/** 账号角色（登录身份）。与产品角色（AI catalog 里的 role）不是同一套。 */

export type AccountRole = 'admin' | 'user'

export const ACCOUNT_ROLES: { id: AccountRole; label: string }[] = [
  { id: 'admin', label: '管理员' },
  { id: 'user', label: '用户' },
]

const ROLE_ALIASES: Record<string, AccountRole> = {
  platform_admin: 'admin',
  org_admin: 'admin',
  qa_lead: 'user',
  operator: 'user',
  viewer: 'user',
}

export const normalizeRole = (id: unknown): string => {
  const raw = String(id || '').trim()
  const mapped = ROLE_ALIASES[raw] || raw
  return ACCOUNT_ROLES.some((r) => r.id === mapped) ? mapped : (raw || '—')
}

export const roleLabel = (id: unknown): string => {
  const norm = normalizeRole(id)
  return ACCOUNT_ROLES.find((r) => r.id === norm)?.label || norm || '—'
}

export const isAdmin = (id: unknown): boolean => normalizeRole(id) === 'admin'
