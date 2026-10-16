import { request } from '@/lib/request'
export interface LoginEvidencePolicy { mode: 'ui_identity' | 'submitted_account'; env_profiles: string[]; env_surfaces: string[]; authenticated_content_hint?: string; logout_navigation_hint?: string }
const path = (appId: string) => `/app-automation/login-evidence-policy/${encodeURIComponent(appId)}`
export const getLoginEvidencePolicy = (appId: string) => request<{ policy: LoginEvidencePolicy }>({ url: path(appId), method: 'get' })
export const saveLoginEvidencePolicy = (appId: string, policy: LoginEvidencePolicy, expected_policy: LoginEvidencePolicy) => request<{ policy: LoginEvidencePolicy }>({ url: path(appId), method: 'put', data: { policy, expected_policy } })
