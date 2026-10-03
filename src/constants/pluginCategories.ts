import type { Plugin } from '@/api/plugins'

export const PLUGIN_CATEGORIES = [
  { id: 'all', label: '全部', desc: '所有外部系统' },
  { id: 'docs', label: '文档', desc: 'Wiki 副本' },
  { id: 'im', label: 'IM', desc: '群通知、对话与提缺陷' },
  { id: 'defect', label: '缺陷', desc: '禅道等缺陷库' },
  { id: 'design', label: '设计', desc: '设计稿学习' },
] as const

export const normalizePluginCat = (cat: unknown): string => {
  const id = String(cat || 'all')
  return PLUGIN_CATEGORIES.some((c) => c.id === id) ? id : 'all'
}

export const pluginCategories = (p: Plugin | undefined): string[] => {
  if (Array.isArray(p?.categories) && p.categories.length) return p.categories
  return p?.kind ? [p.kind] : []
}

export const pluginInCategory = (p: Plugin, cat: string): boolean => {
  const id = normalizePluginCat(cat)
  if (id === 'all') return true
  return pluginCategories(p).includes(id)
}

export const categoryLabel = (id: string): string =>
  PLUGIN_CATEGORIES.find((c) => c.id === id)?.label || id
