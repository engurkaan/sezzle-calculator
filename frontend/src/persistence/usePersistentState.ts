import { useEffect, useState } from 'react'
import { load, save } from './storage'

/** useState that survives page reloads. Invalid stored values are ignored. */
export function usePersistentState<T>(
  key: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => load(key, isValid) ?? fallback)
  useEffect(() => {
    save(key, value)
  }, [key, value])
  return [value, setValue]
}
