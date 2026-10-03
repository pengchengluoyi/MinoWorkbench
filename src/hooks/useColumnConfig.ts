import { useCallback, useMemo, useState } from 'react'

export interface ColumnPref {
  hidden?: boolean
  width?: number
  order?: number
}
export type ColumnPrefs = Record<string, ColumnPref>

const keyOf = (viewId: string) => `mino.columns.${viewId}`

const read = (viewId: string): ColumnPrefs => {
  try {
    const raw = localStorage.getItem(keyOf(viewId))
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch { return {} }
}

/**
 * 列配置持久化（手册 §7.1）。
 * 原项目 402 处表格列全是写死的，列宽和显隐刷新就丢。
 * 每个表格给一个稳定的 viewId，偏好按视图存。
 */
export function useColumnConfig(viewId: string) {
  const [prefs, setPrefs] = useState<ColumnPrefs>(() => read(viewId))

  const persist = useCallback((next: ColumnPrefs) => {
    setPrefs(next)
    try { localStorage.setItem(keyOf(viewId), JSON.stringify(next)) } catch { /* quota */ }
  }, [viewId])

  const toggle = useCallback((col: string) => {
    persist({ ...prefs, [col]: { ...prefs[col], hidden: !prefs[col]?.hidden } })
  }, [prefs, persist])

  const setWidth = useCallback((col: string, width: number) => {
    persist({ ...prefs, [col]: { ...prefs[col], width } })
  }, [prefs, persist])

  const reset = useCallback(() => {
    setPrefs({})
    try { localStorage.removeItem(keyOf(viewId)) } catch { /* ignore */ }
  }, [viewId])

  const isHidden = useCallback((col: string) => !!prefs[col]?.hidden, [prefs])

  const hiddenCount = useMemo(
    () => Object.values(prefs).filter((p) => p?.hidden).length,
    [prefs],
  )

  return { prefs, toggle, setWidth, reset, isHidden, hiddenCount }
}
