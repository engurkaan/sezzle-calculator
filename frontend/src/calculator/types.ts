import type { CalculationRequest, DecimalString } from '../api/types'

/** Operators that wait for a second operand before they are evaluated. */
export type InfixOperator = 'add' | 'subtract' | 'multiply' | 'divide' | 'power'

/**
 * The operand currently shown in the main display.
 *
 * - `typed`: the user is entering digits; kept as text so "0." and "-0"
 *   survive until the number is complete.
 * - `computed`: a value produced by the backend (or recalled from history).
 *   It can be used as an operand but not edited digit by digit.
 */
export type Entry = { kind: 'typed'; text: string } | { kind: 'computed'; value: DecimalString }

/** What to do with the result of a request once it arrives. */
export type Intent =
  /** `=` was pressed: show the result and finish the calculation. */
  | { kind: 'equals' }
  /** An operator was pressed mid-calculation: the result becomes the new left operand. */
  | { kind: 'chain'; next: InfixOperator }
  /** √ or %: the result replaces the current operand. */
  | { kind: 'unary' }

export interface PendingRequest {
  id: number
  request: CalculationRequest
  intent: Intent
  /** Human-readable form of the request, e.g. "12 + 7". */
  expression: string
}

export interface HistoryEntry {
  id: number
  expression: string
  result: DecimalString
}

export interface CalculatorState {
  entry: Entry | null
  /** Left operand of the pending operator. */
  accumulator: DecimalString | null
  operator: InfixOperator | null
  /** Remembered so that pressing `=` again repeats the last operation. */
  lastOperation: { operator: InfixOperator; operand: DecimalString } | null
  /** Expression that produced the computed entry, shown above the result. */
  lastExpression: string | null
  pending: PendingRequest | null
  error: string | null
  history: HistoryEntry[]
  /** Monotonic id source for requests and history entries. */
  nextId: number
}

export type CalculatorAction =
  | { type: 'digit'; digit: string }
  | { type: 'decimal' }
  | { type: 'operator'; operator: InfixOperator }
  | { type: 'equals' }
  | { type: 'percent' }
  | { type: 'sqrt' }
  | { type: 'toggleSign' }
  | { type: 'backspace' }
  | { type: 'clear' }
  | { type: 'recall'; value: DecimalString }
  | { type: 'clearHistory' }
  | { type: 'deleteHistoryEntry'; id: number }
  | { type: 'resolve'; id: number; result: DecimalString }
  | { type: 'reject'; id: number; message: string }
