import { describe, expect, it } from 'vitest'
import { formatTokens, MAX_EXPRESSION_LENGTH, toWire } from './expression'
import {
  calculatorReducer,
  createInitialState,
  selectActiveOperator,
  selectDisplay,
  selectExpression,
} from './reducer'
import type { CalculatorAction, CalculatorState, Token } from './types'

const KEYS: Record<string, CalculatorAction> = {
  '.': { type: 'decimal' },
  '+': { type: 'operator', operator: 'add' },
  '-': { type: 'operator', operator: 'subtract' },
  '*': { type: 'operator', operator: 'multiply' },
  '/': { type: 'operator', operator: 'divide' },
  '^': { type: 'operator', operator: 'power' },
  '%': { type: 'percent' },
  '(': { type: 'paren', side: 'open' },
  ')': { type: 'paren', side: 'close' },
  '!': { type: 'function', name: 'factorial' },
  '²': { type: 'function', name: 'square' },
  '³': { type: 'function', name: 'cube' },
  ⁱ: { type: 'function', name: 'reciprocal' },
  '√': { type: 'function', name: 'sqrt' },
  s: { type: 'function', name: 'sin' },
  l: { type: 'function', name: 'ln' },
  a: { type: 'function', name: 'abs' },
  t: { type: 'function', name: 'tenPower' },
  π: { type: 'constant', name: 'pi' },
  e: { type: 'constant', name: 'e' },
  m: { type: 'operator', operator: 'mod' },
  n: { type: 'toggleSign' },
  '<': { type: 'backspace' },
  '=': { type: 'equals' },
  C: { type: 'clear' },
}

function action(key: string): CalculatorAction {
  if (/^\d$/.test(key)) {
    return { type: 'digit', digit: key }
  }
  const found = KEYS[key]
  if (!found) {
    throw new Error(`unknown key ${key}`)
  }
  return found
}

const expressionMode = () => createInitialState({ evaluation: 'expression' })

function type(keys: string, state: CalculatorState = expressionMode()): CalculatorState {
  return [...keys].reduce((s, key) => calculatorReducer(s, action(key)), state)
}

function wireOf(keys: string): string | undefined {
  const pending = calculatorReducer(type(keys), { type: 'equals' }).pending
  return pending?.call.kind === 'evaluate' ? pending.call.request.expression : undefined
}

function evaluateTo(state: CalculatorState, result: string): CalculatorState {
  const pending = calculatorReducer(state, { type: 'equals' })
  return calculatorReducer(pending, { type: 'resolve', id: pending.pending?.id ?? 0, result })
}

describe('building expressions', () => {
  it.each([
    ['7+3*2', '7+3*2', '7 + 3 × 2'],
    ['12.5/4', '12.5/4', '12.5 ÷ 4'],
    ['2^10', '2^10', '2^10'],
    ['10m3', '10 mod 3', '10 mod 3'],
    ['1234567+1', '1234567+1', '1,234,567 + 1'],
    ['5!', '5!', '5!'],
    ['50%', '50%', '50%'],
    ['3²', '3^2', '3²'],
    ['2³', '2^3', '2³'],
    ['4ⁱ', '4^(-1)', '4⁻¹'],
    ['√16', 'sqrt(16)', '√(16'],
    ['s30', 'sin(30)', 'sin(30'],
    ['l(e)', 'ln((e))', 'ln((e)'],
    ['a5n', 'abs((-5))', 'abs(-5'],
    ['t2', '10^(2)', '10^(2'],
    ['(1+2)*3', '(1+2)*3', '(1 + 2) × 3'],
  ])('%s sends %s and shows %s', (keys, wire, shown) => {
    expect(wireOf(keys)).toBe(wire)
    expect(selectDisplay(type(keys))).toBe(shown)
  })

  it('evaluates the whole expression in one request', () => {
    const pending = calculatorReducer(type('7+3*2'), { type: 'equals' }).pending
    expect(pending?.call).toEqual({
      kind: 'evaluate',
      request: { expression: '7+3*2', angleUnit: 'deg' },
    })
    expect(pending?.expression).toBe('7 + 3 × 2')
  })

  it('sends the selected angle unit', () => {
    const state = calculatorReducer(expressionMode(), { type: 'setAngleUnit', unit: 'rad' })
    const pending = calculatorReducer(type('s1', state), { type: 'equals' }).pending
    expect(pending?.call).toMatchObject({ request: { angleUnit: 'rad' } })
  })

  it('shows 0 when empty', () => {
    expect(selectDisplay(expressionMode())).toBe('0')
    expect(selectExpression(expressionMode())).toBe('')
  })

  it('has no active operator highlight', () => {
    expect(selectActiveOperator(type('2+'))).toBeNull()
  })
})

