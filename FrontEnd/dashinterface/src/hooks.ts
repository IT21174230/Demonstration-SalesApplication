import { useEffect, useState } from 'react'

// Demo persistence — stash state under a namespaced localStorage key so it
// survives page refresh. Used for inquiries, customers, quotes, shipments,
// tasks, followups, and chat messages.
const NAMESPACE = 'mvp-demo:'

export function usePersistentState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const fullKey = NAMESPACE + key
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(fullKey)
      if (raw) return JSON.parse(raw) as T
    } catch {
      // Bad JSON / quota / etc. — fall through to seed.
    }
    return initial
  })

  useEffect(() => {
    try {
      localStorage.setItem(fullKey, JSON.stringify(value))
    } catch {
      // Quota exceeded or storage disabled — silently skip.
    }
  }, [fullKey, value])

  return [value, setValue]
}

// Wipe every key the demo persists. Used by the Reset Demo button.
export function resetPersistentDemo() {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(NAMESPACE)) keys.push(k)
    }
    keys.forEach(k => localStorage.removeItem(k))
  } catch {
    // Ignore — best-effort.
  }
}
