import inspect
import io
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import UploadFile
from storage3.exceptions import StorageException

from app.services.document import storage_supabase
from app.services.document.storage_supabase import StorageSupabase, StorageSupabaseError

BUCKET = "documents"
PUBLIC_URL_PREFIX = f"https://xyzcompany.supabase.co/storage/v1/object/public/{BUCKET}/"


class _FakeBucketProxy:
    def __init__(self):
        self.upload = AsyncMock(return_value=None)
        self.download = AsyncMock(return_value=b"downloaded-bytes")
        self.remove = AsyncMock(return_value=[{"name": "deleted"}])
        # get_public_url is a coroutine on the real async client (verified via
        # inspect.iscoroutinefunction against the installed storage3 package,
        # not just its -> str return annotation) - a plain MagicMock here would
        # let a missing `await` in the implementation pass silently, which is
        # exactly how that bug shipped the first time.
        self.get_public_url = AsyncMock(side_effect=lambda key: PUBLIC_URL_PREFIX + key)


class _FakeStorageNamespace:
    def __init__(self, bucket_proxy: _FakeBucketProxy):
        self._bucket_proxy = bucket_proxy
        self.from_ = MagicMock(return_value=bucket_proxy)


class _FakeAsyncClient:
    def __init__(self, bucket_proxy: _FakeBucketProxy):
        self.storage = _FakeStorageNamespace(bucket_proxy)


def _service(monkeypatch, bucket_proxy: _FakeBucketProxy | None = None) -> tuple[StorageSupabase, _FakeBucketProxy]:
    bucket_proxy = bucket_proxy or _FakeBucketProxy()
    fake_client = _FakeAsyncClient(bucket_proxy)
    create_mock = AsyncMock(return_value=fake_client)
    monkeypatch.setattr(storage_supabase, "create_async_client", create_mock)
    service = StorageSupabase(
        supabase_url="https://xyzcompany.supabase.co",
        supabase_service_key="service-role-secret",
        bucket=BUCKET,
    )
    return service, bucket_proxy


class TestInit:
    @pytest.mark.parametrize(
        "kwargs",
        [
            dict(supabase_url="", supabase_service_key="key", bucket="documents"),
            dict(supabase_url="https://x.supabase.co", supabase_service_key="", bucket="documents"),
            dict(supabase_url="https://x.supabase.co", supabase_service_key="key", bucket=""),
        ],
    )
    def test_raises_clearly_when_any_config_is_missing(self, kwargs):
        with pytest.raises(StorageSupabaseError):
            StorageSupabase(**kwargs)


class TestSave:
    async def test_uploads_and_returns_public_url(self, monkeypatch):
        service, bucket = _service(monkeypatch)
        org_id, company_id = uuid.uuid4(), uuid.uuid4()
        file = UploadFile(file=io.BytesIO(b"pdf-bytes"), filename="report.pdf", headers={"content-type": "application/pdf"})

        result = await service.save(organization_id=org_id, company_id=company_id, file=file)

        bucket.upload.assert_awaited_once()
        key, content, options = bucket.upload.await_args.args
        assert key.startswith(f"{org_id}/{company_id}/")
        assert key.endswith(".pdf")
        assert content == b"pdf-bytes"
        assert options == {"content-type": "application/pdf"}
        assert result == PUBLIC_URL_PREFIX + key

    async def test_returns_the_awaited_url_string_not_a_coroutine(self, monkeypatch):
        # Regression test for a shipped bug: _upload() returned
        # `bucket.get_public_url(key)` without awaiting it - get_public_url is a
        # coroutine on the real async client, so this returned an un-awaited
        # coroutine object instead of the URL string, which blew up downstream
        # wherever the caller treated storage_path as a str (e.g. Path(storage_path)
        # in routes/auth.py's upload_avatar). Asserted explicitly here, in addition
        # to the plain equality checks above, so a future regression fails loudly
        # with an obvious message instead of an unrelated TypeError three layers away.
        service, _ = _service(monkeypatch)

        result = await service.save(
            organization_id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            file=UploadFile(file=io.BytesIO(b"x"), filename="a.pdf"),
        )

        assert isinstance(result, str)
        assert not inspect.iscoroutine(result)


