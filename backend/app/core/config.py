from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# core/config.py -> app -> backend. Single source of truth for repo-relative
# paths that must resolve the same way regardless of the process's current
# working directory (a background task, a test runner, and `uvicorn` invoked
# from a different shell can all have different cwds) - resolved from
# __file__, never Path.cwd(). Callers that previously computed their own
# `Path(__file__).resolve().parents[N]` (services/schema_check.py,
# services/accuracy_report.py) should use these instead.
BACKEND_DIR = Path(__file__).resolve().parents[2]
FIXTURES_DIR = BACKEND_DIR / "tests" / "fixtures"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore", populate_by_name=True
    )

    postgres_user: str = "assiduous_user"
    postgres_password: str = "assiduous"
    postgres_db: str = "assiduous_board_report"
    postgres_host: str = "localhost"
    postgres_port: int = 5432

    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60

    cors_origins: str = "http://localhost:5173"
    # Used to build links embedded in outgoing emails (invitation, password
    # reset) - see app/services/email/mailer.py.
    frontend_base_url: str = "http://localhost:5173"

    # Structured per-request timing log line (db/llm/storage/app breakdown) -
    # see app/core/request_timing.py. On by default in dev; set to false to
    # silence it (e.g. a noisy local terminal, or a prod deploy that doesn't
    # want the extra per-request log line).
    request_timing_enabled: bool = True

    storage_dir: str = "storage"
    avatar_max_size_bytes: int = 5 * 1024 * 1024
    avatar_dimension_px: int = 256

    # "local" (default, unchanged filesystem storage) or "supabase" - see
    # app/services/storage.py's get_storage_service() for the switch, and
    # app/services/document/storage_supabase.py for the Supabase implementation.
    storage_provider: str = "local"
    supabase_url: str = ""
    # Supabase renamed its "service_role" secret key to "secret key" in their newer
    # API-key scheme; accept either env var name so this doesn't depend on exactly
    # when the Supabase project's keys were generated. SUPABASE_SECRET_KEY wins if
    # both happen to be set.
    supabase_service_key: str = Field(
        default="", validation_alias=AliasChoices("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY")
    )
    supabase_storage_bucket: str = ""

    anthropic_api_key: str | None = None
    extraction_model: str = "claude-opus-4-8"
    insight_model: str = "claude-opus-4-8"

    # SMTP (invitation/password-reset emails - see app/services/email/mailer.py).
    # send_email() already treats a blank username/password as "SMTP not
    # configured" and skips sending rather than erroring, so these default to
    # blank instead of requiring every dev environment to set up real SMTP.
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "Assiduous Board Report"

    # Auto-fetch cost/safety controls (app/services/extraction/auto_fetch.py).
    auto_fetch_interval_hours: int = 24
    auto_fetch_max_documents_per_check: int = 3
    auto_fetch_daily_extraction_limit: int = 20
    auto_fetch_circuit_breaker_threshold: int = 10
    auto_fetch_http_timeout_seconds: int = 30

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
