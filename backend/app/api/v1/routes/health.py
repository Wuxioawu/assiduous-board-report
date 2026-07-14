from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services.schema_check import get_schema_status

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check() -> dict:
    return {"status": "ok"}


@router.get("/health/config")
async def health_config(db: AsyncSession = Depends(get_db)) -> dict:
    # Unauthenticated like /health above - this is an infra-facing diagnostic
    # (deploy scripts, uptime checks), not a user-facing endpoint, and the
    # only data it exposes is a migration revision hash, not application data.
    return await get_schema_status(db)
