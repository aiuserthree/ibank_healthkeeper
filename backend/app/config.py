from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
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
    session_max_age: int = 86400 * 30  # 회원 로그인 유지 — 쓸 때마다 다시 30일로 늘어난다(core/session.touch_member_session)
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

    confirm_mode: str = "AUTO"  # MANUAL | AUTO

    app_base_url: str = "http://localhost:5173"

    sso_provider: str = "mock"  # mock | entra
    entra_tenant_id: str = ""
    entra_client_id: str = ""
    entra_client_secret: str = ""
    entra_redirect_uri: str = "http://localhost:5173/api/auth/sso/callback"
    sso_allowed_domain: str = ""
    sso_success_path: str = "/reserve"

    # 로컬 수동 테스트용 — DEBUG=true 일 때만 수 17:00(close_at) 양도/교환 창을 건너뜀
    transfer_window_bypass: bool = False

    teams_reminder_enabled: bool = True
    teams_reminder_minutes_before: int = 5
    teams_reminder_retry_max: int = 3
    teams_reminder_retry_backoff_seconds: list[int] = [60, 300, 900]
    teams_open_notice_enabled: bool = True
    teams_open_notice_url: str = "https://healthkeeper.ibank.co.kr/index"
    # 수요일 오픈 안내 맨 아래 「이번 주 게임」 소개 칸 — 끄면 기존 안내만 나간다(teams.OPEN_NOTICE_GAMES 를 한 주에 하나씩)
    teams_open_notice_game_enabled: bool = True
    teams_sender_email: str = "healthkeeper@ibank.co.kr"
    teams_sender_refresh_token: str = ""

    public_data_portal_service_key: str = ""

    # 그룹웨어 휴가 받는 입구(/api/internal/leave-sync) 비밀값 — 비어 있으면 입구가 꺼져 있다(503).
    # 사내망 맥의 scripts/gw-leave-sync.py 가 X-Leave-Sync-Token 헤더로 같은 값을 보낸다
    leave_sync_token: str = ""

    # 그룹웨어 DB(읽기 전용) — 채워져 있으면 헬스키퍼 서버가 평일 07~19시 10분마다 직접 휴가를 읽는다(services/gw_leave.py).
    # 비어 있으면 끔(예전처럼 사내망 맥이 위 입구로 보낸다). 값은 서버 backend/.env 에만 두고, 화면 · 로그에 남기지 않는다
    gw_db_host: str = ""
    gw_db_port: int = 5432
    gw_db_name: str = "postgres"
    gw_db_user: str = ""
    gw_db_password: str = ""

    def gw_ready(self) -> bool:
        return bool(self.gw_db_host and self.gw_db_user and self.gw_db_password)

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

    def teams_graph_sender_ready(self) -> bool:
        if self.sso_provider != "entra":
            return False
        if not self.sso_ready():
            return False
        return bool(
            self.teams_sender_email.strip() and self.teams_sender_refresh_token.strip()
        )

    def teams_sender_ready(self) -> bool:
        return self.teams_reminder_enabled and self.teams_graph_sender_ready()

    def teams_open_notice_ready(self) -> bool:
        return self.teams_open_notice_enabled and self.teams_graph_sender_ready()


@lru_cache
def get_settings() -> Settings:
    return Settings()
