import asyncio
import contextlib
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.services.extraction.auto_fetch import run_periodic_auto_fetch

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Content-Disposition isn't in the CORS-safelisted response headers, so it
    # must be explicitly exposed for the browser to read the export filename.
    expose_headers=["Content-Disposition"],
)

app.include_router(api_router)
