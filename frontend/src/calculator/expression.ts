import type { DecimalString } from '../api/types'
import { CONSTANT_SYMBOLS } from './constants'
import { formatInput, formatNumber, negate, OPERATOR_SYMBOLS } from './format'
import { appendDecimal, appendDigit, toggleTextSign, typedValue } from './input'
import { queue } from './session'
import type {
  CalculatorAction,
  CalculatorState,
  ExpressionState,
  InfixOperator,
  PendingRequest,
  PostfixOperator,
  PrefixFunction,
  ScientificFunction,
  Token,
} from './types'

/**
 * Expression mode: keys build an expression such as "7 + 3 × 2", and "="
 * sends the whole expression to the backend, which applies standard operator
 * precedence (= 13). The reducer only enforces that the expression stays
 * well formed while it is typed; it never evaluates anything.
 */

/** Matches the backend's limit on expression length. */
export const MAX_EXPRESSION_LENGTH = 1000

const POSTFIX_FUNCTIONS: Partial<Record<ScientificFunction, PostfixOperator>> = {
  factorial: 'factorial',
  square: 'square',
  cube: 'cube',
  reciprocal: 'reciprocal',
}

export function expressionReducer(
  state: CalculatorState,
  action: CalculatorAction,
): CalculatorState {
  const ex = state.expression
  const set = (next: ExpressionState): CalculatorState =>
    toWire(next.tokens).length > MAX_EXPRESSION_LENGTH ? state : { ...state, expression: next }

  // After "=", keys that start a value begin a new expression, while
  // operators continue from the result.
  const fresh: Token[] = ex.result ? [] : ex.tokens
  const continued: Token[] = ex.result ? [{ kind: 'value', value: ex.result.value }] : ex.tokens
  const last = fresh.at(-1)

  switch (action.type) {
    case 'digit': {
      if (last?.kind === 'number') {
        const text = appendDigit(last.text, action.digit)
        return text === null ? state : set(replaceLast(fresh, { kind: 'number', text }))
      }
      if (!/^\d$/.test(action.digit)) {
        return state
      }
      return set(start(append(fresh, { kind: 'number', text: action.digit })))
    }
    case 'decimal': {
      if (last?.kind === 'number') {
        const text = appendDecimal(last.text)
        return text === null ? state : set(replaceLast(fresh, { kind: 'number', text }))
      }
      return set(start(append(fresh, { kind: 'number', text: '0.' })))
    }
    case 'constant':
      return set(start(append(fresh, { kind: 'constant', name: action.name })))
    case 'paren':
      if (action.side === 'open') {
        return set(start(append(fresh, { kind: 'open' })))
      }
      return !ex.result && endsOperand(ex.tokens) && openParens(ex.tokens) > 0
        ? set(start([...ex.tokens, { kind: 'close' }]))
        : state
    case 'function': {
      const postfix = POSTFIX_FUNCTIONS[action.name]
      if (postfix) {
        return addPostfix(state, continued, postfix, set)
      }
      if (action.name === 'tenPower') {
        return set(
          start([
            ...append(fresh, { kind: 'value', value: '10' }),
            { kind: 'operator', operator: 'power' },
            { kind: 'open' },
          ]),
        )
      }
      return set(start(append(fresh, { kind: 'function', name: action.name as PrefixFunction })))
    }
    case 'percent':
      return addPostfix(state, continued, 'percent', set)
    case 'operator':
      return addOperator(state, continued, action.operator, set)
    case 'toggleSign':
      return toggleSign(state, continued, set)
    case 'backspace':
      return ex.result ? state : set(start(backspace(ex.tokens)))
    case 'recall':
      return set(start(recall(fresh, action.value)))
    case 'equals':
      return pressEquals(state)
    default:
      return state
  }
}

/** Updates expression-mode state with a result from the backend. */
export function applyExpressionResult(
  state: CalculatorState,
  pending: PendingRequest,
  result: DecimalString,
): CalculatorState {
  return {
    ...state,
    expression: { tokens: [], result: { value: result, expression: pending.expression } },
  }
}

// --- Selectors ---------------------------------------------------------------

export function selectExpressionDisplay(ex: ExpressionState): string {
  if (ex.tokens.length > 0) {
    return formatTokens(ex.tokens)
  }
  return formatNumber(ex.result?.value ?? '0')
}

export function selectExpressionLine(ex: ExpressionState): string {
  return ex.result && ex.tokens.length === 0 ? `${ex.result.expression} =` : ''
}

// --- Display and wire formats -------------------------------------------------

const POSTFIX_SYMBOLS: Record<PostfixOperator, string> = {
  factorial: '!',
  percent: '%',
  square: '²',
  cube: '³',
  reciprocal: '⁻¹',
}

const POSTFIX_WIRE: Record<PostfixOperator, string> = {
  factorial: '!',
  percent: '%',
  square: '^2',
  cube: '^3',
  reciprocal: '^(-1)',
}

const OPERATOR_WIRE: Record<InfixOperator, string> = {
  add: '+',
  subtract: '-',
  multiply: '*',
  divide: '/',
  power: '^',
  mod: ' mod ',
}

const FUNCTION_SYMBOLS: Partial<Record<PrefixFunction, string>> = { sqrt: '√' }

/** Human-readable expression, e.g. "7 + 3 × √(16)". */
export function formatTokens(tokens: Token[]): string {
  return tokens
    .map((token, i) => {
      switch (token.kind) {
        case 'number':
          return parenthesizeIfNegative(formatInput(token.text), tokens[i + 1])
        case 'value':
          return parenthesizeIfNegative(formatNumber(token.value), tokens[i + 1])
        case 'constant':
          return CONSTANT_SYMBOLS[token.name]
        case 'operator':
          return token.operator === 'power' ? '^' : ` ${OPERATOR_SYMBOLS[token.operator]} `
        case 'negate':
          return '−'
        case 'function':
          return `${FUNCTION_SYMBOLS[token.name] ?? token.name}(`
        case 'open':
          return '('
        case 'close':
          return ')'
        case 'postfix':
          return POSTFIX_SYMBOLS[token.operator]
      }
    })
    .join('')
    .trim()
}

