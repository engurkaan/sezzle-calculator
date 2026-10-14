import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createClient } from './client'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function rejectOnAbort(_url: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () =>
      reject(new DOMException('The operation was aborted.', 'AbortError')),
    )
  })
}

async function captureError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError)
    return err as ApiError
  }
  throw new Error('expected promise to reject')
}

describe('createClient', () => {
  it('posts the operands as JSON to the operation endpoint', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { operation: 'add', operands: ['2', '3'], result: '5' }))
    const { calculate } = createClient({ baseUrl: 'http://api.test/', fetch })

    const res = await calculate({ operation: 'add', a: '2', b: '3' })

    expect(res).toEqual({ operation: 'add', operands: ['2', '3'], result: '5' })
    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://api.test/api/v1/add')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual({ a: '2', b: '3' })
  })

  it('sends only `a` for unary operations', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { operation: 'sqrt', operands: ['9'], result: '3' }))
    const { calculate } = createClient({ fetch })

    await calculate({ operation: 'sqrt', a: '9' })

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/sqrt')
    expect(JSON.parse(init.body as string)).toEqual({ a: '9' })
  })

  it('sends the angle unit for trigonometric operations', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { operation: 'sin', operands: ['30'], result: '0.5' }))
    const { calculate } = createClient({ fetch })

    await calculate({ operation: 'sin', a: '30', angleUnit: 'deg' })

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/sin')
    expect(JSON.parse(init.body as string)).toEqual({ a: '30', angleUnit: 'deg' })
  })

  it('evaluates whole expressions', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { expression: '7+3*2', result: '13' }))
    const { evaluate } = createClient({ fetch })

    const res = await evaluate({ expression: '7+3*2', angleUnit: 'rad' })

    expect(res).toEqual({ expression: '7+3*2', result: '13' })
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/evaluate')
    expect(JSON.parse(init.body as string)).toEqual({ expression: '7+3*2', angleUnit: 'rad' })
  })

  it('validates evaluation responses', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(200, { result: 13 }))
    const { evaluate } = createClient({ fetch })

    const err = await captureError(evaluate({ expression: '7+3*2', angleUnit: 'rad' }))

    expect(err.code).toBe('INVALID_RESPONSE')
  })

  it('surfaces the server error code, message and status', async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse(422, {
        error: { code: 'DIVISION_BY_ZERO', message: 'division by zero is undefined' },
      }),
    )
    const { calculate } = createClient({ fetch })

    const err = await captureError(calculate({ operation: 'divide', a: '1', b: '0' }))

    expect(err.code).toBe('DIVISION_BY_ZERO')
    expect(err.message).toBe('division by zero is undefined')
    expect(err.status).toBe(422)
  })

  it('falls back to HTTP_ERROR when the error body is not the standard envelope', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 }))
    const { calculate } = createClient({ fetch })

    const err = await captureError(calculate({ operation: 'add', a: '1', b: '1' }))

    expect(err.code).toBe('HTTP_ERROR')
    expect(err.status).toBe(502)
  })

  it.each([
    ['a non-JSON body', new Response('ok', { status: 200 })],
    ['a missing result', jsonResponse(200, { operation: 'add', operands: ['1', '1'] })],
    ['a numeric result', jsonResponse(200, { operation: 'add', operands: ['1', '1'], result: 2 })],
    [
      'a non-decimal result',
      jsonResponse(200, { operation: 'add', operands: ['1', '1'], result: 'NaN' }),
    ],
    ['numeric operands', jsonResponse(200, { operation: 'add', operands: [1, 1], result: '2' })],
  ])('rejects a successful response with %s', async (_, response) => {
    const { calculate } = createClient({ fetch: vi.fn().mockResolvedValue(response) })

    const err = await captureError(calculate({ operation: 'add', a: '1', b: '1' }))

    expect(err.code).toBe('INVALID_RESPONSE')
  })

  it('reports network failures', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const { calculate } = createClient({ fetch })

    const err = await captureError(calculate({ operation: 'add', a: '1', b: '1' }))

    expect(err.code).toBe('NETWORK_ERROR')
    expect(err.status).toBeUndefined()
  })

  describe('timeouts', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('aborts and reports TIMEOUT when the server is too slow', async () => {
      const fetch = vi.fn(rejectOnAbort)
      const { calculate } = createClient({ fetch, timeoutMs: 1000 })

      const pending = captureError(calculate({ operation: 'add', a: '1', b: '1' }))
      await vi.advanceTimersByTimeAsync(1000)
      const err = await pending

      expect(err.code).toBe('TIMEOUT')
      const init = fetch.mock.calls[0]?.[1]
      expect(init?.signal?.aborted).toBe(true)
    })

    it('clears the timer once the request settles', async () => {
      const fetch = vi
        .fn()
        .mockResolvedValue(
          jsonResponse(200, { operation: 'add', operands: ['1', '1'], result: '2' }),
        )
      const { calculate } = createClient({ fetch, timeoutMs: 1000 })

      await calculate({ operation: 'add', a: '1', b: '1' })

      expect(vi.getTimerCount()).toBe(0)
    })
  })

  it('rethrows the AbortError when the caller cancels', async () => {
    const { calculate } = createClient({ fetch: vi.fn(rejectOnAbort) })
    const controller = new AbortController()

    const pending = calculate({ operation: 'add', a: '1', b: '1' }, controller.signal)
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
