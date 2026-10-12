import { describe, expect, it } from 'vitest'
import { evaluate } from '../test/fakeBackend'
import { toDisplayMessage } from './errors'
import {
  calculatorReducer,
  initialState,
  MAX_HISTORY,
  MAX_INPUT_DIGITS,
  selectActiveOperator,
  selectDisplay,
  selectExpression,
} from './reducer'
import type { CalculatorAction, CalculatorState } from './types'

const SHORTHAND: Record<string, CalculatorAction> = {
  '.': { type: 'decimal' },
  '+': { type: 'operator', operator: 'add' },
  '-': { type: 'operator', operator: 'subtract' },
  '*': { type: 'operator', operator: 'multiply' },
  '/': { type: 'operator', operator: 'divide' },
  '^': { type: 'operator', operator: 'power' },
  '=': { type: 'equals' },
  '%': { type: 'percent' },
  r: { type: 'sqrt' },
  n: { type: 'toggleSign' },
  '<': { type: 'backspace' },
  C: { type: 'clear' },
}

function toAction(key: string): CalculatorAction {
  if (/^\d$/.test(key)) {
    return { type: 'digit', digit: key }
  }
  const action = SHORTHAND[key]
  if (!action) {
    throw new Error(`unknown shorthand key ${key}`)
  }
  return action
}

/** Answers the pending request the way the backend would. */
function settle(state: CalculatorState): CalculatorState {
  const { pending } = state
  if (!pending) {
    return state
  }
  try {
    return calculatorReducer(state, {
      type: 'resolve',
      id: pending.id,
      result: evaluate(pending.request),
    })
  } catch (err) {
    return calculatorReducer(state, {
      type: 'reject',
      id: pending.id,
      message: toDisplayMessage(err),
    })
  }
}

/** Presses each key in turn, letting the fake backend answer every request. */
function press(keys: string, state: CalculatorState = initialState): CalculatorState {
  return [...keys].reduce((s, key) => settle(calculatorReducer(s, toAction(key))), state)
}

const display = (keys: string) => selectDisplay(press(keys))

describe('number entry', () => {
  it('starts at zero', () => {
    expect(selectDisplay(initialState)).toBe('0')
    expect(selectExpression(initialState)).toBe('')
  })

  it.each([
    ['7', '7'],
    ['123', '123'],
    ['007', '7'],
    ['1234567', '1,234,567'],
    ['.5', '0.5'],
    ['3.', '3.'],
    ['3.1.4', '3.14'],
    ['0.000', '0.000'],
  ])('typing %s shows %s', (keys, expected) => {
    expect(display(keys)).toBe(expected)
  })

  it(`limits input to ${MAX_INPUT_DIGITS} digits`, () => {
    const keys = '1'.repeat(MAX_INPUT_DIGITS + 4)
    expect(display(keys).replace(/,/g, '')).toBe('1'.repeat(MAX_INPUT_DIGITS))
  })

  it('does not count leading zero of a decimal towards the limit', () => {
    const keys = '0.' + '1'.repeat(MAX_INPUT_DIGITS + 1)
    expect(display(keys)).toBe('0.' + '1'.repeat(MAX_INPUT_DIGITS))
  })

  it('ignores invalid digit payloads', () => {
    const state = calculatorReducer(initialState, { type: 'digit', digit: 'x' })
    expect(state).toBe(initialState)
  })

  describe('backspace', () => {
    it.each([
      ['123<', '12'],
      ['5<', '0'],
      ['5<<', '0'],
      ['1.5<', '1.'],
      ['5n<', '0'],
    ])('%s shows %s', (keys, expected) => {
      expect(display(keys)).toBe(expected)
    })

    it('does not edit a computed result', () => {
      expect(display('12+3=<')).toBe('15')
    })
  })

  describe('sign toggle', () => {
    it.each([
      ['5n', '-5'],
      ['5nn', '5'],
      ['n', '-0'],
      ['n7', '-7'],
      ['2.5n', '-2.5'],
    ])('%s shows %s', (keys, expected) => {
      expect(display(keys)).toBe(expected)
    })

    it('negates a computed result locally', () => {
      const before = press('2+3=')
      const after = calculatorReducer(before, { type: 'toggleSign' })
      expect(after.pending).toBeNull()
      expect(selectDisplay(after)).toBe('-5')
    })

    it('keeps zero unsigned when negating a computed zero', () => {
      expect(display('3-3=n')).toBe('0')
    })

    it('starts a negative second operand after an operator', () => {
      expect(display('5*n3=')).toBe('-15')
    })
  })
})

