import asyncio
import uuid
from abc import ABC, abstractmethod
from pathlib import Path
from typing import TYPE_CHECKING

import httpx
from fastapi import UploadFile

from app.core.config import get_settings

if TYPE_CHECKING:
    from app.models.document import Document

# Tuned for a filing-sized PDF over a normal connection, not a huge download -
# generous enough to tolerate a slow Supabase/CDN response without hanging
# the extraction background task indefinitely.
_FETCH_TIMEOUT_SECONDS = 30.0
_FETCH_MAX_ATTEMPTS = 3
_FETCH_RETRY_BACKOFF_SECONDS = 1.0
# Read in chunks (not response.aread() / .content) so a large file doesn't
# require httpx to hold a second, separately-buffered full copy in memory
# during the read - see _fetch_url_bytes.
_FETCH_CHUNK_BYTES = 256 * 1024


def is_remote_storage_path(storage_path: str) -> bool:
    """True for a storage_path that's a full URL (e.g. a Supabase public URL)
    rather than a local filesystem path - callers that serve a stored file back
    (users.py/companies.py's avatar/logo routes) need this to decide between
    FileResponse (local) and a redirect (remote), since FileResponse can't serve
    a URL and Path(...).is_file() silently returns False for one instead of
    erroring, which would otherwise 404 a perfectly valid remote file."""
    return storage_path.startswith(("http://", "https://"))


class DocumentUnreachableError(RuntimeError):
    """A Document's stored file couldn't be read back, from either a local
    disk path or a remote URL - see get_document_bytes. Callers (extraction,
    re-extraction) catch this to record a clear, specific
    Document.error_message ("stored file unreachable at ...: ...") instead of
    letting a raw FileNotFoundError/httpx exception leak through - especially
    important since passing a URL through Path()/os.path anywhere upstream
    silently collapses "https://host/x" into "https:/host/x" (a single
    slash), which then fails with an opaque "[Errno 2] No such file or
    directory" naming a string that was never the real location. This
    exception always carries the ORIGINAL, unmangled location."""

    def __init__(self, location: str, reason: str):
        self.location = location
        self.reason = reason
        super().__init__(f"Stored document file unreachable at {location!r}: {reason}")


async def get_document_bytes(document: "Document") -> bytes:
    """The one place a Document's file content is read back into memory -
    extraction and re-extraction both go through this rather than asking
    get_storage_service() for the CURRENTLY CONFIGURED provider's get(),
    because a Document's storage_path can be either a local filesystem path
    or a full URL independent of whatever STORAGE_PROVIDER says right now:
    an environment's provider setting can change over time, or a script can
    run against a database that was populated by a differently-configured
    environment (e.g. production data - STORAGE_PROVIDER=supabase, uploads
    saved as public URLs - inspected from a dev environment defaulting to
    STORAGE_PROVIDER=local). Which kind of location THIS ONE document has is
    decided by looking at the stored string itself, not by asking the global
    config which backend is active.

    storage_path is kept as an opaque string right up until the scheme check
    inside is_remote_storage_path() - it must NEVER be passed through
    Path()/os.path first (see DocumentUnreachableError's docstring for why).
    """
    location = document.storage_path
    if is_remote_storage_path(location):
        return await _fetch_url_bytes(location)
    return _read_local_bytes(location)


def _read_local_bytes(path: str) -> bytes:
    local_path = Path(path)
    if not local_path.is_file():
        raise DocumentUnreachableError(path, "file not found on local disk")
    try:
        return local_path.read_bytes()
    except OSError as exc:
        raise DocumentUnreachableError(path, str(exc)) from exc


async def _fetch_url_bytes(url: str) -> bytes:
    """GETs `url` with a bounded timeout, retrying transient failures (timeouts,
    connection errors, 5xx) up to _FETCH_MAX_ATTEMPTS times with a short
    backoff. A 4xx response is treated as permanent (retrying a 404 or 403
    can't ever succeed) and raises immediately. Streams the response body in
    chunks via client.stream()/aiter_bytes() rather than a single .content
    read, so a large filing doesn't force httpx to materialize two full
    in-memory copies of it at once."""
    last_error = "request failed"
    # follow_redirects=True: some storage providers serve a download via a
    # signed 3xx redirect rather than a direct 200 - without this, httpx
    # returns the redirect response itself (a near-empty body) instead of
    # following it, which would silently return the wrong bytes rather than
    # erroring.
    async with httpx.AsyncClient(timeout=_FETCH_TIMEOUT_SECONDS, follow_redirects=True) as client:
        for attempt in range(1, _FETCH_MAX_ATTEMPTS + 1):
            try:
                async with client.stream("GET", url) as response:
                    if 400 <= response.status_code < 500:
                        raise DocumentUnreachableError(
                            url, f"HTTP {response.status_code} {response.reason_phrase}"
                        )
                    response.raise_for_status()
                    chunks = bytearray()
                    async for chunk in response.aiter_bytes(_FETCH_CHUNK_BYTES):
                        chunks.extend(chunk)
                    return bytes(chunks)
            except DocumentUnreachableError:
                raise
            except (httpx.TimeoutException, httpx.TransportError, httpx.HTTPStatusError) as exc:
                last_error = str(exc) or exc.__class__.__name__
                if attempt < _FETCH_MAX_ATTEMPTS:
                    await asyncio.sleep(_FETCH_RETRY_BACKOFF_SECONDS * attempt)
    raise DocumentUnreachableError(url, f"failed after {_FETCH_MAX_ATTEMPTS} attempts: {last_error}")


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
