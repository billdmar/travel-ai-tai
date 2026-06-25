# Multi-stage build: compile the React frontend, then serve it + the API from
# one Python container.

# ── Stage 1: build the frontend ──────────────────────────────────────────────
FROM node:20-alpine AS web-build
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build          # emits /web/dist

# ── Stage 2: Python API serving the built static files ───────────────────────
FROM python:3.11-slim AS runtime
WORKDIR /app

# Install Python deps. CPU-only. Includes the Gemini SDK (google-generativeai)
# so the live site can run LLM_PROVIDER=gemini; its grpcio/protobuf deps ship
# prebuilt manylinux wheels for this slim image, so no compiler toolchain is
# needed. The gemini provider still imports the SDK lazily.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# App code + the compiled frontend.
COPY api/ ./api/
COPY --from=web-build /web/dist ./web/dist

# Bind the port the platform provides ($PORT on Render/Heroku/Cloud Run);
# fall back to 8000 for local `docker run`. Shell form so $PORT is expanded.
EXPOSE 8000

# Liveness check using Python (no curl, to avoid image bloat). Hits the
# dependency-free /health probe in api/routes/health.py. Targets 8000 — the
# local `docker run` fallback port; managed platforms (Render) use their own
# external healthCheckPath and ignore this instruction.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health').status==200 else 1)"

# Drain in-flight SSE/LLM requests on deploy instead of cutting them:
#   --timeout-graceful-shutdown 30  wait up to 30s for active requests to finish
#   --timeout-keep-alive 65         keep idle keep-alive sockets ~65s (> typical
#                                   60s LB idle timeout) to avoid races
CMD uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000} --timeout-graceful-shutdown 30 --timeout-keep-alive 65

# ── GPU / scale note ─────────────────────────────────────────────────────────
# This image is CPU-only and stateless; scale horizontally behind a load
# balancer and point DATABASE_URL at Postgres + CACHE_BACKEND=redis for shared
# state across replicas.