class TestSaveBytes:
    async def test_uploads_under_org_and_company_scoped_key(self, monkeypatch):
        service, bucket = _service(monkeypatch)
        org_id, company_id = uuid.uuid4(), uuid.uuid4()

        result = await service.save_bytes(
            organization_id=org_id, company_id=company_id, filename="filing.pdf", content=b"raw-bytes"
        )

        key, content, options = bucket.upload.await_args.args
        assert key.startswith(f"{org_id}/{company_id}/")
        assert content == b"raw-bytes"
        assert options == {"content-type": "application/pdf"}
        assert result == PUBLIC_URL_PREFIX + key

    async def test_defaults_to_pdf_suffix_when_filename_has_none(self, monkeypatch):
        service, bucket = _service(monkeypatch)

        await service.save_bytes(
            organization_id=uuid.uuid4(), company_id=uuid.uuid4(), filename="no-extension", content=b"data"
        )

        key = bucket.upload.await_args.args[0]
        assert key.endswith(".pdf")


class TestSaveAvatarAndLogoBytes:
    async def test_save_avatar_bytes_scopes_by_user_id_and_guesses_content_type(self, monkeypatch):
        service, bucket = _service(monkeypatch)
        user_id = uuid.uuid4()

        result = await service.save_avatar_bytes(user_id=user_id, filename="avatar.jpg", content=b"img")

        key, content, options = bucket.upload.await_args.args
        assert key.startswith(f"avatars/{user_id}/")
        assert content == b"img"
        assert options == {"content-type": "image/jpeg"}
        assert result == PUBLIC_URL_PREFIX + key

    async def test_save_logo_bytes_scopes_by_company_id_and_guesses_content_type(self, monkeypatch):
        service, bucket = _service(monkeypatch)
        company_id = uuid.uuid4()

        result = await service.save_logo_bytes(company_id=company_id, filename="logo.png", content=b"img")

        key, content, options = bucket.upload.await_args.args
        assert key.startswith(f"logos/{company_id}/")
        assert options == {"content-type": "image/png"}
        assert result == PUBLIC_URL_PREFIX + key


class TestDelete:
    async def test_parses_the_key_back_out_of_a_public_url(self, monkeypatch):
        service, bucket = _service(monkeypatch)
        url = PUBLIC_URL_PREFIX + "org/company/some-uuid.pdf"

        await service.delete(url)

        bucket.remove.assert_awaited_once_with(["org/company/some-uuid.pdf"])

    async def test_treats_a_bare_key_as_already_a_key(self, monkeypatch):
        service, bucket = _service(monkeypatch)

        await service.delete("org/company/some-uuid.pdf")

        bucket.remove.assert_awaited_once_with(["org/company/some-uuid.pdf"])

    async def test_wraps_storage_errors_clearly(self, monkeypatch):
        bucket = _FakeBucketProxy()
        bucket.remove = AsyncMock(side_effect=StorageException("bucket not found"))
        service, _ = _service(monkeypatch, bucket)

        with pytest.raises(StorageSupabaseError, match="Failed to delete"):
            await service.delete(PUBLIC_URL_PREFIX + "org/company/x.pdf")


class TestGet:
    async def test_downloads_content_by_key_parsed_from_url(self, monkeypatch):
        service, bucket = _service(monkeypatch)
        url = PUBLIC_URL_PREFIX + "org/company/some-uuid.pdf"

        content = await service.get(url)

        bucket.download.assert_awaited_once_with("org/company/some-uuid.pdf")
        assert content == b"downloaded-bytes"

    async def test_wraps_storage_errors_clearly(self, monkeypatch):
        bucket = _FakeBucketProxy()
        bucket.download = AsyncMock(side_effect=StorageException("not found"))
        service, _ = _service(monkeypatch, bucket)

        with pytest.raises(StorageSupabaseError, match="Failed to download"):
            await service.get(PUBLIC_URL_PREFIX + "org/company/x.pdf")


class TestUploadErrorHandling:
    async def test_wraps_storage_errors_clearly(self, monkeypatch):
        bucket = _FakeBucketProxy()
        bucket.upload = AsyncMock(side_effect=StorageException("bucket does not exist"))
        service, _ = _service(monkeypatch, bucket)

        with pytest.raises(StorageSupabaseError, match="Failed to upload"):
            await service.save_bytes(
                organization_id=uuid.uuid4(), company_id=uuid.uuid4(), filename="a.pdf", content=b"x"
            )


class TestClientCaching:
    async def test_client_is_built_once_and_reused(self, monkeypatch):
        service, bucket = _service(monkeypatch)

        await service.save_bytes(organization_id=uuid.uuid4(), company_id=uuid.uuid4(), filename="a.pdf", content=b"x")
        await service.save_bytes(organization_id=uuid.uuid4(), company_id=uuid.uuid4(), filename="b.pdf", content=b"y")

        storage_supabase.create_async_client.assert_awaited_once()
