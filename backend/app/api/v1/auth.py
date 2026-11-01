import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import client_ip, get_current_user, user_permissions, write_audit
from app.core.security import (create_access_token, hash_password, hash_token, new_refresh_token,
                               validate_password_strength, verify_password)
from app.db.session import get_db
from app.models.core import RefreshToken, User
from app.schemas.core import LoginIn, MeOut, PasswordChange, TokenOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])
COOKIE = "kup_refresh"


def _issue(db: Session, user: User, request: Request, response: Response) -> TokenOut:
    s = get_settings()
    raw, hashed = new_refresh_token()
    db.add(RefreshToken(user_id=user.id, token_hash=hashed, ip=client_ip(request),
                        expires_at=datetime.now(timezone.utc) + timedelta(days=s.refresh_token_days)))
    response.set_cookie(COOKIE, raw, httponly=True, samesite="strict", secure=s.cookie_secure,
                        max_age=s.refresh_token_days * 86400, path="/api/v1/auth")
    return TokenOut(access_token=create_access_token(str(user.id)))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    s = get_settings()
    tid = uuid.UUID(s.default_tenant_id)
    ip = client_ip(request)
    user = db.scalar(select(User).where(User.tenant_id == tid, User.email == body.email.lower(),
                                        User.is_deleted.is_(False)))
    now = datetime.now(timezone.utc)
    if user and user.locked_until and user.locked_until.replace(tzinfo=timezone.utc) > now:
        raise HTTPException(429, "Hesap geÃ§ici olarak kilitlendi. Daha sonra tekrar deneyin.")
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        if user:
            user.failed_attempts += 1
            if user.failed_attempts >= s.max_failed_attempts:
                user.locked_until = now + timedelta(minutes=s.lockout_minutes)
                user.failed_attempts = 0
        write_audit(db, tenant_id=tid, user_id=user.id if user else None, action="auth.login_failed",
                    entity="user", new={"email": body.email}, ip=ip)
        db.commit()
        raise HTTPException(401, "E-posta veya parola hatalÄ±.")
    user.failed_attempts, user.locked_until, user.last_login_at = 0, None, now
    write_audit(db, tenant_id=tid, user_id=user.id, action="auth.login", entity="user", entity_id=user.id, ip=ip)
    out = _issue(db, user, request, response)
    db.commit()
    return out


@router.post("/refresh", response_model=TokenOut)
def refresh(request: Request, response: Response, kup_refresh: str | None = Cookie(default=None),
            db: Session = Depends(get_db)):
    if not kup_refresh:
        raise HTTPException(401, "Oturum bulunamadÄ±.")
    tok = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(kup_refresh)))
    now = datetime.now(timezone.utc)
    if not tok or tok.revoked_at or tok.expires_at.replace(tzinfo=timezone.utc) < now:
        raise HTTPException(401, "Oturum sÃ¼resi dolmuÅŸ.")
    user = db.get(User, tok.user_id)
    if not user or not user.is_active or user.is_deleted:
        raise HTTPException(401, "Oturum geÃ§ersiz.")
    tok.revoked_at = now  # rotasyon
    out = _issue(db, user, request, response)
    db.commit()
    return out


@router.post("/logout", status_code=204)
def logout(response: Response, kup_refresh: str | None = Cookie(default=None), db: Session = Depends(get_db)):
    if kup_refresh:
        tok = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(kup_refresh)))
        if tok and not tok.revoked_at:
            tok.revoked_at = datetime.now(timezone.utc)
            db.commit()
    response.delete_cookie(COOKIE, path="/api/v1/auth")


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(get_current_user)):
    perms = sorted(user_permissions(user))
    if user.is_superuser:
        from app.core.permissions import ALL_CODES
        perms = sorted(ALL_CODES)
    return MeOut(**UserOut.model_validate(user).model_dump(), permissions=perms)


@router.post("/change-password", status_code=204)
def change_password(body: PasswordChange, request: Request, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Mevcut parola hatalÄ±.")
    if (msg := validate_password_strength(body.new_password)):
        raise HTTPException(422, msg)
    user.password_hash = hash_password(body.new_password)
    write_audit(db, tenant_id=user.tenant_id, user_id=user.id, action="auth.password_changed",
                entity="user", entity_id=user.id, ip=client_ip(request))
    db.commit()


