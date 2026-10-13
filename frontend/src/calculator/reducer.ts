import type { CalculationRequest, DecimalString } from '../api/types'
import { formatInput, formatNumber, formatOperand, negate, OPERATOR_SYMBOLS } from './format'
import type {
  CalculatorAction,
  CalculatorState,
  Entry,
  HistoryEntry,
  InfixOperator,
  Intent,
  PendingRequest,
} from './types'

/**
 * Maximum number of significant digits the user may type. Matches what the
 * display can show; the backend itself accepts up to 34.
 */
export const MAX_INPUT_DIGITS = 20

/** Maximum number of entries kept in the history panel. */
export const MAX_HISTORY = 50

export const initialState: CalculatorState = {
  entry: null,
  accumulator: null,
  operator: null,
  lastOperation: null,
  lastExpression: null,
  pending: null,
  error: null,
  history: [],
  nextId: 1,
}

/** Initial state, optionally restored with a previous session's history. */
export function createInitialState(history: HistoryEntry[] = []): CalculatorState {
  const nextId = history.reduce((max, entry) => Math.max(max, entry.id), 0) + 1
  return { ...initialState, history: history.slice(0, MAX_HISTORY), nextId }
}

/**
 * Pure state machine behind the keypad.
 *
 * The reducer never does arithmetic itself: when an operation must be
 * evaluated it stores a PendingRequest, which useCalculator sends to the
 * backend before dispatching `resolve` or `reject`. While a request is in
 * flight every input except `clear` is ignored, so results cannot interleave.
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
  }

  if (state.pending) {
    return state
  }
  if (state.error) {
    // Any key dismisses the error. Keys that start a new number also apply.
    const fresh = reset(state)
    switch (action.type) {
      case 'digit':
      case 'decimal':
      case 'toggleSign':
      case 'recall':
        return calculatorReducer(fresh, action)
      default:
        return fresh
    }
  }

  switch (action.type) {
    case 'digit':
      return inputDigit(state, action.digit)
    case 'decimal':
      return inputDecimal(state)
    case 'backspace':
      return backspace(state)
    case 'toggleSign':
      return toggleSign(state)
    case 'recall':
      return { ...state, entry: { kind: 'computed', value: action.value } }
    case 'operator':
      return pressOperator(state, action.operator)
    case 'equals':
      return pressEquals(state)
    case 'percent':
      return pressPercent(state)
    case 'sqrt': {
      const a = currentOperand(state)
      return request(state, { operation: 'sqrt', a }, { kind: 'unary' }, `√${formatOperand(a)}`)
    }
  }
}

// --- Selectors -------------------------------------------------------------

/** Text for the main display. */
export function selectDisplay(state: CalculatorState): string {
  if (state.error) {
    return state.error
  }
  if (state.entry?.kind === 'typed') {
    return formatInput(state.entry.text)
  }
  if (state.entry?.kind === 'computed') {
    return formatNumber(state.entry.value)
  }
  return formatNumber(state.accumulator ?? '0')
}

/** Text for the secondary line above the display, e.g. "12 +" or "12 + 7 =". */
export function selectExpression(state: CalculatorState): string {
  if (state.pending) {
    return state.pending.expression
  }
  if (state.operator !== null && state.accumulator !== null) {
    return `${formatOperand(state.accumulator)} ${OPERATOR_SYMBOLS[state.operator]}`
  }
  if (state.entry?.kind === 'computed' && state.lastExpression) {
    return `${state.lastExpression} =`
  }
  return ''
}

/** The operator awaiting its second operand, if any (used to highlight its key). */
export function selectActiveOperator(state: CalculatorState): InfixOperator | null {
  return state.entry === null ? state.operator : null
}

// --- Transitions -----------------------------------------------------------

function reset(state: CalculatorState): CalculatorState {
  return { ...initialState, history: state.history, nextId: state.nextId }
}

/** The entry as a decimal string for the API ("5." becomes "5"). */
function entryValue(entry: Entry): DecimalString {
  return entry.kind === 'computed' ? entry.value : entry.text.replace(/\.$/, '')
}

/** The number an operation would act on right now. */
function currentOperand(state: CalculatorState): DecimalString {
  return state.entry ? entryValue(state.entry) : (state.accumulator ?? '0')
}

function countDigits(text: string): number {
  return text.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '').length
}

function inputDigit(state: CalculatorState, digit: string): CalculatorState {
  if (!/^\d$/.test(digit)) {
    return state
  }
  if (state.entry?.kind !== 'typed') {
    return { ...state, entry: { kind: 'typed', text: digit } }
  }

  const { text } = state.entry
  if (text === '0' || text === '-0') {
    return { ...state, entry: { kind: 'typed', text: text.slice(0, -1) + digit } }
  }
  if (countDigits(text) >= MAX_INPUT_DIGITS) {
    return state
  }
  return { ...state, entry: { kind: 'typed', text: text + digit } }
}