describe('implicit multiplication', () => {
  it.each([
    ['2π', '2*pi'],
    ['2(3)', '2*(3)'],
    ['(2)(3)', '(2)*(3)'],
    ['2√9', '2*sqrt(9)'],
    ['πe', 'pi*e'],
    ['5!2', '5!*2'],
    ['2t3', '2*10^(3)'],
  ])('%s sends %s', (keys, wire) => {
    expect(wireOf(keys)).toBe(wire)
  })
})

describe('signs and operators', () => {
  it.each([
    ['-5', '-5', '−5'],
    ['2*-3', '2*-3', '2 × −3'],
    ['2--3', '2--3', '2 − −3'],
    ['5n', '(-5)', '-5'],
    ['5nn', '5', '5'],
    ['5n²', '(-5)^2', '(-5)²'],
    ['2*n3', '2*-3', '2 × −3'],
    ['(-2)', '(-2)', '(−2)'],
  ])('%s sends %s and shows %s', (keys, wire, shown) => {
    expect(wireOf(keys)).toBe(wire)
    expect(selectDisplay(type(keys))).toBe(shown)
  })

  it('replaces an operator typed straight after another', () => {
    expect(wireOf('8+*2')).toBe('8*2')
    expect(wireOf('8*/2')).toBe('8/2')
  })

  it('ignores a leading binary operator', () => {
    expect(type('*').expression.tokens).toEqual([])
  })

  it('removes a unary minus with ±', () => {
    expect(type('2*-n').expression.tokens).toEqual(type('2*').expression.tokens)
  })

  it('does not stack unary minus signs', () => {
    expect(type('--').expression.tokens).toEqual([{ kind: 'negate' }])
  })

  it('ignores ± after a closing parenthesis', () => {
    const state = type('(2)')
    expect(calculatorReducer(state, action('n'))).toBe(state)
  })
})

describe('parentheses', () => {
  it('only closes a parenthesis that is open', () => {
    expect(type('2)').expression.tokens).toEqual(type('2').expression.tokens)
  })

  it('does not close an empty or incomplete group', () => {
    expect(type('(').expression.tokens).toEqual([{ kind: 'open' }])
    expect(type('(2+)').expression.tokens).toEqual(type('(2+').expression.tokens)
  })

  it('auto-closes open parentheses on =', () => {
    expect(wireOf('((1+2')).toBe('((1+2))')
    const pending = calculatorReducer(type('√(9'), { type: 'equals' })
    expect(selectExpression(pending)).toBe('√((9))')
  })
})

describe('postfix operators', () => {
  it('need an operand', () => {
    expect(type('!').expression.tokens).toEqual([])
    expect(type('2+%').expression.tokens).toEqual(type('2+').expression.tokens)
  })
})

describe('equals', () => {
  it('ignores incomplete expressions', () => {
    for (const keys of ['', '2+', '(', '√', '-']) {
      const state = type(keys)
      expect(calculatorReducer(state, { type: 'equals' })).toBe(state)
    }
  })

  it('shows the result and the expression after evaluation', () => {
    const state = evaluateTo(type('7+3*2'), '13')
    expect(selectDisplay(state)).toBe('13')
    expect(selectExpression(state)).toBe('7 + 3 × 2 =')
    expect(state.history[0]).toMatchObject({ expression: '7 + 3 × 2', result: '13' })
  })

  it('does nothing when pressed again after a result', () => {
    const state = evaluateTo(type('7+3*2'), '13')
    expect(calculatorReducer(state, { type: 'equals' })).toBe(state)
  })
})

