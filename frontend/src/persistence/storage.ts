/**
 * Small wrappers around localStorage. Storage can be unavailable (private
 * browsing, disabled cookies, quota exceeded) or contain data from an older
 * version, so every read is validated and every failure falls back silently:
 * persistence is a convenience, never a requirement.
 */

const PREFIX = 'calculator:'

export function load<T>(key: string, isValid: (value: unknown) => value is T): T | undefined {
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    if (raw === null) {
      return undefined
    }
    const value: unknown = JSON.parse(raw)
    return isValid(value) ? value : undefined
  } catch {
    return undefined
  }
}

export function save(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Ignore: the app keeps working with in-memory state.
  }
}
