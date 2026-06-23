from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Healthkeeper API"
    api_port: int = 8100
    debug: bool = False
    secret_key: str = "change-me-in-production"
    timezone: str = "Asia/Seoul"

    database_url: str = "postgresql+asyncpg://healthkeeper:password@127.0.0.1:5432/healthkeeper"
    redis_url: str = "redis://:password@127.0.0.1:6379/0"

    neo4j_uri: str = "bolt://127.0.0.1:17687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "password"

    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    session_cookie_name: str = "hk_session"
    admin_session_cookie_name: str = "hk_admin_session"
    session_max_age: int = 86400 * 7
    admin_session_remember_max_age: int = 86400 * 30
    admin_session_short_max_age: int = 86400

    verify_token_ttl_hours: int = 24
    verify_resend_cooldown_minutes: int = 5
    login_max_failures: int = 5
    login_lock_minutes: int = 15

    smtp_host: str = "localhost"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@healthkeeper.local"
    smtp_from_name: str = "헬스키퍼"
    smtp_use_tls: bool = True

    mail_retry_max: int = 3
    mail_retry_backoff_seconds: list[int] = [60, 300, 1800]

    confirm_mode: str = "MANUAL"  # MANUAL | AUTO

    app_base_url: str = "http://localhost:5173"

    sso_provider: str = "mock"  # mock | entra
    entra_tenant_id: str = ""
    entra_client_id: str = ""
    entra_client_secret: str = ""
    entra_redirect_uri: str = "http://localhost:5173/api/auth/sso/callback"
    sso_allowed_domain: str = ""
    sso_success_path: str = "/reserve"

    teams_reminder_enabled: bool = True
    teams_reminder_minutes_before: int = 10
    teams_reminder_retry_max: int = 3
    teams_reminder_retry_backoff_seconds: list[int] = [60, 300, 900]
    teams_sender_email: str = "healthkeeper@ibank.co.kr"
    teams_sender_refresh_token: str = ""

    def allowed_email_domains(self) -> list[str]:
        """SSO_ALLOWED_DOMAIN — 쉼표 구분 (예: ibank.co.kr,digitalworks.co.kr)."""
        return [d.strip().lower() for d in self.sso_allowed_domain.split(",") if d.strip()]

    @property
    def cookie_secure(self) -> bool:
        return self.app_base_url.startswith("https://")

    def sso_missing_fields(self) -> list[str]:
        if self.sso_provider != "entra":
            return []
        missing: list[str] = []
        if not self.entra_tenant_id.strip():
            missing.append("ENTRA_TENANT_ID")
        if not self.entra_client_id.strip():
            missing.append("ENTRA_CLIENT_ID")
        if not self.entra_client_secret.strip():
            missing.append("ENTRA_CLIENT_SECRET")
        if not self.entra_redirect_uri.strip():
            missing.append("ENTRA_REDIRECT_URI")
        return missing

    def sso_ready(self) -> bool:
        return not self.sso_missing_fields()

    def teams_sender_ready(self) -> bool:
        if not self.teams_reminder_enabled or self.sso_provider != "entra":
            return False
        if not self.sso_ready():
            return False
        return bool(
            self.teams_sender_email.strip() and self.teams_sender_refresh_token.strip()
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
