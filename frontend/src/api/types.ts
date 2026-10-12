/** Operations that take two operands: `a` and `b`. */
export type BinaryOperation = 'add' | 'subtract' | 'multiply' | 'divide' | 'power' | 'percentage'

/** Operations that take a single operand: `a`. */
export type UnaryOperation = 'sqrt'

export type Operation = BinaryOperation | UnaryOperation

/**
 * A decimal number as text, e.g. "12.5", "-0.001" or "1.5e+40".
 *
 * Numbers cross the API as strings because JavaScript numbers are binary
 * floats: parsing "0.1" or a 34-digit result into a `number` would silently
 * change its value. The frontend never does arithmetic on them; it only
 * forwards and formats them.
 */
export type DecimalString = string

export type CalculationRequest =
  | { operation: BinaryOperation; a: DecimalString; b: DecimalString }
  | { operation: UnaryOperation; a: DecimalString }

/** Success payload returned by `POST /api/v1/{operation}`. */
export interface CalculationResponse {
  operation: Operation
  operands: DecimalString[]
  result: DecimalString
}

/** Error codes produced by the backend. */
export type ServerErrorCode =
  | 'INVALID_JSON'
  | 'INVALID_OPERAND'
  | 'MISSING_OPERAND'
  | 'UNEXPECTED_FIELD'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNKNOWN_OPERATION'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'DIVISION_BY_ZERO'
  | 'NEGATIVE_SQUARE_ROOT'
  | 'NON_REAL_RESULT'
  | 'RESULT_OUT_OF_RANGE'
  | 'INTERNAL_ERROR'

/** Error codes produced by the client when no usable response arrives. */
export type ClientErrorCode = 'NETWORK_ERROR' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'HTTP_ERROR'

export type ApiErrorCode = ServerErrorCode | ClientErrorCode
