import { ApiError } from '../api/client'
import type { CalculatorApi } from '../api/client'
import type {
  CalculationRequest,
  CalculationResponse,
  DecimalString,
  EvaluationRequest,
  EvaluationResponse,
} from '../api/types'

/** value = coefficient × 10^-scale */
interface Decimal {
  coefficient: bigint
  scale: number
}

const PRECISION = 34
const MAX_EXPONENT = 6144

function parse(text: DecimalString): Decimal {
  const match = /^(-?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text)
  if (!match) {
    throw new Error(`fake backend: invalid decimal ${text}`)
  }
  const [, sign = '', integer = '', fraction = '', exponent = '0'] = match
  const coefficient = BigInt(`${sign}${integer}${fraction}` || '0')
  return { coefficient, scale: fraction.length - Number(exponent) }
}

function format({ coefficient, scale }: Decimal): DecimalString {
  if (coefficient === 0n) {
    return '0'
  }
  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n
    scale--
  }
  const negative = coefficient < 0n
  let digits = (negative ? -coefficient : coefficient).toString()
  if (scale <= 0) {
    digits += '0'.repeat(-scale)
  } else {
    digits = digits.padStart(scale + 1, '0')
    digits = `${digits.slice(0, -scale)}.${digits.slice(-scale)}`
  }
  return negative ? `-${digits}` : digits
}

function align(a: Decimal, b: Decimal): [bigint, bigint, number] {
  const scale = Math.max(a.scale, b.scale)
  return [
    a.coefficient * 10n ** BigInt(scale - a.scale),
    b.coefficient * 10n ** BigInt(scale - b.scale),
    scale,
  ]
}

function exponentOf({ coefficient, scale }: Decimal): number {
  const digits = (coefficient < 0n ? -coefficient : coefficient).toString().length
  return digits - 1 - scale
}

function outOfRange(): ApiError {
  return new ApiError('RESULT_OUT_OF_RANGE', 'result is outside the supported range', 422)
}

function compute(request: CalculationRequest): Decimal {
  const a = parse(request.a)
  switch (request.operation) {
    case 'add': {
      const [x, y, scale] = align(a, parse(request.b))
      return { coefficient: x + y, scale }
    }
    case 'subtract': {
      const [x, y, scale] = align(a, parse(request.b))
      return { coefficient: x - y, scale }
    }
    case 'multiply': {
      const b = parse(request.b)
      return { coefficient: a.coefficient * b.coefficient, scale: a.scale + b.scale }
    }
    case 'percentage': {
      const b = parse(request.b)
      return { coefficient: a.coefficient * b.coefficient, scale: a.scale + b.scale + 2 }
    }
    case 'divide': {
      const b = parse(request.b)
      if (b.coefficient === 0n) {
        throw new ApiError('DIVISION_BY_ZERO', 'division by zero is undefined', 422)
      }
      const extra = PRECISION + 2
      return {
        coefficient: (a.coefficient * 10n ** BigInt(extra)) / b.coefficient,
        scale: a.scale - b.scale + extra,
      }
    }
    case 'power': {
      const b = parse(request.b)
      const exponent = Number(format(b))
      if (Number.isInteger(exponent) && exponent >= 0 && exponent <= 10_000) {
        return { coefficient: a.coefficient ** BigInt(exponent), scale: a.scale * exponent }
      }
      if (a.coefficient < 0n && !Number.isInteger(exponent)) {
        throw new ApiError('NON_REAL_RESULT', 'result is not a real number', 422)
      }
      return parse(String(Number(format(a)) ** exponent))
    }
    case 'sqrt':
      if (a.coefficient < 0n) {
        throw new ApiError(
          'NEGATIVE_SQUARE_ROOT',
          'square root of a negative number is undefined',
          422,
        )
      }
      return float(Math.sqrt(Number(format(a))))
    case 'mod': {
      const b = parse(request.b)
      if (b.coefficient === 0n) {
        throw new ApiError('DIVISION_BY_ZERO', 'division by zero is undefined', 422)
      }
      const [x, y, scale] = align(a, b)
      return { coefficient: x % y, scale }
    }
    case 'factorial': {
      const n = Number(format(a))
      if (!Number.isInteger(n) || n < 0) {
        throw new ApiError(
          'DOMAIN_ERROR',
          'factorial is only defined for non-negative integers',
          422,
        )
      }
      let result = 1n
      for (let i = 2n; i <= BigInt(n); i++) result *= i
      return { coefficient: result, scale: 0 }
    }
    case 'ln':
    case 'log': {
      const x = Number(format(a))
      if (x <= 0) {
        throw new ApiError('DOMAIN_ERROR', 'logarithm is only defined for positive numbers', 422)
      }
      return float(request.operation === 'ln' ? Math.log(x) : Math.log10(x))
    }
    case 'exp':
      return float(Math.exp(Number(format(a))))
    case 'sin':
    case 'cos':
    case 'tan': {
      const x = Number(format(a))
      const radians = request.angleUnit === 'deg' ? (x * Math.PI) / 180 : x
      return float(Math[request.operation](radians))
    }
  }
}

function float(x: number): Decimal {
  return parse(String(Number(x.toPrecision(12))))
}

export function evaluate(request: CalculationRequest): DecimalString {
  const result = compute(request)
  if (result.coefficient !== 0n && Math.abs(exponentOf(result)) > MAX_EXPONENT) {
    throw outOfRange()
  }
  return format(result)
}

export async function fakeCalculate(request: CalculationRequest): Promise<CalculationResponse> {
  const result = evaluate(request)
  const operands = 'b' in request ? [request.a, request.b] : [request.a]
  return { operation: request.operation, operands, result }
}

// Expression evaluation is tested in the backend, so here it is a lookup table.
export function createFakeApi(evaluations: Record<string, DecimalString> = {}): CalculatorApi {
  return {
    calculate: fakeCalculate,
    async evaluate(request: EvaluationRequest): Promise<EvaluationResponse> {
      const result = evaluations[request.expression]
      if (result === undefined) {
        throw new ApiError('INVALID_EXPRESSION', `no fake result for ${request.expression}`, 400)
      }
      return { expression: request.expression, result }
    },
  }
}
