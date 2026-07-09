# Contributing to Travel AI

Thanks for your interest in contributing. This guide covers the local dev workflow.

## Prerequisites

- Python 3.11+ with a virtual environment (`.venv/`)
- Node.js 20+ (frontend)
- Make (optional — the Makefile wraps all common commands)

## Setup

```bash
# Backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt

# Frontend
cd web && npm install
```

## Development

```bash
make dev        # backend (uvicorn, auto-reload at :8000)
make web-dev    # frontend (vite dev server at :5173)
```

The frontend proxies `/api` to `:8000` automatically.

## Quality checks

```bash
make lint       # ruff + mypy (full api/ package)
make typecheck  # TypeScript strict
make test       # backend (pytest, mock provider, no network)
make test-fe    # frontend (vitest + coverage thresholds)
```

All four must pass before opening a PR. CI enforces a 90% backend coverage gate.

## Pre-commit hooks (recommended)

```bash
pip install pre-commit
pre-commit install
```

This runs ruff, trailing-whitespace, and end-of-file fixers on every commit.

## Branch naming

- `feat/<short-description>` for new features
- `fix/<short-description>` for bug fixes
- `chore/<short-description>` for tooling/docs/deps

## Pull requests

Use the PR template (`.github/pull_request_template.md`). Ensure:

- [ ] Backend tests pass (`make test`)
- [ ] Frontend builds and tests pass (`make build && make test-fe`)
- [ ] Lint clean (`make lint`)
- [ ] Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)

## Code style

- **Python:** ruff (line-length 100, isort) + mypy strict on all of `api/`
- **TypeScript:** strict mode, eslint, prettier via Vite
- **CSS:** Tailwind utility classes; design tokens in `web/src/index.css`
