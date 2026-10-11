# Test coverage report

Snapshot taken on 2026-10-11. To regenerate it, run `make coverage` from the repository root. That command writes `backend/coverage.html` and `frontend/coverage/index.html`.

## Backend (Go)

`go test -race -coverprofile=coverage.out ./...`

| Package               | Statements |
| --------------------- | ---------: |
| `internal/calculator` |     100.0% |
| `internal/config`     |     100.0% |
| `internal/api`        |      98.0% |
| `cmd/server`          |      65.4% |
| **Total**             |  **91.7%** |

Gaps:

- `cmd/server`: `main()` itself is not covered: it parses flags, installs signal handlers and calls `os.Exit`. All of its logic lives in `run()` and `probe()`, which are covered by tests that start a real server on a free port, call it and shut it down gracefully.
- `internal/api`: the uncovered lines are defensive branches. One logs a failed write of a response body after the headers have gone out. The other is a fallback for JSON decode errors that `encoding/json` does not currently produce.

## Frontend (TypeScript)

`vitest run --coverage` (V8 provider). The 165 tests cover all modules except the entry point `main.tsx` and type-only files.

| Area             | Statements | Branches | Functions |  Lines |
| ---------------- | ---------: | -------: | --------: | -----: |
| `src/calculator` |       100% |   96.7%  |      100% |   100% |
| `src/components` |       100% |   95.5%  |      100% |   100% |
| `src/api`        |      97.6% |   96.3%  |     90.9% |  97.4% |
| **Total**        | **99.6%**  | **96.5%**| **98.3%** | **99.5%** |

The uncovered function in `src/api/client.ts` is the default `fetch` wrapper. Tests always inject a stub in its place.
