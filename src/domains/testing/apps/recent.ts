import { useSession } from '@/lib/session'
const KEY = 'mino.testing.recentApps'
const MAX = 12

/**
 * 最近打开过的应用。
 * 落地页排序要「执行中 → 最近打开 → 名称」，最近打开这一维度只有本地知道。
 */
const read = (): string[] => {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []
  } catch { return [] }
}

export const recentAppIds = read

export const markAppOpened = (appId: string) => {
  if (!appId) return
  const next = [appId, ...read().filter((id) => id !== appId)].slice(0, MAX)
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* 隐私模式 */ }
}

// Project history is separate from legacy application IDs and scoped to the account.
const projectKey = () => `mino.testing.recentProjects:${useSession.getState().user?.user_id || ''}`
export const recentProjectIds = (): string[] => {
  try { const rows = JSON.parse(localStorage.getItem(projectKey()) || '[]'); return Array.isArray(rows) ? rows.filter(value => typeof value === 'string') : [] } catch { return [] }
}
export const markProjectOpened = (projectId: string) => {
  try { localStorage.setItem(projectKey(), JSON.stringify([projectId, ...recentProjectIds().filter(id => id !== projectId)].slice(0, MAX))) } catch { /* private mode */ }
}
