# Test coverage report

Snapshot taken on 2026-10-14, after adding scientific functions, expression mode and persistent history. To regenerate it, run `make coverage` from the repository root. That command writes `backend/coverage.html` and `frontend/coverage/index.html`.

## Backend (Go)

`go test -race -coverprofile=coverage.out ./...`

| Package               | Statements |
| --------------------- | ---------: |
| `internal/config`     |     100.0% |
| `internal/api`        |      98.0% |
| `internal/calculator` |      94.6% |
| `cmd/server`          |      65.4% |
| **Total**             |  **93.6%** |

Gaps:

- `cmd/server`: `main()` itself is not covered: it parses flags, installs signal handlers and calls `os.Exit`. All of its logic lives in `run()` and `probe()`, which are covered by tests that start a real server on a free port, call it and shut it down gracefully.
- `internal/api`: the uncovered lines are defensive branches. One logs a failed write of a response body after the headers have gone out. The others are fallbacks for JSON decode errors that `encoding/json` does not currently produce.
- `internal/calculator`: most uncovered lines handle errors that cannot occur with validated input:
  - apd conditions that explicit checks already rule out (division by zero, invalid operation).
  - Failures inside trigonometric argument reduction, whose working contexts are sized so that they cannot overflow.
  - Panics guarding the hard-coded constants π and e.

## Frontend (TypeScript)

`vitest run --coverage` (V8 provider). The 320 tests cover all modules except the entry point `main.tsx` and type-only files.

| Area              | Statements | Branches | Functions |  Lines |
| ----------------- | ---------: | -------: | --------: | -----: |
| `src/calculator`  |      99.1% |   97.7%  |      100% |  99.1% |
| `src/components`  |       100% |   97.1%  |      100% |   100% |
| `src/persistence` |       100% |    100%  |      100% |   100% |
| `src/api`         |      97.8% |   96.9%  |     93.3% |  97.7% |
| **Total**         | **99.2%**  | **97.6%**| **99.3%** | **99.1%** |

The uncovered function in `src/api/client.ts` is the default `fetch` wrapper. Tests always inject a stub in its place.
