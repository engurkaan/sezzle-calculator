import type { CalculatorAction, InfixOperator } from '../calculator/types'
import { KEYS } from './keys'
import styles from './Keypad.module.css'

interface KeypadProps {
  onAction: (action: CalculatorAction) => void
  activeOperator: InfixOperator | null
}

export function Keypad({ onAction, activeOperator }: KeypadProps) {
  return (
    <div className={styles.keypad} role="group" aria-label="Keypad">
      {KEYS.map((key) => {
        const isOperator = key.action.type === 'operator'
        return (
          <button
            key={key.id}
            type="button"
            className={styles.key}
            data-variant={key.variant}
            data-span={key.span}
            aria-label={key.ariaLabel}
            aria-pressed={isOperator ? activeOperator === key.id : undefined}
            title={key.shortcut ? `${key.ariaLabel ?? key.label} (${key.shortcut})` : undefined}
            onClick={() => onAction(key.action)}
          >
            {key.label}
          </button>
        )
      })}
    </div>
  )
}
