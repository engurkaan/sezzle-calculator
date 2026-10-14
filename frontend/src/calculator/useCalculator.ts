import { useEffect, useReducer } from 'react'
import { isDecimalString, type CalculatorApi } from '../api/client'
import type { AngleUnit } from '../api/types'
import { load, save } from '../persistence/storage'
import { toDisplayMessage } from './errors'
import {
  calculatorReducer,
  createInitialState,
  selectActiveOperator,
  selectDisplay,
  selectExpression,
} from './reducer'
import type { ApiCall, Evaluation, HistoryEntry } from './types'

const HISTORY_KEY = 'history:v1'
const SETTINGS_KEY = 'settings:v1'

interface Settings {
  evaluation: Evaluation
  angleUnit: AngleUnit
}

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

function isSettings(value: unknown): value is Settings {
  const v = value as Partial<Settings> | null
  return (
    typeof v === 'object' &&
    v !== null &&
    (v.evaluation === 'immediate' || v.evaluation === 'expression') &&
    (v.angleUnit === 'deg' || v.angleUnit === 'rad')
  )
}

function send(api: CalculatorApi, call: ApiCall, signal: AbortSignal) {
  return call.kind === 'calculate'
    ? api.calculate(call.request, signal)
    : api.evaluate(call.request, signal)
}

export function useCalculator(api: CalculatorApi) {
  const [state, dispatch] = useReducer(calculatorReducer, undefined, () =>
    createInitialState({
      history: load(HISTORY_KEY, isHistory),
      ...load(SETTINGS_KEY, isSettings),
    }),
  )
  const { pending, history, evaluation, angleUnit } = state

  useEffect(() => {
    save(HISTORY_KEY, history)
  }, [history])

  useEffect(() => {
    save(SETTINGS_KEY, { evaluation, angleUnit } satisfies Settings)
  }, [evaluation, angleUnit])

  useEffect(() => {
    if (!pending) {
      return
    }
    const controller = new AbortController()
    send(api, pending.call, controller.signal).then(
      (response) => dispatch({ type: 'resolve', id: pending.id, result: response.result }),
      (err: unknown) => {
        if (!controller.signal.aborted) {
          dispatch({ type: 'reject', id: pending.id, message: toDisplayMessage(err) })
        }
      },
    )
    return () => controller.abort()
  }, [pending, api])

  return {
    state,
    dispatch,
    display: selectDisplay(state),
    expression: selectExpression(state),
    activeOperator: selectActiveOperator(state),
    busy: pending !== null,
  }
}
