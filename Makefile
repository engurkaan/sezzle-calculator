
IMAGE ?= sezzle-calculator

.PHONY: help install dev-backend dev-frontend test test-backend test-frontend \
	coverage lint docker-build docker-run

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

install: ## Install frontend dependencies
	cd frontend && npm ci

dev-backend: ## Run the API on :8080
	$(MAKE) -C backend run

dev-frontend: ## Run the Vite dev server on :5173 (proxies /api to :8080)
	cd frontend && npm run dev

test: test-backend test-frontend ## Run all tests

test-backend:
	$(MAKE) -C backend test

test-frontend:
	cd frontend && npm test

coverage: ## Generate coverage reports for both layers
	$(MAKE) -C backend cover
	cd frontend && npm run coverage

lint: ## Run static analysis, formatting and type checks
	$(MAKE) -C backend vet
	cd frontend && npm run lint && npm run format:check && npm run typecheck

docker-build: ## Build the full-stack image
	docker build -t $(IMAGE) .

docker-run: docker-build ## Run the full-stack image on http://localhost:8080
	docker run --rm -p 8080:8080 $(IMAGE)
