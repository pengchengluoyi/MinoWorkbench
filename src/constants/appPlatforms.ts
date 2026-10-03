/** 应用覆盖端：创建、展示、判断是否支持某端。逻辑原样搬自 MinoStudio，仅加类型。 */

export const MOBILE_CANONICAL = 'Mobile'
export const MOBILE_PARTS = ['Android', 'iOS']

export interface PlatformOption {
  label: string
  value: string
  desc?: string
  icon: string
  featured?: boolean
}

/** 创建应用时的平台卡片（featured 占两列） */
export const APP_PLATFORM_OPTIONS: PlatformOption[] = [
  { label: '移动端', value: MOBILE_CANONICAL, desc: 'Android + iOS 双端共用', icon: '📱', featured: true },
  { label: 'Web', value: 'Web', desc: '浏览器 / H5', icon: '🌐' },
  { label: 'Windows', value: 'Windows', desc: '桌面客户端', icon: '🪟' },
  { label: 'Mac', value: 'Mac', desc: '桌面客户端', icon: '🍎' },
]

/** 仅需单端时展开（高级） */
export const APP_PLATFORM_OPTIONS_ADVANCED: PlatformOption[] = [
  { label: '仅 Android', value: 'Android', icon: '🤖' },
  { label: '仅 iOS', value: 'iOS', icon: '🍏' },
]

const ICON_MAP: Record<string, string> = {
  Windows: '🪟', Mac: '🍎', Mobile: '📱', Android: '🤖', iOS: '🍏', Web: '🌐',
}

export type PlatformInput = string | string[] | null | undefined

export function normalizePlatforms(platforms: PlatformInput): string[] {
  if (Array.isArray(platforms)) return platforms.map((p) => String(p).trim()).filter(Boolean)
  if (typeof platforms === 'string') return platforms.split(',').map((p) => p.trim()).filter(Boolean)
  return []
}

/** Mobile → Android + iOS，用于能力判断、环境字段等 */
export function expandPlatforms(platforms: PlatformInput): string[] {
  const out: string[] = []
  for (const p of normalizePlatforms(platforms)) {
    if (p === MOBILE_CANONICAL) out.push(...MOBILE_PARTS)
    else out.push(p)
  }
  return [...new Set(out)]
}

/** 若同时勾了 Android+iOS，展示/存储时收敛为 Mobile */
export function collapsePlatforms(list: PlatformInput): string[] {
  const set = new Set(normalizePlatforms(list))
  if (set.has(MOBILE_CANONICAL) || (set.has('Android') && set.has('iOS'))) {
    set.delete('Android')
    set.delete('iOS')
    set.add(MOBILE_CANONICAL)
  }
  return [...set]
}

/** 创建应用：单选覆盖端 → 规范为 0/1 个平台值 */
export function serializePlatformSelection(selected: PlatformInput): string[] {
  if (!selected) return []
  const collapsed = collapsePlatforms(typeof selected === 'string' ? [selected] : selected)
  return collapsed.length ? [collapsed[0]] : []
}

export function platformIncludes(platforms: PlatformInput, name: string): boolean {
  const key = String(name).toLowerCase()
  return expandPlatforms(platforms).some((p) => p.toLowerCase() === key)
}

export function getPlatformIcon(platform: PlatformInput): string {
  if (!platform) return '📱'
  const p = collapsePlatforms([platform as string])[0] || String(platform)
  return ICON_MAP[p] || '📱'
}

/** 卡片上展示的端标签（已收敛 Mobile） */
export function formatPlatformTags(platforms: PlatformInput): string[] {
  return collapsePlatforms(platforms).map((p) => {
    const opt = [...APP_PLATFORM_OPTIONS, ...APP_PLATFORM_OPTIONS_ADVANCED].find((o) => o.value === p)
    return opt?.label || p
  })
}
