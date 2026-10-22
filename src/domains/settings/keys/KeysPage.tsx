import { recordAudit } from '@/domains/admin/audit/auditLog'
import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import {
  Alert, Button, EmptyState, FormSection, Input, InputNumber, Modal, Select, Skeleton, StatusPill, Switch, errText, useFeedback,
} from '@/ui'
import {
  PRESET_PROVIDER_IDS, apiTypeLabel, deleteAIProvider, listAIProviders, roundRatio, saveAIProvider,
  validateAIProvider, sdkProviderLabel, type AIProvider, type ProviderForm,
} from '@/api/ai'

import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { useSession } from '@/lib/session'
import { useUrlState } from '@/hooks/useUrlState'
import { ModelCosts } from './ModelCosts'
import { ModelConfig } from './ModelConfig'

const keys = { get all() { return ['account', useSession.getState().user?.user_id || '', 'ai', 'providers'] as const } }

const toForm = (p: AIProvider, defaultId: string): ProviderForm => {
  const options = [...(p.model_options || [])]
  const model = (p.model || '').trim()
  if (model && !options.includes(model)) options.unshift(model)
  return {
    name: p.name || '',
    api_type: p.api_type || 'openai',
    api_key: '',
    base_url: p.base_url || '',
    model,
    model_options: options,
    sdk_provider: p.sdk_provider || 'openai',
    embedding_model: p.embedding_model || '',
    model_parameters: p.model_parameters || {},
    pricing: p.pricing || {},
    embedding_pricing: p.embedding_pricing || {},
    enabled: p.configured ? p.enabled !== false : false,
    case_execution_use: Boolean(p.configured && p.enabled !== false && p.case_execution_use),
    plan_compress_ratio: roundRatio(p.plan_compress_ratio ?? 3, 3),
    web_compress_ratio: roundRatio(p.web_compress_ratio ?? 2, 2),
    android_compress_ratio: roundRatio(p.android_compress_ratio ?? 1, 1),
    pc_compress_ratio: roundRatio(p.pc_compress_ratio ?? 1, 1),
    clear_key: false,
    set_default: defaultId === p.id,
  }
}

/**
 * 模型密钥。只保留「大模型」这一档：配置 Key、选执行用的供应商、调截图压缩。
 * 发信和知识沉淀不在这个页面里（知识 tab 已砍，发信也不在当前导航）。
 */
