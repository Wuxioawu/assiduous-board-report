import io
import uuid
from pathlib import Path

import pytest
from fastapi import UploadFile

from app.services.storage import LocalStorageService, get_storage_service, is_remote_storage_path


def _upload_file(content: bytes, filename: str) -> UploadFile:
    return UploadFile(file=io.BytesIO(content), filename=filename)


class TestSave:
    async def test_writes_content_under_org_and_company_scoped_dir(self, tmp_path):
        service = LocalStorageService(base_dir=tmp_path)
        org_id, company_id = uuid.uuid4(), uuid.uuid4()

        storage_path = await service.save(
            organization_id=org_id, company_id=company_id, file=_upload_file(b"pdf-bytes", "report.pdf")
        )

        path = Path(storage_path)
        assert path.exists()
        assert path.read_bytes() == b"pdf-bytes"
        assert path.parent == tmp_path / str(org_id) / str(company_id)

    async def test_generates_unique_filename_not_client_supplied_name(self, tmp_path):
        # The stored filename must never be taken from client input - a
        # generated UUID avoids path traversal and collisions; the original
        # filename is only ever kept in the DB record, never used on disk.
        service = LocalStorageService(base_dir=tmp_path)
        org_id, company_id = uuid.uuid4(), uuid.uuid4()

        storage_path = await service.save(
            organization_id=org_id, company_id=company_id, file=_upload_file(b"data", "my report.pdf")
        )

        assert Path(storage_path).name != "my report.pdf"
        assert Path(storage_path).suffix == ".pdf"

    async def test_path_traversal_attempt_in_filename_is_neutralized(self, tmp_path):
        service = LocalStorageService(base_dir=tmp_path)
        org_id, company_id = uuid.uuid4(), uuid.uuid4()

        storage_path = await service.save(
            organization_id=org_id,
            company_id=company_id,
            file=_upload_file(b"data", "../../../../etc/passwd.pdf"),
        )

        # Resolved path must stay confined to the org/company-scoped directory,
        # not escape upward via the malicious filename's ".." segments.
        resolved = Path(storage_path).resolve()
        expected_dir = (tmp_path / str(org_id) / str(company_id)).resolve()
        assert resolved.parent == expected_dir

    async def test_two_uploads_do_not_collide(self, tmp_path):
        service = LocalStorageService(base_dir=tmp_path)
        org_id, company_id = uuid.uuid4(), uuid.uuid4()

        first = await service.save(
            organization_id=org_id, company_id=company_id, file=_upload_file(b"one", "report.pdf")
        )
        second = await service.save(
            organization_id=org_id, company_id=company_id, file=_upload_file(b"two", "report.pdf")
        )

        assert first != second
        assert Path(first).read_bytes() == b"one"
        assert Path(second).read_bytes() == b"two"


class TestSaveBytes:
    async def test_writes_raw_bytes(self, tmp_path):
        service = LocalStorageService(base_dir=tmp_path)
        org_id, company_id = uuid.uuid4(), uuid.uuid4()

        storage_path = await service.save_bytes(
            organization_id=org_id, company_id=company_id, filename="filing.pdf", content=b"raw-bytes"
        )

        assert Path(storage_path).read_bytes() == b"raw-bytes"

    async def test_defaults_to_pdf_suffix_when_filename_has_none(self, tmp_path):
        service = LocalStorageService(base_dir=tmp_path)
        org_id, company_id = uuid.uuid4(), uuid.uuid4()

        storage_path = await service.save_bytes(
            organization_id=org_id, company_id=company_id, filename="no-extension", content=b"data"
        )

        assert Path(storage_path).suffix == ".pdf"


