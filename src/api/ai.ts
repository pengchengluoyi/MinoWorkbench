import { request } from '@/lib/request'

export interface AIProvider {
  id: string
  name?: string
  api_type?: string
  base_url?: string
  model?: string
  model_options?: string[]
  sdk_provider?: string
  sdk_version?: string
  embedding_model?: string
  model_info?: SDKModel
  model_parameters?: Record<string, unknown>
  pricing?: UnitPricing
  embedding_pricing?: UnitPricing
  validation?: { status: string; model?: string; at?: string; error?: string; provider_error_code?: string; provider_request_id?: string }
  configured?: boolean
  enabled?: boolean
  case_execution_use?: boolean
  api_key_masked?: string
  plan_compress_ratio?: number
  web_compress_ratio?: number
  android_compress_ratio?: number
  pc_compress_ratio?: number
}

export interface AIProvidersDoc {
  providers?: AIProvider[]
  sdk_providers?: string[]
  default_provider?: string
  usage?: {
    case_execution_enabled?: boolean
    case_execution_provider_id?: string
  }
}

const SDK_PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI / 兼容接口', anthropic: 'Anthropic', gemini: 'Google Gemini',
  deepseek: 'DeepSeek', dashscope: '通义千问', volcengine: '火山引擎',
  groq: 'Groq', mistral: 'Mistral', xai: 'xAI', openrouter: 'OpenRouter',
  azure: 'Azure OpenAI', aihubmix: 'AiHubMix', moonshot: 'Moonshot',
  cerebras: 'Cerebras', together_ai: 'Together AI', fireworks_ai: 'Fireworks AI',
}

export const sdkProviderLabel = (sdkProvider: string) => SDK_PROVIDER_LABELS[sdkProvider] || sdkProvider

export interface ProviderForm {
  name: string
  api_type: string
  api_key: string
  base_url: string
  model: string
  model_options: string[]
  sdk_provider: string
  embedding_model: string
  model_parameters: Record<string, unknown>
  pricing: UnitPricing
  embedding_pricing: UnitPricing
  enabled: boolean
  case_execution_use: boolean
  plan_compress_ratio: number
  web_compress_ratio: number
  android_compress_ratio: number
  pc_compress_ratio: number
  clear_key: boolean
  set_default: boolean
}

export interface UnitPricing { input_per_million_usd?: number; output_per_million_usd?: number }
export interface SDKModel {
  id: string; mode: string; sdk_registered: boolean
  supports_vision?: boolean; supports_function_calling?: boolean; supports_response_schema?: boolean
  max_input_tokens?: number; max_output_tokens?: number; deprecation_date?: string
  supported_parameters?: string[]
}
export interface ModelCatalog { models: SDKModel[]; providers: string[]; sdk_version: string; notice: string }
export const listSDKModels = (sdkProvider: string) => request<ModelCatalog>({ url: '/settings/ai/models', method: 'get', params: { sdk_provider: sdkProvider } })

export interface CostFilters { task_id?: string; case_id?: string; session_id?: string; step_index?: number; group_by?: string; start?: string; end?: string; offset?: number; limit?: number }
export interface CostRow {
  task_id?: string; case_id?: string; session_id?: string; step_index?: number; provider_id?: string; model?: string
  attempts: number; prompt_tokens: number | null; completion_tokens: number | null; total_tokens: number | null
  known_estimated_cost_usd: number | null; unknown_usage_attempts: number; unknown_cost_attempts: number; cost_complete: boolean
}
export interface CostDoc { summary: CostRow; items: CostRow[]; group_count: number; has_more: boolean; currency: string; notice: string }
export const getModelCosts = (params: CostFilters) => request<CostDoc>({ url: '/settings/ai/costs', method: 'get', params })

export const PRESET_PROVIDER_IDS = [
  'openai', 'anthropic', 'umodelverse', 'google', 'deepseek', 'qwen', 'volcengine',
] as const

export const listAIProviders = () =>
  request<AIProvidersDoc>({ url: '/settings/ai/providers', method: 'get' })

export const saveAIProvider = (providerId: string, data: ProviderForm) =>
  request({ url: `/settings/ai/providers/${encodeURIComponent(providerId)}`, method: 'put', data })

export const validateAIProvider = (providerId: string) =>
  request({ url: `/settings/ai/providers/${encodeURIComponent(providerId)}/validate`, method: 'post' })

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
