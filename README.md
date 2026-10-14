# Calculator: React + Go

A full-stack calculator. The **React + TypeScript** frontend is a phone-style keypad. Every arithmetic operation is sent to a **Go REST microservice**, which validates the input, computes the result and returns JSON.

- **Operations:** addition, subtraction, multiplication, division, exponentiation, square root and percentage. A **Scientific** keypad adds sin/cos/tan (degrees or radians), ln, log, eˣ, x², x³, 10ˣ, 1/x, |x|, n!, mod, π, e and parentheses.
- **Two evaluation modes:** **Immediate** works like a desk calculator, applying each operator as you go (`7 + 3 × 2 = 20`). **Expression** builds the whole expression and evaluates it with standard operator precedence (`7 + 3 × 2 = 13`).
- **Frontend:** keypad and keyboard input, repeated `=`, history that persists across reloads (recall, delete one entry, clear all, collapse), responsive layout, light and dark themes, accessible markup.
- **Exact decimal arithmetic:** 34 significant digits (IEEE 754 decimal128 parameters). `0.1 + 0.2` is exactly `0.3`, and money values never pick up binary rounding errors.
- **Backend:** standard library plus one decimal library, with strict input validation, consistent JSON errors and graceful shutdown.
- **Tests:** about 94% statement coverage on the backend and about 99% on the frontend. See [docs/COVERAGE.md](docs/COVERAGE.md).
- **Docker:** a single ~10 MB distroless image serves both the UI and the API.

```
┌──────────────────────────────┐        POST /api/v1/{op}         ┌──────────────────────────────┐
│ React (Vite, TypeScript)     │  ─────────────────────────────▶  │ Go net/http service          │
│                              │    {"a": "12", "b": "7"}         │                              │
│                              │  POST /api/v1/evaluate           │ calculator/  expression      │
│                              │    {"expression": "7+3*2"}       │              parser          │
│ components/  ← UI only       │                                  │ api/         HTTP, validation│
│ calculator/  ← state machine │  ◀─────────────────────────────  │ calculator/  pure arithmetic │
│ api/         ← typed client  │  {"operation":"add",             │ config/      env vars        │
└──────────────────────────────┘   "operands":["12","7"],         └──────────────────────────────┘
                                    "result":"19"}
```

---

## Contents

