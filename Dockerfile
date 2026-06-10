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

# Install Python deps. CPU-only — no heavy ML wheels, no grpc.
# Prod runs LLM_PROVIDER=mock; the optional Gemini SDK (grpcio/protobuf) is a
# dev-only dep (requirements-dev.txt) and is intentionally NOT installed here,
# so this slim image needs no compiler toolchain.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# App code + the compiled frontend.
COPY api/ ./api/
COPY --from=web-build /web/dist ./web/dist

# Bind the port the platform provides ($PORT on Render/Heroku/Cloud Run);
# fall back to 8000 for local `docker run`. Shell form so $PORT is expanded.
EXPOSE 8000
CMD uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000}

# ── GPU / scale note ─────────────────────────────────────────────────────────
# This image is CPU-only and stateless; scale horizontally behind a load
# balancer and point DATABASE_URL at Postgres + CACHE_BACKEND=redis for shared
# state across replicas.