class TestDelete:
    async def test_removes_existing_file(self, tmp_path):
        service = LocalStorageService(base_dir=tmp_path)
        org_id, company_id = uuid.uuid4(), uuid.uuid4()
        storage_path = await service.save_bytes(
            organization_id=org_id, company_id=company_id, filename="a.pdf", content=b"data"
        )
        assert Path(storage_path).exists()

        await service.delete(storage_path)

        assert not Path(storage_path).exists()

    async def test_missing_file_is_a_no_op(self, tmp_path):
        service = LocalStorageService(base_dir=tmp_path)

        # Must not raise even though nothing was ever written at this path -
        # callers (e.g. avatar re-upload) call delete() unconditionally on
        # whatever the previous storage_path was.
        await service.delete(str(tmp_path / "never-existed.pdf"))


class TestGet:
    async def test_reads_back_previously_saved_content(self, tmp_path):
        service = LocalStorageService(base_dir=tmp_path)
        org_id, company_id = uuid.uuid4(), uuid.uuid4()
        storage_path = await service.save_bytes(
            organization_id=org_id, company_id=company_id, filename="a.pdf", content=b"the-content"
        )

        assert await service.get(storage_path) == b"the-content"

    async def test_missing_file_raises(self, tmp_path):
        service = LocalStorageService(base_dir=tmp_path)

        with pytest.raises(FileNotFoundError):
            await service.get(str(tmp_path / "never-existed.pdf"))


class TestIsRemoteStoragePath:
    @pytest.mark.parametrize(
        "path",
        [
            "https://xyzcompany.supabase.co/storage/v1/object/public/documents/org/company/file.pdf",
            "http://localhost:54321/storage/v1/object/public/documents/file.pdf",
        ],
    )
    def test_true_for_urls(self, path):
        assert is_remote_storage_path(path) is True

    @pytest.mark.parametrize(
        "path",
        [
            "/app/storage/org-id/company-id/file.pdf",
            "storage/avatars/user-id/file.jpg",
            "relative/path.pdf",
        ],
    )
    def test_false_for_local_paths(self, path):
        assert is_remote_storage_path(path) is False


class TestAvatarAndLogoBytes:
    async def test_save_avatar_bytes_scopes_by_user_id(self, tmp_path):
        service = LocalStorageService(base_dir=tmp_path)
        user_id = uuid.uuid4()

        storage_path = await service.save_avatar_bytes(user_id=user_id, filename="avatar.jpg", content=b"img")

        path = Path(storage_path)
        assert path.read_bytes() == b"img"
        assert path.parent == tmp_path / "avatars" / str(user_id)

    async def test_save_logo_bytes_scopes_by_company_id(self, tmp_path):
        service = LocalStorageService(base_dir=tmp_path)
        company_id = uuid.uuid4()

        storage_path = await service.save_logo_bytes(company_id=company_id, filename="logo.png", content=b"img")

        path = Path(storage_path)
        assert path.read_bytes() == b"img"
        assert path.parent == tmp_path / "logos" / str(company_id)


def test_get_storage_service_returns_local_storage_service():
    assert isinstance(get_storage_service(), LocalStorageService)


class TestGetStorageServiceProviderSwitch:
    def test_supabase_provider_returns_storage_supabase(self, monkeypatch):
        from app.core.config import Settings
        from app.services.document.storage_supabase import StorageSupabase

        monkeypatch.setattr(
            "app.services.storage.get_settings",
            lambda: Settings(
                storage_provider="supabase",
                supabase_url="https://xyzcompany.supabase.co",
                supabase_service_key="service-role-secret",
                supabase_storage_bucket="documents",
            ),
        )

        service = get_storage_service()

        assert isinstance(service, StorageSupabase)

    def test_supabase_provider_with_missing_config_raises_clearly(self, monkeypatch):
        from app.core.config import Settings
        from app.services.document.storage_supabase import StorageSupabaseError

        monkeypatch.setattr(
            "app.services.storage.get_settings",
            lambda: Settings(storage_provider="supabase", supabase_url="", supabase_service_key="", supabase_storage_bucket=""),
        )

        with pytest.raises(StorageSupabaseError):
            get_storage_service()
