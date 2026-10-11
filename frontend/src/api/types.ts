/** Operations that take two operands: `a` and `b`. */
export type BinaryOperation = 'add' | 'subtract' | 'multiply' | 'divide' | 'power' | 'percentage'

/** Operations that take a single operand: `a`. */
export type UnaryOperation = 'sqrt'

export type Operation = BinaryOperation | UnaryOperation

export type CalculationRequest =
  { operation: BinaryOperation; a: number; b: number } | { operation: UnaryOperation; a: number }

/** Success payload returned by `POST /api/v1/{operation}`. */
export interface CalculationResponse {
  operation: Operation
  operands: number[]
  result: number
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
  | 'RESULT_OUT_OF_RANGE'
  | 'INTERNAL_ERROR'

/** Error codes produced by the client when no usable response arrives. */
export type ClientErrorCode = 'NETWORK_ERROR' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'HTTP_ERROR'

export type ApiErrorCode = ServerErrorCode | ClientErrorCode
