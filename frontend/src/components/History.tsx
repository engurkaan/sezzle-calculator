import { formatNumber } from '../calculator/format'
import type { HistoryEntry } from '../calculator/types'
import styles from './History.module.css'

interface HistoryProps {
  entries: HistoryEntry[]
  onRecall: (value: number) => void
  onClear: () => void
}

export function History({ entries, onRecall, onClear }: HistoryProps) {
  return (
    <section className={styles.history} aria-labelledby="history-heading">
      <header className={styles.header}>
        <h2 id="history-heading" className={styles.title}>
          History
        </h2>
        {entries.length > 0 && (
          <button type="button" className={styles.clear} onClick={onClear}>
            Clear
          </button>
        )}
      </header>
      {entries.length === 0 ? (
        <p className={styles.empty}>No calculations yet.</p>
      ) : (
        <ol className={styles.list}>
          {entries.map((entry) => {
            const result = formatNumber(entry.result)
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  className={styles.entry}
                  onClick={() => onRecall(entry.result)}
                  aria-label={`Use ${result} (${entry.expression} = ${result})`}
                >
                  <span className={styles.expression}>{entry.expression} =</span>
                  <span className={styles.result}>{result}</span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
