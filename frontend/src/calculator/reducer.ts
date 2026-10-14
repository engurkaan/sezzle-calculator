import type { AngleUnit } from '../api/types'
import {
  applyExpressionResult,
  expressionReducer,
  formatTokens,
  selectExpressionDisplay,
  selectExpressionLine,
} from './expression'
import {
  applyImmediateResult,
  immediateReducer,
  selectImmediateDisplay,
  selectImmediateExpression,
} from './immediate'
import { initialExpression, initialImmediate } from './session'
import type {
  CalculatorAction,
  CalculatorState,
  Evaluation,
  HistoryEntry,
  InfixOperator,
  PendingRequest,
} from './types'

export { MAX_INPUT_DIGITS } from './input'

export const MAX_HISTORY = 50

export const initialState: CalculatorState = {
  evaluation: 'immediate',
  angleUnit: 'deg',
  immediate: initialImmediate,
  expression: initialExpression,
  pending: null,
  error: null,
  history: [],
  nextId: 1,
}

export interface RestoredSession {
  history?: HistoryEntry[]
  evaluation?: Evaluation
  angleUnit?: AngleUnit
}

export function createInitialState({
  history = [],
  evaluation = initialState.evaluation,
  angleUnit = initialState.angleUnit,
}: RestoredSession = {}): CalculatorState {
  const nextId = history.reduce((max, entry) => Math.max(max, entry.id), 0) + 1
  return { ...initialState, evaluation, angleUnit, history: history.slice(0, MAX_HISTORY), nextId }
}

export function calculatorReducer(
  state: CalculatorState,
  action: CalculatorAction,
): CalculatorState {
  switch (action.type) {
    case 'resolve':
      return state.pending?.id === action.id
        ? applyResult(state, state.pending, action.result)
        : state
    case 'reject':
      return state.pending?.id === action.id
        ? { ...state, pending: null, error: action.message }
        : state
    case 'clear':
      return reset(state)
    case 'clearHistory':
      return { ...state, history: [] }
    case 'deleteHistoryEntry':
      return { ...state, history: state.history.filter((entry) => entry.id !== action.id) }
    case 'setEvaluation':
      return action.evaluation === state.evaluation
        ? state
        : { ...reset(state), evaluation: action.evaluation }
    case 'setAngleUnit':
      return { ...state, angleUnit: action.unit }
  }

  if (state.pending) {
    return state
  }

  if (state.error) {
    if (state.evaluation === 'expression') {
      return expressionReducer({ ...state, error: null }, action)
    }
    const fresh = reset(state)
    switch (action.type) {
      case 'digit':
      case 'decimal':
      case 'toggleSign':
      case 'recall':
      case 'constant':
        return immediateReducer(fresh, action)
      default:
        return fresh
    }
  }

  return state.evaluation === 'immediate'
    ? immediateReducer(state, action)
    : expressionReducer(state, action)
}

export function selectDisplay(state: CalculatorState): string {
  if (state.error) {
    return state.error
  }
  return state.evaluation === 'immediate'
    ? selectImmediateDisplay(state.immediate)
    : selectExpressionDisplay(state.expression)
}

export function selectExpression(state: CalculatorState): string {
  if (state.pending) {
    return state.pending.expression
  }
  if (state.evaluation === 'immediate') {
    return selectImmediateExpression(state.immediate)
  }
  return state.error
    ? formatTokens(state.expression.tokens)
    : selectExpressionLine(state.expression)
}

export function selectActiveOperator(state: CalculatorState): InfixOperator | null {
  const im = state.immediate
  return state.evaluation === 'immediate' && im.entry === null ? im.operator : null
}

function reset(state: CalculatorState): CalculatorState {
  return {
    ...state,
    immediate: initialImmediate,
    expression: initialExpression,
    pending: null,
    error: null,
  }
}

function applyResult(
  state: CalculatorState,
  pending: PendingRequest,
  result: string,
): CalculatorState {
  const history = [
    { id: pending.id, expression: pending.expression, result },
    ...state.history,
  ].slice(0, MAX_HISTORY)
  const next = { ...state, pending: null, history }
  return pending.intent.kind === 'evaluate'
    ? applyExpressionResult(next, pending, result)
    : applyImmediateResult(next, pending, result)
}