- [Quick start (Docker)](#quick-start-docker)
- [Local development](#local-development)
- [Running tests and coverage](#running-tests-and-coverage)
- [API reference](#api-reference)
- [Using the calculator](#using-the-calculator)
- [Design decisions](#design-decisions)
- [Assumptions and limitations](#assumptions-and-limitations)
- [Project structure](#project-structure)

---

## Quick start (Docker)

You only need Docker.

```bash
docker build -t sezzle-calculator .
docker run --rm -p 8080:8080 sezzle-calculator
```

Then open <http://localhost:8080>. The same container serves the API, for example `curl localhost:8080/healthz`.

Or use `make docker-run`, which builds and runs the image.

## Local development

**Prerequisites:** Go 1.27+, Node.js 24+ (with npm), and optionally `make`.

### Backend

```bash
cd backend
go run ./cmd/server          # listens on :8080
```

| Variable          | Default                 | Purpose                                                                 |
| ----------------- | ----------------------- | ----------------------------------------------------------------------- |
| `PORT`            | `8080`                  | TCP port to listen on                                                   |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated CORS allowlist (`*` allows any origin)                  |
| `STATIC_DIR`      | _(unset)_               | If set, the server also serves the built frontend from this directory   |

### Frontend

In a second terminal:

```bash
cd frontend
npm ci
npm run dev                  # http://localhost:5173
```

The Vite dev server proxies `/api` to `http://localhost:8080`, so the browser only ever talks to one origin. To point it at a backend on another address, set `API_PROXY_TARGET=http://host:port` before `npm run dev`. To build a frontend that calls a backend on another origin, set `VITE_API_BASE_URL=https://api.example.com` at build time and add that frontend's origin to the backend's `ALLOWED_ORIGINS`.

### Make targets

From the repository root, `make help` lists all targets:

```
make install        # npm ci for the frontend
make dev-backend    # run the API on :8080
make dev-frontend   # run Vite on :5173
make test           # all tests
make coverage       # coverage reports for both layers
make lint           # go vet + gofmt, oxlint + prettier + tsc
make docker-run     # build and run the full-stack image
```

## Running tests and coverage

```bash
# Backend
cd backend
go test -race ./...
make cover                   # coverage.out + coverage.html + per-function summary

# Frontend
cd frontend
npm test                     # vitest, single run
npm run coverage             # text summary + coverage/index.html
```

The latest numbers are in [docs/COVERAGE.md](docs/COVERAGE.md). CI (`.github/workflows/ci.yml`) runs the same checks and builds the Docker image.

**What is tested:**

- **Backend**
  - Every operation, including edge cases: zero, negatives, overflow, NaN-producing inputs and negative zero.
  - Every HTTP status the API can return, with the exact error code.
  - CORS, panic recovery and request logging.
  - Static file serving and SPA fallback.
  - Configuration parsing.
  - The real server: it is started on a free port, called and shut down gracefully.
- **Frontend**
  - The calculator state machine (the bulk of the logic) is tested as a pure reducer against an in-memory fake of the backend.
  - The API client is tested with a stubbed `fetch` for success, server errors, malformed responses, network failure, timeout and cancellation.
  - Number formatting and key mapping.
  - Full component flows with Testing Library: clicks, keyboard input, error display and recovery, ignoring input while a request is in flight, and history.

## API reference

The base path is `/api/v1`. Requests must send `Content-Type: application/json`. The full spec is in [docs/openapi.yaml](docs/openapi.yaml).

**Numbers are exact decimals.** Operands can be sent as JSON numbers (`5.25`) or strings (`"5.25"`); both are parsed from their exact text, with up to 34 significant digits. Results and echoed operands are **always strings**, because a JSON number would be parsed into a binary float by most clients, browsers included, and could silently lose precision. Results that cannot be represented exactly, such as `1/3`, are rounded to 34 digits with round-half-even.

| Method | Path                    | Body             | Result                       |
| ------ | ----------------------- | ---------------- | ---------------------------- |
| POST   | `/api/v1/add`           | `{"a":…, "b":…}` | a + b                        |
| POST   | `/api/v1/subtract`      | `{"a":…, "b":…}` | a − b                        |
| POST   | `/api/v1/multiply`      | `{"a":…, "b":…}` | a × b                        |
| POST   | `/api/v1/divide`        | `{"a":…, "b":…}` | a ÷ b                        |
| POST   | `/api/v1/power`         | `{"a":…, "b":…}` | a raised to the power b      |
| POST   | `/api/v1/percentage`    | `{"a":…, "b":…}` | a percent of b (a × b ÷ 100) |
| POST   | `/api/v1/mod`           | `{"a":…, "b":…}` | remainder of a ÷ b (sign of a) |
| POST   | `/api/v1/sqrt`          | `{"a":…}`        | √a                           |
| POST   | `/api/v1/ln`, `/log`    | `{"a":…}`        | natural / base-10 logarithm  |
| POST   | `/api/v1/exp`           | `{"a":…}`        | eᵃ                           |
| POST   | `/api/v1/factorial`     | `{"a":…}`        | a! (integers 0–2000)         |
| POST   | `/api/v1/sin`, `/cos`, `/tan` | `{"a":…, "angleUnit":"deg"}` | trigonometry; `angleUnit` is `rad` (default) or `deg` |
| POST   | `/api/v1/evaluate`      | `{"expression":…, "angleUnit":…}` | a whole expression, with precedence |
| GET    | `/api/v1/operations`    | –                | Supported operations         |
| GET    | `/healthz`              | –                | `{"status":"ok"}`            |

### Examples

```bash
$ curl -s -X POST localhost:8080/api/v1/add \
    -H 'Content-Type: application/json' -d '{"a": 5, "b": 3}'
{"operation":"add","operands":["5","3"],"result":"8"}

$ curl -s -X POST localhost:8080/api/v1/add \
    -H 'Content-Type: application/json' -d '{"a": "0.1", "b": "0.2"}'
{"operation":"add","operands":["0.1","0.2"],"result":"0.3"}

$ curl -s -X POST localhost:8080/api/v1/divide \
    -H 'Content-Type: application/json' -d '{"a": 1, "b": 4}'
{"operation":"divide","operands":["1","4"],"result":"0.25"}

$ curl -s -X POST localhost:8080/api/v1/divide \
    -H 'Content-Type: application/json' -d '{"a": "1", "b": "3"}'
{"operation":"divide","operands":["1","3"],"result":"0.3333333333333333333333333333333333"}

$ curl -s -X POST localhost:8080/api/v1/power \
    -H 'Content-Type: application/json' -d '{"a": 2, "b": 10}'
{"operation":"power","operands":["2","10"],"result":"1024"}

$ curl -s -X POST localhost:8080/api/v1/sqrt \
    -H 'Content-Type: application/json' -d '{"a": 144}'
{"operation":"sqrt","operands":["144"],"result":"12"}

$ curl -s -X POST localhost:8080/api/v1/percentage \
    -H 'Content-Type: application/json' -d '{"a": "8.875", "b": "59.99"}'
{"operation":"percentage","operands":["8.875","59.99"],"result":"5.3241125"}

$ curl -s -X POST localhost:8080/api/v1/add \
    -H 'Content-Type: application/json' -d '{"a": "9007199254740993", "b": "1"}'
{"operation":"add","operands":["9007199254740993","1"],"result":"9007199254740994"}
```

**Expressions.** `POST /api/v1/evaluate` accepts `+ - * / ^ mod`, postfix `!` and `%`, parentheses, the functions `sqrt sin cos tan ln log exp abs`, and the constants `pi` and `e`. Precedence follows mathematics: `^` binds tighter than unary minus and is right-associative (`-2^2 = -4`, `2^3^2 = 512`). `a + b%` adds b percent of a (`200+10% = 220`). Syntax errors are 400 `INVALID_EXPRESSION` with the 1-based `position` of the problem.

```bash
$ curl -s -X POST localhost:8080/api/v1/evaluate \
    -H 'Content-Type: application/json' -d '{"expression": "7+3*2"}'
{"expression":"7+3*2","result":"13"}

$ curl -s -X POST localhost:8080/api/v1/evaluate \
    -H 'Content-Type: application/json' -d '{"expression": "2*sin(30)+sqrt(16)", "angleUnit": "deg"}'
{"expression":"2*sin(30)+sqrt(16)","result":"5"}

$ curl -s -X POST localhost:8080/api/v1/evaluate \
    -H 'Content-Type: application/json' -d '{"expression": "1+*2"}'
{"error":{"code":"INVALID_EXPRESSION","message":"unexpected \"*\" at position 3","position":3}}

$ curl -s -X POST localhost:8080/api/v1/tan \
    -H 'Content-Type: application/json' -d '{"a": 90, "angleUnit": "deg"}'
{"error":{"code":"DOMAIN_ERROR","message":"tangent is undefined at this angle"}}
```

### Errors

Every failure uses the same envelope. Clients should branch on `code`, which is stable; `message` is for humans and may change.

```json
{ "error": { "code": "DIVISION_BY_ZERO", "message": "division by zero is undefined" } }
```

```bash
# 422: valid request, no finite answer
$ curl -s -X POST localhost:8080/api/v1/divide -H 'Content-Type: application/json' -d '{"a":1,"b":0}'
{"error":{"code":"DIVISION_BY_ZERO","message":"division by zero is undefined"}}

$ curl -s -X POST localhost:8080/api/v1/sqrt -H 'Content-Type: application/json' -d '{"a":-4}'
{"error":{"code":"NEGATIVE_SQUARE_ROOT","message":"square root of a negative number is undefined"}}

$ curl -s -X POST localhost:8080/api/v1/power -H 'Content-Type: application/json' -d '{"a":-8,"b":0.5}'
{"error":{"code":"NON_REAL_RESULT","message":"result is not a real number"}}

$ curl -s -X POST localhost:8080/api/v1/multiply -H 'Content-Type: application/json' -d '{"a":"1e6000","b":"1e6000"}'
{"error":{"code":"RESULT_OUT_OF_RANGE","message":"result is outside the supported range"}}

# 400: malformed input
$ curl -s -X POST localhost:8080/api/v1/add -H 'Content-Type: application/json' -d '{"a":1}'
{"error":{"code":"MISSING_OPERAND","message":"operand \"b\" is required"}}

$ curl -s -X POST localhost:8080/api/v1/add -H 'Content-Type: application/json' -d '{"a":"one","b":2}'
{"error":{"code":"INVALID_OPERAND","message":"operand \"a\" must be a number"}}

$ curl -s -X POST localhost:8080/api/v1/add -H 'Content-Type: application/json' -d '{"a":"12345678901234567890123456789012345","b":1}'
{"error":{"code":"INVALID_OPERAND","message":"operand \"a\" has more than 34 significant digits"}}

$ curl -s -X POST localhost:8080/api/v1/add -H 'Content-Type: application/json' -d '{"a":1,"b":2,"c":3}'
{"error":{"code":"UNEXPECTED_FIELD","message":"unknown field \"c\""}}

# 404 / 415
$ curl -s -X POST localhost:8080/api/v1/modulo -H 'Content-Type: application/json' -d '{"a":1,"b":2}'
{"error":{"code":"UNKNOWN_OPERATION","message":"unknown operation \"modulo\""}}

$ curl -s -X POST localhost:8080/api/v1/add -d 'a=1&b=2'
{"error":{"code":"UNSUPPORTED_MEDIA_TYPE","message":"Content-Type must be application/json"}}
```

| Status | Codes |
| ------ | ----- |
| 400 | `INVALID_JSON`, `MISSING_OPERAND`, `INVALID_OPERAND`, `UNEXPECTED_FIELD`, `INVALID_ANGLE_UNIT`, `INVALID_EXPRESSION` |
| 404 | `UNKNOWN_OPERATION`, `NOT_FOUND` |
| 405 | `METHOD_NOT_ALLOWED` (with an `Allow` header) |
| 413 | `PAYLOAD_TOO_LARGE` (the body limit is 1 KB) |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `DIVISION_BY_ZERO`, `NEGATIVE_SQUARE_ROOT`, `NON_REAL_RESULT`, `DOMAIN_ERROR` (e.g. `ln 0`, `tan 90°`, `2.5!`), `RESULT_OUT_OF_RANGE` |
| 500 | `INTERNAL_ERROR` (details are logged, never returned) |

## Using the calculator

Two switches sit above the display:

- **Basic / Scientific** chooses the keypad. Scientific adds a panel of function keys (beside the keypad on wide screens, above it on phones) and a **DEG/RAD** key; the current angle unit is also shown in the display.
- **Immediate / Expression** chooses how input is evaluated:
  - **Immediate:** each operator applies as soon as the next is pressed (`7 + 3 × 2 = 20`). Function keys act on the current number at once (`30 sin` → `0.5`). Parentheses are disabled.
  - **Expression:** you type the whole expression, `7 + 3 × 2`, and `=` evaluates it with precedence (`13`).
    - Functions open a parenthesis (`sin(`, `√(`). Unclosed parentheses are closed for you on `=`.
    - Implicit products such as `2π` or `2(3)` are understood.
    - Operators after a result continue from it.
    - After an error, the expression stays on screen so you can fix it with `⌫`.

Settings, the history panel's collapsed state and the history itself are remembered across reloads.

| Key | Keyboard | Behaviour |
| --- | -------- | --------- |
| `0`–`9`, `.` | `0`–`9`, `.` or `,` | Enter a number (up to 20 digits, one decimal point) |
| `+ − × ÷` | `+ - * /` (or `x`) | Binary operators; chained operators evaluate left to right |
| `xʸ` | `^` | Power |
| `=` | `Enter` or `=` | Evaluate; pressing it again repeats the last operation (`2 + 3 = =` → 8) |
| `√` | `r` | Square root |
| `(` `)` | `(` `)` | Parentheses (Expression mode) |
| `n!` | `!` | Factorial |
| `%` | `%` | `200 + 10 %` → `20` (10% of 200), so `=` gives 220; otherwise divides by 100 |
| `±` | `n` | Toggle sign |
| `⌫` | `Backspace` | Delete the last typed digit |
| `AC` | `Esc`, `Delete` or `c` | Clear the calculation (history is kept) |

**History:** click an entry to use its result as the current number. Hover over an entry, or tap it on touch screens, to reveal **×**, which deletes it. **Clear all** asks for confirmation. The chevron collapses the panel.

## Design decisions

### Backend

- **Exact decimal arithmetic instead of float64.** Binary floats cannot represent most decimal fractions: `0.1 + 0.2` is `0.30000000000000004`, `0.1 × 3 − 0.3` is `5.55e-17`, and integers above 2⁵³ lose digits. That is unacceptable for anything near money. The calculator uses [`cockroachdb/apd`](https://github.com/cockroachdb/apd), a well-tested implementation of the General Decimal Arithmetic specification, configured with IEEE 754 decimal128 parameters:
  - 34 significant digits, round-half-even, and exponents from −6143 to 6144.
  - Inputs are represented exactly. Inputs that would need rounding are **rejected** with a clear error rather than silently changed.
  - Results that cannot be exact (`1/3`, `√2`) are rounded to 34 digits.
  - Precision is deliberately **bounded** rather than truly arbitrary. Unbounded precision cannot represent `1/3` or `√2` anyway, and it would let a single request such as `9 ^ 999999999` exhaust server memory. With fixed precision every operation takes microseconds, which the tests check.
  - Converting results to cents is a business rule (rounding mode, allocation of remainders), not arithmetic, so the calculator does not do it.
- **Standard library plus one dependency.** Go 1.22+ `http.ServeMux` supports method and path-parameter patterns, which is all this API needs, so there is no web framework. The only dependency is the decimal library, because correct decimal `Pow`, `Sqrt` and rounding are not something to hand-roll.
- **The domain is separate from transport.** `internal/calculator` holds pure functions with sentinel errors (`ErrDivisionByZero`, …) and knows nothing about HTTP. `internal/api` maps those errors to status codes. A registry maps each operation name to its arity and function, so adding an operation is one line plus tests, and handlers stay generic.
- **One endpoint per operation (`POST /api/v1/{operation}`)** rather than a single `/calculate` with an `op` field. The brief asks for endpoints per operation, and this design makes each URL self-describing and lets an unknown operation return a natural 404. It still needs only one handler.
- **Operator precedence is parsed on the server.** Expression mode sends the whole expression to `POST /api/v1/evaluate`. That is one round trip instead of one per operator, and precedence rules live in one authoritative place. A small recursive-descent parser builds a syntax tree that is evaluated with the same decimal functions as the single-operation endpoints, so both modes produce identical results. Length (1000 characters) and nesting (64 levels) are bounded, and syntax errors report a position.
- **Trigonometry with exact degrees.** apd has no trigonometric functions, so sin, cos and tan:
  - reduce the argument to [−π/4, π/4] plus a quadrant, using π to 150 digits;
  - evaluate a Taylor series with 16 guard digits, then round once.
  
  In degrees the reduction is exact decimal arithmetic, so `sin 180°` is exactly `0` (most calculators show `1.2e-16`), `tan 45°` is exactly `1`, and `tan 90°` is reported as undefined rather than as a huge number. Logarithms, `exp` and fractional powers also run with guard digits before the final rounding.
- **Bounded worst cases.** Every scientific function has a cheap upper bound:
  - `n!` is limited to 2000 (larger results overflow the exponent range anyway).
  - Trigonometric arguments are limited to 10⁴⁰.
  - `mod` uses a context wide enough to be exact for any operands.
  
  Tests assert that the worst inputs finish in milliseconds.
- **Strict validation.** The server checks the content type, caps bodies at 4 KB, and rejects unknown fields and trailing data. Operands are decoded as raw JSON, so a JSON number like `0.1` is parsed from its exact text instead of passing through float64. A missing or `null` operand is told apart from an explicit `0`, and `NaN`, `Infinity`, hex and thousands separators are rejected.
- **400 vs 422.** A 400 means the request itself is malformed. A 422 means it is well formed but has no answer: division by zero, the square root of a negative number, a non-real power such as `(-8)^0.5`, or a result outside the supported range. This lets clients tell bugs in their own code apart from inputs the user can correct.
- **Numbers travel as strings.** The response encodes every number as a canonical decimal string (no trailing zeros, scientific notation only for extreme magnitudes). A JSON number would be read into a JavaScript double, defeating the point of decimal arithmetic. Negative zero is normalised to `0`.
- **Production-minded server.** It sets read, write and idle timeouts, shuts down gracefully on SIGTERM, logs requests as structured JSON (`log/slog`), recovers from panics without leaking details, and restricts CORS to an allowlist.

### Frontend

- **No arithmetic in the browser.** All arithmetic goes through the API (see [why](#why-the-arithmetic-runs-on-the-server)). The frontend treats numbers as opaque decimal strings: it forwards what the user typed verbatim and only formats results. The single local operation, flipping the sign, is a string edit and therefore exact. Because of this, switching the backend to decimal needed no decimal library in the browser.
- **A pure reducer as the state machine** (`src/calculator/`). Keypad semantics are the trickiest part of a calculator: chaining, repeated `=`, `%`, entering a negative number, and recovering after an error. Modelling them as a pure `(state, action) → state` function makes every rule unit-testable without React or a network. The root reducer owns the shared session (history, pending request, errors, settings) and delegates keypad input to one module per evaluation mode:
  - `immediate.ts` implements the desk-calculator rules.
  - `expression.ts` keeps a list of tokens well formed as you type (no `2 + × 3`, no closing a parenthesis that isn't open). It renders each token twice: for the display (`√(16) × π`) and in the backend's grammar (`sqrt(16)*pi`). When an operation must be computed, the reducer stores a `pending` request with an id. The `useCalculator` hook sends it and dispatches the result, and responses for superseded ids (for example after `AC`) are ignored and aborted.
- **Input is ignored while a request is in flight,** rather than disabling the keys. Disabling a focused button would drop keyboard focus, and the backend responds in milliseconds anyway. A spinner appears only if a request takes longer than 150 ms, to avoid flicker.
- **Typed client with explicit failure modes.** `createClient` returns a `CalculatorApi` (`calculate` and `evaluate`) that is injected into the UI, so tests can swap in a fake backend. Every failure becomes an `ApiError` carrying either the server's code or a client-side one (`NETWORK_ERROR`, `TIMEOUT`, `INVALID_RESPONSE`). Response bodies are validated, not trusted.
- **Display formatting.** Results are shown to 20 significant digits with thousands separators, using `Intl.NumberFormat`'s exact string formatting so that no value is ever converted to a float. The full 34-digit value is kept for the next operation. The hidden digits act as guard digits, as on a hardware calculator: `1 ÷ 3 × 3` is computed as `0.999…9` (34 nines) and displays `1`. Very large or very small values switch to scientific notation (`1.5e+40`).
- **Accessibility.** The result is an `aria-live` region and errors are announced as alerts. Symbol keys have accessible names, the active operator uses `aria-pressed`, and focus outlines are visible. The layout respects `prefers-reduced-motion` and `prefers-color-scheme`, and works from 320 px wide.
- **Persistence is a convenience, never a requirement.**
  - History, settings and layout preferences are stored in `localStorage` under versioned keys.
  - Stored data is validated on load, and anything malformed is ignored.
  - Storage failures (private browsing, quota) fall back to in-memory state.
- **Disabled, but still focusable.** Keys that do not apply in the current mode, such as parentheses in Immediate mode, use `aria-disabled` instead of `disabled`, so focus is not lost when switching modes and a tooltip can explain why.
- **No UI or state libraries.** React state plus CSS Modules is enough at this size.

### Why the arithmetic runs on the server

Basic arithmetic is a set of pure, deterministic functions, so it could run in the browser or at the edge with lower latency and no backend to operate. That is a reasonable design for a plain calculator. It was not chosen here, for these reasons:

- **The brief requires the frontend to consume the backend** for the calculations.
- **The server is the single source of truth.** In a payments context, values with consequences (instalment splits, fees, interest) must be computed in one trusted, auditable place, not by code the user controls.
- **One implementation.** Running the arithmetic in both places means two decimal libraries (for example apd and decimal.js) that must agree to the last digit. They can drift apart on `pow`, rounding modes and edge cases.
- **The cost is small.** The service is stateless and each operation takes microseconds, so it scales horizontally, and responses for a nearby deployment arrive in milliseconds.

If latency ever mattered more than authority, the same Go `calculator` package could be compiled to WebAssembly and run at the edge or in the browser. That would keep a single implementation.

### Deployment

- **A single container.** The multi-stage Dockerfile builds the frontend with Node, builds a static Go binary, and copies both into `distroless/static` running as non-root (about 10 MB). The Go server serves the SPA when `STATIC_DIR` is set, so the UI and API share an origin and need no CORS. A `-healthcheck` flag on the binary powers the Docker `HEALTHCHECK` without needing a shell or curl in the image.

## Assumptions and limitations

- **Precision.** Arithmetic uses 34 significant decimal digits. The keypad accepts up to 20 typed digits and shows 20 significant digits, while the API accepts the full 34.
- **Operator precedence** depends on the mode. Immediate mode evaluates chained operators left to right like a desk calculator (`2 + 3 × 4 =` gives `20`). Expression mode follows mathematical precedence (`14`). Immediate is the default because it matches the keypad users are used to.
- **Angle unit** defaults to degrees in the UI (what most people expect from a calculator) and to radians in the API (the mathematical convention).
- **Not implemented:** inverse trigonometric functions, memory keys (M+, MR) and an Ans key. History recall covers most uses of the last two.
- **Percentage** in the API means "a percent of b". The keypad `%` key follows desk-calculator conventions on top of that.
- **Number format** in the UI is en-US style (`1,234.5`). Both `.` and `,` on the keyboard enter a decimal point.
- **The service is stateless:** history lives only in the user's browser (`localStorage`), never on the server.
- **Not included,** since they are out of scope for a take-home: authentication, rate limiting, metrics, server-side history and end-to-end browser tests in CI. The app was verified end to end manually against the Docker image.

## Project structure

```
.
├── backend/
│   ├── cmd/server/          # entrypoint: config, middleware chain, graceful shutdown, -healthcheck
│   └── internal/
│       ├── calculator/      # pure decimal operations, scientific functions, expression parser, registry
│       ├── api/             # handlers, request decoding, error envelope, middleware, static serving
│       └── config/          # environment parsing
├── frontend/
│   └── src/
│       ├── api/             # typed fetch client and API types
│       ├── calculator/      # state machine (root + immediate + expression modes), formatting, hooks
│       ├── components/      # Calculator, Display, Keypad, SegmentedControl, History (+ CSS Modules)
│       ├── persistence/     # validated localStorage helpers
│       └── test/            # test setup and in-memory fake backend
├── docs/
│   ├── openapi.yaml         # API specification
│   └── COVERAGE.md          # latest coverage report
├── Dockerfile               # full-stack image
├── Makefile                 # common tasks
└── .github/workflows/ci.yml
```
