import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import {
  Button, EmptyState, Input, InputNumber, Select, Skeleton, StatusPill, Switch, errText, useFeedback,
} from '@/ui'
import {
  PRESET_PROVIDER_IDS, apiTypeLabel, deleteAIProvider, listAIProviders, roundRatio, saveAIProvider, saveAIUsage,
  type AIProvider, type ProviderForm,
} from '@/api/ai'

const keys = { all: ['ai', 'providers'] as const }

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
    enabled: p.configured ? p.enabled !== false : false,
    case_execution_use: Boolean(p.configured && p.enabled !== false && p.case_execution_use),
    plan_compress_ratio: roundRatio(p.plan_compress_ratio ?? 3, 3),
    web_compress_ratio: roundRatio(p.web_compress_ratio ?? 2, 2),
    android_compress_ratio: roundRatio(p.android_compress_ratio ?? 1, 1),
    clear_key: false,
    set_default: defaultId === p.id,
  }
}

/**
 * 模型密钥。只保留「大模型」这一档：配置 Key、选执行用的供应商、调截图压缩。
 * 发信和知识沉淀不在这个页面里（知识 tab 已砍，发信也不在当前导航）。
 */
export function KeysPage() {
  const feedback = useFeedback()
  const qc = useQueryClient()
  const [openId, setOpenId] = useState('')
  const [forms, setForms] = useState<Record<string, ProviderForm>>({})

  const query = useQuery({
    queryKey: keys.all,
    queryFn: async () => {
      const res = await listAIProviders()
      const data = res.data || {}
      const providers = data.providers || []
      const defaultId = data.default_provider || 'openai'
      const next: Record<string, ProviderForm> = {}
      for (const p of providers) next[p.id] = toForm(p, data.usage?.case_execution_provider_id || defaultId)
      return {
        providers,
        usageEnabled: Boolean(data.usage?.case_execution_enabled),
        forms: next,
      }
    },
  })

  const liveForms = useMemo(
    () => (Object.keys(forms).length ? forms : (query.data?.forms || {})),
    [forms, query.data],
  )

  const patchForm = (id: string, patch: Partial<ProviderForm>) => {
    setForms((prev) => {
      const base = Object.keys(prev).length ? prev : (query.data?.forms || {})
      return { ...base, [id]: { ...base[id], ...patch } }
    })
  }

  const refresh = async () => {
    setForms({})
    await qc.invalidateQueries({ queryKey: keys.all })
  }

  const save = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: ProviderForm }) => {
      await saveAIProvider(id, {
        ...form,
        plan_compress_ratio: roundRatio(form.plan_compress_ratio, 3),
        web_compress_ratio: roundRatio(form.web_compress_ratio, 2),
        android_compress_ratio: roundRatio(form.android_compress_ratio, 1),
      })
    },
    onSuccess: async () => {
      feedback.ok('已保存')
      await refresh()
    },
    onError: (e) => feedback.fail(errText(e, '保存失败')),
  })

  const usage = useMutation({
    mutationFn: (enabled: boolean) => {
      const chosen = query.data?.providers.find((p) => liveForms[p.id]?.case_execution_use)?.id || ''
      return saveAIUsage({ case_execution_enabled: enabled, case_execution_provider_id: chosen })
    },
    onSuccess: async () => {
      feedback.ok('已生效')
      await refresh()
    },
    onError: (e) => feedback.fail(errText(e, '保存失败')),
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteAIProvider(id),
    onSuccess: async () => {
      feedback.ok('已删除')
      await refresh()
    },
    onError: (e) => feedback.fail(errText(e, '删除失败')),
  })

  const ordered = useMemo(() => {
    const rows = query.data?.providers || []
    return [...rows].sort((a, b) => {
      const rank = (p: AIProvider) => (liveForms[p.id]?.case_execution_use ? 0 : liveForms[p.id]?.enabled ? 1 : 2)
      return rank(a) - rank(b)
    })
  }, [query.data?.providers, liveForms])

  if (query.isLoading) return <Skeleton active paragraph={{ rows: 8 }} title={{ width: 160 }} />
  if (query.isError) {
    return (
      <EmptyState
        icon={<TriangleAlert size={28} strokeWidth={1.5} style={{ color: 'var(--w-fail)' }} />}
        title="读不到模型供应商"
        hint={errText(query.error)}
        action={<Button size="small" onClick={() => void query.refetch()}>重试</Button>}
      />
    )
  }

  const toggleEnabled = (p: AIProvider, enabled: boolean) => {
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
    const form = liveForms[p.id]
    if (!form?.enabled) return
    if (on && !p.configured && !form.api_key.trim()) {
      feedback.warn('请先填写并保存 API Key')
      return
    }
    const nextForms = { ...liveForms }
    for (const id of Object.keys(nextForms)) {
      nextForms[id] = { ...nextForms[id], case_execution_use: on && id === p.id, api_key: '', clear_key: false }
    }
    setForms(nextForms)
    save.mutate({ id: p.id, form: { ...nextForms[p.id], enabled: true } })
  }

  const selectedId = openId || ordered[0]?.id || ''
  const selected = ordered.find((p) => p.id === selectedId)
  const selectedForm = selected ? liveForms[selected.id] : undefined

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ gap: 12 }}>
      <header className="flex shrink-0 items-center gap-4">
        <div className="min-w-0 flex-1">
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>模型密钥</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--w-text-tertiary)', fontSize: 'var(--w-font-sm)' }}>
            已配置 {ordered.filter((p) => p.configured).length} / {ordered.length}。Key 只在这里改，列表不展开表单。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-secondary)' }}>用例执行使用大模型</span>
          <Switch checked={query.data?.usageEnabled} loading={usage.isPending} onChange={(v) => usage.mutate(v)} />
        </div>
      </header>

      {!ordered.length && <EmptyState title="还没有供应商" hint="Nexus 没有返回任何模型配置。" />}

      {!!ordered.length && (
        <div className="flex min-h-0 flex-1" style={{ gap: 12 }}>
          <aside className="min-h-0 overflow-y-auto" style={{ flex: '0 0 clamp(200px, 22%, 320px)', background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-radius-lg)' }}>
            {ordered.map((p) => {
              const form = liveForms[p.id]
              const on = p.id === selectedId
              return (
                <button
                  key={p.id}
                  type="button"
                  data-active={on ? 'true' : 'false'}
                  className="w-hit flex w-full items-center gap-2"
                  onClick={() => setOpenId(p.id)}
                  style={{ border: 'none', borderBottom: '1px solid var(--w-border)', cursor: 'pointer', textAlign: 'left', padding: '10px 12px' }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate" style={{ fontWeight: 700 }}>{p.name || p.id}</span>
                    <span className="block truncate" style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)', fontFamily: 'var(--w-font-mono)' }}>
                      {p.configured ? (p.api_key_masked || '已保存') : '还没有 Key'}
                    </span>
                  </span>
                  {form?.case_execution_use && <StatusPill status="pass">用例</StatusPill>}
                </button>
              )
            })}
          </aside>

          {selected && selectedForm && (
            <section className="min-h-0 flex-1 overflow-y-auto" style={{ ...card, paddingBottom: 28 }}>
              <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: 16 }}>
                <strong style={{ fontSize: 18 }}>{selected.name || selected.id}</strong>
                <StatusPill status="muted">{apiTypeLabel(selected)}</StatusPill>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 'var(--w-font-sm)' }}>启用</span>
                <Switch checked={selectedForm.enabled} loading={save.isPending} onChange={(v) => toggleEnabled(selected, v)} />
                {selectedForm.enabled && (
                  <>
                    <span style={{ fontSize: 'var(--w-font-sm)' }}>跑用例</span>
                    <Switch checked={selectedForm.case_execution_use} loading={save.isPending} onChange={(v) => toggleCase(selected, v)} />
                  </>
                )}
              </div>
              <div className="grid" style={{ gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))' }}>
                <Field label="API Key">
                  {selected.configured && selected.api_key_masked ? (
                    <div style={{ fontFamily: 'var(--w-font-mono)', fontSize: 'var(--w-font-sm)', marginBottom: 4 }}>{selected.api_key_masked}</div>
                  ) : null}
                  <Input.Password
                    value={selectedForm.api_key}
                    placeholder={selected.configured ? '留空则不修改' : '粘贴 API Key'}
                    autoComplete="new-password"
                    onChange={(e) => patchForm(selected.id, { api_key: e.target.value, clear_key: false })}
                  />
                </Field>
                <Field label="Base URL">
                  <Input value={selectedForm.base_url} onChange={(e) => patchForm(selected.id, { base_url: e.target.value })} />
                </Field>
                <Field label={selected.id === 'volcengine' ? '默认模型 / 接入点' : '默认模型'}>
                  <Select
                    showSearch
                    value={selectedForm.model || undefined}
                    options={selectedForm.model_options.map((m) => ({ value: m, label: m }))}
                    onChange={(v) => patchForm(selected.id, { model: v })}
                    style={{ width: '100%' }}
                  />
                </Field>
                <Ratio label="Plan 压缩" value={selectedForm.plan_compress_ratio} onChange={(v) => patchForm(selected.id, { plan_compress_ratio: v })} />
                <Ratio label="Web 压缩" value={selectedForm.web_compress_ratio} onChange={(v) => patchForm(selected.id, { web_compress_ratio: v })} />
                <Ratio label="安卓压缩" value={selectedForm.android_compress_ratio} onChange={(v) => patchForm(selected.id, { android_compress_ratio: v })} />
              </div>
              <div className="flex gap-2" style={{ marginTop: 16 }}>
                <Button type="primary" loading={save.isPending} onClick={() => save.mutate({ id: selected.id, form: selectedForm })}>保存配置</Button>
                {selected.configured && (
                  <Button
                    loading={save.isPending}
                    onClick={() => save.mutate({
                      id: selected.id,
                      form: { ...selectedForm, api_key: '', clear_key: true, enabled: false, case_execution_use: false },
                    })}
                  >
                    清除 Key
                  </Button>
                )}
                {!(PRESET_PROVIDER_IDS as readonly string[]).includes(selected.id) && (
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
      <InputNumber min={1} max={10} step={0.1} value={value} onChange={(v) => onChange(roundRatio(v, value))} style={{ width: '100%' }} />
    </Field>
  )
}

const card: CSSProperties = {
  background: 'var(--w-surface)',
  border: '1px solid var(--w-border)',
  borderRadius: 'var(--w-radius-lg)',
  padding: 'var(--w-space-4)',
}
