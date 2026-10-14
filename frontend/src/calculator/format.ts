import type { DecimalString } from '../api/types'
import type { InfixOperator } from './types'

// The backend keeps 34 digits; the hidden ones act as guard digits (1 ÷ 3 × 3 displays 1).
export const DISPLAY_DIGITS = 20

const MIN_PLAIN_EXPONENT = -6

// Intl.NumberFormat rounds numeric strings exactly, without converting them to binary floats.
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

// V8 renders strings beyond the float64 range as "∞", so only the mantissa goes through Intl.
function formatScientific(value: DecimalString, exponent: number): string {
  const negative = value.startsWith('-')
  const digits = value
    .replace(/[eE].*$/, '')
    .replace(/\D/g, '')
    .replace(/^0+/, '')
  let mantissa = formatExact(mantissaFormat, `${digits[0]}.${digits.slice(1)}`)
  if (mantissa === '10') {
    // 9.99… rounded up to 10.
    mantissa = '1'
    exponent++
  }
  return `${negative ? '-' : ''}${mantissa}e${exponent < 0 ? '-' : '+'}${Math.abs(exponent)}`
}

export function formatInput(text: string): string {
  const match = /^(-?)(\d*)(\.\d*)?$/.exec(text)
  if (!match) {
    return text
  }
  const [, sign = '', integer = '', fraction = ''] = match
  return `${sign}${(integer || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction}`
}

export function formatOperand(value: DecimalString): string {
  const formatted = formatNumber(value)
  return formatted.startsWith('-') ? `(${formatted})` : formatted
}

export function negate(value: DecimalString): DecimalString {
  if (decimalExponent(value) === null) {
    return '0'
  }
  return value.startsWith('-') ? value.slice(1) : `-${value}`
}
