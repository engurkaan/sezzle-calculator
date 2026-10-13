import type { AngleUnit, CalculationRequest, DecimalString, EvaluationRequest } from '../api/types'

/**
 * How keypad input is evaluated:
 * - `immediate`: like a desk calculator, each operator applies as soon as
 *   it is pressed, so 7 + 3 × 2 = 20.
 * - `expression`: the whole expression is built first and evaluated with
 *   standard operator precedence, so 7 + 3 × 2 = 13.
 */
export type Evaluation = 'immediate' | 'expression'

/** Binary operators. */
export type InfixOperator = 'add' | 'subtract' | 'multiply' | 'divide' | 'power' | 'mod'

/** Keys that act on a single value. */
export type ScientificFunction =
  | 'sqrt'
  | 'sin'
  | 'cos'
  | 'tan'
  | 'ln'
  | 'log'
  | 'exp'
  | 'factorial'
  | 'square'
  | 'cube'
  | 'tenPower'
  | 'reciprocal'
  | 'abs'

export type Constant = 'pi' | 'e'

// --- Immediate mode -------------------------------------------------------

/**
 * The operand currently shown in the main display.
 *
 * - `typed`: the user is entering digits; kept as text so "0." and "-0"
 *   survive until the number is complete.
 * - `computed`: a value produced by the backend (or recalled from history).
 *   It can be used as an operand but not edited digit by digit.
 */
export type Entry = { kind: 'typed'; text: string } | { kind: 'computed'; value: DecimalString }

export interface ImmediateState {
  entry: Entry | null
  /** Left operand of the pending operator. */
  accumulator: DecimalString | null
  operator: InfixOperator | null
  /** Remembered so that pressing `=` again repeats the last operation. */
  lastOperation: { operator: InfixOperator; operand: DecimalString } | null
  /** Expression that produced the computed entry, shown above the result. */
  lastExpression: string | null
}

// --- Expression mode ------------------------------------------------------

/** Functions written with an opening parenthesis, e.g. "sin(". */
export type PrefixFunction = 'sqrt' | 'sin' | 'cos' | 'tan' | 'ln' | 'log' | 'exp' | 'abs'

/** Operators written after their operand, e.g. "5!" or "3²". */
export type PostfixOperator = 'factorial' | 'percent' | 'square' | 'cube' | 'reciprocal'

/** One element of an expression being built. */
export type Token =
  /** Digits being typed (may carry a leading "-" from ±). */
  | { kind: 'number'; text: string }
  /** A complete number: a previous result, a recalled value or 10 for 10ˣ. */
  | { kind: 'value'; value: DecimalString }
  | { kind: 'constant'; name: Constant }
  | { kind: 'operator'; operator: InfixOperator }
  /** Unary minus, e.g. in "2 × −3". */
  | { kind: 'negate' }
  | { kind: 'function'; name: PrefixFunction }
  | { kind: 'open' }
  | { kind: 'close' }
  | { kind: 'postfix'; operator: PostfixOperator }

export interface ExpressionState {
  tokens: Token[]
  /** The last evaluated expression, shown until the user starts a new one. */
  result: { value: DecimalString; expression: string } | null
}

// --- Shared ---------------------------------------------------------------

/** A backend call waiting to be made. */
export type ApiCall =
  | { kind: 'calculate'; request: CalculationRequest }
  | { kind: 'evaluate'; request: EvaluationRequest }

/** What to do with the result of a request once it arrives. */
export type Intent =
  /** `=` was pressed (immediate mode): show the result and finish. */
  | { kind: 'equals' }
  /** An operator was pressed mid-calculation: the result becomes the new left operand. */
  | { kind: 'chain'; next: InfixOperator }
  /** A function such as √ or %: the result replaces the current operand. */
  | { kind: 'unary' }
  /** A whole expression was evaluated (expression mode). */
  | { kind: 'evaluate' }

export interface PendingRequest {
  id: number
  call: ApiCall
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
  evaluation: Evaluation
  angleUnit: AngleUnit
  immediate: ImmediateState
  expression: ExpressionState
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
  | { type: 'function'; name: ScientificFunction }
  | { type: 'constant'; name: Constant }
  | { type: 'paren'; side: 'open' | 'close' }
  | { type: 'toggleSign' }
  | { type: 'backspace' }
  | { type: 'clear' }
  | { type: 'recall'; value: DecimalString }
  | { type: 'clearHistory' }
  | { type: 'deleteHistoryEntry'; id: number }
  | { type: 'setEvaluation'; evaluation: Evaluation }
  | { type: 'setAngleUnit'; unit: AngleUnit }
  | { type: 'resolve'; id: number; result: DecimalString }
  | { type: 'reject'; id: number; message: string }
