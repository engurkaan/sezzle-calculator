import type { DecimalString } from '../api/types'
import type { InfixOperator } from './types'

/**
 * Significant digits shown in the display. The backend keeps 34, so the
 * extra digits act as guard digits: 1 ÷ 3 × 3 is computed as
 * 0.999…9 (34 nines) but displays as 1, as on a hardware calculator.
 */
export const DISPLAY_DIGITS = 20

/** Exponents outside [MIN_PLAIN_EXPONENT, DISPLAY_DIGITS) use scientific notation. */
const MIN_PLAIN_EXPONENT = -6

// Intl.NumberFormat formats numeric *strings* as exact decimals, so values are
// rounded for display without ever being converted to a binary float.
const plain = new Intl.NumberFormat('en-US', { maximumSignificantDigits: DISPLAY_DIGITS })
const mantissaFormat = new Intl.NumberFormat('en-US', {
  maximumSignificantDigits: DISPLAY_DIGITS,
  useGrouping: false,
})

// The TypeScript lib types predate string support in Intl.NumberFormat.
const formatExact = (format: Intl.NumberFormat, value: DecimalString) =>
  format.format(value as unknown as number)

const DECIMAL_PATTERN = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/

export const OPERATOR_SYMBOLS: Record<InfixOperator, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  power: '^',
  mod: 'mod',
}

/**
 * Power of ten of the most significant digit of a decimal string
 * ("1234" → 3, "0.05" → -2, "1.5e40" → 40), or null for zero and invalid input.
 */
export function decimalExponent(value: DecimalString): number | null {
  const match = DECIMAL_PATTERN.exec(value)
  if (!match) {
    return null
  }
  const [, , integer = '', fraction = '', exponent = '0'] = match
  const shift = Number(exponent)
  const significantInteger = integer.replace(/^0+/, '')
  if (significantInteger) {
    return significantInteger.length - 1 + shift
  }
  const firstNonZero = fraction.search(/[1-9]/)
  return firstNonZero === -1 ? null : shift - firstNonZero - 1
}

/** Formats a computed decimal for display. */
export function formatNumber(value: DecimalString): string {
  if (!DECIMAL_PATTERN.test(value) || !/\d/.test(value)) {
    return 'Error'
  }
  const exponent = decimalExponent(value)
  if (exponent === null) {
    return '0'
  }
  if (exponent >= MIN_PLAIN_EXPONENT && exponent < DISPLAY_DIGITS) {
    return formatExact(plain, value)
  }
  return formatScientific(value, exponent)
}

/**
 * Scientific notation built by hand: only the mantissa goes through Intl, as
 * V8 renders strings beyond the float64 range (e.g. "1e+400") as "∞".
 */
function formatScientific(value: DecimalString, exponent: number): string {
  const negative = value.startsWith('-')
  const digits = value
    .replace(/[eE].*$/, '')
    .replace(/\D/g, '')
    .replace(/^0+/, '')
  let mantissa = formatExact(mantissaFormat, `${digits[0]}.${digits.slice(1)}`)
  if (mantissa === '10') {
    // Rounding carried into a new digit, e.g. 9.999… → 10.
    mantissa = '1'
    exponent++
  }
  return `${negative ? '-' : ''}${mantissa}e${exponent < 0 ? '-' : '+'}${Math.abs(exponent)}`
}

/**
 * Formats text the user is typing. Unlike formatNumber it preserves a
 * trailing decimal point, trailing zeros and a lone minus sign ("-0").
 */
export function formatInput(text: string): string {
  const match = /^(-?)(\d*)(\.\d*)?$/.exec(text)
  if (!match) {
    return text
  }
  const [, sign = '', integer = '', fraction = ''] = match
  return `${sign}${(integer || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction}`
}

/** Formats an operand inside an expression; negatives are parenthesised for clarity. */
export function formatOperand(value: DecimalString): string {
  const formatted = formatNumber(value)
  return formatted.startsWith('-') ? `(${formatted})` : formatted
}

/** Negates a decimal string. Exact, so it needs no round trip to the backend. */
export function negate(value: DecimalString): DecimalString {
  if (decimalExponent(value) === null) {
    return '0'
  }
  return value.startsWith('-') ? value.slice(1) : `-${value}`
}
