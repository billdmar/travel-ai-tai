"""FastAPI application factory for Travel AI (TAI).

``create_app`` builds a fully wired app from a :class:`Settings` instance: it
constructs the async DB engine, cache, LLM provider, and recommendation engine
onto ``app.state``; configures CORS and (toggleable) slowapi rate limiting;
registers the health and itinerary routers FIRST; and mounts the built React
SPA at ``/`` LAST with a catch-all so client-side routes resolve to
``index.html`` — guarded so the API runs fine without a built frontend.

Historical note: the resume-era prototype used Flask; this rewrite uses
FastAPI for first-class async, dependency injection, and OpenAPI docs.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import TYPE_CHECKING, AsyncIterator

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded

from api.cache import ItineraryCache
from api.config import Settings, get_settings
from api.db import build_engine, build_sessionmaker, create_all
from api.llm.provider import get_provider
from api.logging_config import setup_logging
from api.middleware import RequestIDMiddleware, SecurityHeadersMiddleware
from api.ratelimit import limiter
from api.recommend import RecommendationEngine
from api.routes import export as export_routes
from api.routes import health as health_routes
from api.routes import images as image_routes
from api.routes import itineraries as itinerary_routes
from api.routes import share as share_routes
from api.routes import stream as stream_routes

try:  # discovery router is provided by a sibling branch; tolerate its absence.
    from api.routes.destinations import router as destinations_router
except ImportError:  # pragma: no cover - present only after the merge.
    destinations_router = None

if TYPE_CHECKING:
    from fastapi.responses import Response

_WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"

_DESCRIPTION = (
    "LLM-powered personalized travel itinerary generator. Submit travel "
    "preferences and receive a structured, day-by-day itinerary."
)


def _configure_logging(settings: Settings) -> None:
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build and return a configured FastAPI application."""
    settings = settings or get_settings()
    _configure_logging(settings)

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
        await create_all(engine)
        yield
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
    app.add_middleware(RequestIDMiddleware)
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
    if destinations_router is not None:
        app.include_router(destinations_router)

    _mount_spa(app)

    return app


def _configure_cors(app: FastAPI, settings: Settings) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
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
    app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)


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
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=jsonable_encoder(
                {"error": "validation_failed", "detail": exc.errors()}
            ),
        )


def _mount_spa(app: FastAPI) -> None:
    """Mount the built React SPA at ``/`` with a catch-all (if it exists)."""
    if not _WEB_DIST.is_dir():
        return

    index_file = _WEB_DIST / "index.html"

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_catch_all(full_path: str) -> Response:
        candidate = _WEB_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index_file)

    app.mount("/", StaticFiles(directory=str(_WEB_DIST), html=True), name="static")


# Module-level app for `uvicorn api.main:app`.
app = create_app()