describe('after a result', () => {
  const result = () => evaluateTo(type('7+3*2'), '13')

  it('starts a new expression when a digit is typed', () => {
    const state = type('4', result())
    expect(selectDisplay(state)).toBe('4')
    expect(selectExpression(state)).toBe('')
  })

  it('continues from the result when an operator is typed', () => {
    expect(selectDisplay(type('+1', result()))).toBe('13 + 1')
    const pending = calculatorReducer(type('+1', result()), { type: 'equals' }).pending
    expect(pending?.call).toMatchObject({ request: { expression: '13+1' } })
  })

  it('continues with postfix operators', () => {
    expect(selectDisplay(type('²', result()))).toBe('13²')
  })

  it('starts a new expression with a function', () => {
    expect(selectDisplay(type('√', result()))).toBe('√(')
  })

  it('negates the result with ±', () => {
    expect(selectDisplay(type('n', result()))).toBe('-13')
  })

  it('ignores backspace', () => {
    const state = result()
    expect(calculatorReducer(state, action('<'))).toBe(state)
  })
})

describe('editing', () => {
  it.each([
    ['123<', '12'],
    ['12+<', '12'],
    ['s<', '0'],
    ['5n<', '0'],
    ['1<', '0'],
  ])('%s shows %s', (keys, shown) => {
    expect(selectDisplay(type(keys))).toBe(shown)
  })

  it('limits digits per number and decimal points', () => {
    expect(selectDisplay(type('1.2.3'))).toBe('1.23')
    expect(selectDisplay(type('0.5+.5'))).toBe('0.5 + 0.5')
  })

  it('recalls a value into the expression', () => {
    const base = type('2+3')
    const replaced = calculatorReducer(base, { type: 'recall', value: '40' })
    expect(selectDisplay(replaced)).toBe('2 + 40')

    const appended = calculatorReducer(type('2+'), { type: 'recall', value: '40' })
    expect(selectDisplay(appended)).toBe('2 + 40')

    const multiplied = calculatorReducer(type('(2)'), { type: 'recall', value: '40' })
    expect(selectDisplay(multiplied)).toBe('(2) × 40')
  })

  it('rejects input that would exceed the maximum length', () => {
    let state = expressionMode()
    for (let i = 0; i < MAX_EXPRESSION_LENGTH; i++) {
      state = type(i % 2 === 0 ? '1' : '+', state)
    }
    expect(toWire(state.expression.tokens).length).toBeLessThanOrEqual(MAX_EXPRESSION_LENGTH)
  })
})

describe('errors', () => {
  it('keeps the expression so it can be fixed', () => {
    const pending = calculatorReducer(type('1/(2-2'), { type: 'equals' })
    const failed = calculatorReducer(pending, {
      type: 'reject',
      id: pending.pending?.id ?? 0,
      message: 'Cannot divide by zero',
    })
    expect(selectDisplay(failed)).toBe('Cannot divide by zero')
    expect(selectExpression(failed)).toBe('1 ÷ (2 − 2)')

    const edited = calculatorReducer(failed, action('<'))
    expect(edited.error).toBeNull()
    expect(selectDisplay(edited)).toBe('1 ÷ (2 − 2')
  })
})

describe('switching modes', () => {
  it('starts a fresh calculation but keeps history and the angle unit', () => {
    const withHistory = evaluateTo(type('1+1'), '2')
    const typing = type('5+', calculatorReducer(withHistory, { type: 'setAngleUnit', unit: 'rad' }))
    const switched = calculatorReducer(typing, { type: 'setEvaluation', evaluation: 'immediate' })

    expect(switched.evaluation).toBe('immediate')
    expect(switched.expression.tokens).toEqual([])
    expect(switched.history).toHaveLength(1)
    expect(switched.angleUnit).toBe('rad')
    expect(selectDisplay(switched)).toBe('0')
  })

  it('does nothing when the mode is unchanged', () => {
    const state = type('5+')
    expect(calculatorReducer(state, { type: 'setEvaluation', evaluation: 'expression' })).toBe(
      state,
    )
  })
})

describe('formatTokens', () => {
  it('renders every token kind', () => {
    const tokens: Token[] = [
      { kind: 'function', name: 'sqrt' },
      { kind: 'value', value: '-4' },
      { kind: 'close' },
      { kind: 'operator', operator: 'mod' },
      { kind: 'constant', name: 'pi' },
      { kind: 'postfix', operator: 'reciprocal' },
    ]
    expect(formatTokens(tokens)).toBe('√(-4) mod π⁻¹')
    expect(toWire(tokens)).toBe('sqrt((-4)) mod pi^(-1)')
  })
})
