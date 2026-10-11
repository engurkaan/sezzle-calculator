import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { toDisplayMessage } from './errors'

describe('toDisplayMessage', () => {
  it.each([
    ['DIVISION_BY_ZERO', 'Cannot divide by zero'],
    ['NEGATIVE_SQUARE_ROOT', 'Invalid input for √'],
    ['RESULT_OUT_OF_RANGE', 'Result out of range'],
    ['INVALID_OPERAND', 'Invalid number'],
    ['NETWORK_ERROR', 'Service unavailable'],
    ['TIMEOUT', 'Request timed out'],
  ])('maps %s to a short message', (code, message) => {
    expect(toDisplayMessage(new ApiError(code, 'raw server message'))).toBe(message)
  })

  it('falls back to a generic message for other API errors', () => {
    expect(toDisplayMessage(new ApiError('INTERNAL_ERROR', 'boom', 500))).toBe(
      'Something went wrong',
    )
  })

  it('falls back to a generic message for unexpected errors', () => {
    expect(toDisplayMessage(new Error('boom'))).toBe('Something went wrong')
    expect(toDisplayMessage('boom')).toBe('Something went wrong')
  })
})
