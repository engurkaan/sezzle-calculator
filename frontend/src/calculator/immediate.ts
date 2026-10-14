import type { CalculationRequest, DecimalString } from '../api/types'
import { CONSTANTS } from './constants'
import { formatInput, formatNumber, formatOperand, negate, OPERATOR_SYMBOLS } from './format'
import { appendDecimal, appendDigit, toggleTextSign, typedValue } from './input'
import { queue } from './session'
import type {
  CalculatorAction,
  CalculatorState,
  Entry,
  ImmediateState,
  InfixOperator,
  Intent,
  PendingRequest,
  ScientificFunction,
} from './types'

export function immediateReducer(
  state: CalculatorState,
  action: CalculatorAction,
): CalculatorState {
  const im = state.immediate
  const update = (patch: Partial<ImmediateState>): CalculatorState => ({
    ...state,
    immediate: { ...im, ...patch },
  })

  switch (action.type) {
    case 'digit': {
      if (im.entry?.kind !== 'typed') {
        return /^\d$/.test(action.digit)
          ? update({ entry: { kind: 'typed', text: action.digit } })
          : state
      }
      const text = appendDigit(im.entry.text, action.digit)
      return text === null ? state : update({ entry: { kind: 'typed', text } })
    }
    case 'decimal': {
      if (im.entry?.kind !== 'typed') {
        return update({ entry: { kind: 'typed', text: '0.' } })
      }
      const text = appendDecimal(im.entry.text)
      return text === null ? state : update({ entry: { kind: 'typed', text } })
    }
    case 'backspace': {
      if (im.entry?.kind !== 'typed') {
        return state
      }
      const text = im.entry.text.slice(0, -1)
      return update({ entry: { kind: 'typed', text: text === '' || text === '-' ? '0' : text } })
    }
    case 'toggleSign':
      return update({ entry: toggleSign(im.entry) })
    case 'recall':
      return update({ entry: { kind: 'computed', value: action.value } })
    case 'constant':
      return update({ entry: { kind: 'computed', value: CONSTANTS[action.name] } })
    case 'operator':
      return pressOperator(state, action.operator)
    case 'equals':
      return pressEquals(state)
    case 'percent':
      return pressPercent(state)
    case 'function':
      return applyFunction(state, action.name)
    default:
      return state
  }
}

export function applyImmediateResult(
  state: CalculatorState,
  pending: PendingRequest,
  result: DecimalString,
): CalculatorState {
  const im = state.immediate
  switch (pending.intent.kind) {
    case 'chain':
      return {
        ...state,
        immediate: {
          ...im,
          entry: null,
          accumulator: result,
          operator: pending.intent.next,
          lastExpression: null,
        },
      }
    case 'unary':
      return {
        ...state,
        immediate: {
          ...im,
          entry: { kind: 'computed', value: result },
          lastExpression: pending.expression,
        },
      }
    default:
      return {
        ...state,
        immediate: {
          ...im,
          entry: { kind: 'computed', value: result },
          accumulator: null,
          operator: null,
          lastExpression: pending.expression,
        },
      }
  }
}

export function selectImmediateDisplay(im: ImmediateState): string {
  if (im.entry?.kind === 'typed') {
    return formatInput(im.entry.text)
  }
  if (im.entry?.kind === 'computed') {
    return formatNumber(im.entry.value)
  }
  return formatNumber(im.accumulator ?? '0')
}

export function selectImmediateExpression(im: ImmediateState): string {
  if (im.operator !== null && im.accumulator !== null) {
    return `${formatOperand(im.accumulator)} ${OPERATOR_SYMBOLS[im.operator]}`
  }
  if (im.entry?.kind === 'computed' && im.lastExpression) {
    return `${im.lastExpression} =`
  }
  return ''
}

function entryValue(entry: Entry): DecimalString {
  return entry.kind === 'computed' ? entry.value : typedValue(entry.text)
}

function currentOperand(im: ImmediateState): DecimalString {
  return im.entry ? entryValue(im.entry) : (im.accumulator ?? '0')
}

function toggleSign(entry: Entry | null): Entry {
  if (entry === null) {
    return { kind: 'typed', text: '-0' }
  }
  if (entry.kind === 'typed') {
    return { kind: 'typed', text: toggleTextSign(entry.text) }
  }
  return { kind: 'computed', value: negate(entry.value) }
}

