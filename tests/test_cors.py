"""CORS configuration tests.

The app uses no cookies/auth, so CORS runs with ``allow_credentials=False`` and
an explicit origin allowlist. These tests assert the middleware is wired that
way and that a disallowed origin gets no ``Access-Control-Allow-Origin`` echo.
"""

from __future__ import annotations

from fastapi.middleware.cors import CORSMiddleware

from api.main import create_app


def _cors_middleware(app):
    """Return the CORSMiddleware entry from the app's middleware stack."""
    for middleware in app.user_middleware:
        if middleware.cls is CORSMiddleware:
            return middleware
    raise AssertionError("CORSMiddleware is not configured")


def test_cors_middleware_disables_credentials(test_settings) -> None:
    app = create_app(test_settings)
    middleware = _cors_middleware(app)
    assert middleware.kwargs["allow_credentials"] is False


async def test_disallowed_origin_not_echoed(client) -> None:
    resp = await client.get(
        "/health", headers={"Origin": "https://evil.example.com"}
    )
    assert resp.status_code == 200
    assert "access-control-allow-origin" not in resp.headers


async def test_allowed_origin_is_echoed(client) -> None:
    # test_settings allows the localhost dev origin.
    resp = await client.get(
        "/health", headers={"Origin": "http://localhost:5173"}
    )
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == "http://localhost:5173"
