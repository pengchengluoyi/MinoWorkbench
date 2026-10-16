import { useQuery } from '@tanstack/react-query'
import { AutoComplete, InputNumber, Select, Alert, Button, FormField, FormSection, StatusPill, errText } from '@/ui'
import { listSDKModels, type AIProvider, type ProviderForm } from '@/api/ai'
import { useSession } from '@/lib/session'

export function ModelConfig({ provider, form, patch }: { provider: AIProvider; form: ProviderForm; patch: (patch: Partial<ProviderForm>) => void }) {
  const owner = useSession((s) => s.user?.user_id || '')
  const query = useQuery({ queryKey: ['account', owner, 'ai', 'catalog', form.sdk_provider], queryFn: async () => (await listSDKModels(form.sdk_provider)).data })
  const model = query.data?.models.find((m) => m.id === form.model)
  const params = form.model_parameters
  const setParam = (key: string, value: unknown) => {
    const next = { ...params }
    if (value == null || value === '') delete next[key]; else next[key] = value
    patch({ model_parameters: next })
  }
  return <>
    <FormSection title="模型选择" description="从注册表选择模型，或填写服务商提供的模型 ID / 接入点。注册信息不代表当前账号一定可用。">
      {query.isError && <Alert type="error" message={errText(query.error, '读取模型注册表失败，可继续填写模型 ID')} action={<Button onClick={() => void query.refetch()}>重试</Button>} style={{ marginBottom: 16 }} />}
      <div className="w-form-grid">
        <FormField label="对话模型" hint="支持选取已登记模型，也可直接输入自定义 ID，例如 ep-…">
          <AutoComplete aria-label="对话模型 ID" value={form.model} placeholder="选择或输入模型 ID" options={(query.data?.models || []).filter(m => m.mode === 'chat').map(m => ({ value: m.id, label: m.id }))} filterOption={(value, option) => String(option?.value || '').toLowerCase().includes(value.toLowerCase())} onChange={value => patch({ model: value })} style={{ width: '100%' }} />
        </FormField>
        <FormField label="向量模型（可选）" hint="留空时使用全文检索（FTS），无需配置向量模型。">
          <AutoComplete allowClear aria-label="向量模型 ID" value={form.embedding_model} placeholder="选择或输入向量模型 ID" options={(query.data?.models || []).filter(m => m.mode === 'embedding').map(m => ({ value: m.id, label: m.id }))} filterOption={(value, option) => String(option?.value || '').toLowerCase().includes(value.toLowerCase())} onChange={value => patch({ embedding_model: value })} style={{ width: '100%' }} />
        </FormField>
      </div>
      <div className="w-capability-list" aria-label="模型注册能力">
        {([['图片理解', model?.supports_vision], ['工具调用', model?.supports_function_calling], ['结构化输出', model?.supports_response_schema]] as const).map(([label, value]) => <StatusPill key={label} status={value == null ? 'muted' : value ? 'pass' : 'warn'}>{label} · {value == null ? '未知' : value ? '支持' : '不支持'}</StatusPill>)}
      </div>
      <p className="w-form-hint" style={{ marginBottom: 0 }}>来源：LiteLLM {query.data?.sdk_version || provider.sdk_version || '版本未提供'}。{model ? 'SDK 已登记，服务商维护状态待核实。' : '自定义或未登记 ID，能力与价格未知。'}{model?.deprecation_date ? ` 注册表退役日期：${model.deprecation_date}` : ''}</p>
    </FormSection>
    <FormSection title="生成参数" description="留空跟随任务配置；实际生效范围取决于模型支持情况。">
      <div className="w-form-grid">
        <FormField label="Temperature" hint="控制生成随机性，留空按任务设置。"><InputNumber aria-label="Temperature" min={0} max={2} step={0.1} value={params.temperature as number | undefined} onChange={v => setParam('temperature', v)} style={{ width: '100%' }} /></FormField>
        <FormField label="最大输出 token" hint="仅控制输出上限，不代表模型上下文长度。"><InputNumber aria-label="最大输出 token" min={1} precision={0} value={params.max_tokens as number | undefined} onChange={v => setParam('max_tokens', v)} style={{ width: '100%' }} /></FormField>
        {form.sdk_provider === 'volcengine' && <FormField label="Thinking" hint="依模型支持；未设置时跟随任务。"><Select allowClear aria-label="Thinking" value={(params.thinking as { type?: string })?.type} options={['enabled', 'disabled', 'auto'].map(value => ({ value, label: value }))} onChange={v => setParam('thinking', v ? { type: v } : undefined)} style={{ width: '100%' }} /></FormField>}
      </div>
      {model?.supported_parameters && <p className="w-form-hint">SDK 声明的参数：{model.supported_parameters.join('、') || '暂无记录'}。注册表信息不代替运行验证。</p>}
    </FormSection>
    <FormSection title="费用估算" description="自定义单价，单位为 USD / 百万 token。留空使用已有计价策略；未知价格不会按零费用计算。">
      <div className="w-form-grid w-form-grid-thirds">
        <FormField label="对话输入单价"><InputNumber aria-label="输入单价" min={0} value={form.pricing.input_per_million_usd} onChange={v => patch({ pricing: { ...form.pricing, input_per_million_usd: v ?? undefined } })} style={{ width: '100%' }} /></FormField>
        <FormField label="对话输出单价"><InputNumber aria-label="输出单价" min={0} value={form.pricing.output_per_million_usd} onChange={v => patch({ pricing: { ...form.pricing, output_per_million_usd: v ?? undefined } })} style={{ width: '100%' }} /></FormField>
        <FormField label="向量输入单价"><InputNumber aria-label="向量单价" min={0} value={form.embedding_pricing.input_per_million_usd} onChange={v => patch({ embedding_pricing: { input_per_million_usd: v ?? undefined } })} style={{ width: '100%' }} /></FormField>
      </div>
    </FormSection>
  </>
}
