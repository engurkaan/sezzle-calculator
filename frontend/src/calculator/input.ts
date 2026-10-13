/**
 * Rules for typing a number, shared by both evaluation modes. Text is kept
 * verbatim ("0.", "-0", "12.50") until the number is complete.
 */

/**
 * Maximum number of significant digits the user may type. Matches what the
 * display can show; the backend itself accepts up to 34.
 */
export const MAX_INPUT_DIGITS = 20

function countDigits(text: string): number {
  return text.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '').length
}

/** Appends a digit, replacing a lone leading zero. Returns null if not allowed. */
export function appendDigit(text: string, digit: string): string | null {
  if (!/^\d$/.test(digit)) {
    return null
  }
  if (text === '0' || text === '-0') {
    return text.slice(0, -1) + digit
  }
  if (countDigits(text) >= MAX_INPUT_DIGITS) {
    return null
  }
  return text + digit
}

/** Appends a decimal point unless there already is one. */
export function appendDecimal(text: string): string | null {
  return text.includes('.') ? null : text + '.'
}

/** Adds or removes a leading minus sign. */
export function toggleTextSign(text: string): string {
  return text.startsWith('-') ? text.slice(1) : '-' + text
}

/** The typed text as a decimal string for the API ("5." becomes "5"). */
export function typedValue(text: string): string {
  return text.replace(/\.$/, '')
}
