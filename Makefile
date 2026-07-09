.PHONY: help dev web-dev test test-fe lint typecheck build smoke clean

help: ## Show all targets with descriptions
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

dev: ## Run backend dev server with hot reload
	.venv/bin/uvicorn api.main:app --reload

web-dev: ## Run frontend dev server
	cd web && npm run dev

test: ## Run backend tests with coverage
	.venv/bin/pytest -q --cov=api --cov-report=term-missing

test-fe: ## Run frontend tests with coverage
	cd web && npm run test:cov

lint: ## Lint and type-check backend code
	.venv/bin/ruff check api/ tests/ && .venv/bin/mypy api/ --ignore-missing-imports

typecheck: ## Type-check frontend code
	cd web && npx tsc --noEmit -p tsconfig.app.json

build: ## Build frontend for production
	cd web && npm run build

smoke: ## Run smoke tests
	./scripts/smoke-test.sh

clean: ## Remove build artifacts and caches
	rm -rf web/dist && find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
