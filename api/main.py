"""FastAPI application factory for Travel AI (TAI).

``create_app`` builds a fully wired app from a :class:`Settings` instance: it
constructs the async DB engine, cache, LLM provider, and recommendation engine
onto ``app.state``; configures CORS and (toggleable) slowapi rate limiting;
registers the health and itinerary routers FIRST; and mounts the built React
SPA at ``/`` LAST with a catch-all so client-side routes resolve to
``index.html`` — guarded so the API runs fine without a built frontend.

"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import TYPE_CHECKING, AsyncIterator

import httpx
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import FileResponse, JSONResponse
from slowapi.errors import RateLimitExceeded
from starlette.middleware.gzip import GZipMiddleware

from api.cache import ItineraryCache
from api.config import Settings, get_settings
from api.db import build_engine, build_sessionmaker, create_all, run_migrations
from api.llm.provider import get_provider
from api.logging_config import setup_logging
from api.middleware import RequestIDMiddleware, SecurityHeadersMiddleware
from api.models import ErrorResponse
from api.observability import init_sentry
from api.ratelimit import limiter
from api.recommend import RecommendationEngine
from api.routes import curated_destinations as curated_destinations_routes
from api.routes import export as export_routes
from api.routes import health as health_routes
from api.routes import images as image_routes
from api.routes import itineraries as itinerary_routes
from api.routes import og as og_routes
from api.routes import share as share_routes
from api.routes import stream as stream_routes
from api.routes.destinations import router as destinations_router

if TYPE_CHECKING:
    from fastapi.responses import Response

logger = logging.getLogger("tai.main")

_WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"

_DESCRIPTION = (
    "LLM-powered personalized travel itinerary generator. Submit travel "
    "preferences and receive a structured, day-by-day itinerary."
)


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build and return a configured FastAPI application."""
    settings = settings or get_settings()
    # Opt-in error tracking. Wired before any route registration so the SDK can
    # instrument the app; a no-op unless SENTRY_DSN is set (see api.observability).
    init_sentry(settings)

    engine = build_engine(settings.database_url)
    sessionmaker = build_sessionmaker(engine)
    cache = ItineraryCache(settings)
    provider = get_provider(settings)
    recommendation_engine = RecommendationEngine(
        settings=settings, provider=provider, cache=cache
    )

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        setup_logging()
        # Schema bootstrap. Postgres (the documented prod backend) is brought to
        # the latest schema with Alembic so versioned changes apply on deploy.
        # SQLite/dev keeps the zero-config create_all path — it also keeps the
        # test harness fast (tests inject their own engine + create_all and never
        # touch this branch).
        if settings.is_postgres:
            await run_migrations()
        else:
            await create_all(engine)
            # Postgres seeds the curated destinations via the Alembic migration;
            # the SQLite/dev create_all path makes the empty table, so seed it
            # here (idempotent — no-op once populated) so the curated endpoint
            # has rows in every environment.
            from api.seed_destinations import seed_destinations_if_empty

            # Read the sessionmaker off app.state (not the closure) so the test
            # harness's injected DB is seeded too — the curated endpoint reads
            # via the same get_session-backed sessionmaker. Best-effort: a seed
            # failure must never abort startup (the curated endpoint would just
            # return an empty list and the frontend falls back to its static
            # array), so any error is logged and swallowed.
            try:
                async with _app.state.sessionmaker() as session:
                    await seed_destinations_if_empty(session)
            except Exception:  # pragma: no cover - defensive startup guard
                logger.warning("curated_destinations_seed_failed", exc_info=True)
        _app.state.http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(settings.http_timeout_seconds),
            follow_redirects=True,
        )
        yield
        await _app.state.http_client.aclose()
        await engine.dispose()

    app = FastAPI(
        title="Travel AI (TAI)",
        description=_DESCRIPTION,
        version=settings.version,
        contact={"name": "William Mar"},
        lifespan=lifespan,
    )

    # Shared state for handlers / dependencies.
    app.state.settings = settings
    app.state.engine = recommendation_engine
    app.state.db_engine = engine
    app.state.sessionmaker = sessionmaker
    app.state.cache = cache

    # Observability/security middleware (added before CORS so CORS runs
    # outermost). BE-HARDEN fills these stubs with real behavior.
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.add_middleware(RequestIDMiddleware)
    # Opt-in Prometheus request metrics (no-op unless ENABLE_METRICS=true).
    if settings.enable_metrics:
        from api.middleware import MetricsMiddleware

        app.add_middleware(MetricsMiddleware)
    _configure_cors(app, settings)
    _configure_rate_limiting(app, settings)
    _configure_error_handlers(app)

    # Routers FIRST so /health, /api/v1/*, /docs, /openapi.json take precedence
    # over the static SPA mount registered last.
    app.include_router(health_routes.router)
    app.include_router(itinerary_routes.router)
    app.include_router(image_routes.router)
    app.include_router(export_routes.router)
    app.include_router(share_routes.router)
    app.include_router(stream_routes.router)
    app.include_router(curated_destinations_routes.router)
    app.include_router(og_routes.router)
    app.include_router(destinations_router)
    # Opt-in /metrics endpoint (registered only when ENABLE_METRICS=true).
    if settings.enable_metrics:
        from api.routes import metrics as metrics_routes

        app.include_router(metrics_routes.router)

    _install_openapi_error_responses(app)
    _mount_spa(app)

    return app


