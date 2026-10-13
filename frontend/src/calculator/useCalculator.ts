import { useEffect, useReducer } from 'react'
import { isDecimalString, type Calculate } from '../api/client'
import { load, save } from '../persistence/storage'
import { toDisplayMessage } from './errors'
import type { HistoryEntry } from './types'
import {
  calculatorReducer,
  createInitialState,
  selectActiveOperator,
  selectDisplay,
  selectExpression,
} from './reducer'

const HISTORY_KEY = 'history:v1'

function isHistory(value: unknown): value is HistoryEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry: Partial<HistoryEntry> | null) =>
        typeof entry === 'object' &&
        entry !== null &&
        Number.isInteger(entry.id) &&
        typeof entry.expression === 'string' &&
        isDecimalString(entry.result),
    )
  )
}

/**
 * Connects the calculator state machine to the backend: whenever the reducer
 * queues a request, it is sent with `calculate` and the outcome is dispatched
 * back. Superseded requests (e.g. after AC) are aborted. History is kept in
 * localStorage so it survives reloads until the user deletes it.
 */
export function useCalculator(calculate: Calculate) {
  const [state, dispatch] = useReducer(calculatorReducer, undefined, () =>
    createInitialState(load(HISTORY_KEY, isHistory)),
  )
  const { pending, history } = state

  useEffect(() => {
    save(HISTORY_KEY, history)
  }, [history])

  useEffect(() => {
    if (!pending) {
      return
    }
    const controller = new AbortController()
    calculate(pending.request, controller.signal).then(
      (response) => dispatch({ type: 'resolve', id: pending.id, result: response.result }),
      (err: unknown) => {
        if (!controller.signal.aborted) {
          dispatch({ type: 'reject', id: pending.id, message: toDisplayMessage(err) })
        }
      },
    )
    return () => controller.abort()
  }, [pending, calculate])

  return {
    state,
    dispatch,
    display: selectDisplay(state),
    expression: selectExpression(state),
    activeOperator: selectActiveOperator(state),
    busy: pending !== null,
  }
}
