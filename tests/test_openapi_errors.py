"""OpenAPI error-contract tests.

Phase 5 documented the project's shared ``{"error": ...}`` envelope on the
generated schema (see :func:`api.main._install_openapi_error_responses`). These
tests assert that the schema actually advertises ``ErrorResponse`` for the 422
handler and for the representative 404/429/502/503 codes the routes raise —
WITHOUT asserting anything about the runtime bodies (those are doc-only edits,
so the wire format is covered by the per-route test modules).
"""

from __future__ import annotations

import pytest

from api.config import Settings
from api.main import create_app
from api.models import ErrorResponse

_ERROR_REF = "#/components/schemas/ErrorResponse"


@pytest.fixture
def schema() -> dict:
    """The generated OpenAPI schema for a mock-provider app."""
    app = create_app(
        Settings(
            LLM_PROVIDER="mock",
            OPENAI_API_KEY=None,
            RATE_LIMIT_ENABLED=False,
            DATABASE_URL="sqlite+aiosqlite:///:memory:",
            CACHE_BACKEND="memory",
            DEBUG_MODE=False,
        )
    )
    return app.openapi()


def _response_ref(schema: dict, method: str, path: str, code: str) -> str:
    """Return the ``$ref`` of the JSON response schema for one operation+code."""
    operation = schema["paths"][path][method.lower()]
    content = operation["responses"][code]["content"]
    return content["application/json"]["schema"]["$ref"]


def test_error_response_is_a_registered_component(schema: dict) -> None:
    """The shared envelope is a referenceable component in the schema."""
    assert "ErrorResponse" in schema["components"]["schemas"]
    component = schema["components"]["schemas"]["ErrorResponse"]
    # ``error`` is the only required field; ``detail``/``retry_after_seconds``
    # are optional so the model documents (not constrains) the wire bodies.
    assert component["required"] == ["error"]
    assert set(component["properties"]) == {
        "error",
        "detail",
        "retry_after_seconds",
    }


def test_error_response_model_matches_runtime_envelope() -> None:
    """ErrorResponse round-trips every envelope the app emits at runtime."""
    # 404/502/503 style: bare code.
    assert ErrorResponse(error="itinerary_not_found").model_dump(
        exclude_none=True
    ) == {"error": "itinerary_not_found"}
    # 422 handler style: code + human detail.
    assert ErrorResponse(
        error="validation_failed", detail="One or more fields were invalid."
    ).model_dump(exclude_none=True) == {
        "error": "validation_failed",
        "detail": "One or more fields were invalid.",
    }
    # 429 handler style: code + retry hint.
    assert ErrorResponse(
        error="rate_limit_exceeded", retry_after_seconds=60
    ).model_dump(exclude_none=True) == {
        "error": "rate_limit_exceeded",
        "retry_after_seconds": 60,
    }


def test_validation_422_uses_error_response(schema: dict) -> None:
    """The auto-generated 422 is re-pointed at our envelope, not FastAPI's."""
    # Representative body-bearing endpoints across routers.
    for method, path in (
        ("POST", "/api/v1/itineraries"),
        ("POST", "/api/v1/itineraries/stream"),
        ("POST", "/api/v1/destinations/recommend"),
        ("GET", "/api/v1/itineraries/{itinerary_id}/export"),
    ):
        assert _response_ref(schema, method, path, "422") == _ERROR_REF


@pytest.mark.parametrize(
    ("method", "path", "code"),
    [
        # 404: missing/soft-deleted resource (itinerary + share token).
        ("GET", "/api/v1/itineraries/{itinerary_id}", "404"),
        ("DELETE", "/api/v1/itineraries/{itinerary_id}", "404"),
        ("GET", "/api/v1/shared/{token}", "404"),
        # 429: rate-limit envelope on a write and a read.
        ("POST", "/api/v1/itineraries", "429"),
        ("GET", "/api/v1/images", "429"),
        # 502: upstream parse failure (itinerary + discovery).
        ("POST", "/api/v1/itineraries", "502"),
        ("POST", "/api/v1/destinations/recommend", "502"),
        # 503: provider unavailable + missing PDF backend.
        ("POST", "/api/v1/itineraries", "503"),
        ("GET", "/api/v1/itineraries/{itinerary_id}/export", "503"),
    ],
)
def test_runtime_error_codes_documented(
    schema: dict, method: str, path: str, code: str
) -> None:
    """Each runtime error status an endpoint raises is documented with the envelope."""
    assert _response_ref(schema, method, path, code) == _ERROR_REF


def test_openapi_schema_is_cached(schema: dict) -> None:
    """The override caches like the stock generator (same object on re-call)."""
    app = create_app(
        Settings(
            LLM_PROVIDER="mock",
            OPENAI_API_KEY=None,
            RATE_LIMIT_ENABLED=False,
            DATABASE_URL="sqlite+aiosqlite:///:memory:",
            CACHE_BACKEND="memory",
            DEBUG_MODE=False,
        )
    )
    assert app.openapi() is app.openapi()
