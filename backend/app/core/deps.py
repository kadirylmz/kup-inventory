import uuid

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.core import AuditLog, User

from datetime import date, datetime
from decimal import Decimal

bearer = HTTPBearer(auto_error=False)


def _json_safe(val):
    if isinstance(val, dict):
        return {k: _json_safe(v) for k, v in val.items()}
    if isinstance(val, (list, tuple, set)):
        return [_json_safe(x) for x in val]
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    if isinstance(val, Decimal):
        return str(val)
    if isinstance(val, uuid.UUID):
        return str(val)
    return val


def client_ip(request: Request) -> str | None:
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else None)


def get_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)
) -> User:
    err = HTTPException(status.HTTP_401_UNAUTHORIZED, "Oturum geçersiz veya süresi dolmuş.")
    if not cred:
        raise err
    uid = decode_access_token(cred.credentials)
    if not uid:
        raise err
    user = db.get(User, uuid.UUID(uid))
    if not user or user.is_deleted or not user.is_active:
        raise err
    return user


def user_permissions(user: User) -> set[str]:
    return {p.code for r in user.roles if not r.is_deleted for p in r.permissions}


def has_permission(user: User, code: str) -> bool:
    return user.is_superuser or code in user_permissions(user)


def require_permission(code: str):
    def checker(user: User = Depends(get_current_user)) -> User:
        if not has_permission(user, code):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Bu işlem için yetkiniz yok.")
        return user

    return checker


def write_audit(db: Session, *, tenant_id, user_id, action: str, entity: str | None = None,
                entity_id=None, old=None, new=None, ip: str | None = None) -> None:
    db.add(AuditLog(tenant_id=tenant_id, user_id=user_id, action=action, entity=entity,
                    entity_id=str(entity_id) if entity_id else None, old_value=_json_safe(old), new_value=_json_safe(new), ip=ip))
