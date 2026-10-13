import { useQuery } from '@tanstack/react-query'
import { Input, InputNumber, Select, Alert, Button, errText } from '@/ui'
import { listSDKModels, type AIProvider, type ProviderForm } from '@/api/ai'
import { useSession } from '@/lib/session'

export function ModelConfig({ provider, form, patch }: { provider: AIProvider; form: ProviderForm; patch: (patch: Partial<ProviderForm>) => void }) {
  const owner = useSession((s) => s.user?.user_id || '')
  const query = useQuery({ queryKey: ['account', owner, 'ai', 'catalog', form.sdk_provider], queryFn: async () => (await listSDKModels(form.sdk_provider)).data })
  const model = query.data?.models.find((m) => m.id === form.model)
  const known = (value: boolean | undefined) => value == null ? '未知' : value ? '支持' : '不支持'
  const params = form.model_parameters
  const setParam = (key: string, value: unknown) => {
    const next = { ...params }; if (value == null || value === '') delete next[key]; else next[key] = value
    patch({ model_parameters: next })
  }
  return <div style={{ marginBottom: 16 }}>
    {query.isError && <Alert type="error" message={errText(query.error, '读取模型注册表失败')} action={<Button onClick={() => void query.refetch()}>重试</Button>} />}
    <p>模型资料来自 LiteLLM {query.data?.sdk_version || provider.sdk_version}；SDK 登记不代表服务商仍维护或当前账号可用。修改后请先保存，再主动验证连接。</p>
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
      <label>SDK 对话模型<Select showSearch aria-label="SDK 对话模型" placeholder="从 SDK 注册表选取" value={model?.mode === 'chat' ? form.model : undefined} options={(query.data?.models || []).filter((m) => m.mode === 'chat').map((m) => ({ value: m.id, label: m.id }))} onChange={(v) => patch({ model: v })} style={{ width: '100%' }} /></label>
      <label>模型 ID / 自定义接入点<Input aria-label="模型 ID" value={form.model} placeholder="允许 ep-… 或自定义模型 ID" onChange={(e) => patch({ model: e.target.value })} /></label>
      <label>向量模型 ID（留空使用 FTS）<Input aria-label="向量模型 ID" value={form.embedding_model} onChange={(e) => patch({ embedding_model: e.target.value })} /></label>
      <label>SDK 向量模型<Select allowClear showSearch aria-label="SDK 向量模型" value={form.embedding_model || undefined} options={(query.data?.models || []).filter((m) => m.mode === 'embedding').map((m) => ({ value: m.id, label: m.id }))} onChange={(v) => patch({ embedding_model: v || '' })} style={{ width: '100%' }} /></label>
      <label>Temperature（留空按任务）<InputNumber aria-label="Temperature" min={0} max={2} step={0.1} value={params.temperature as number | undefined} onChange={(v) => setParam('temperature', v)} style={{ width: '100%' }} /></label>
      <label>最大输出 token（留空按任务）<InputNumber aria-label="最大输出 token" min={1} precision={0} value={params.max_tokens as number | undefined} onChange={(v) => setParam('max_tokens', v)} style={{ width: '100%' }} /></label>
      {form.sdk_provider === 'volcengine' && <label>Thinking（依模型支持）<Select allowClear aria-label="Thinking" value={(params.thinking as { type?: string })?.type} options={['enabled', 'disabled', 'auto'].map((value) => ({ value, label: value }))} onChange={(v) => setParam('thinking', v ? { type: v } : undefined)} style={{ width: '100%' }} /></label>}
      <label>自定义输入单价 USD / 百万 token<InputNumber aria-label="输入单价" min={0} value={form.pricing.input_per_million_usd} onChange={(v) => patch({ pricing: { ...form.pricing, input_per_million_usd: v ?? undefined } })} style={{ width: '100%' }} /></label>
      <label>自定义输出单价 USD / 百万 token<InputNumber aria-label="输出单价" min={0} value={form.pricing.output_per_million_usd} onChange={(v) => patch({ pricing: { ...form.pricing, output_per_million_usd: v ?? undefined } })} style={{ width: '100%' }} /></label>
      <label>自定义向量单价 USD / 百万 token<InputNumber aria-label="向量单价" min={0} value={form.embedding_pricing.input_per_million_usd} onChange={(v) => patch({ embedding_pricing: { input_per_million_usd: v ?? undefined } })} style={{ width: '100%' }} /></label>
    </div>
    <p>图片：{known(model?.supports_vision)}；工具：{known(model?.supports_function_calling)}；结构化输出：{known(model?.supports_response_schema)}。{model ? 'SDK 已登记；维护状态未知。' : '自定义或未登记 ID，能力与价格未知。'}{model?.deprecation_date ? `注册表退役日期：${model.deprecation_date}` : ''}</p>
    {model?.supported_parameters && <p>SDK 声明的可选参数：{model.supported_parameters.join('、') || '暂无记录'}。未设置的参数跟随任务配置。</p>}
    <p>已保存配置的验证：{provider.validation?.status === 'verified' ? '连接成功（文本探针；不代表全部能力）' : provider.validation?.status === 'failed' ? '失败' : '未验证'}{provider.validation?.at ? ` · ${provider.validation.at}` : ''} {provider.validation?.error} {provider.validation?.provider_request_id ? `请求 ID：${provider.validation.provider_request_id}` : ''}</p>
  </div>
}
