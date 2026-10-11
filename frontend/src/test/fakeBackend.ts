import { ApiError } from '../api/client'
import type { CalculationRequest, CalculationResponse } from '../api/types'

/**
 * In-memory stand-in for the Go service, mirroring its semantics and error
 * codes, so frontend tests can exercise full flows without a network.
 */
export function evaluate(request: CalculationRequest): number {
  const { a } = request
  let result: number
  switch (request.operation) {
    case 'add':
      result = a + request.b
      break
    case 'subtract':
      result = a - request.b
      break
    case 'multiply':
      result = a * request.b
      break
    case 'divide':
      if (request.b === 0) {
        throw new ApiError('DIVISION_BY_ZERO', 'division by zero is undefined', 422)
      }
      result = a / request.b
      break
    case 'power':
      result = a ** request.b
      break
    case 'percentage':
      result = (a * request.b) / 100
      break
    case 'sqrt':
      if (a < 0) {
        throw new ApiError(
          'NEGATIVE_SQUARE_ROOT',
          'square root of a negative number is undefined',
          422,
        )
      }
      result = Math.sqrt(a)
      break
  }
  if (!Number.isFinite(result)) {
    throw new ApiError('RESULT_OUT_OF_RANGE', 'result is out of range', 422)
  }
  return result === 0 ? 0 : result
}

export async function fakeCalculate(request: CalculationRequest): Promise<CalculationResponse> {
  const result = evaluate(request)
  const operands = 'b' in request ? [request.a, request.b] : [request.a]
  return { operation: request.operation, operands, result }
}
