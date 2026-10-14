import type { AngleUnit, CalculationRequest, DecimalString, EvaluationRequest } from '../api/types'

export type Evaluation = 'immediate' | 'expression'

export type InfixOperator = 'add' | 'subtract' | 'multiply' | 'divide' | 'power' | 'mod'

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

export type Entry = { kind: 'typed'; text: string } | { kind: 'computed'; value: DecimalString }

export interface ImmediateState {
  entry: Entry | null
  accumulator: DecimalString | null
  operator: InfixOperator | null
  lastOperation: { operator: InfixOperator; operand: DecimalString } | null
  lastExpression: string | null
}

export type PrefixFunction = 'sqrt' | 'sin' | 'cos' | 'tan' | 'ln' | 'log' | 'exp' | 'abs'

export type PostfixOperator = 'factorial' | 'percent' | 'square' | 'cube' | 'reciprocal'

export type Token =
  | { kind: 'number'; text: string }
  | { kind: 'value'; value: DecimalString }
  | { kind: 'constant'; name: Constant }
  | { kind: 'operator'; operator: InfixOperator }
  | { kind: 'negate' }
  | { kind: 'function'; name: PrefixFunction }
  | { kind: 'open' }
  | { kind: 'close' }
  | { kind: 'postfix'; operator: PostfixOperator }

export interface ExpressionState {
  tokens: Token[]
  result: { value: DecimalString; expression: string } | null
}

export type ApiCall =
  | { kind: 'calculate'; request: CalculationRequest }
  | { kind: 'evaluate'; request: EvaluationRequest }

export type Intent =
  | { kind: 'equals' }
  | { kind: 'chain'; next: InfixOperator }
  | { kind: 'unary' }
  | { kind: 'evaluate' }

export interface PendingRequest {
  id: number
  call: ApiCall
  intent: Intent
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
