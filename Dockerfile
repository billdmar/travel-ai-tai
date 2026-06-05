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

# Install Python deps. CPU-only — no heavy ML wheels here.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# App code + the compiled frontend.
COPY api/ ./api/
COPY alembic/ ./alembic/
COPY --from=web-build /web/dist ./web/dist

EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]

# ── GPU / scale note ─────────────────────────────────────────────────────────
# This image is CPU-only and stateless; scale horizontally behind a load
# balancer and point DATABASE_URL at Postgres + CACHE_BACKEND=redis for shared
# state across replicas.
