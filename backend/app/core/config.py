from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://kup:kup@db:5432/kup_inventory"
    secret_key: str = "CHANGE_ME"
    access_token_minutes: int = 15
    refresh_token_days: int = 7
    cookie_secure: bool = False  # HTTPS arkasında True yapın
    max_failed_attempts: int = 5
    lockout_minutes: int = 15
    first_admin_email: str = "admin@kup.local"
    first_admin_password: str = "ChangeMe!12345"
    upload_dir: str = "/data/uploads"
    max_upload_mb: int = 20
    default_tenant_id: str = "00000000-0000-0000-0000-000000000001"


@lru_cache
def get_settings() -> Settings:
    return Settings()
