# Test coverage report

Snapshot taken on 2026-10-12, after the switch to decimal arithmetic. To regenerate it, run `make coverage` from the repository root. That command writes `backend/coverage.html` and `frontend/coverage/index.html`.

## Backend (Go)

`go test -race -coverprofile=coverage.out ./...`

| Package               | Statements |
| --------------------- | ---------: |
| `internal/config`     |     100.0% |
| `internal/api`        |      97.6% |
| `internal/calculator` |      97.4% |
| `cmd/server`          |      65.4% |
| **Total**             |  **92.2%** |

Gaps:

- `cmd/server`: `main()` itself is not covered: it parses flags, installs signal handlers and calls `os.Exit`. All of its logic lives in `run()` and `probe()`, which are covered by tests that start a real server on a free port, call it and shut it down gracefully.
- `internal/api`: the uncovered lines are defensive branches. One logs a failed write of a response body after the headers have gone out. The others are fallbacks for JSON decode errors that `encoding/json` does not currently produce.
- `internal/calculator`: the uncovered lines map apd's division-by-zero and invalid-operation conditions to domain errors. Those inputs are rejected by explicit checks before apd is called, so the mapping is a safety net that the tests cannot reach.

## Frontend (TypeScript)

`vitest run --coverage` (V8 provider). The 204 tests cover all modules except the entry point `main.tsx` and type-only files.

| Area             | Statements | Branches | Functions |  Lines |
| ---------------- | ---------: | -------: | --------: | -----: |
| `src/calculator` |       100% |   97.6%  |      100% |   100% |
| `src/components` |       100% |   96.2%  |      100% |   100% |
| `src/api`        |      97.7% |   96.6%  |     91.7% |  97.6% |
| **Total**        | **99.6%**  | **97.3%**| **98.4%** | **99.6%** |

The uncovered function in `src/api/client.ts` is the default `fetch` wrapper. Tests always inject a stub in its place.