def _configure_cors(app: FastAPI, settings: Settings) -> None:
    # The app uses no cookies/auth, so credentials are never sent cross-origin.
    # Keeping ``allow_credentials=False`` avoids the credentials+origin footgun
    # and lets the browser honour the explicit ``allow_origins`` allowlist.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )


def _configure_rate_limiting(app: FastAPI, settings: Settings) -> None:
    """Wire slowapi onto the app, toggling the shared limiter.

    The shared module-level limiter (decorating ``create_itinerary`` with
    ``10/minute``) is enabled/disabled via the ``RATE_LIMIT_ENABLED`` setting
    (default true), so rate limiting is toggleable without touching routes.
    """
    limiter.enabled = settings.rate_limit_enabled
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)  # type: ignore[arg-type]


def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> Response:
    """Return the project's 429 envelope (request must be first per slowapi)."""
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={"error": "rate_limit_exceeded", "retry_after_seconds": 60},
        headers={"Retry-After": "60"},
    )


def _configure_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def _on_validation_error(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # Log the full Pydantic errors server-side for debugging, but return a
        # generic envelope so loc/type/ctx schema internals never leak.
        logger.warning("validation_failed errors=%s", exc.errors())
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": "validation_failed",
                "detail": "One or more fields were invalid.",
            },
        )


# Per-operation map of the runtime error statuses each API endpoint raises
# beyond the 422 that FastAPI documents automatically. Keyed by
# ``(METHOD, path)`` to the status codes the route's handler (or its rate-limit
# dependency) can return as the shared ``{"error": ...}`` envelope. This is
# documentation only — the route files already emit these bodies at runtime;
# the table just teaches the generated OpenAPI schema about them. Descriptions
# are derived from the canonical ``error`` codes the routes use.
_ERROR_RESPONSES: dict[tuple[str, str], dict[int, str]] = {
    ("POST", "/api/v1/itineraries"): {
        429: "rate_limit_exceeded",
        502: "itinerary_parse_failed",
        503: "llm_unavailable",
    },
    ("POST", "/api/v1/itineraries/{itinerary_id}/regenerate"): {
        404: "itinerary_not_found",
        429: "rate_limit_exceeded",
        502: "itinerary_parse_failed",
        503: "llm_unavailable",
    },
    ("GET", "/api/v1/itineraries/{itinerary_id}"): {
        404: "itinerary_not_found",
        429: "rate_limit_exceeded",
    },
    ("POST", "/api/v1/itineraries/{itinerary_id}/save"): {
        404: "itinerary_not_found",
    },
    ("DELETE", "/api/v1/itineraries/{itinerary_id}"): {
        404: "itinerary_not_found",
    },
    ("GET", "/api/v1/itineraries"): {
        429: "rate_limit_exceeded",
    },
    ("GET", "/api/v1/itineraries/{itinerary_id}/export"): {
        404: "itinerary_not_found",
        429: "rate_limit_exceeded",
        503: "pdf_export_unavailable",
    },
    ("POST", "/api/v1/itineraries/{itinerary_id}/share"): {
        404: "itinerary_not_found",
    },
    ("GET", "/api/v1/shared/{token}"): {
        404: "share_token_not_found",
        429: "rate_limit_exceeded",
    },
    ("POST", "/api/v1/destinations/recommend"): {
        502: "destinations_parse_failed",
        503: "llm_unavailable",
    },
    ("GET", "/api/v1/images"): {
        429: "rate_limit_exceeded",
    },
}


