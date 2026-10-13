import { renderHook, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { load, save } from './storage'
import { usePersistentState } from './usePersistentState'

const isNumber = (v: unknown): v is number => typeof v === 'number'

describe('storage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('round-trips JSON values under a namespaced key', () => {
    save('answer', 42)
    expect(window.localStorage.getItem('calculator:answer')).toBe('42')
    expect(load('answer', isNumber)).toBe(42)
  })

  it('returns undefined for missing, invalid or corrupt values', () => {
    expect(load('missing', isNumber)).toBeUndefined()
    window.localStorage.setItem('calculator:wrong-type', '"text"')
    expect(load('wrong-type', isNumber)).toBeUndefined()
    window.localStorage.setItem('calculator:corrupt', '{not json')
    expect(load('corrupt', isNumber)).toBeUndefined()
  })

  it('survives storage being unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    expect(() => save('x', 1)).not.toThrow()
    expect(load('x', isNumber)).toBeUndefined()
  })
})

describe('usePersistentState', () => {
  it('starts from the stored value and saves updates', () => {
    save('count', 3)
    const { result } = renderHook(() => usePersistentState('count', 0, isNumber))
    expect(result.current[0]).toBe(3)

    act(() => result.current[1](7))
    expect(load('count', isNumber)).toBe(7)
  })

  it('falls back when nothing valid is stored', () => {
    window.localStorage.setItem('calculator:count', '"oops"')
    const { result } = renderHook(() => usePersistentState('count', 5, isNumber))
    expect(result.current[0]).toBe(5)
  })
})