export function KeysPage() {
  const [tab, setTab] = useUrlState<'keys' | 'costs'>('modelTab', 'keys', ['keys', 'costs'])
  const [addOpen, setAddOpen] = useState(false)
  const [newId, setNewId] = useState('')
  const [newSdkProvider, setNewSdkProvider] = useState('openai')
  const feedback = useFeedback()
  const qc = useQueryClient()
  const [openId, setOpenId] = useState('')
  const [providerSearch, setProviderSearch] = useState('')
  const [forms, setForms] = useState<Record<string, ProviderForm>>({})

  const query = useQuery({
    queryKey: keys.all,
    queryFn: async () => {
      const res = await listAIProviders()
      const data = res.data || {}
      const savedProviders = data.providers || []
      const sdkProviders = data.sdk_providers || [...new Set(savedProviders.map((p) => p.sdk_provider || 'openai'))]
      const existing = new Set(savedProviders.map((p) => p.sdk_provider || 'openai'))
      const providers: AIProvider[] = [
        ...savedProviders,
        ...sdkProviders.filter((native) => !existing.has(native) && !savedProviders.some((p) => p.id === native)).map((native) => ({
          id: native, name: sdkProviderLabel(native), sdk_provider: native,
          api_type: native === 'anthropic' || native === 'gemini' ? native : 'openai',
        })),
      ]
      const defaultId = data.default_provider || 'openai'
      const next: Record<string, ProviderForm> = {}
      for (const p of providers) next[p.id] = toForm(p, data.usage?.case_execution_provider_id || defaultId)
      return {
        providers,
        sdkProviders,
        savedIds: savedProviders.map((p) => p.id),
        forms: next,
      }
    },
  })

  const liveForms = useMemo(
    () => ({ ...(query.data?.forms || {}), ...forms }),
    [forms, query.data],
  )

  const patchForm = (id: string, patch: Partial<ProviderForm>) => {
    if (save.isPending || validate.isPending) return
    setForms((prev) => {
      const base = { ...(query.data?.forms || {}), ...prev }
      return { ...prev, [id]: { ...base[id], ...patch } }
    })
  }

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: keys.all })
  }

  const save = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: ProviderForm }) => {
      await saveAIProvider(id, {
        ...form,
        plan_compress_ratio: roundRatio(form.plan_compress_ratio, 3),
        web_compress_ratio: roundRatio(form.web_compress_ratio, 2),
        android_compress_ratio: roundRatio(form.android_compress_ratio, 1),
        pc_compress_ratio: roundRatio(form.pc_compress_ratio, 1),
      })
    },
    onSuccess: async (_result, { id, form }) => {
      await refresh()
      if (qc.getQueryState(keys.all)?.status !== 'success') { feedback.warn('保存请求已成功，但最新配置暂未读回；当前草稿已保留，请重试读取。'); return }
      setForms(prev => { if (JSON.stringify(prev[id]) !== JSON.stringify(form)) return prev; const next = { ...prev }; delete next[id]; return next })
      recordAudit('模型接入保存')
      feedback.ok('已保存')
      setAddOpen(false)
    },
    onError: (e) => feedback.fail(errText(e, '保存失败')),
  })

  const validate = useMutation({
    mutationFn: validateAIProvider,
    onSuccess: async () => { feedback.ok('连接验证成功'); await refresh() },
    onError: async (e) => { feedback.fail(errText(e, '连接验证失败')); await refresh() },
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteAIProvider(id),
    onSuccess: async () => {
      feedback.ok('已删除')
      await refresh()
    },
    onError: (e) => feedback.fail(errText(e, '删除失败')),
  })

  const hasDrafts = Object.keys(forms).some(id => JSON.stringify(forms[id]) !== JSON.stringify(query.data?.forms[id]))
  useUnsavedChanges(hasDrafts)
  const ordered = useMemo(() => {
    const rows = query.data?.providers || []
    return [...rows].sort((a, b) => {
      const rank = (p: AIProvider) => p.configured ? 0 : 1
      return rank(a) - rank(b)
    })
  }, [query.data?.providers])

  if (query.isLoading) return <Skeleton active paragraph={{ rows: 8 }} title={{ width: 160 }} />
  if (query.isError && !query.data) {
    return (
      <EmptyState
        icon={<TriangleAlert size={28} strokeWidth={1.5} style={{ color: 'var(--w-fail)' }} />}
        title="读不到模型接入配置"
        hint={errText(query.error)}
        action={<Button size="small" onClick={() => void query.refetch()}>重试</Button>}
      />
    )
  }

  const toggleEnabled = (p: AIProvider, enabled: boolean) => {
    if (hasDrafts) { feedback.warn('请先保存或放弃配置草稿，再更改启用状态'); return }
    const form = liveForms[p.id]
    if (!form) return
    if (enabled && !p.configured && !form.api_key.trim()) {
      feedback.warn('请先填写并保存 API Key 后再启用')
      return
    }
    const next = { ...form, enabled, case_execution_use: enabled ? form.case_execution_use : false, api_key: '', clear_key: false }
    patchForm(p.id, next)
    save.mutate({ id: p.id, form: next })
  }

  const toggleCase = (p: AIProvider, on: boolean) => {
    if (hasDrafts) { feedback.warn('请先保存或放弃当前配置草稿，再调整执行用途。'); return }
    const form = query.data?.forms[p.id]
    if (!form || !p.configured || !form.enabled) { feedback.warn('请先保存并启用此接入配置'); return }
    save.mutate({ id: p.id, form: { ...form, case_execution_use: on } })
  }

  const selectedId = openId || ordered[0]?.id || ''
  const selected = ordered.find((p) => p.id === selectedId)
  const selectedForm = selected ? liveForms[selected.id] : undefined
  const validationDirty = Boolean(selected && selectedForm && JSON.stringify(selectedForm) !== JSON.stringify(query.data?.forms[selected.id]))

  if (tab === 'costs') return <div className="flex h-full min-h-0 flex-col"><Button onClick={() => setTab('keys')}>返回模型配置</Button><ModelCosts /></div>

  return (
    <div className="w-workspace flex h-full min-h-0 flex-col" style={{ gap: 16 }}>
      <header className="flex shrink-0 flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>模型密钥</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--w-text-tertiary)', fontSize: 'var(--w-font-sm)' }}>
            从左侧选择接入方式，再配置对应的模型、Key 和地址。已配置 {ordered.filter((p) => p.configured).length} 项。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={hasDrafts} onClick={() => setTab('costs')}>模型用量与费用</Button>
          <Button onClick={() => setAddOpen(true)}>添加模型接入</Button>
        </div>
      </header>

      {query.isError && <Alert type="warning" showIcon message="配置刷新失败，保留上次读取内容与草稿" description={errText(query.error)} action={<Button onClick={() => void query.refetch()}>重试读取</Button>} />}
      {hasDrafts && <p role="status">有未保存的接入配置。保存或验证其他接入不会清除这些草稿。<Button disabled={save.isPending} onClick={() => setForms({})}>放弃全部配置草稿</Button></p>}
      <Modal open={addOpen} title="添加模型接入" onCancel={() => setAddOpen(false)} confirmLoading={save.isPending}
        onOk={() => {
          const id = newId.trim().toLowerCase()
          if (!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(id) || ordered.some((p) => p.id === id)) { feedback.warn('请输入未使用的英文接入 ID'); return }
          setOpenId(id)
          save.mutate({ id, form: toForm({ id, name: id, sdk_provider: newSdkProvider }, '') })
        }}>
        <p>为当前账号添加独立配置。相同接入方式可使用不同的 Key、地址与模型 ID。</p>
        <label>接入方式<Select aria-label="新接入方式" value={newSdkProvider} options={(query.data?.sdkProviders || []).map((native) => ({ value: native, label: sdkProviderLabel(native) }))} onChange={setNewSdkProvider} style={{ width: '100%', marginBottom: 12 }} /></label>
        <Input aria-label="新接入 ID" value={newId} placeholder="英文 ID，例如 my-provider" onChange={(e) => setNewId(e.target.value)} />
      </Modal>
      {!ordered.length && <EmptyState title="还没有接入方式" hint="Nexus 没有返回任何模型配置。" />}

      {!!ordered.length && (
        <div className="w-settings-layout">
          <aside className="w-settings-nav" aria-label="模型接入列表">
            <div className="w-settings-nav-heading"><strong>接入方式</strong><Input aria-label="搜索模型接入" placeholder="搜索服务商或接入名称" allowClear value={providerSearch} onChange={e => setProviderSearch(e.target.value)} style={{ marginTop: 10 }} /></div>
            {([true, false] as const).map(configured => {
              const rows = ordered.filter(p => !!p.configured === configured && `${sdkProviderLabel(p.sdk_provider || '')} ${p.name || ''} ${p.id}`.toLowerCase().includes(providerSearch.toLowerCase()))
              return rows.length ? <div key={String(configured)}><div className="w-band" data-tone="quiet">{configured ? '已配置接入' : '可添加的接入'}</div>{rows.map(p => <button key={p.id} type="button" className="w-nav-item w-hit" aria-current={p.id === selectedId ? 'true' : undefined} onClick={() => setOpenId(p.id)}>
                <div className="w-nav-item-title"><span>{p.name || sdkProviderLabel(p.sdk_provider || 'openai')}</span>{query.data?.forms[p.id]?.case_execution_use && <StatusPill status="pass">用例</StatusPill>}</div>
                <div className="w-nav-item-meta">{p.configured ? (p.api_key_masked || '凭证已保存') : '尚未配置'}{forms[p.id] && JSON.stringify(forms[p.id]) !== JSON.stringify(query.data?.forms[p.id]) ? ' · 有草稿' : ''}</div>
              </button>)}</div> : null
            })}
            {providerSearch && !ordered.some(p => `${sdkProviderLabel(p.sdk_provider || '')} ${p.name || ''} ${p.id}`.toLowerCase().includes(providerSearch.toLowerCase())) && <p style={{ padding: 16 }}>没有匹配的接入</p>}
          </aside>

          {selected && selectedForm && (
            <section className="w-settings-detail" aria-label="当前模型接入配置">
              <div className="w-detail-heading">
                <strong style={{ fontSize: 18 }}>{sdkProviderLabel(selectedForm.sdk_provider)}</strong>
                <StatusPill status="muted">{apiTypeLabel(selected)}</StatusPill>
                <span style={{ flex: 1 }} />
                <span>启用接入</span>
                <Switch aria-label="启用当前模型接入" checked={selectedForm.enabled} disabled={validate.isPending} loading={save.isPending} onChange={(v) => toggleEnabled(selected, v)} />
                {selectedForm.enabled && (
                  <>
                    <span>用于跑用例</span>
                    <Switch aria-label="允许当前模型用于用例执行" checked={selectedForm.case_execution_use} disabled={validate.isPending} loading={save.isPending} onChange={(v) => toggleCase(selected, v)} />
                  </>
                )}
              </div>
              <FormSection title="连接与凭证" description="密钥仅保存在当前账号下。修改后请先保存，再验证已保存的连接。"><div className="w-form-grid">
                <Field label="API Key">
                  {selected.configured && selected.api_key_masked ? (
                    <div style={{ fontFamily: 'var(--w-font-mono)', fontSize: 'var(--w-font-sm)', marginBottom: 4 }}>{selected.api_key_masked}</div>
                  ) : null}
                  <Input.Password
                    aria-label="当前接入 API Key"
                    value={selectedForm.api_key}
                    placeholder={selected.configured ? '留空则不修改' : '粘贴 API Key'}
                    autoComplete="new-password"
                    onChange={(e) => patchForm(selected.id, { api_key: e.target.value, clear_key: false })}
                  />
                </Field>
                <Field label="Base URL">
                  <Input aria-label="当前接入 Base URL" value={selectedForm.base_url} onChange={(e) => patchForm(selected.id, { base_url: e.target.value })} />
                </Field>

              </div></FormSection>
              <ModelConfig provider={selected} form={selectedForm} patch={(patch) => patchForm(selected.id, patch)} />
              <FormSection title="截图压缩策略" description="各执行平台独立配置，范围 1–10；沿用现有压缩倍率语义。">
                <div className="w-form-grid">
                <Ratio label="Plan 压缩" value={selectedForm.plan_compress_ratio} onChange={(v) => patchForm(selected.id, { plan_compress_ratio: v })} />
                <Ratio label="Web 压缩" value={selectedForm.web_compress_ratio} onChange={(v) => patchForm(selected.id, { web_compress_ratio: v })} />
                <Ratio label="安卓压缩" value={selectedForm.android_compress_ratio} onChange={(v) => patchForm(selected.id, { android_compress_ratio: v })} />
                <Ratio label="PC 压缩" value={selectedForm.pc_compress_ratio} onChange={(v) => patchForm(selected.id, { pc_compress_ratio: v })} />
                </div>
              </FormSection>
              <FormSection title="配置验证" description="验证会产生少量模型用量，只针对已保存的连接与文本探针，不代表全部能力。">
                <StatusPill status={validationDirty ? 'warn' : selected.validation?.status === 'verified' ? 'pass' : selected.validation?.status === 'failed' ? 'fail' : 'muted'}>{validationDirty ? '有未保存修改 · 需保存后验证' : selected.validation?.status === 'verified' ? '已保存配置连接成功' : selected.validation?.status === 'failed' ? '已保存配置验证失败' : '尚未验证'}</StatusPill>
                {selected.validation?.at && <p className="w-form-hint">最近验证：{selected.validation.at}</p>}
                {selected.validation?.error && <p role="alert" style={{ color: 'var(--w-fail)' }}>{selected.validation.error}</p>}
                {save.isError && save.variables?.id === selected.id && <Alert type="error" message="保存失败，草稿已保留" description={errText(save.error)} style={{ marginTop: 12 }} />}
                {validate.isError && validate.variables === selected.id && <Alert type="error" message="本次验证失败" description={errText(validate.error)} style={{ marginTop: 12 }} />}
              </FormSection>
              <div className="w-action-bar">
                <span className="w-form-hint" role="status">{validationDirty ? '当前接入有未保存修改' : '当前配置已保存'}</span>
                <Button type="primary" disabled={!validationDirty || validate.isPending || query.isError} loading={save.isPending} onClick={() => save.mutate({ id: selected.id, form: selectedForm })}>保存配置</Button>
                {selected.configured && <Button disabled={validationDirty || save.isPending || query.isError} loading={validate.isPending} onClick={() => validate.mutate(selected.id)}>验证已保存配置（产生少量用量）</Button>}
                {selected.configured && (
                  <Button
                    loading={save.isPending}
                    danger disabled={validationDirty || save.isPending || validate.isPending} onClick={() => { void feedback.confirm({ title: `清除 ${selected.name || selected.id} 的密钥？`, content: '此接入将停用，并不再用于用例执行。', danger: true, okText: '清除密钥' }).then(ok => { if (ok) save.mutate({ id: selected.id, form: { ...selectedForm, api_key: '', clear_key: true, enabled: false, case_execution_use: false } }) }) }}
                  >
                    清除 Key
                  </Button>
                )}
                {!(PRESET_PROVIDER_IDS as readonly string[]).includes(selected.id) && query.data?.savedIds.includes(selected.id) && (
                  <Button
                    danger
                    loading={remove.isPending}
                    onClick={() => {
                      void feedback.confirm({ title: `删除 ${selected.name || selected.id}？`, danger: true, okText: '删除' }).then((ok) => {
                        if (ok) remove.mutate(selected.id)
                      })
                    }}
                  >
                    删除
                  </Button>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col" style={{ gap: 4, fontSize: 'var(--w-font-sm)', color: 'var(--w-text-secondary)' }}>
      {label}
      {children}
    </label>
  )
}

function Ratio({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <InputNumber aria-label={label} min={1} max={10} step={0.1} value={value} onChange={(v) => onChange(roundRatio(v, value))} style={{ width: '100%' }} />
    </Field>
  )
}
