import { useCallback, useState } from 'react'

/**
 * 布尔开关，写进 localStorage。
 * 读不到或隐私模式时退回 initial，不抛错。
 */
export function usePersistedFlag(key: string, initial: boolean) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw === '1') return true
      if (raw === '0') return false
    } catch { /* 隐私模式 */ }
    return initial
  })

  const set = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setValue((prev) => {
      const value = typeof next === 'function' ? next(prev) : next
      try { localStorage.setItem(key, value ? '1' : '0') } catch { /* 隐私模式 */ }
      return value
    })
  }, [key])

  return [value, set] as const
}
