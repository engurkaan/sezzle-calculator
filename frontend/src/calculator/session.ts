import type { ApiCall, CalculatorState, ExpressionState, ImmediateState, Intent } from './types'

export const initialImmediate: ImmediateState = {
  entry: null,
  accumulator: null,
  operator: null,
  lastOperation: null,
  lastExpression: null,
}

export const initialExpression: ExpressionState = { tokens: [], result: null }

export function queue(
  state: CalculatorState,
  call: ApiCall,
  intent: Intent,
  expression: string,
): CalculatorState {
  return {
    ...state,
    pending: { id: state.nextId, call, intent, expression },
    nextId: state.nextId + 1,
  }
}
