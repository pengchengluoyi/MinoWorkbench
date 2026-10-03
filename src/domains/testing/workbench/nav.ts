import { FlaskConical, ListChecks, Share2, Settings2, Boxes } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * 应用内导航。tab 从原实现的 11 项减到 7 项
 * （单据 / 知识 / 文档 / 信息基座已砍，见重建方案 §0）。
 */
export const VALID_TABS = [
  'cases', 'tasks', 'dispatch', 'session-log', 'navigation', 'assets', 'config',
] as const
export type Tab = (typeof VALID_TABS)[number]

/** 原默认是 process，该 tab 已砍 —— 不改默认值会白屏。 */
export const DEFAULT_TAB: Tab = 'cases'

/** 已砍功能的旧 tab 值，统一重定向到默认 tab，不保留空页面。 */
export const RETIRED_TABS = ['process', 'knowledge', 'docs', 'intel'] as const

export interface SubItem {
  /** 子项要么切换 tab 本身，要么只改子视图参数 —— 沿用原实现划分，避免旧链接失效 */
  tab?: Tab
  /** 子视图参数名与取值 */
  param?: { key: 'view' | 'nview' | 'section' | 'dview' | 'configSection'; value: string }
  label: string
}

export interface NavItem {
  id: Tab
  label: string
  icon: LucideIcon
  /** 属于同一导航项的其他 tab 值（高亮用） */
  alsoActiveOn?: Tab[]
  children?: SubItem[]
}

export const APP_NAV: NavItem[] = [
  {
    id: 'cases',
    label: '用例',
    icon: FlaskConical,
  },
  {
    id: 'tasks',
    label: '任务',
    icon: ListChecks,
    alsoActiveOn: ['dispatch', 'session-log'],
    children: [
      { label: '执行批次', tab: 'tasks' },
      { label: '调用记录', tab: 'dispatch', param: { key: 'dview', value: 'pipeline' } },
      { label: 'Session Log', tab: 'session-log' },
    ],
  },
  {
    id: 'navigation',
    label: '导航',
    icon: Share2,
    children: [{ label: '架构', param: { key: 'nview', value: 'arch' } }],
  },
  {
    id: 'assets',
    label: '测试资源',
    icon: Boxes,
    children: [
      { label: '账号管理', param: { key: 'section', value: 'accounts' } },
      { label: '资源日志', param: { key: 'section', value: 'logs' } },
      { label: '机态 App', param: { key: 'section', value: 'device-apps' } },
    ],
  },
  {
    id: 'config',
    label: '配置',
    icon: Settings2,
    children: [{ label: '环境配置', param: { key: 'configSection', value: 'env' } }],
  },
]

/** 每个 tab 的子视图参数名与默认值，用于读 URL 时兜底。 */
export const SUB_VIEW_DEFAULTS: Partial<Record<Tab, { key: SubItem['param']['key']; value: string }>> = {
  cases: { key: 'view', value: 'library' },
  navigation: { key: 'nview', value: 'arch' },
  assets: { key: 'section', value: 'accounts' },
  dispatch: { key: 'dview', value: 'pipeline' },
  config: { key: 'configSection', value: 'env' },
}

export const resolveTab = (raw: unknown): Tab => {
  const t = String(raw || '')
  return (VALID_TABS as readonly string[]).includes(t) ? (t as Tab) : DEFAULT_TAB
}

export const isRetiredTab = (raw: unknown): boolean =>
  (RETIRED_TABS as readonly string[]).includes(String(raw || ''))
