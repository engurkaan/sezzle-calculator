export const MAX_INPUT_DIGITS = 20

function countDigits(text: string): number {
  return text.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '').length
}

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

export function appendDecimal(text: string): string | null {
  return text.includes('.') ? null : text + '.'
}

export function toggleTextSign(text: string): string {
  return text.startsWith('-') ? text.slice(1) : '-' + text
}

export function typedValue(text: string): string {
  return text.replace(/\.$/, '')
}
