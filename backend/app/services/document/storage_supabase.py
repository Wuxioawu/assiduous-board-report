import mimetypes
import uuid
from pathlib import Path

from fastapi import UploadFile
from storage3.exceptions import StorageException
from supabase import AsyncClient, create_async_client

from app.services.storage import StorageService


class StorageSupabaseError(RuntimeError):
    """Raised when a Supabase Storage operation fails (missing bucket, bad
    credentials, oversized file, network error, ...) so callers see a clear,
    specific error instead of a bare exception from deep inside the client or
    a silently-swallowed failure."""


def _guess_content_type(filename: str, *, default: str) -> str:
    return mimetypes.guess_type(filename)[0] or default


class StorageSupabase(StorageService):
    """Supabase Storage-backed implementation, swapped in by get_storage_service()
    when STORAGE_PROVIDER=supabase. Matches LocalStorageService's method
    signatures exactly (same abstract base) so no call site needs to know or
    care which provider is active.

    save*() return the object's public URL rather than a bare key - the target
    bucket must therefore be public (or fronted by a CDN/policy that makes
    these URLs resolve), since that's what gets persisted as storage_path and
    ultimately what avatar_url/logo_url serving redirects to (see
    app.services.storage.is_remote_storage_path and its callers in
    routes/users.py and routes/companies.py). delete()/get() parse the object
    key back out of that same URL so callers never need to track both forms.
    """

    def __init__(self, *, supabase_url: str, supabase_service_key: str, bucket: str):
        if not supabase_url or not supabase_service_key or not bucket:
            raise StorageSupabaseError(
                "Supabase storage is not configured - SUPABASE_URL, SUPABASE_SECRET_KEY "
                "(or SUPABASE_SERVICE_ROLE_KEY), and SUPABASE_STORAGE_BUCKET must all be "
                "set when STORAGE_PROVIDER=supabase."
            )
        self._supabase_url = supabase_url
        self._supabase_service_key = supabase_service_key
        self._bucket = bucket
        self._client: AsyncClient | None = None

    async def _get_client(self) -> AsyncClient:
        # create_async_client is itself a coroutine, so the client can't be built
        # in __init__ - built once lazily and cached rather than reconnecting
        # (and re-authenticating) on every single storage call.
        if self._client is None:
            self._client = await create_async_client(self._supabase_url, self._supabase_service_key)
        return self._client

    def _key_from_path_or_url(self, storage_path: str) -> str:
        """save*() returns a public URL (see class docstring); delete()/get()
        need the bare object key to call the Supabase API, so parse it back out
        of the standard `.../object/public/{bucket}/{key}` shape. Falls back to
        treating storage_path as already a bare key, so this stays correct even
        if a caller is ever given a raw key directly instead of a URL."""
        marker = f"/object/public/{self._bucket}/"
        if marker in storage_path:
            return storage_path.split(marker, 1)[1]
        return storage_path

    async def _upload(self, *, key: str, content: bytes, content_type: str) -> str:
        client = await self._get_client()
        bucket = client.storage.from_(self._bucket)
        try:
            await bucket.upload(key, content, {"content-type": content_type})
        except StorageException as exc:
            raise StorageSupabaseError(
                f"Failed to upload {key!r} to Supabase bucket {self._bucket!r}: {exc}"
            ) from exc
        return bucket.get_public_url(key)

    async def save(self, *, organization_id: uuid.UUID, company_id: uuid.UUID, file: UploadFile) -> str:
        suffix = Path(file.filename or "").suffix
        key = f"{organization_id}/{company_id}/{uuid.uuid4()}{suffix}"
        content = await file.read()
        content_type = file.content_type or _guess_content_type(file.filename or "", default="application/octet-stream")
        return await self._upload(key=key, content=content, content_type=content_type)

    async def save_bytes(
        self, *, organization_id: uuid.UUID, company_id: uuid.UUID, filename: str, content: bytes
    ) -> str:
        suffix = Path(filename).suffix or ".pdf"
        key = f"{organization_id}/{company_id}/{uuid.uuid4()}{suffix}"
        content_type = _guess_content_type(filename, default="application/pdf")
        return await self._upload(key=key, content=content, content_type=content_type)

    async def save_avatar_bytes(self, *, user_id: uuid.UUID, filename: str, content: bytes) -> str:
        suffix = Path(filename).suffix or ".jpg"
        key = f"avatars/{user_id}/{uuid.uuid4()}{suffix}"
        content_type = _guess_content_type(filename, default="image/jpeg")
        return await self._upload(key=key, content=content, content_type=content_type)

    async def save_logo_bytes(self, *, company_id: uuid.UUID, filename: str, content: bytes) -> str:
        suffix = Path(filename).suffix or ".jpg"
        key = f"logos/{company_id}/{uuid.uuid4()}{suffix}"
        content_type = _guess_content_type(filename, default="image/jpeg")
        return await self._upload(key=key, content=content, content_type=content_type)

    async def delete(self, storage_path: str) -> None:
        key = self._key_from_path_or_url(storage_path)
        client = await self._get_client()
        try:
            # Deleting an already-missing key is a no-op (200, not an error) on
            # Supabase's storage API, same as LocalStorageService's
            # unlink(missing_ok=True) - so no special-casing needed here to
            # satisfy the ABC's "no-op if it no longer exists" contract.
            await client.storage.from_(self._bucket).remove([key])
        except StorageException as exc:
            raise StorageSupabaseError(
                f"Failed to delete {key!r} from Supabase bucket {self._bucket!r}: {exc}"
            ) from exc

    async def get(self, storage_path: str) -> bytes:
        key = self._key_from_path_or_url(storage_path)
        client = await self._get_client()
        try:
            return await client.storage.from_(self._bucket).download(key)
        except StorageException as exc:
            raise StorageSupabaseError(
                f"Failed to download {key!r} from Supabase bucket {self._bucket!r}: {exc}"
            ) from exc
