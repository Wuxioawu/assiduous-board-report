import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse, RedirectResponse

from app.db.session import AsyncSessionLocal
from app.repositories.user import UserRepository
from app.services.storage import is_remote_storage_path

router = APIRouter(prefix="/users", tags=["users"])


async def _serve_avatar(user_id: uuid.UUID, *, cacheable: bool) -> FileResponse | RedirectResponse:
    # Deliberately unauthenticated: an <img src> can't attach an Authorization header,
    # and a profile photo isn't sensitive enough to justify the complexity of signed
    # URLs - the user_id keying it is already unguessable. Same tradeoff other apps
    # (e.g. Gravatar) make for avatar delivery.
    async with AsyncSessionLocal() as db:
        user = await UserRepository(db).get_by_id_unscoped(user_id)
    if user is None or not user.avatar_storage_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No avatar set for this user")

    # The versioned route's URL changes on every upload (see upload_avatar), so its
    # response can be cached indefinitely - that exact URL will never point to
    # different content. The legacy unversioned route stays in place only for
    # avatar_url values persisted before this route existed, and must never be
    # cached: the same URL there really can change contents on a future re-upload.
    headers = (
        {"Cache-Control": "public, max-age=31536000, immutable"}
        if cacheable
        else {"Cache-Control": "no-store"}
    )

    # STORAGE_PROVIDER=supabase stores a public URL as avatar_storage_path, not a
    # local path - FileResponse can't serve that (and Path(...).is_file() would
    # just silently return False for it, wrongly 404ing a real avatar), so hand
    # the browser off to the real file instead of trying to stream it ourselves.
    if is_remote_storage_path(user.avatar_storage_path):
        return RedirectResponse(user.avatar_storage_path, headers=headers)

    if not Path(user.avatar_storage_path).is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No avatar set for this user")
    return FileResponse(user.avatar_storage_path, media_type="image/jpeg", headers=headers)


@router.get("/{user_id}/avatar", response_model=None)
async def get_avatar(user_id: uuid.UUID) -> FileResponse | RedirectResponse:
    return await _serve_avatar(user_id, cacheable=False)


@router.get("/{user_id}/avatar/{version}", response_model=None)
async def get_avatar_versioned(user_id: uuid.UUID, version: str) -> FileResponse | RedirectResponse:
    # `version` isn't looked up - it only exists to make the URL unique per upload
    # (see upload_avatar's avatar_url construction) so browsers always refetch a
    # changed photo. The response served is always whatever the user's current
    # avatar is; there's no history of old versions to serve by an old token.
    return await _serve_avatar(user_id, cacheable=True)
