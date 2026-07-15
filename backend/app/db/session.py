import logging
import time
from collections.abc import AsyncGenerator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.request_timing import SLOW_QUERY_THRESHOLD_MS, record_db_time

settings = get_settings()
slow_query_logger = logging.getLogger("app.slow_query")

engine = create_async_engine(
    settings.database_url,
    echo=False,
    future=True,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args={"statement_cache_size": 0},
)


@event.listens_for(engine.sync_engine, "before_cursor_execute")
def _before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    # Stashed on the ExecutionContext (one per statement execution, even for
    # the async engine - the actual DBAPI call happens via greenlet_spawn on
    # the same Task/thread, not a separate one) rather than a module-level
    # variable, so concurrent statements on different connections never
    # clobber each other's start time.
    context._request_timing_start = time.perf_counter()


@event.listens_for(engine.sync_engine, "after_cursor_execute")
def _after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    start = getattr(context, "_request_timing_start", None)
    if start is None:
        return
    elapsed_ms = (time.perf_counter() - start) * 1000
    record_db_time(elapsed_ms)
    if elapsed_ms > SLOW_QUERY_THRESHOLD_MS:
        # Parameters deliberately omitted - they can hold customer financial
        # data/PII, and the statement text alone is enough to spot a missing
        # index or an N+1 amplifier.
        slow_query_logger.warning(
            "slow_query_ms=%.0f statement=%r", elapsed_ms, statement
        )


AsyncSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
