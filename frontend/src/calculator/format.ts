import type { InfixOperator } from './types'

/**
 * Significant digits shown for computed results. IEEE-754 doubles carry
 * 15–17 significant digits, and binary rounding noise lives in the last
 * one or two, so 15 hides artefacts such as 0.1 + 0.2 = 0.30000000000000004.
 */
const DISPLAY_PRECISION = 15

/** Magnitudes outside [MIN_PLAIN, MAX_PLAIN) are shown in exponential form. */
const MAX_PLAIN = 1e15
const MIN_PLAIN = 1e-6

export const OPERATOR_SYMBOLS: Record<InfixOperator, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  power: '^',
}

function groupThousands(integerDigits: string): string {
  return integerDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** Formats a computed number for display. */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return 'Error'
  }
  if (value === 0) {
    return '0'
  }

  const magnitude = Math.abs(value)
  if (magnitude >= MAX_PLAIN || magnitude < MIN_PLAIN) {
    const [mantissa = '', exponent = ''] = value.toExponential(DISPLAY_PRECISION - 1).split('e')
    const trimmed = mantissa.includes('.') ? mantissa.replace(/\.?0+$/, '') : mantissa
    return `${trimmed}e${exponent}`
  }

  return formatInput(String(Number(value.toPrecision(DISPLAY_PRECISION))))
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
  return `${sign}${groupThousands(integer || '0')}${fraction}`
}

/** Formats an operand inside an expression; negatives are parenthesised for clarity. */
export function formatOperand(value: number): string {
  const formatted = formatNumber(value)
  return value < 0 ? `(${formatted})` : formatted
}
