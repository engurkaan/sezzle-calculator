import { useEffect, useReducer } from 'react'
import type { Calculate } from '../api/client'
import { toDisplayMessage } from './errors'
import {
  calculatorReducer,
  initialState,
  selectActiveOperator,
  selectDisplay,
  selectExpression,
} from './reducer'

/**
 * Connects the calculator state machine to the backend: whenever the reducer
 * queues a request, it is sent with `calculate` and the outcome is dispatched
 * back. Superseded requests (e.g. after AC) are aborted.
 */
export function useCalculator(calculate: Calculate) {
  const [state, dispatch] = useReducer(calculatorReducer, initialState)
  const { pending } = state

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
