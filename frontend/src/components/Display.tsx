import styles from './Display.module.css'

interface DisplayProps {
  value: string
  expression: string
  error: boolean
  busy: boolean
}

/** Picks a font size step so long numbers still fit on one line. */
function sizeFor(text: string): 'large' | 'medium' | 'small' {
  if (text.length > 16) return 'small'
  if (text.length > 10) return 'medium'
  return 'large'
}

export function Display({ value, expression, error, busy }: DisplayProps) {
  return (
    <div className={styles.display} data-busy={busy || undefined}>
      <div className={styles.expression} data-testid="expression" aria-hidden={!expression}>
        {expression || ' '}
      </div>
      <output
        className={styles.value}
        data-size={sizeFor(value)}
        data-error={error || undefined}
        role={error ? 'alert' : 'status'}
        aria-live="polite"
      >
        {value}
      </output>
      <span className={styles.spinner} aria-hidden="true" />
    </div>
  )
}
