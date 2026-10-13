import { useLayoutEffect, useRef } from 'react'
import styles from './Display.module.css'

interface DisplayProps {
  value: string
  expression: string
  error: boolean
  busy: boolean
  /** Small status label in the corner, e.g. the angle unit. */
  indicator?: string | undefined
}

/** Picks a font size step so long numbers still fit on one line. */
function sizeFor(text: string): 'large' | 'medium' | 'small' | 'xsmall' {
  if (text.length > 22) return 'xsmall'
  if (text.length > 16) return 'small'
  if (text.length > 10) return 'medium'
  return 'large'
}

export function Display({ value, expression, error, busy, indicator }: DisplayProps) {
  const output = useRef<HTMLOutputElement>(null)

  // Keep the end of a long expression in view while it is being typed.
  useLayoutEffect(() => {
    const el = output.current
    if (el) {
      el.scrollLeft = el.scrollWidth
    }
  }, [value])

  return (
    <div className={styles.display} data-busy={busy || undefined}>
      <div className={styles.status}>
        {indicator && <span className={styles.indicator}>{indicator}</span>}
        <span className={styles.spinner} aria-hidden="true" />
      </div>
      <div className={styles.expression} data-testid="expression" aria-hidden={!expression}>
        {expression || ' '}
      </div>
      <output
        ref={output}
        className={styles.value}
        data-size={sizeFor(value)}
        data-error={error || undefined}
        role={error ? 'alert' : 'status'}
        aria-live="polite"
      >
        {value}
      </output>
    </div>
  )
}
