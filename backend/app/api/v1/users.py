import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import client_ip, require_permission, write_audit
from app.core.permissions import ALL_CODES
from app.core.security import hash_password, validate_password_strength
from app.db.session import get_db
from app.models.core import Permission, Role, User
from app.schemas.core import (RoleCreate, RoleOut, RolePermissionsUpdate, UserCreate, UserOut, UserUpdate)

router = APIRouter(tags=["users"])


def _roles(db: Session, tenant_id, ids: list[uuid.UUID]) -> list[Role]:
    roles = list(db.scalars(select(Role).where(Role.id.in_(ids), Role.tenant_id == tenant_id))) if ids else []
    if len(roles) != len(set(ids)):
        raise HTTPException(422, "Geçersiz rol seçimi.")
    return roles


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), me: User = Depends(require_permission("user.view"))):
    return db.scalars(select(User).where(User.tenant_id == me.tenant_id, User.is_deleted.is_(False))
                      .order_by(User.full_name)).all()


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(body: UserCreate, request: Request, db: Session = Depends(get_db),
                me: User = Depends(require_permission("user.manage"))):
    if (msg := validate_password_strength(body.password)):
        raise HTTPException(422, msg)
    email = body.email.lower()
    if db.scalar(select(User).where(User.tenant_id == me.tenant_id, User.email == email)):
        raise HTTPException(409, "Bu e-posta ile bir kullanıcı zaten var.")
    u = User(tenant_id=me.tenant_id, email=email, full_name=body.full_name,
             password_hash=hash_password(body.password), roles=_roles(db, me.tenant_id, body.role_ids))
    db.add(u)
    db.flush()
    write_audit(db, tenant_id=me.tenant_id, user_id=me.id, action="user.create", entity="user", entity_id=u.id,
                new={"email": email, "roles": [r.code for r in u.roles]}, ip=client_ip(request))
    db.commit()
    return u


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: uuid.UUID, body: UserUpdate, request: Request, db: Session = Depends(get_db),
                me: User = Depends(require_permission("user.manage"))):
    u = db.get(User, user_id)
    if not u or u.tenant_id != me.tenant_id or u.is_deleted:
        raise HTTPException(404, "Kullanıcı bulunamadı.")
    old = {"full_name": u.full_name, "is_active": u.is_active, "roles": [r.code for r in u.roles]}
    if body.full_name is not None:
        u.full_name = body.full_name
    if body.is_active is not None:
        if u.id == me.id and not body.is_active:
            raise HTTPException(400, "Kendi hesabınızı pasifleştiremezsiniz.")
        u.is_active = body.is_active
    if body.role_ids is not None:
        u.roles = _roles(db, me.tenant_id, body.role_ids)
    if body.password:
        if (msg := validate_password_strength(body.password)):
            raise HTTPException(422, msg)
        u.password_hash = hash_password(body.password)
    write_audit(db, tenant_id=me.tenant_id, user_id=me.id, action="user.update", entity="user", entity_id=u.id,
                old=old, new={"full_name": u.full_name, "is_active": u.is_active,
                              "roles": [r.code for r in u.roles], "password_changed": bool(body.password)},
                ip=client_ip(request))
    db.commit()
    return u


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: uuid.UUID, request: Request, db: Session = Depends(get_db),
                me: User = Depends(require_permission("user.manage"))):
    u = db.get(User, user_id)
    if not u or u.tenant_id != me.tenant_id or u.is_deleted:
        raise HTTPException(404, "Kullanıcı bulunamadı.")
    if u.id == me.id:
        raise HTTPException(400, "Kendi hesabınızı silemezsiniz.")
    u.is_deleted, u.is_active, u.deleted_at = True, False, datetime.now(timezone.utc)  # soft delete
    write_audit(db, tenant_id=me.tenant_id, user_id=me.id, action="user.delete", entity="user",
                entity_id=u.id, ip=client_ip(request))
    db.commit()


@router.get("/roles")
def list_roles(db: Session = Depends(get_db), me: User = Depends(require_permission("role.view"))):
    roles = db.scalars(select(Role).where(Role.tenant_id == me.tenant_id, Role.is_deleted.is_(False))).all()
    return [{**RoleOut.model_validate(r).model_dump(), "permissions": sorted(p.code for p in r.permissions)}
            for r in roles]


@router.get("/permissions")
def list_permissions(me: User = Depends(require_permission("role.view"))):
    return sorted(ALL_CODES)


def _perms(db: Session, codes: list[str]) -> list[Permission]:
    perms = list(db.scalars(select(Permission).where(Permission.code.in_(codes)))) if codes else []
    if len(perms) != len(set(codes)):
        raise HTTPException(422, "Geçersiz izin kodu.")
    return perms


@router.post("/roles", status_code=201)
def create_role(body: RoleCreate, request: Request, db: Session = Depends(get_db),
                me: User = Depends(require_permission("role.manage"))):
    if db.scalar(select(Role).where(Role.tenant_id == me.tenant_id, Role.code == body.code)):
        raise HTTPException(409, "Bu rol kodu zaten var.")
    r = Role(tenant_id=me.tenant_id, code=body.code, name=body.name, permissions=_perms(db, body.permission_codes))
    db.add(r)
    db.flush()
    write_audit(db, tenant_id=me.tenant_id, user_id=me.id, action="role.create", entity="role", entity_id=r.id,
                new={"code": r.code, "permissions": body.permission_codes}, ip=client_ip(request))
    db.commit()
    return {"id": r.id, "code": r.code}


@router.put("/roles/{role_id}/permissions")
def set_role_permissions(role_id: uuid.UUID, body: RolePermissionsUpdate, request: Request,
                         db: Session = Depends(get_db), me: User = Depends(require_permission("role.manage"))):
    r = db.get(Role, role_id)
    if not r or r.tenant_id != me.tenant_id:
        raise HTTPException(404, "Rol bulunamadı.")
    if r.code == "ADMIN":
        raise HTTPException(400, "ADMIN rolünün yetkileri değiştirilemez.")
    old = sorted(p.code for p in r.permissions)
    r.permissions = _perms(db, body.permission_codes)
    write_audit(db, tenant_id=me.tenant_id, user_id=me.id, action="role.permissions_update", entity="role",
                entity_id=r.id, old={"permissions": old}, new={"permissions": sorted(body.permission_codes)},
                ip=client_ip(request))
    db.commit()
    return {"ok": True}
