import uuid
from abc import ABC, abstractmethod
from pathlib import Path

from fastapi import UploadFile

from app.core.config import get_settings


def is_remote_storage_path(storage_path: str) -> bool:
    """True for a storage_path that's a full URL (e.g. a Supabase public URL)
    rather than a local filesystem path - callers that serve a stored file back
    (users.py/companies.py's avatar/logo routes) need this to decide between
    FileResponse (local) and a redirect (remote), since FileResponse can't serve
    a URL and Path(...).is_file() silently returns False for one instead of
    erroring, which would otherwise 404 a perfectly valid remote file."""
    return storage_path.startswith(("http://", "https://"))


class StorageService(ABC):
    @abstractmethod
    async def save(self, *, organization_id: uuid.UUID, company_id: uuid.UUID, file: UploadFile) -> str:
        """Persist the uploaded file and return a path/key that can locate it later."""

    @abstractmethod
    async def save_bytes(
        self, *, organization_id: uuid.UUID, company_id: uuid.UUID, filename: str, content: bytes
    ) -> str:
        """Persist raw bytes (e.g. a downloaded auto-fetch PDF, not an UploadFile)
        and return a path/key that can locate it later."""

    @abstractmethod
    async def delete(self, storage_path: str) -> None:
        """Remove a previously-saved file; a no-op if it no longer exists."""

    @abstractmethod
    async def get(self, storage_path: str) -> bytes:
        """Read back the full content of a previously-saved file, given the
        path/key save*() returned. Needed wherever saved content is read back
        in-process rather than just served to a browser (e.g. the extraction
        pipeline parsing an uploaded PDF) - service-agnostic, unlike relying on
        the storage_path being directly openable as a local file."""

    @abstractmethod
    async def save_avatar_bytes(self, *, user_id: uuid.UUID, filename: str, content: bytes) -> str:
        """Persist a user's profile photo (already validated/resized by the caller)
        and return a path/key that can locate it later. Kept separate from
        save_bytes since avatars are scoped by user_id, not organization/company."""

    @abstractmethod
    async def save_logo_bytes(self, *, company_id: uuid.UUID, filename: str, content: bytes) -> str:
        """Persist a company's logo (already validated/resized by the caller) and
        return a path/key that can locate it later. Kept separate from save_bytes
        since logos are scoped by company_id alone, not organization+company."""


class LocalStorageService(StorageService):
    """Dev-only filesystem storage. Swap for an S3-compatible implementation in Phase 2."""

    def __init__(self, base_dir: str | Path):
        self.base_dir = Path(base_dir)

    async def save(self, *, organization_id: uuid.UUID, company_id: uuid.UUID, file: UploadFile) -> str:
        target_dir = self.base_dir / str(organization_id) / str(company_id)
        target_dir.mkdir(parents=True, exist_ok=True)

        # Store under a generated name (never the client-supplied filename) to avoid
        # path traversal / collisions; the original filename is kept in the DB record.
        suffix = Path(file.filename or "").suffix
        target_path = target_dir / f"{uuid.uuid4()}{suffix}"

        with target_path.open("wb") as out_file:
            while chunk := await file.read(1024 * 1024):
                out_file.write(chunk)

        return str(target_path)

    async def save_bytes(
        self, *, organization_id: uuid.UUID, company_id: uuid.UUID, filename: str, content: bytes
    ) -> str:
        target_dir = self.base_dir / str(organization_id) / str(company_id)
        target_dir.mkdir(parents=True, exist_ok=True)

        suffix = Path(filename).suffix or ".pdf"
        target_path = target_dir / f"{uuid.uuid4()}{suffix}"
        target_path.write_bytes(content)
        return str(target_path)

    async def delete(self, storage_path: str) -> None:
        Path(storage_path).unlink(missing_ok=True)

    async def get(self, storage_path: str) -> bytes:
        return Path(storage_path).read_bytes()

    async def save_avatar_bytes(self, *, user_id: uuid.UUID, filename: str, content: bytes) -> str:
        target_dir = self.base_dir / "avatars" / str(user_id)
        target_dir.mkdir(parents=True, exist_ok=True)

        suffix = Path(filename).suffix or ".jpg"
        target_path = target_dir / f"{uuid.uuid4()}{suffix}"
        target_path.write_bytes(content)
        return str(target_path)

    async def save_logo_bytes(self, *, company_id: uuid.UUID, filename: str, content: bytes) -> str:
        target_dir = self.base_dir / "logos" / str(company_id)
        target_dir.mkdir(parents=True, exist_ok=True)

        suffix = Path(filename).suffix or ".jpg"
        target_path = target_dir / f"{uuid.uuid4()}{suffix}"
        target_path.write_bytes(content)
        return str(target_path)


def get_storage_service() -> StorageService:
    settings = get_settings()
    if settings.storage_provider == "supabase":
        # Imported lazily (not at module level) to avoid a circular import -
        # storage_supabase.py imports StorageService from this module.
        from app.services.document.storage_supabase import StorageSupabase

        return StorageSupabase(
            supabase_url=settings.supabase_url,
            supabase_service_key=settings.supabase_service_key,
            bucket=settings.supabase_storage_bucket,
        )
    return LocalStorageService(base_dir=get_settings().storage_dir)
