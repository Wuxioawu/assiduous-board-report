import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.request_timing import RequestTimingMiddleware
from app.services.extraction.auto_fetch import run_periodic_auto_fetch

# Ensures the per-request timing line (and the slow-query warning) actually
# reach a handler - uvicorn's own logging config only touches its "uvicorn.*"
# loggers, so without this "app.*" loggers would fall back to the logging
# module's WARNING-level "last resort" handler and silently drop our INFO line.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

settings = get_settings()


@contextlib.asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    auto_fetch_task = asyncio.create_task(run_periodic_auto_fetch())
    try:
        yield
    finally:
        auto_fetch_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await auto_fetch_task


app = FastAPI(title="Assiduous Board Report Platform API", version="0.1.0", lifespan=lifespan)

if settings.request_timing_enabled:
    app.add_middleware(RequestTimingMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Content-Disposition isn't in the CORS-safelisted response headers, so it
    # must be explicitly exposed for the browser to read the export filename;
    # X-Request-ID likewise needs to be explicit for the frontend's slow-request/
    # error correlation logging (see api/client.ts) to read it cross-origin.
    expose_headers=["Content-Disposition", "X-Request-ID"],
)

app.include_router(api_router)
