import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * 把一个视图状态挂到 URL query 上。
 *
 * 原项目大量用 `?tab=&board=&view=`，让人能把当前视图甩给同事——
 * 这是真实用法，手册 §9 要求保留。这个 hook 把它规范化。
 */
export function useUrlState<T extends string = string>(
  key: string,
  // NoInfer：否则传字面量 '' 会把 T 收窄成 ''，setter 就只收空串了
  fallback: NoInfer<T>,
  allowed?: readonly T[],
): [T, (next: T) => void] {
  const [params, setParams] = useSearchParams()

  const value = useMemo(() => {
    const raw = params.get(key) as T | null
    if (!raw) return fallback
    if (allowed && !allowed.includes(raw)) return fallback
    return raw
  }, [params, key, fallback, allowed])

  const set = useCallback((next: T) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev)
      if (!next || next === fallback) p.delete(key)
      else p.set(key, next)
      return p
    }, { replace: true })
  }, [setParams, key, fallback])

  return [value, set]
}
