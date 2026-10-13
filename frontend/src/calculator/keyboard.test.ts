import { fireEvent, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { keyToAction, useKeyboard } from './keyboard'

describe('keyToAction', () => {
  it.each([
    ['0', { type: 'digit', digit: '0' }],
    ['9', { type: 'digit', digit: '9' }],
    ['.', { type: 'decimal' }],
    [',', { type: 'decimal' }],
    ['+', { type: 'operator', operator: 'add' }],
    ['-', { type: 'operator', operator: 'subtract' }],
    ['*', { type: 'operator', operator: 'multiply' }],
    ['x', { type: 'operator', operator: 'multiply' }],
    ['/', { type: 'operator', operator: 'divide' }],
    ['^', { type: 'operator', operator: 'power' }],
    ['%', { type: 'percent' }],
    ['r', { type: 'function', name: 'sqrt' }],
    ['!', { type: 'function', name: 'factorial' }],
    ['(', { type: 'paren', side: 'open' }],
    [')', { type: 'paren', side: 'close' }],
    ['n', { type: 'toggleSign' }],
    ['Enter', { type: 'equals' }],
    ['=', { type: 'equals' }],
    ['Backspace', { type: 'backspace' }],
    ['Escape', { type: 'clear' }],
    ['Delete', { type: 'clear' }],
    ['c', { type: 'clear' }],
  ])('maps %s', (key, action) => {
    expect(keyToAction(key)).toEqual(action)
  })

  it.each(['a', 'Tab', 'ArrowUp', ' ', 'F5', '10'])('ignores %s', (key) => {
    expect(keyToAction(key)).toBeNull()
  })
})

describe('useKeyboard', () => {
  it('dispatches mapped keys and prevents their default behaviour', () => {
    const onAction = vi.fn()
    renderHook(() => useKeyboard(onAction))

    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
    window.dispatchEvent(event)

    expect(onAction).toHaveBeenCalledWith({ type: 'equals' })
    expect(event.defaultPrevented).toBe(true)
  })

  it('leaves unmapped keys alone', () => {
    const onAction = vi.fn()
    renderHook(() => useKeyboard(onAction))

    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true })
    window.dispatchEvent(event)

    expect(onAction).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it.each([{ ctrlKey: true }, { metaKey: true }, { altKey: true }])(
    'ignores shortcuts with modifiers %o',
    (modifiers) => {
      const onAction = vi.fn()
      renderHook(() => useKeyboard(onAction))

      fireEvent.keyDown(window, { key: 'c', ...modifiers })

      expect(onAction).not.toHaveBeenCalled()
    },
  )

  it('ignores typing inside form fields', () => {
    const onAction = vi.fn()
    renderHook(() => useKeyboard(onAction))
    const input = document.createElement('input')
    document.body.append(input)

    fireEvent.keyDown(input, { key: '5' })

    expect(onAction).not.toHaveBeenCalled()
    input.remove()
  })

  it('always calls the latest callback', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ cb }) => useKeyboard(cb), { initialProps: { cb: first } })

    rerender({ cb: second })
    fireEvent.keyDown(window, { key: '1' })

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })

  it('unsubscribes on unmount', () => {
    const onAction = vi.fn()
    const { unmount } = renderHook(() => useKeyboard(onAction))

    unmount()
    fireEvent.keyDown(window, { key: '1' })

    expect(onAction).not.toHaveBeenCalled()
  })
})
