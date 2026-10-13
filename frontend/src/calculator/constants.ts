import type { DecimalString } from '../api/types'
import type { Constant } from './types'

/**
 * Mathematical constants to 34 significant digits, the backend's precision.
 * Inserting a constant is data entry, not arithmetic, so it happens locally;
 * in expression mode the constant's name is sent and the backend uses its own
 * value instead.
 */
export const CONSTANTS: Record<Constant, DecimalString> = {
  pi: '3.141592653589793238462643383279503',
  e: '2.718281828459045235360287471352662',
}

export const CONSTANT_SYMBOLS: Record<Constant, string> = { pi: 'π', e: 'e' }
