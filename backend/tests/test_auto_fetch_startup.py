from unittest.mock import AsyncMock

from app.services.extraction import auto_fetch
from app.services.extraction.auto_fetch import run_periodic_auto_fetch


async def test_returns_cleanly_without_looping_when_storage_service_fails_to_initialize(monkeypatch, caplog):
    # get_storage_service() can now raise StorageSupabaseError (a misconfigured
    # STORAGE_PROVIDER=supabase) - this background task is fire-and-forget
    # (asyncio.create_task in main.py's lifespan), so it must log and return
    # rather than let the exception escape uncaught or loop forever retrying.
    def _boom():
        raise RuntimeError("Supabase storage is not configured")

    monkeypatch.setattr(auto_fetch, "get_storage_service", _boom)
    check_mock = AsyncMock()
    monkeypatch.setattr(auto_fetch, "_check_all_enabled_companies", check_mock)

    await run_periodic_auto_fetch()

    check_mock.assert_not_awaited()
    assert "could not initialize storage service" in caplog.text
