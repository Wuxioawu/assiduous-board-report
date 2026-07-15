"""Per-request timing instrumentation: one structured log line per HTTP
request breaking total_ms down into db_ms / llm_ms / storage_ms / app_ms, so
slowness can be attributed to a specific layer without an external APM
dependency. See ARCHITECTURE.md / README for the log line shape.

Request-scoped accumulation uses contextvars rather than a global/thread-local,
so it stays correct under concurrent requests: each incoming HTTP request is
its own asyncio Task, and asyncio copies the current contextvars.Context when
a Task is created, so two requests running concurrently each see their own
RequestMetrics instance despite sharing the same OS thread. SQLAlchemy's async
engine executes the actual DBAPI calls (and fires before/after_cursor_execute)
via greenlet_spawn on that same Task/thread rather than a separate asyncio
Task, so those callbacks still see the request's ContextVar value - see
app/db/session.py.
"""

import contextlib
import dataclasses
import logging
import time
import uuid
from collections.abc import AsyncIterator
from contextvars import ContextVar

logger = logging.getLogger("app.request_timing")

SLOW_QUERY_THRESHOLD_MS = 200.0
COLD_START_GAP_SECONDS = 60.0


@dataclasses.dataclass
class RequestMetrics:
    db_ms: float = 0.0
    db_queries: int = 0
    llm_ms: float = 0.0
    storage_ms: float = 0.0


_metrics_var: ContextVar[RequestMetrics | None] = ContextVar("request_metrics", default=None)
_request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)

# Process-local (deliberately NOT a contextvar): a cold Neon wake-up is a
# property of the process/connection, not of any one request, so "how long
# since the previous request finished" has to survive across requests rather
# than being scoped to one.
_last_request_end_monotonic: float | None = None


def current_request_id() -> str | None:
    return _request_id_var.get()


def _current_metrics() -> RequestMetrics | None:
    return _metrics_var.get()


def record_db_time(elapsed_ms: float) -> None:
    """Called from the SQLAlchemy before/after_cursor_execute hook pair (see
    app/db/session.py) once per statement execution."""
    metrics = _current_metrics()
    if metrics is not None:
        metrics.db_ms += elapsed_ms
        metrics.db_queries += 1


@contextlib.asynccontextmanager
async def atimed(component: str) -> AsyncIterator[None]:
    """Wraps an LLM call or a StorageService operation so its wall-clock time
    is added to the current request's llm_ms/storage_ms. A no-op outside a
    request (e.g. a background task not wrapped by the middleware below) -
    the accumulator is simply None there, so timing is skipped rather than
    raising."""
    metrics = _current_metrics()
    start = time.perf_counter()
    try:
        yield
    finally:
        elapsed_ms = (time.perf_counter() - start) * 1000
        if metrics is not None:
            if component == "llm":
                metrics.llm_ms += elapsed_ms
            elif component == "storage":
                metrics.storage_ms += elapsed_ms


@contextlib.asynccontextmanager
async def timed_background_job(job_name: str, **tags: object) -> AsyncIterator[None]:
    """Same db/llm/storage/app breakdown and log shape as the per-request
    line, for work that runs OUTSIDE any HTTP request/response cycle -
    FastAPI BackgroundTasks (e.g. run_extraction, kicked off from the upload
    and re-extract endpoints - see services/extraction/pipeline.py) execute
    in the same asyncio Task as the triggering request, but only after
    RequestTimingMiddleware has already logged and reset that request's
    contextvars (see its _log_and_release) - so without this, the single
    most expensive operation in the app (LLM extraction, tens of seconds)
    would be entirely invisible to this instrumentation. `tags` are extra
    key=value pairs identifying the job instance (e.g. document_id=...)."""
    metrics = RequestMetrics()
    metrics_token = _metrics_var.set(metrics)
    start = time.perf_counter()
    status = "success"
    try:
        yield
    except BaseException:
        status = "failed"
        raise
    finally:
        total_ms = (time.perf_counter() - start) * 1000
        app_ms = max(total_ms - metrics.db_ms - metrics.llm_ms - metrics.storage_ms, 0.0)
        tag_str = " ".join(f"{key}={value}" for key, value in tags.items())
        logger.info(
            f"job={job_name} {tag_str} status={status} total_ms={total_ms:.0f} "
            f"db_ms={metrics.db_ms:.0f} db_queries={metrics.db_queries} "
            f"llm_ms={metrics.llm_ms:.0f} storage_ms={metrics.storage_ms:.0f} "
            f"app_ms={app_ms:.0f}"
        )
        _metrics_var.reset(metrics_token)


