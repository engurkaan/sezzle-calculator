import type { CalculatorAction, InfixOperator } from '../calculator/types'

export type KeyVariant = 'digit' | 'function' | 'operator' | 'equals'

export interface KeyDefinition {
  id: string
  label: string
  /** Accessible name, when the visible label is a symbol. */
  ariaLabel?: string
  action: CalculatorAction
  variant: KeyVariant
  /** Keyboard shortcut, shown as a tooltip. */
  shortcut?: string
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
  shortcut: string,
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
    action: { type: 'sqrt' },
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
