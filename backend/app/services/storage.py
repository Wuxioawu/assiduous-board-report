import uuid
from abc import ABC, abstractmethod
from pathlib import Path

from fastapi import UploadFile

from app.core.config import get_settings


class StorageService(ABC):
    @abstractmethod
    async def save(self, *, organization_id: uuid.UUID, company_id: uuid.UUID, file: UploadFile) -> str:
        """Persist the uploaded file and return a path/key that can locate it later."""


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


def get_storage_service() -> StorageService:
    return LocalStorageService(base_dir=get_settings().storage_dir)
