import type {
  ApiErrorCode,
  CalculationRequest,
  CalculationResponse,
  EvaluationRequest,
  EvaluationResponse,
} from './types'

/** Error raised for every failed calculation, whatever its cause. */
export class ApiError extends Error {
  readonly code: ApiErrorCode | (string & {})
  /** HTTP status, when the server responded. */
  readonly status: number | undefined

  constructor(code: ApiError['code'], message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export interface ClientOptions {
  /** Prefix for API URLs. Empty means same origin. */
  baseUrl?: string
  /** Abort requests that take longer than this. */
  timeoutMs?: number
  /** Injected for tests; defaults to the global fetch. */
  fetch?: typeof fetch
}

export type Calculate = (
  request: CalculationRequest,
  signal?: AbortSignal,
) => Promise<CalculationResponse>

export type Evaluate = (
  request: EvaluationRequest,
  signal?: AbortSignal,
) => Promise<EvaluationResponse>

/** Everything the UI needs from the backend; injectable for tests. */
export interface CalculatorApi {
  /** Runs one operation, e.g. `POST /api/v1/add`. */
  calculate: Calculate
  /** Evaluates a whole expression with operator precedence. */
  evaluate: Evaluate
}

export const DEFAULT_TIMEOUT_MS = 5000

/**
 * Creates an API client bound to a backend.
 *
 * Calls resolve with the server's response or reject with an ApiError. If
 * the caller aborts through `signal`, the native AbortError is rethrown so
 * callers can tell cancellation apart from failure.
 */
export function createClient({
  baseUrl = '',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetch: fetchImpl = (...args) => globalThis.fetch(...args),
}: ClientOptions = {}): CalculatorApi {
  const root = baseUrl.replace(/\/+$/, '')

  async function post<T>(
    path: string,
    payload: unknown,
    isValid: (body: unknown) => body is T,
    signal: AbortSignal | undefined,
  ): Promise<T> {
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
    const forwardAbort = () => controller.abort()
    signal?.addEventListener('abort', forwardAbort, { once: true })

    try {
      let response: Response
      try {
        response = await fetchImpl(`${root}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })
      } catch (err) {
        if (timedOut) {
          throw new ApiError('TIMEOUT', 'The server took too long to respond.')
        }
        if (signal?.aborted) {
          throw err
        }
        throw new ApiError('NETWORK_ERROR', 'Could not reach the calculator service.')
      }

      const body: unknown = await response.json().catch(() => undefined)

      if (!response.ok) {
        throw toServerError(body, response.status)
      }
      if (!isValid(body)) {
        throw new ApiError('INVALID_RESPONSE', 'The server returned an unexpected response.')
      }
      return body
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', forwardAbort)
    }
  }

  return {
    calculate({ operation, ...operands }, signal) {
      return post(`/api/v1/${operation}`, operands, isCalculationResponse, signal)
    },
    evaluate(request, signal) {
      return post('/api/v1/evaluate', request, isEvaluationResponse, signal)
    },
  }
}

function toServerError(body: unknown, status: number): ApiError {
  if (isErrorEnvelope(body)) {
    return new ApiError(body.error.code, body.error.message, status)
  }
  return new ApiError('HTTP_ERROR', `Request failed with status ${status}.`, status)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isErrorEnvelope(value: unknown): value is { error: { code: string; message: string } } {
  return (
    isRecord(value) &&
    isRecord(value.error) &&
    typeof value.error.code === 'string' &&
    typeof value.error.message === 'string'
  )
}

const DECIMAL_PATTERN = /^-?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/

/** Whether value is a finite decimal number in text form. */
export function isDecimalString(value: unknown): value is string {
  return typeof value === 'string' && DECIMAL_PATTERN.test(value)
}

function isCalculationResponse(value: unknown): value is CalculationResponse {
  return (
    isRecord(value) &&
    typeof value.operation === 'string' &&
    Array.isArray(value.operands) &&
    value.operands.every(isDecimalString) &&
    isDecimalString(value.result)
  )
}

function isEvaluationResponse(value: unknown): value is EvaluationResponse {
  return isRecord(value) && typeof value.expression === 'string' && isDecimalString(value.result)
}

/** Client configured from the build environment. */
export const api: CalculatorApi = createClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
})
