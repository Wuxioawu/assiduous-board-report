from alembic.config import Config as AlembicConfig
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import BACKEND_DIR, get_settings

_ALEMBIC_INI = BACKEND_DIR / "alembic.ini"


def get_bundled_head_revision() -> str | None:
    """The latest migration revision bundled in the deployed codebase, read
    straight from migrations/ on disk - not the DB's applied revision (see
    get_db_revision). Resolves alembic.ini/migrations by absolute path (see
    BACKEND_DIR) so this works regardless of the process's current working
    directory."""
    cfg = AlembicConfig(str(_ALEMBIC_INI))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    return ScriptDirectory.from_config(cfg).get_current_head()


async def get_db_revision(db: AsyncSession) -> str | None:
    """The migration revision actually applied to this database - None if
    alembic_version doesn't exist yet (a database that's never been migrated),
    distinct from a revision mismatch."""
    table_exists = await db.execute(text("SELECT to_regclass('public.alembic_version')"))
    if table_exists.scalar_one_or_none() is None:
        return None
    result = await db.execute(text("SELECT version_num FROM alembic_version"))
    return result.scalar_one_or_none()


async def get_schema_status(db: AsyncSession) -> dict:
    """Powers GET /health/config's schema_current field - lets a lagging
    production schema (a deploy that started serving before its migration
    step ran, or ran against the wrong database) be spotted at a glance rather
    than discovered via a 500 on the first query touching a missing column."""
    db_revision = await get_db_revision(db)
    head_revision = get_bundled_head_revision()
    return {
        "db_revision": db_revision,
        "head_revision": head_revision,
        "schema_current": db_revision is not None and db_revision == head_revision,
        "storage_backend": get_settings().storage_provider,
    }
