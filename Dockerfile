# syntax=docker/dockerfile:1

# Builds the frontend and backend, then ships both in a single minimal image:
# the Go server exposes the API and serves the static frontend on one port.

# --- Frontend build -----------------------------------------------------------
FROM node:24-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- Backend build ------------------------------------------------------------
FROM golang:1.27-alpine AS backend
WORKDIR /src
COPY backend/go.mod ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# --- Runtime ------------------------------------------------------------------
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=backend /out/server /server
COPY --from=frontend /app/dist /static
ENV PORT=8080 \
    STATIC_DIR=/static
EXPOSE 8080
USER nonroot:nonroot
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["/server", "-healthcheck"]
ENTRYPOINT ["/server"]
