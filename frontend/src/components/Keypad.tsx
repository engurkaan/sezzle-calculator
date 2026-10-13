import type { ReactNode } from 'react'
import type { CalculatorAction, InfixOperator } from '../calculator/types'
import type { KeyDefinition } from './keys'
import styles from './Keypad.module.css'

interface KeypadProps {
  label: string
  keys: KeyDefinition[]
  onAction: (action: CalculatorAction) => void
  activeOperator: InfixOperator | null
  /** Ids of keys that cannot be used in the current mode. */
  disabled?: ReadonlySet<string>
  layout?: 'basic' | 'scientific'
  /** Extra keys rendered after the defined ones. */
  children?: ReactNode
}

export function Keypad({
  label,
  keys,
  onAction,
  activeOperator,
  disabled,
  layout = 'basic',
  children,
}: KeypadProps) {
  return (
    <div className={styles.keypad} data-layout={layout} role="group" aria-label={label}>
      {keys.map((key) => {
        const isOperator = key.action.type === 'operator'
        const isDisabled = disabled?.has(key.id) ?? false
        const name = key.ariaLabel ?? key.label
        return (
          <button
            key={key.id}
            type="button"
            className={styles.key}
            data-variant={key.variant}
            data-span={key.span}
            aria-label={key.ariaLabel}
            aria-pressed={isOperator ? activeOperator === key.id : undefined}
            // aria-disabled keeps the key focusable, so focus is not lost when
            // the mode changes; the reducer ignores the action anyway.
            aria-disabled={isDisabled || undefined}
            title={
              isDisabled
                ? `${name} (Expression mode only)`
                : key.shortcut
                  ? `${name} (${key.shortcut})`
                  : undefined
            }
            onClick={() => {
              if (!isDisabled) {
                onAction(key.action)
              }
            }}
          >
            {key.label}
          </button>
        )
      })}
      {children}
    </div>
  )
}

interface KeyButtonProps {
  label: string
  ariaLabel: string
  title?: string
  onClick: () => void
}

/** A stand-alone key for state-dependent buttons such as DEG/RAD. */
export function KeyButton({ label, ariaLabel, title, onClick }: KeyButtonProps) {
  return (
    <button
      type="button"
      className={styles.key}
      data-variant="toggle"
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
    >
      {label}
    </button>
  )
}
