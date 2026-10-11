.PHONY: run build test cover vet fmt

run: ## Run the API server on :8080
	go run ./cmd/server

build: ## Build a static binary into bin/
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/server ./cmd/server

test: ## Run all tests with the race detector
	go test -race ./...

cover: ## Write coverage.out and coverage.html and print a per-function summary
	go test -coverprofile=coverage.out ./...
	go tool cover -func=coverage.out
	go tool cover -html=coverage.out -o coverage.html

vet: ## Run static checks
	go vet ./...
	@test -z "$$(gofmt -l .)" || (echo "gofmt needed:"; gofmt -l .; exit 1)

fmt:
	gofmt -w .
