import { useCallback, useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'
type Density = 'comfortable' | 'compact'

const THEME_KEY = 'mino.appearance.theme'
const DENSITY_KEY = 'mino.appearance.density'

const read = (k: string, fallback: string): string => {
  try { return localStorage.getItem(k) || fallback } catch { return fallback }
}
const write = (k: string, v: string) => {
  try { localStorage.setItem(k, v) } catch { /* 隐私模式 */ }
}

const applyTheme = (theme: Theme) => {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

const applyDensity = (density: Density) => {
  document.documentElement.setAttribute('data-density', density)
}

/**
 * 外观偏好。密度切换是手册 §7.5 要求的：
 * 表格页要紧凑，详情页要舒适，同一套 token 两档值。
 */
export function useAppearance() {
  const [theme, setThemeState] = useState<Theme>(() => read(THEME_KEY, 'system') as Theme)
  const [density, setDensityState] = useState<Density>(() => read(DENSITY_KEY, 'comfortable') as Density)

  useEffect(() => { applyTheme(theme) }, [theme])
  useEffect(() => { applyDensity(density) }, [density])

  const setTheme = useCallback((t: Theme) => { setThemeState(t); write(THEME_KEY, t) }, [])
  const setDensity = useCallback((d: Density) => { setDensityState(d); write(DENSITY_KEY, d) }, [])

  return { theme, setTheme, density, setDensity }
}

/** 给 antd ConfigProvider 判断用的实际深浅（解析 system）。 */
export function useResolvedDark(): boolean {
  const [dark, setDark] = useState(() => {
    const attr = document.documentElement.getAttribute('data-theme')
    if (attr === 'dark') return true
    if (attr === 'light') return false
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  })

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const recompute = () => {
      const attr = document.documentElement.getAttribute('data-theme')
      if (attr === 'dark') return setDark(true)
      if (attr === 'light') return setDark(false)
      setDark(mq.matches)
    }
    mq.addEventListener('change', recompute)
    const observer = new MutationObserver(recompute)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => { mq.removeEventListener('change', recompute); observer.disconnect() }
  }, [])

  return dark
}
