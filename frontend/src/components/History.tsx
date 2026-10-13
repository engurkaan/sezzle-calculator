import { useEffect, useState } from 'react'
import { formatNumber } from '../calculator/format'
import type { HistoryEntry } from '../calculator/types'
import styles from './History.module.css'

interface HistoryProps {
  entries: HistoryEntry[]
  collapsed: boolean
  onToggleCollapsed: () => void
  onRecall: (value: string) => void
  onDelete: (id: number) => void
  onClear: () => void
}

/** How long "Clear all" waits for a confirming second click. */
export const CONFIRM_TIMEOUT_MS = 3000

export function History({
  entries,
  collapsed,
  onToggleCollapsed,
  onRecall,
  onDelete,
  onClear,
}: HistoryProps) {
  const [confirmingClear, setConfirmingClear] = useState(false)

  useEffect(() => {
    if (!confirmingClear) {
      return
    }
    const timer = setTimeout(() => setConfirmingClear(false), CONFIRM_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [confirmingClear])

  const clearAll = () => {
    if (confirmingClear) {
      setConfirmingClear(false)
      onClear()
    } else {
      setConfirmingClear(true)
    }
  }

  return (
    <section
      className={styles.history}
      data-collapsed={collapsed || undefined}
      aria-label="History"
    >
      <header className={styles.header}>
        <h2 className={styles.title}>
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={!collapsed}
            aria-controls="history-content"
            onClick={onToggleCollapsed}
          >
            <ChevronIcon />
            <span className={styles.label}>History</span>
            {entries.length > 0 && (
              <span className={styles.count} aria-hidden="true">
                {entries.length}
              </span>
            )}
          </button>
        </h2>
        {!collapsed && entries.length > 0 && (
          <button
            type="button"
            className={styles.clear}
            data-confirming={confirmingClear || undefined}
            onClick={clearAll}
            onBlur={() => setConfirmingClear(false)}
          >
            {confirmingClear ? 'Confirm clear' : 'Clear all'}
          </button>
        )}
      </header>
      <div id="history-content" className={styles.content} hidden={collapsed}>
        {entries.length === 0 ? (
          <p className={styles.empty}>No calculations yet.</p>
        ) : (
          <ol className={styles.list}>
            {entries.map((entry) => {
              const result = formatNumber(entry.result)
              const summary = `${entry.expression} = ${result}`
              return (
                <li key={entry.id} className={styles.item}>
                  <button
                    type="button"
                    className={styles.entry}
                    onClick={() => onRecall(entry.result)}
                    aria-label={`Use ${result} (${summary})`}
                  >
                    <span className={styles.expression}>{entry.expression} =</span>
                    <span className={styles.result} data-long={result.length > 18 || undefined}>
                      {result}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.delete}
                    onClick={() => onDelete(entry.id)}
                    aria-label={`Delete ${summary}`}
                    title="Delete"
                  >
                    <CloseIcon />
                  </button>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}

function ChevronIcon() {
  return (
    <svg className={styles.chevron} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        d="M4 6l4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M4 4l8 8M12 4l-8 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}
