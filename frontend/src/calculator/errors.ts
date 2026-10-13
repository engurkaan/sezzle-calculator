import { ApiError } from '../api/client'

const MESSAGES: Partial<Record<string, string>> = {
  DIVISION_BY_ZERO: 'Cannot divide by zero',
  NEGATIVE_SQUARE_ROOT: 'Invalid input for √',
  NON_REAL_RESULT: 'Not a real number',
  DOMAIN_ERROR: 'Math error',
  INVALID_EXPRESSION: 'Syntax error',
  RESULT_OUT_OF_RANGE: 'Result out of range',
  INVALID_OPERAND: 'Invalid number',
  NETWORK_ERROR: 'Service unavailable',
  TIMEOUT: 'Request timed out',
}

/** Turns any failure into a short message that fits the calculator display. */
export function toDisplayMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return MESSAGES[err.code] ?? 'Something went wrong'
  }
  return 'Something went wrong'
}