describe('binary operations', () => {
  it.each([
    ['2+3=', '5'],
    ['9-12=', '-3'],
    ['6*7=', '42'],
    ['7/2=', '3.5'],
    ['2^10=', '1,024'],
    ['.1+.2=', '0.3'],
    ['1.5*n4=', '-6'],
  ])('%s gives %s', (keys, expected) => {
    expect(display(keys)).toBe(expected)
  })

  it('sends the operation to the backend instead of computing locally', () => {
    const state = calculatorReducer(press('12+7'), { type: 'equals' })
    expect(state.pending?.request).toEqual({ operation: 'add', a: '12', b: '7' })
    expect(selectExpression(state)).toBe('12 + 7')
  })

  it('evaluates chained operations left to right', () => {
    expect(display('2+3*4=')).toBe('20')
    expect(display('12+7*2=')).toBe('38')
  })

  it('shows the intermediate result while chaining', () => {
    const state = press('2+3*')
    expect(selectDisplay(state)).toBe('5')
    expect(selectExpression(state)).toBe('5 ×')
    expect(selectActiveOperator(state)).toBe('multiply')
  })

  it('replaces the operator when two are pressed in a row', () => {
    const state = press('8+-')
    expect(state.pending).toBeNull()
    expect(selectExpression(state)).toBe('8 −')
    expect(display('8+-3=')).toBe('5')
  })

  it('uses the first operand when = follows an operator directly', () => {
    expect(display('5*=')).toBe('25')
  })

  it('repeats the last operation on repeated =', () => {
    expect(display('2+3==')).toBe('8')
    expect(display('2*3===')).toBe('54')
  })

  it('repeats the last operation on a newly typed number', () => {
    expect(display('2+3=10=')).toBe('13')
  })

  it('continues from a result when an operator is pressed', () => {
    expect(display('2+3=*4=')).toBe('20')
  })

  it('starts fresh when a digit is typed after a result', () => {
    const state = press('2+3=7')
    expect(selectDisplay(state)).toBe('7')
    expect(selectExpression(state)).toBe('')
  })

  it('normalises a typed number when = has nothing to evaluate', () => {
    const state = press('5.=')
    expect(state.pending).toBeNull()
    expect(selectDisplay(state)).toBe('5')
  })

  it('shows the completed expression after =', () => {
    expect(selectExpression(press('12+7='))).toBe('12 + 7 =')
  })

  it('parenthesises negative operands in expressions', () => {
    expect(selectExpression(press('5n*3='))).toBe('(-5) × 3 =')
  })

  it('does nothing when = is pressed on a fresh calculator', () => {
    expect(calculatorReducer(initialState, { type: 'equals' })).toBe(initialState)
  })
})

describe('decimal precision', () => {
  it('sends typed numbers to the backend exactly as typed', () => {
    const state = calculatorReducer(press('0.1+12345678901234567890'), { type: 'equals' })
    expect(state.pending?.request).toEqual({
      operation: 'add',
      a: '0.1',
      b: '12345678901234567890',
    })
  })

  it('drops a trailing decimal point from typed operands', () => {
    const state = calculatorReducer(press('5.*2.'), { type: 'equals' })
    expect(state.pending?.request).toEqual({ operation: 'multiply', a: '5', b: '2' })
  })

  it('keeps results that float64 would corrupt', () => {
    expect(display('.1*3-.3=')).toBe('0')
    expect(display('9007199254740993+0=')).toBe('9,007,199,254,740,993')
  })

  it('keeps full precision between chained operations', () => {
    // 1 ÷ 3 is held to 34 digits, so × 3 lands on 0.999… and displays as 1.
    const state = press('1/3*3=')
    expect(selectDisplay(state)).toBe('1')
    expect(state.history[1]?.result).toMatch(/^0\.3{30,}/)
  })

  it('negates large computed values without losing digits', () => {
    const state = calculatorReducer(press('10^40='), { type: 'toggleSign' })
    expect(selectDisplay(state)).toBe('-1e+40')
  })
})

describe('unary operations', () => {
  it('computes square roots', () => {
    expect(display('81r')).toBe('9')
    expect(selectExpression(press('81r'))).toBe('√81 =')
  })

  it('applies √ to the second operand mid-calculation', () => {
    const state = press('5+9r')
    expect(selectDisplay(state)).toBe('3')
    expect(selectExpression(state)).toBe('5 +')
    expect(display('5+9r=')).toBe('8')
  })

  it('lets a new operator chain after √ mid-calculation', () => {
    expect(display('5+9r*2=')).toBe('16')
  })

  it('treats % as a fraction of 100 on its own', () => {
    expect(display('50%')).toBe('0.5')
    expect(selectExpression(press('50%'))).toBe('50% =')
  })

  it('treats % after + or − as a percentage of the first operand', () => {
    expect(display('200+10%')).toBe('20')
    expect(display('200+10%=')).toBe('220')
    expect(display('200-10%=')).toBe('180')
    expect(selectExpression(press('200+10%'))).toBe('200 +')
  })

  it('treats % after × or ÷ as a fraction of 100', () => {
    expect(display('200*10%=')).toBe('20')
  })

  it('records percent requests with a readable expression', () => {
    const state = press('200+10%')
    expect(state.history[0]?.expression).toBe('10% of 200')
  })
})

