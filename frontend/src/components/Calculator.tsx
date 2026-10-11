import type { Calculate } from '../api/client'
import { useKeyboard } from '../calculator/keyboard'
import { useCalculator } from '../calculator/useCalculator'
import styles from './Calculator.module.css'
import { Display } from './Display'
import { History } from './History'
import { Keypad } from './Keypad'

interface CalculatorProps {
  /** Backend used for every operation; injectable for tests. */
  calculate: Calculate
}

export function Calculator({ calculate }: CalculatorProps) {
  const { state, dispatch, display, expression, activeOperator, busy } = useCalculator(calculate)
  useKeyboard(dispatch)

  return (
    <div className={styles.layout}>
      <section className={styles.calculator} aria-label="Calculator" aria-busy={busy}>
        <Display value={display} expression={expression} error={state.error !== null} busy={busy} />
        <Keypad onAction={dispatch} activeOperator={activeOperator} />
      </section>
      <History
        entries={state.history}
        onRecall={(value) => dispatch({ type: 'recall', value })}
        onClear={() => dispatch({ type: 'clearHistory' })}
      />
    </div>
  )
}
