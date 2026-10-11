import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, type Calculate } from '../api/client'
import type { CalculationResponse } from '../api/types'
import { fakeCalculate } from '../test/fakeBackend'
import { useCalculator } from './useCalculator'

function deferred() {
  let resolve!: (value: CalculationResponse) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<CalculationResponse>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useCalculator', () => {
  it('sends queued operations to the backend and shows the result', async () => {
    const calculate = vi.fn<Calculate>(fakeCalculate)
    const { result } = renderHook(() => useCalculator(calculate))

    act(() => {
      result.current.dispatch({ type: 'digit', digit: '6' })
      result.current.dispatch({ type: 'operator', operator: 'multiply' })
      result.current.dispatch({ type: 'digit', digit: '7' })
      result.current.dispatch({ type: 'equals' })
    })

    expect(result.current.busy).toBe(true)
    await waitFor(() => expect(result.current.display).toBe('42'))
    expect(result.current.busy).toBe(false)
    expect(result.current.expression).toBe('6 × 7 =')
    expect(calculate).toHaveBeenCalledWith(
      { operation: 'multiply', a: 6, b: 7 },
      expect.any(AbortSignal),
    )
  })

  it('shows a friendly message when the backend rejects the operation', async () => {
    const calculate = vi
      .fn<Calculate>()
      .mockRejectedValue(new ApiError('DIVISION_BY_ZERO', 'division by zero is undefined', 422))
    const { result } = renderHook(() => useCalculator(calculate))

    act(() => {
      result.current.dispatch({ type: 'digit', digit: '1' })
      result.current.dispatch({ type: 'operator', operator: 'divide' })
      result.current.dispatch({ type: 'digit', digit: '0' })
      result.current.dispatch({ type: 'equals' })
    })

    await waitFor(() => expect(result.current.display).toBe('Cannot divide by zero'))
    expect(result.current.busy).toBe(false)
  })

  it('aborts the in-flight request on clear and ignores its outcome', async () => {
    const request = deferred()
    let signal: AbortSignal | undefined
    const calculate = vi.fn<Calculate>((_, s) => {
      signal = s
      return request.promise
    })
    const { result } = renderHook(() => useCalculator(calculate))

    act(() => {
      result.current.dispatch({ type: 'digit', digit: '9' })
      result.current.dispatch({ type: 'sqrt' })
    })
    expect(result.current.busy).toBe(true)

    act(() => result.current.dispatch({ type: 'clear' }))
    expect(signal?.aborted).toBe(true)

    await act(async () => {
      request.reject(new DOMException('aborted', 'AbortError'))
      await request.promise.catch(() => undefined)
    })
    expect(result.current.display).toBe('0')
    expect(result.current.state.error).toBeNull()
  })

  it('highlights the operator awaiting its second operand', () => {
    const { result } = renderHook(() => useCalculator(fakeCalculate))

    act(() => {
      result.current.dispatch({ type: 'digit', digit: '3' })
      result.current.dispatch({ type: 'operator', operator: 'add' })
    })
    expect(result.current.activeOperator).toBe('add')

    act(() => result.current.dispatch({ type: 'digit', digit: '4' }))
    expect(result.current.activeOperator).toBeNull()
  })
})
