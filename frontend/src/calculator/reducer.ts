import type { AngleUnit } from '../api/types'
import {
  applyExpressionResult,
  expressionReducer,
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

/** Maximum number of entries kept in the history panel. */
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

/** Settings and history restored from a previous session. */
export interface RestoredSession {
  history?: HistoryEntry[]
  evaluation?: Evaluation
  angleUnit?: AngleUnit
}

/** Initial state, optionally restored from a previous session. */
export function createInitialState({
  history = [],
  evaluation = initialState.evaluation,
  angleUnit = initialState.angleUnit,
}: RestoredSession = {}): CalculatorState {
  const nextId = history.reduce((max, entry) => Math.max(max, entry.id), 0) + 1
  return { ...initialState, evaluation, angleUnit, history: history.slice(0, MAX_HISTORY), nextId }
}

/**
 * Pure state machine behind the keypad.
 *
 * Session-level actions (results, history, settings) are handled here, and
 * keypad input is delegated to the active evaluation mode. The reducer never
 * does arithmetic itself: when something must be computed it stores a
 * PendingRequest, which useCalculator sends to the backend before dispatching
 * `resolve` or `reject`. While a request is in flight every input except
 * `clear` is ignored, so results cannot interleave.
 */
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
      // Switching modes starts a fresh calculation; the two modes do not
      // share an in-progress state.
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
      // Keep the expression so the user can fix it, e.g. with backspace.
      return expressionReducer({ ...state, error: null }, action)
    }
    // Any key dismisses the error. Keys that start a new number also apply.
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

// --- Selectors -------------------------------------------------------------

/** Text for the main display. */
export function selectDisplay(state: CalculatorState): string {
  if (state.error) {
    return state.error
  }
  return state.evaluation === 'immediate'
    ? selectImmediateDisplay(state.immediate)
    : selectExpressionDisplay(state.expression)
}

/** Text for the secondary line above the display, e.g. "12 +" or "12 + 7 =". */
export function selectExpression(state: CalculatorState): string {
  if (state.pending) {
    return state.pending.expression
  }
  return state.evaluation === 'immediate'
    ? selectImmediateExpression(state.immediate)
    : selectExpressionLine(state.expression)
}

/** The operator awaiting its second operand, if any (used to highlight its key). */
export function selectActiveOperator(state: CalculatorState): InfixOperator | null {
  const im = state.immediate
  return state.evaluation === 'immediate' && im.entry === null ? im.operator : null
}

// --- Transitions -----------------------------------------------------------

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