def _set_request_id_header(message: dict, request_id: str) -> None:
    headers = list(message.get("headers", []))
    headers.append((b"x-request-id", request_id.encode("latin-1")))
    message["headers"] = headers


def _route_template(scope: dict) -> str:
    """The route PATH TEMPLATE (e.g. "/api/v1/companies/{company_id}/charts"),
    not the raw URL - so charts for 50 different companies all aggregate
    under one log "path", instead of one distinct value per company_id.

    Deliberately does NOT read scope["route"].path: FastAPI's router now
    resolves a nested include_router() (api_router, prefix="/api/v1",
    including e.g. charts.router) via an internal _IncludedRouter rather than
    eagerly flattening each sub-route's path with its parent's prefix baked
    in, so the matched leaf route's own .path lacks the "/api/v1" (and any
    other outer router's) prefix - it would silently under-report the path.
    Substituting resolved path_params' concrete values back to {name} in the
    raw request path is agnostic to however many routers deep this got
    resolved through.
    """
    path = scope.get("path", "")
    for name, value in (scope.get("path_params") or {}).items():
        path = path.replace(f"/{value}", f"/{{{name}}}")
    return path


class RequestTimingMiddleware:
    """Raw ASGI middleware (not BaseHTTPMiddleware) so the route template is
    available on `scope["route"]` after the inner app has handled routing,
    and so contextvars set here are visible all the way down through the
    endpoint without BaseHTTPMiddleware's extra task-group indirection.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = str(uuid.uuid4())
        metrics = RequestMetrics()
        request_id_token = _request_id_var.set(request_id)
        metrics_token = _metrics_var.set(metrics)

        status_holder = {"status": 0}
        start = time.perf_counter()
        released = False

        def _log_and_release() -> None:
            # Starlette's Response.__call__ sends "http.response.start" and
            # "http.response.body" and THEN (still inside the same await we're
            # wrapping) runs any BackgroundTasks attached to the response - see
            # e.g. routes/documents.py's upload_document, which hands
            # run_extraction to BackgroundTasks. From the client's socket the
            # response is already fully delivered once the body message is
            # sent; from our POV inside self.app(...) it isn't "done" until
            # the background task also finishes. Logging/resetting here, right
            # after the final body chunk, means total_ms reflects what the
            # client actually waited rather than including the whole
            # background extraction run - and resetting the contextvars here
            # (rather than after self.app() returns) means the background
            # task's own DB/LLM time lands nowhere (record_db_time/atimed are
            # no-ops once the var is back to its unset default) instead of
            # being misattributed to this request, since it keeps running in
            # this same asyncio Task/Context after the response is sent.
            nonlocal released
            if released:
                return
            released = True

            total_ms = (time.perf_counter() - start) * 1000

            global _last_request_end_monotonic
            now = time.monotonic()
            # No previous request (first one since process start) is treated
            # as cold too - that's the most common real cold-start case.
            gap = None if _last_request_end_monotonic is None else now - _last_request_end_monotonic
            cold_candidate = gap is None or gap > COLD_START_GAP_SECONDS
            _last_request_end_monotonic = now

            path = _route_template(scope)
            app_ms = max(total_ms - metrics.db_ms - metrics.llm_ms - metrics.storage_ms, 0.0)

            line = (
                f"req_id={request_id} method={scope.get('method', '')} path={path} "
                f"status={status_holder['status']} total_ms={total_ms:.0f} "
                f"db_ms={metrics.db_ms:.0f} db_queries={metrics.db_queries} "
                f"llm_ms={metrics.llm_ms:.0f} storage_ms={metrics.storage_ms:.0f} "
                f"app_ms={app_ms:.0f}"
            )
            if cold_candidate:
                line += " cold_candidate=true"
            logger.info(line)

            _request_id_var.reset(request_id_token)
            _metrics_var.reset(metrics_token)

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                status_holder["status"] = message["status"]
                _set_request_id_header(message, request_id)
            await send(message)
            if message["type"] == "http.response.body" and not message.get("more_body", False):
                _log_and_release()

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            # Fallback for a path that never sent a body message at all (e.g.
            # an exception before any response was produced) - ordinary
            # request/response cycles are already logged by send_wrapper above.
            _log_and_release()
