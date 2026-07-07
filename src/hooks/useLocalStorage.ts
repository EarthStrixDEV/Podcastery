import { useCallback, useEffect, useState } from 'react'

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initialValue
    } catch {
      return initialValue
    }
  })

  const setAndPersist = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved))
        } catch {
          // storage full / disabled — keep in-memory state only
        }
        return resolved
      })
    },
    [key]
  )

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return
      try {
        setValue(e.newValue ? (JSON.parse(e.newValue) as T) : initialValue)
      } catch {
        // ignore corrupt payload from other tab
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return [value, setAndPersist] as const
}
