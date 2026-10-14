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
    // Persistence is optional: keep working with in-memory state.
  }
}