/** The expression in the backend's grammar, e.g. "7+3*sqrt(16)". */
export function toWire(tokens: Token[]): string {
  return tokens
    .map((token) => {
      switch (token.kind) {
        case 'number':
          return wrapNegative(typedValue(token.text))
        case 'value':
          return wrapNegative(token.value)
        case 'constant':
          return token.name
        case 'operator':
          return OPERATOR_WIRE[token.operator]
        case 'negate':
          return '-'
        case 'function':
          return `${token.name}(`
        case 'open':
          return '('
        case 'close':
          return ')'
        case 'postfix':
          return POSTFIX_WIRE[token.operator]
      }
    })
    .join('')
}

/** Negative numbers are parenthesised so that "(-5)²" is not read as −(5²). */
function wrapNegative(value: string): string {
  return value.startsWith('-') ? `(${value})` : value
}

function parenthesizeIfNegative(shown: string, next: Token | undefined): string {
  const bindsTighter =
    next?.kind === 'postfix' || (next?.kind === 'operator' && next.operator === 'power')
  return shown.startsWith('-') && bindsTighter ? `(${shown})` : shown
}

// --- Helpers -------------------------------------------------------------------

/** Whether the expression currently ends with a complete operand. */
function endsOperand(tokens: Token[]): boolean {
  const last = tokens.at(-1)
  if (!last) {
    return false
  }
  if (last.kind === 'number') {
    return /\d/.test(last.text)
  }
  return ['value', 'constant', 'close', 'postfix'].includes(last.kind)
}

function openParens(tokens: Token[]): number {
  return tokens.reduce((depth, t) => {
    if (t.kind === 'open' || t.kind === 'function') return depth + 1
    if (t.kind === 'close') return depth - 1
    return depth
  }, 0)
}

/** Appends a token that begins an operand, inserting "×" for implicit products like 2π. */
function append(tokens: Token[], token: Token): Token[] {
  return endsOperand(tokens)
    ? [...tokens, { kind: 'operator', operator: 'multiply' }, token]
    : [...tokens, token]
}

function replaceLast(tokens: Token[], token: Token): ExpressionState {
  return { tokens: [...tokens.slice(0, -1), token], result: null }
}

function start(tokens: Token[]): ExpressionState {
  return { tokens, result: null }
}

function addOperator(
  state: CalculatorState,
  tokens: Token[],
  operator: InfixOperator,
  set: (next: ExpressionState) => CalculatorState,
): CalculatorState {
  const last = tokens.at(-1)
  if (endsOperand(tokens)) {
    return set(start([...tokens, { kind: 'operator', operator }]))
  }
  if (operator === 'subtract' && last?.kind !== 'negate') {
    // A minus where an operand is expected is a unary minus: "2 × −3".
    return set(start([...tokens, { kind: 'negate' }]))
  }
  if (last?.kind === 'operator') {
    // Two operators in a row: the user changed their mind.
    return set(start([...tokens.slice(0, -1), { kind: 'operator', operator }]))
  }
  return state
}

function addPostfix(
  state: CalculatorState,
  tokens: Token[],
  operator: PostfixOperator,
  set: (next: ExpressionState) => CalculatorState,
): CalculatorState {
  return endsOperand(tokens) ? set(start([...tokens, { kind: 'postfix', operator }])) : state
}

function toggleSign(
  state: CalculatorState,
  tokens: Token[],
  set: (next: ExpressionState) => CalculatorState,
): CalculatorState {
  const last = tokens.at(-1)
  switch (last?.kind) {
    case 'number':
      return set(replaceLast(tokens, { kind: 'number', text: toggleTextSign(last.text) }))
    case 'value':
      return set(replaceLast(tokens, { kind: 'value', value: negate(last.value) }))
    case 'negate':
      return set(start(tokens.slice(0, -1)))
    default:
      return endsOperand(tokens) ? state : set(start([...tokens, { kind: 'negate' }]))
  }
}

function backspace(tokens: Token[]): Token[] {
  const last = tokens.at(-1)
  if (last?.kind === 'number') {
    const text = last.text.slice(0, -1)
    return text === '' || text === '-'
      ? tokens.slice(0, -1)
      : [...tokens.slice(0, -1), { kind: 'number', text }]
  }
  return tokens.slice(0, -1)
}

function recall(tokens: Token[], value: DecimalString): Token[] {
  const last = tokens.at(-1)
  if (last?.kind === 'number' || last?.kind === 'value') {
    return [...tokens.slice(0, -1), { kind: 'value', value }]
  }
  return append(tokens, { kind: 'value', value })
}

function pressEquals(state: CalculatorState): CalculatorState {
  const { tokens } = state.expression
  if (!endsOperand(tokens)) {
    // Nothing to evaluate yet, or the expression ends with an operator.
    return state
  }
  // Close any parentheses the user left open: "√(16" means "√(16)".
  const closed: Token[] = [
    ...tokens,
    ...Array.from({ length: openParens(tokens) }, (): Token => ({ kind: 'close' })),
  ]
  const next = { ...state, expression: { tokens: closed, result: null } }
  return queue(
    next,
    {
      kind: 'evaluate',
      request: { expression: toWire(closed), angleUnit: state.angleUnit },
    },
    { kind: 'evaluate' },
    formatTokens(closed),
  )
}
