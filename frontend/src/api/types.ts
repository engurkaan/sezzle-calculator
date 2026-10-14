export type BinaryOperation =
  'add' | 'subtract' | 'multiply' | 'divide' | 'power' | 'percentage' | 'mod'

export type UnaryOperation = 'sqrt' | 'ln' | 'log' | 'exp' | 'factorial'

export type TrigOperation = 'sin' | 'cos' | 'tan'

export type Operation = BinaryOperation | UnaryOperation | TrigOperation

export type AngleUnit = 'deg' | 'rad'

// Numbers cross the API as strings: parsing them into a JavaScript number (a binary float)
// would change their value.
export type DecimalString = string

export type CalculationRequest =
  | { operation: BinaryOperation; a: DecimalString; b: DecimalString }
  | { operation: UnaryOperation; a: DecimalString }
  | { operation: TrigOperation; a: DecimalString; angleUnit: AngleUnit }

export interface CalculationResponse {
  operation: Operation
  operands: DecimalString[]
  result: DecimalString
}

export interface EvaluationRequest {
  expression: string
  angleUnit: AngleUnit
}

export interface EvaluationResponse {
  expression: string
  result: DecimalString
}

export type ServerErrorCode =
  | 'INVALID_JSON'
  | 'INVALID_OPERAND'
  | 'MISSING_OPERAND'
  | 'UNEXPECTED_FIELD'
  | 'INVALID_ANGLE_UNIT'
  | 'INVALID_EXPRESSION'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNKNOWN_OPERATION'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'DIVISION_BY_ZERO'
  | 'NEGATIVE_SQUARE_ROOT'
  | 'NON_REAL_RESULT'
  | 'DOMAIN_ERROR'
  | 'RESULT_OUT_OF_RANGE'
  | 'INTERNAL_ERROR'

export type ClientErrorCode = 'NETWORK_ERROR' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'HTTP_ERROR'

export type ApiErrorCode = ServerErrorCode | ClientErrorCode
