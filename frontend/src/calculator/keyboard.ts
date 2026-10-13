import { useEffect, useRef } from 'react'
import type { CalculatorAction } from './types'

const KEY_ACTIONS: Record<string, CalculatorAction> = {
  '.': { type: 'decimal' },
  ',': { type: 'decimal' },
  '+': { type: 'operator', operator: 'add' },
  '-': { type: 'operator', operator: 'subtract' },
  '*': { type: 'operator', operator: 'multiply' },
  x: { type: 'operator', operator: 'multiply' },
  X: { type: 'operator', operator: 'multiply' },
  '/': { type: 'operator', operator: 'divide' },
  '^': { type: 'operator', operator: 'power' },
  '%': { type: 'percent' },
  r: { type: 'function', name: 'sqrt' },
  R: { type: 'function', name: 'sqrt' },
  '!': { type: 'function', name: 'factorial' },
  '(': { type: 'paren', side: 'open' },
  ')': { type: 'paren', side: 'close' },
  n: { type: 'toggleSign' },
  N: { type: 'toggleSign' },
  Enter: { type: 'equals' },
  '=': { type: 'equals' },
  Backspace: { type: 'backspace' },
  Escape: { type: 'clear' },
  Delete: { type: 'clear' },
  c: { type: 'clear' },
  C: { type: 'clear' },
}

/** Maps a KeyboardEvent.key value to a calculator action, if any. */
export function keyToAction(key: string): CalculatorAction | null {
  if (/^\d$/.test(key)) {
    return { type: 'digit', digit: key }
  }
  return KEY_ACTIONS[key] ?? null
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

/** Lets the whole calculator be driven from the keyboard. */
export function useKeyboard(onAction: (action: CalculatorAction) => void): void {
  // Keep the latest callback without re-subscribing on every render.
  const handler = useRef(onAction)
  useEffect(() => {
    handler.current = onAction
  })

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || isEditable(event.target)) {
        return
      }
      const action = keyToAction(event.key)
      if (!action) {
        return
      }
      // Stops Enter from also "clicking" a focused key, and / from opening
      // the browser's quick find.
      event.preventDefault()
      handler.current(action)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
