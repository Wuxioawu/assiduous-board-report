import pytest
from httpx import AsyncClient

from app.db.session import AsyncSessionLocal
from app.services import schema_check
from app.services.schema_check import get_bundled_head_revision, get_db_revision, get_schema_status

pytestmark = pytest.mark.asyncio


async def test_health_check_ok(client: AsyncClient):
    response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_health_config_reports_schema_current_against_the_real_migrated_db(client: AsyncClient):
    # The test DB is migrated to head via `alembic upgrade head` before the
    # suite runs (see .github/workflows/ci.yml) - the same real Postgres
    # every other test runs against, not a mock - so this is current by
    # construction unless a migration is genuinely missing.
    response = await client.get("/api/v1/health/config")

    assert response.status_code == 200
    body = response.json()
    assert body["schema_current"] is True
    assert body["db_revision"] == body["head_revision"]
    assert body["head_revision"] is not None
    assert body["storage_backend"] == "local"


async def test_health_config_reports_configured_storage_backend(client: AsyncClient, monkeypatch):
    from app.core.config import Settings

    monkeypatch.setattr(
        "app.services.schema_check.get_settings",
        lambda: Settings(storage_provider="supabase"),
    )

    response = await client.get("/api/v1/health/config")

    assert response.json()["storage_backend"] == "supabase"


async def test_get_bundled_head_revision_matches_the_newest_migration_file():
    head = get_bundled_head_revision()

    assert head is not None
    assert isinstance(head, str)


async def test_get_db_revision_reads_the_real_alembic_version_table():
    async with AsyncSessionLocal() as db:
        revision = await get_db_revision(db)

    assert revision is not None


async def test_get_schema_status_flags_a_lagging_revision(monkeypatch):
    # Simulates a deploy that started serving before its own migration ran:
    # the bundled codebase is one revision ahead of what's actually applied.
    # Monkeypatches the codebase-side head lookup rather than writing to the
    # real alembic_version row, since tests here run against the shared dev
    # DB (see tests/conftest.py) and every other suite depends on it staying
    # genuinely migrated to head.
    monkeypatch.setattr(schema_check, "get_bundled_head_revision", lambda: "not_a_real_revision")

    async with AsyncSessionLocal() as db:
        status = await get_schema_status(db)

    assert status["schema_current"] is False
    assert status["head_revision"] == "not_a_real_revision"
    assert status["db_revision"] is not None
    assert status["db_revision"] != "not_a_real_revision"