function pressOperator(state: CalculatorState, operator: InfixOperator): CalculatorState {
  const im = state.immediate
  if (im.operator !== null && im.accumulator !== null) {
    if (im.entry === null) {
      return { ...state, immediate: { ...im, operator } }
    }
    return infix(state, im.accumulator, im.operator, entryValue(im.entry), {
      kind: 'chain',
      next: operator,
    })
  }
  return {
    ...state,
    immediate: {
      ...im,
      accumulator: currentOperand(im),
      operator,
      entry: null,
      lastExpression: null,
    },
  }
}

function pressEquals(state: CalculatorState): CalculatorState {
  const im = state.immediate
  if (im.operator !== null && im.accumulator !== null) {
    const operand = im.entry ? entryValue(im.entry) : im.accumulator
    const next = infix(state, im.accumulator, im.operator, operand, { kind: 'equals' })
    return {
      ...next,
      immediate: { ...next.immediate, lastOperation: { operator: im.operator, operand } },
    }
  }
  if (im.lastOperation) {
    const { operator, operand } = im.lastOperation
    return infix(state, currentOperand(im), operator, operand, { kind: 'equals' })
  }
  if (im.entry?.kind === 'typed') {
    return {
      ...state,
      immediate: { ...im, entry: { kind: 'computed', value: entryValue(im.entry) } },
    }
  }
  return state
}

// Desk-calculator convention: after + or −, b% is b percent of the first operand (200 + 10% → 220).
function pressPercent(state: CalculatorState): CalculatorState {
  const im = state.immediate
  const percent = currentOperand(im)
  if (im.accumulator !== null && (im.operator === 'add' || im.operator === 'subtract')) {
    return unary(
      state,
      { operation: 'percentage', a: percent, b: im.accumulator },
      `${formatOperand(percent)}% of ${formatOperand(im.accumulator)}`,
    )
  }
  return unary(state, { operation: 'percentage', a: percent, b: '1' }, `${formatOperand(percent)}%`)
}

function applyFunction(state: CalculatorState, name: ScientificFunction): CalculatorState {
  const im = state.immediate
  const a = currentOperand(im)
  const shown = formatOperand(a)
  switch (name) {
    case 'abs': {
      const entry: Entry =
        im.entry?.kind === 'typed'
          ? { kind: 'typed', text: im.entry.text.replace(/^-/, '') }
          : { kind: 'computed', value: a.replace(/^-/, '') }
      return { ...state, immediate: { ...im, entry } }
    }
    case 'sin':
    case 'cos':
    case 'tan': {
      const angle = state.angleUnit === 'deg' ? `${shown}°` : `${shown} rad`
      return unary(state, { operation: name, a, angleUnit: state.angleUnit }, `${name}(${angle})`)
    }
    case 'sqrt':
      return unary(state, { operation: 'sqrt', a }, `√${shown}`)
    case 'ln':
    case 'log':
    case 'exp':
      return unary(state, { operation: name, a }, `${name}(${shown})`)
    case 'factorial':
      return unary(state, { operation: 'factorial', a }, `${shown}!`)
    case 'square':
      return unary(state, { operation: 'power', a, b: '2' }, `${shown}²`)
    case 'cube':
      return unary(state, { operation: 'power', a, b: '3' }, `${shown}³`)
    case 'tenPower':
      return unary(state, { operation: 'power', a: '10', b: a }, `10^${shown}`)
    case 'reciprocal':
      return unary(state, { operation: 'divide', a: '1', b: a }, `1/${shown}`)
  }
}

function unary(state: CalculatorState, request: CalculationRequest, expression: string) {
  return queue(state, { kind: 'calculate', request }, { kind: 'unary' }, expression)
}

function infix(
  state: CalculatorState,
  a: DecimalString,
  operator: InfixOperator,
  b: DecimalString,
  intent: Intent,
): CalculatorState {
  const expression = `${formatOperand(a)} ${OPERATOR_SYMBOLS[operator]} ${formatOperand(b)}`
  return queue(
    state,
    { kind: 'calculate', request: { operation: operator, a, b } },
    intent,
    expression,
  )
}
