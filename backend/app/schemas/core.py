import uuid

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

# .local gibi LAN alan adları için EmailStr yerine basit desen
EmailStr = Annotated[str, StringConstraints(pattern=r'^[^@\s]+@[^@\s]+\.[^@\s]+$', max_length=255)]


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    code: str
    name: str
    is_system: bool


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: EmailStr
    full_name: str
    is_active: bool
    theme: str
    language: str
    roles: list[RoleOut] = []


class MeOut(UserOut):
    permissions: list[str]


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=150)
    password: str
    role_ids: list[uuid.UUID] = []


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=150)
    is_active: bool | None = None
    role_ids: list[uuid.UUID] | None = None
    password: str | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class RoleCreate(BaseModel):
    code: str = Field(pattern=r"^[A-Z0-9_]{3,50}$")
    name: str = Field(min_length=2, max_length=100)
    permission_codes: list[str] = []


class RolePermissionsUpdate(BaseModel):
    permission_codes: list[str]