function inputDecimal(state: CalculatorState): CalculatorState {
  if (state.entry?.kind !== 'typed') {
    return { ...state, entry: { kind: 'typed', text: '0.' } }
  }
  if (state.entry.text.includes('.')) {
    return state
  }
  return { ...state, entry: { kind: 'typed', text: state.entry.text + '.' } }
}

function backspace(state: CalculatorState): CalculatorState {
  if (state.entry?.kind !== 'typed') {
    return state
  }
  const text = state.entry.text.slice(0, -1)
  return { ...state, entry: { kind: 'typed', text: text === '' || text === '-' ? '0' : text } }
}

function toggleSign(state: CalculatorState): CalculatorState {
  const { entry } = state
  if (entry === null) {
    // Awaiting an operand: start typing a negative number.
    return { ...state, entry: { kind: 'typed', text: '-0' } }
  }
  if (entry.kind === 'typed') {
    const text = entry.text.startsWith('-') ? entry.text.slice(1) : '-' + entry.text
    return { ...state, entry: { kind: 'typed', text } }
  }
  // Flipping the sign of a decimal string is exact, so it is not worth a round trip.
  return { ...state, entry: { kind: 'computed', value: negate(entry.value) } }
}

function pressOperator(state: CalculatorState, operator: InfixOperator): CalculatorState {
  if (state.operator !== null && state.accumulator !== null) {
    if (state.entry === null) {
      // No second operand yet: the user changed their mind about the operator.
      return { ...state, operator }
    }
    return infix(state, state.accumulator, state.operator, entryValue(state.entry), {
      kind: 'chain',
      next: operator,
    })
  }
  return {
    ...state,
    accumulator: currentOperand(state),
    operator,
    entry: null,
    lastExpression: null,
  }
}

function pressEquals(state: CalculatorState): CalculatorState {
  if (state.operator !== null && state.accumulator !== null) {
    // "5 × =" squares: a missing second operand defaults to the first.
    const operand = state.entry ? entryValue(state.entry) : state.accumulator
    return {
      ...infix(state, state.accumulator, state.operator, operand, { kind: 'equals' }),
      lastOperation: { operator: state.operator, operand },
    }
  }
  if (state.lastOperation) {
    // Repeated "=" applies the previous operation to the current value.
    const { operator, operand } = state.lastOperation
    return infix(state, currentOperand(state), operator, operand, { kind: 'equals' })
  }
  if (state.entry?.kind === 'typed') {
    // Nothing to evaluate; normalise text such as "5." into a number.
    return { ...state, entry: { kind: 'computed', value: entryValue(state.entry) } }
  }
  return state
}

/**
 * Percent follows the convention of desk calculators: after + or − it means
 * "percent of the first operand" (200 + 10% → 200 + 20); otherwise it simply
 * divides by 100.
 */
function pressPercent(state: CalculatorState): CalculatorState {
  const percent = currentOperand(state)
  const relative =
    state.accumulator !== null && (state.operator === 'add' || state.operator === 'subtract')
  if (relative) {
    const base = state.accumulator ?? '0'
    return request(
      state,
      { operation: 'percentage', a: percent, b: base },
      { kind: 'unary' },
      `${formatOperand(percent)}% of ${formatOperand(base)}`,
    )
  }
  return request(
    state,
    { operation: 'percentage', a: percent, b: '1' },
    { kind: 'unary' },
    `${formatOperand(percent)}%`,
  )
}

function infix(
  state: CalculatorState,
  a: DecimalString,
  operator: InfixOperator,
  b: DecimalString,
  intent: Intent,
): CalculatorState {
  const expression = `${formatOperand(a)} ${OPERATOR_SYMBOLS[operator]} ${formatOperand(b)}`
  return request(state, { operation: operator, a, b }, intent, expression)
}

function request(
  state: CalculatorState,
  req: CalculationRequest,
  intent: Intent,
  expression: string,
): CalculatorState {
  return {
    ...state,
    pending: { id: state.nextId, request: req, intent, expression },
    nextId: state.nextId + 1,
  }
}

function applyResult(
  state: CalculatorState,
  pending: PendingRequest,
  result: DecimalString,
): CalculatorState {
  const history = [
    { id: pending.id, expression: pending.expression, result },
    ...state.history,
  ].slice(0, MAX_HISTORY)
  const base = { ...state, pending: null, history }

  switch (pending.intent.kind) {
    case 'equals':
      return {
        ...base,
        entry: { kind: 'computed', value: result },
        accumulator: null,
        operator: null,
        lastExpression: pending.expression,
      }
    case 'chain':
      return {
        ...base,
        entry: null,
        accumulator: result,
        operator: pending.intent.next,
        lastExpression: null,
      }
    case 'unary':
      return {
        ...base,
        entry: { kind: 'computed', value: result },
        lastExpression: pending.expression,
      }
  }
}
