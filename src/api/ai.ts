import { request } from '@/lib/request'

export interface AIProvider {
  id: string
  name?: string
  api_type?: string
  base_url?: string
  model?: string
  model_options?: string[]
  configured?: boolean
  enabled?: boolean
  case_execution_use?: boolean
  api_key_masked?: string
  plan_compress_ratio?: number
  web_compress_ratio?: number
  android_compress_ratio?: number
}

export interface AIProvidersDoc {
  providers?: AIProvider[]
  default_provider?: string
  usage?: {
    case_execution_enabled?: boolean
    case_execution_provider_id?: string
  }
}

export interface ProviderForm {
  name: string
  api_type: string
  api_key: string
  base_url: string
  model: string
  model_options: string[]
  enabled: boolean
  case_execution_use: boolean
  plan_compress_ratio: number
  web_compress_ratio: number
  android_compress_ratio: number
  clear_key: boolean
  set_default: boolean
}

export const PRESET_PROVIDER_IDS = [
  'openai', 'anthropic', 'umodelverse', 'google', 'deepseek', 'qwen', 'volcengine',
] as const

export const listAIProviders = () =>
  request<AIProvidersDoc>({ url: '/settings/ai/providers', method: 'get' })

export const saveAIProvider = (providerId: string, data: ProviderForm) =>
  request({ url: `/settings/ai/providers/${encodeURIComponent(providerId)}`, method: 'put', data })

export const deleteAIProvider = (providerId: string) =>
  request({ url: `/settings/ai/providers/${encodeURIComponent(providerId)}`, method: 'delete' })

export const saveAIUsage = (data: { case_execution_enabled: boolean; case_execution_provider_id: string }) =>
  request({
    url: '/settings/ai/usage',
    method: 'put',
    data: { copilot_enabled: false, mode: 'local_first', ...data },
  })

export const roundRatio = (value: unknown, fallback: number) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(10, Math.max(1, Math.round(num * 10) / 10))
}

export const apiTypeLabel = (provider: AIProvider) => {
  const t = String(provider.api_type || '').toLowerCase()
  if (t === 'anthropic') return 'Messages API'
  if (t === 'gemini') return 'Gemini API'
  return 'Chat API'
}
