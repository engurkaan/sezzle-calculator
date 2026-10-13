import type { CalculatorAction, InfixOperator, ScientificFunction } from '../calculator/types'

export type KeyVariant = 'digit' | 'function' | 'operator' | 'equals' | 'scientific'

export interface KeyDefinition {
  id: string
  label: string
  /** Accessible name, when the visible label is a symbol. */
  ariaLabel?: string
  action: CalculatorAction
  variant: KeyVariant
  /** Keyboard shortcut, shown as a tooltip. */
  shortcut?: string | undefined
  /** Grid placement for keys wider or taller than one cell. */
  span?: 'wide' | 'tall'
}

const digit = (d: string): KeyDefinition => ({
  id: `digit-${d}`,
  label: d,
  action: { type: 'digit', digit: d },
  variant: 'digit',
})

const operator = (
  op: InfixOperator,
  label: string,
  ariaLabel: string,
  shortcut?: string,
): KeyDefinition => ({
  id: op,
  label,
  ariaLabel,
  action: { type: 'operator', operator: op },
  variant: 'operator',
  shortcut,
})

/** Keypad layout, in row-major order for a four-column grid. */
export const KEYS: KeyDefinition[] = [
  {
    id: 'clear',
    label: 'AC',
    ariaLabel: 'All clear',
    action: { type: 'clear' },
    variant: 'function',
    shortcut: 'Esc',
  },
  {
    id: 'backspace',
    label: '⌫',
    ariaLabel: 'Backspace',
    action: { type: 'backspace' },
    variant: 'function',
    shortcut: 'Backspace',
  },
  {
    id: 'percent',
    label: '%',
    ariaLabel: 'Percent',
    action: { type: 'percent' },
    variant: 'function',
    shortcut: '%',
  },
  operator('divide', '÷', 'Divide', '/'),

  {
    id: 'sqrt',
    label: '√',
    ariaLabel: 'Square root',
    action: { type: 'function', name: 'sqrt' },
    variant: 'function',
    shortcut: 'r',
  },
  operator('power', 'xʸ', 'Power', '^'),
  {
    id: 'sign',
    label: '±',
    ariaLabel: 'Toggle sign',
    action: { type: 'toggleSign' },
    variant: 'function',
    shortcut: 'n',
  },
  operator('multiply', '×', 'Multiply', '*'),

  digit('7'),
  digit('8'),
  digit('9'),
  operator('subtract', '−', 'Subtract', '-'),

  digit('4'),
  digit('5'),
  digit('6'),
  operator('add', '+', 'Add', '+'),

  digit('1'),
  digit('2'),
  digit('3'),
  {
    id: 'equals',
    label: '=',
    ariaLabel: 'Equals',
    action: { type: 'equals' },
    variant: 'equals',
    shortcut: 'Enter',
    span: 'tall',
  },

  { ...digit('0'), span: 'wide' },
  {
    id: 'decimal',
    label: '.',
    ariaLabel: 'Decimal point',
    action: { type: 'decimal' },
    variant: 'digit',
    shortcut: '.',
  },
]

const fn = (
  name: ScientificFunction,
  label: string,
  ariaLabel: string,
  shortcut?: string,
): KeyDefinition => ({
  id: name,
  label,
  ariaLabel,
  action: { type: 'function', name },
  variant: 'scientific',
  shortcut,
})

/**
 * Extra keys shown in scientific mode, in row-major order for a three-column
 * grid (six columns on narrow screens). The angle-unit key is rendered
 * separately because its label depends on state.
 */
export const SCIENTIFIC_KEYS: KeyDefinition[] = [
  {
    id: 'open',
    label: '(',
    ariaLabel: 'Open parenthesis',
    action: { type: 'paren', side: 'open' },
    variant: 'scientific',
    shortcut: '(',
  },
  {
    id: 'close',
    label: ')',
    ariaLabel: 'Close parenthesis',
    action: { type: 'paren', side: 'close' },
    variant: 'scientific',
    shortcut: ')',
  },
  operator('mod', 'mod', 'Modulo'),

  fn('sin', 'sin', 'Sine'),
  fn('cos', 'cos', 'Cosine'),
  fn('tan', 'tan', 'Tangent'),

  fn('ln', 'ln', 'Natural logarithm'),
  fn('log', 'log', 'Logarithm base 10'),
  fn('exp', 'eˣ', 'e to the power of x'),

  fn('square', 'x²', 'Square'),
  fn('cube', 'x³', 'Cube'),
  fn('tenPower', '10ˣ', '10 to the power of x'),

  fn('reciprocal', '1/x', 'Reciprocal'),
  fn('abs', '|x|', 'Absolute value'),
  fn('factorial', 'n!', 'Factorial', '!'),

  {
    id: 'pi',
    label: 'π',
    ariaLabel: 'Pi',
    action: { type: 'constant', name: 'pi' },
    variant: 'scientific',
  },
  {
    id: 'e',
    label: 'e',
    ariaLabel: "Euler's number",
    action: { type: 'constant', name: 'e' },
    variant: 'scientific',
  },
]

/** Keys that only make sense when building a whole expression. */
export const EXPRESSION_ONLY_KEYS = new Set(['open', 'close'])
