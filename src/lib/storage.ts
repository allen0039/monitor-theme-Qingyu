// Only this compatibility reader retains the former browser-storage namespace.
export function readQingyuStorage(storage: Storage, key: string): string | null {
  const current = storage.getItem(key)
  if (current !== null) return current
  const legacyKey = key.replace(/^qingyu\./, 'boxpro.')
  if (legacyKey === key) return null
  const legacy = storage.getItem(legacyKey)
  if (legacy !== null) {
    try {
      storage.setItem(key, legacy)
      storage.removeItem(legacyKey)
    } catch { /* Keep reading saved preferences even when migration cannot be persisted. */ }
  }
  return legacy
}
