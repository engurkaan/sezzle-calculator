import { useEffect, useState } from 'react'
import { load, save } from './storage'

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
