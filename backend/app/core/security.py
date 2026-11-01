import base64
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings

_ph = PasswordHasher()


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, password)
    except VerifyMismatchError:
        return False


def create_access_token(user_id: str) -> str:
    s = get_settings()
    exp = datetime.now(timezone.utc) + timedelta(minutes=s.access_token_minutes)
    return jwt.encode({"sub": user_id, "exp": exp, "typ": "access"}, s.secret_key, algorithm="HS256")


def decode_access_token(token: str) -> str | None:
    try:
        data = jwt.decode(token, get_settings().secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    return data.get("sub") if data.get("typ") == "access" else None


def new_refresh_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(48)
    return raw, hash_token(raw)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def validate_password_strength(password: str) -> str | None:
    if len(password) < 10:
        return "Parola en az 10 karakter olmalıdır."
    if not any(c.isdigit() for c in password) or not any(c.isalpha() for c in password):
        return "Parola harf ve rakam içermelidir."
    return None


def _fernet() -> Fernet:
    key_bytes = hashlib.sha256(get_settings().secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key_bytes))


def encrypt_secret(plain: str) -> str:
    return _fernet().encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_secret(cipher: str) -> str:
    try:
        return _fernet().decrypt(cipher.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        return "***ÇÖZÜLEMEDİ***"


def mask_license_key(plain: str) -> str:
    clean = plain.strip()
    if len(clean) <= 6:
        return "****"
    return f"{clean[:3]}****-****-{clean[-3:]}"