def _install_openapi_error_responses(app: FastAPI) -> None:
    """Document the shared error envelope on the generated OpenAPI schema.

    FastAPI auto-documents a 422 (against its own ``HTTPValidationError``) for
    every endpoint with a body/params, but the app's handlers and routes return
    the project's own ``{"error": ...}`` envelope (see :class:`ErrorResponse`).
    This wraps ``app.openapi`` so the cached schema (1) re-points each 422 at
    ``ErrorResponse`` and (2) adds the 404/429/502/503 responses each endpoint
    can actually raise, per :data:`_ERROR_RESPONSES`.

    Doc/schema only: it mutates the generated schema, never the runtime
    responses. The result is cached on ``app.openapi_schema`` the first time
    ``/openapi.json`` (or ``app.openapi()``) is requested, exactly like the
    stock generator.
    """

    def custom_openapi() -> dict:
        if app.openapi_schema is not None:
            return app.openapi_schema
        schema = get_openapi(
            title=app.title,
            version=app.version,
            description=app.description,
            routes=app.routes,
            contact=app.contact,
        )
        # Ensure the ErrorResponse schema is a referenceable component even if no
        # operation happens to use it as a request/response model elsewhere.
        components = schema.setdefault("components", {}).setdefault("schemas", {})
        components.setdefault("ErrorResponse", ErrorResponse.model_json_schema())
        error_ref = {
            "application/json": {
                "schema": {"$ref": "#/components/schemas/ErrorResponse"}
            }
        }

        for path, methods in schema.get("paths", {}).items():
            for method, operation in methods.items():
                responses = operation.get("responses")
                if responses is None:
                    continue
                # Re-point the auto-generated 422 at our envelope.
                if "422" in responses:
                    responses["422"] = {
                        "description": "Validation error (validation_failed).",
                        "content": error_ref,
                    }
                # Add the endpoint-specific runtime error codes.
                for code, error_name in _ERROR_RESPONSES.get(
                    (method.upper(), path), {}
                ).items():
                    responses[str(code)] = {
                        "description": error_name,
                        "content": error_ref,
                    }

        app.openapi_schema = schema
        return schema

    app.openapi = custom_openapi  # type: ignore[method-assign]


# Hashed Vite assets (``/assets/<name>-<hash>.<ext>``) are content-addressed, so
# they can be cached forever; ``index.html`` must never be cached or clients
# would pin a stale asset manifest.
_IMMUTABLE_CACHE = "public, max-age=31536000, immutable"
_NO_CACHE = "no-cache"


def _mount_spa(app: FastAPI) -> None:
    """Mount the built React SPA at ``/`` with a catch-all (if it exists)."""
    if not _WEB_DIST.is_dir():
        return

    index_file = _WEB_DIST / "index.html"

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_catch_all(full_path: str) -> Response:
        candidate = _WEB_DIST / full_path
        if full_path and candidate.is_file():
            # Hashed assets are immutable; everything else served as a file is
            # not aggressively cached (it could be index.html under a path).
            cache_control = (
                _IMMUTABLE_CACHE
                if full_path.startswith("assets/")
                else _NO_CACHE
            )
            return FileResponse(
                candidate, headers={"Cache-Control": cache_control}
            )
        return FileResponse(index_file, headers={"Cache-Control": _NO_CACHE})



# Module-level instance for `uvicorn api.main:app`.
app = create_app()
