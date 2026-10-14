import type { CalculatorApi } from '../api/client'
import { useKeyboard } from '../calculator/keyboard'
import type { Evaluation } from '../calculator/types'
import { useCalculator } from '../calculator/useCalculator'
import { usePersistentState } from '../persistence/usePersistentState'
import styles from './Calculator.module.css'
import { Display } from './Display'
import { History } from './History'
import { KeyButton, Keypad } from './Keypad'
import { EXPRESSION_ONLY_KEYS, KEYS, SCIENTIFIC_KEYS } from './keys'
import { SegmentedControl } from './SegmentedControl'

type KeypadMode = 'basic' | 'scientific'

interface CalculatorProps {
  api: CalculatorApi
}

const NO_KEYS: ReadonlySet<string> = new Set()

export function Calculator({ api }: CalculatorProps) {
  const { state, dispatch, display, expression, activeOperator, busy } = useCalculator(api)
  const [keypad, setKeypad] = usePersistentState<KeypadMode>('keypad', 'basic', isKeypadMode)
  const [historyCollapsed, setHistoryCollapsed] = usePersistentState(
    'historyCollapsed',
    false,
    isBoolean,
  )
  useKeyboard(dispatch)

  const scientific = keypad === 'scientific'
  const degrees = state.angleUnit === 'deg'

  return (
    <div className={styles.layout}>
      <section
        className={styles.calculator}
        data-keypad={keypad}
        aria-label="Calculator"
        aria-busy={busy}
      >
        <div className={styles.toolbar}>
          <SegmentedControl<KeypadMode>
            label="Keypad"
            value={keypad}
            onChange={setKeypad}
            options={[
              { value: 'basic', label: 'Basic', description: 'Basic keypad' },
              {
                value: 'scientific',
                label: 'Scientific',
                description: 'Adds trigonometry, logarithms, powers and parentheses',
              },
            ]}
          />
          <SegmentedControl<Evaluation>
            label="Evaluation"
            value={state.evaluation}
            onChange={(evaluation) => dispatch({ type: 'setEvaluation', evaluation })}
            options={[
              {
                value: 'immediate',
                label: 'Immediate',
                description: 'Each operator applies as you go: 7 + 3 × 2 = 20',
              },
              {
                value: 'expression',
                label: 'Expression',
                description: 'Standard order of operations: 7 + 3 × 2 = 13',
              },
            ]}
          />
        </div>
        <Display
          value={display}
          expression={expression}
          error={state.error !== null}
          busy={busy}
          indicator={scientific ? (degrees ? 'DEG' : 'RAD') : undefined}
        />
        <div className={styles.pads}>
          {scientific && (
            <Keypad
              label="Scientific keys"
              keys={SCIENTIFIC_KEYS}
              layout="scientific"
              onAction={dispatch}
              activeOperator={activeOperator}
              disabled={state.evaluation === 'immediate' ? EXPRESSION_ONLY_KEYS : NO_KEYS}
            >
              <KeyButton
                label={degrees ? 'DEG' : 'RAD'}
                ariaLabel={`Angle unit: ${degrees ? 'degrees' : 'radians'}`}
                title={`Switch to ${degrees ? 'radians' : 'degrees'}`}
                onClick={() => dispatch({ type: 'setAngleUnit', unit: degrees ? 'rad' : 'deg' })}
              />
            </Keypad>
          )}
          <Keypad label="Keypad" keys={KEYS} onAction={dispatch} activeOperator={activeOperator} />
        </div>
      </section>
      <History
        entries={state.history}
        collapsed={historyCollapsed}
        onToggleCollapsed={() => setHistoryCollapsed(!historyCollapsed)}
        onRecall={(value) => dispatch({ type: 'recall', value })}
        onDelete={(id) => dispatch({ type: 'deleteHistoryEntry', id })}
        onClear={() => dispatch({ type: 'clearHistory' })}
      />
    </div>
  )
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isKeypadMode(value: unknown): value is KeypadMode {
  return value === 'basic' || value === 'scientific'
}