describe('errors', () => {
  it('reports division by zero', () => {
    const state = press('5/0=')
    expect(selectDisplay(state)).toBe('Cannot divide by zero')
    expect(state.error).not.toBeNull()
    expect(state.operator).toBe('divide')
  })

  it('reports square roots of negative numbers', () => {
    expect(display('4nr')).toBe('Invalid input for √')
  })

  it('reports overflow', () => {
    expect(display('10^7000=')).toBe('Result out of range')
  })

  it('recovers when a digit is typed after an error', () => {
    const state = press('5/0=7')
    expect(state.error).toBeNull()
    expect(selectDisplay(state)).toBe('7')
    expect(state.operator).toBeNull()
  })

  it('dismisses the error on non-entry keys without applying them', () => {
    const state = press('5/0=+')
    expect(state.error).toBeNull()
    expect(state.operator).toBeNull()
    expect(selectDisplay(state)).toBe('0')
  })

  it('keeps history across errors', () => {
    const state = press('1+1=5/0=')
    expect(state.history).toHaveLength(1)
  })
})

describe('pending requests', () => {
  it('ignores input while a request is in flight', () => {
    const waiting = calculatorReducer(press('2+3'), { type: 'equals' })
    for (const key of ['7', '+', '=', '<', 'n', 'r', '%', '.']) {
      expect(calculatorReducer(waiting, toAction(key))).toBe(waiting)
    }
    expect(calculatorReducer(waiting, { type: 'recall', value: '1' })).toBe(waiting)
  })

  it('cancels the request on clear', () => {
    const waiting = calculatorReducer(press('2+3'), { type: 'equals' })
    const cleared = calculatorReducer(waiting, { type: 'clear' })
    expect(cleared.pending).toBeNull()
    expect(selectDisplay(cleared)).toBe('0')
  })

  it('ignores results for superseded requests', () => {
    const waiting = calculatorReducer(press('2+3'), { type: 'equals' })
    const id = waiting.pending?.id ?? 0
    expect(calculatorReducer(waiting, { type: 'resolve', id: id + 1, result: '99' })).toBe(waiting)
    expect(calculatorReducer(waiting, { type: 'reject', id: id + 1, message: 'x' })).toBe(waiting)

    const cleared = calculatorReducer(waiting, { type: 'clear' })
    expect(calculatorReducer(cleared, { type: 'resolve', id, result: '5' })).toBe(cleared)
  })

  it('gives every request a fresh id, even across clears', () => {
    const first = calculatorReducer(press('1+1'), { type: 'equals' })
    const second = calculatorReducer(press('1+1', calculatorReducer(first, { type: 'clear' })), {
      type: 'equals',
    })
    expect(second.pending?.id).not.toBe(first.pending?.id)
  })
})

describe('clear', () => {
  it('resets the calculation but keeps history', () => {
    const state = press('2+3=4*C')
    expect(selectDisplay(state)).toBe('0')
    expect(selectExpression(state)).toBe('')
    expect(state.operator).toBeNull()
    expect(state.lastOperation).toBeNull()
    expect(state.history).toHaveLength(1)
  })
})

describe('history', () => {
  it('records every completed calculation, newest first', () => {
    const state = press('2+3=r')
    expect(state.history.map(({ expression, result }) => ({ expression, result }))).toEqual([
      { expression: '√5', result: String(Math.sqrt(5)) },
      { expression: '2 + 3', result: '5' },
    ])
  })

  it(`keeps at most ${MAX_HISTORY} entries`, () => {
    const state = press('1+1' + '='.repeat(MAX_HISTORY + 5))
    expect(state.history).toHaveLength(MAX_HISTORY)
    expect(state.history[0]?.result).toBe(String(MAX_HISTORY + 6))
  })

  it('recalls a value as the current operand', () => {
    const base = press('2+')
    const state = calculatorReducer(base, { type: 'recall', value: '40' })
    expect(selectDisplay(state)).toBe('40')
    expect(selectDisplay(press('=', state))).toBe('42')
  })

  it('recalls a value after an error', () => {
    const state = calculatorReducer(press('1/0='), { type: 'recall', value: '7' })
    expect(state.error).toBeNull()
    expect(selectDisplay(state)).toBe('7')
  })

  it('can be cleared', () => {
    const state = calculatorReducer(press('1+1='), { type: 'clearHistory' })
    expect(state.history).toEqual([])
    expect(selectDisplay(state)).toBe('2')
  })
})
