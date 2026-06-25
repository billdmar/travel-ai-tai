"""Prometheus metrics exposition endpoint (opt-in).

``GET /metrics`` renders the default Prometheus registry in the text exposition
format consumed by a Prometheus scraper. The counters/histograms themselves are
populated by :class:`api.middleware.MetricsMiddleware`.

Opt-in: ``create_app`` only registers this router (and the middleware) when
``Settings.enable_metrics`` is true, so the endpoint is simply absent (404) on
the default deploy.
"""

from __future__ import annotations

from fastapi import APIRouter, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

router = APIRouter(tags=["metrics"])


@router.get("/metrics", include_in_schema=False)
async def metrics() -> Response:
    """Return the default registry in Prometheus text exposition format."""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
