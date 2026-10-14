import type { DecimalString } from '../api/types'
import type { Constant } from './types'

// Must match the backend's 34-digit values. Expression mode sends the names instead.
export const CONSTANTS: Record<Constant, DecimalString> = {
  pi: '3.141592653589793238462643383279503',
  e: '2.718281828459045235360287471352662',
}

export const CONSTANT_SYMBOLS: Record<Constant, string> = { pi: 'π', e: 'e' }
