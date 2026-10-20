import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getCaseAPISettings, getCaseImportSettings, saveCaseAPISettings, saveCaseImportSettings, type CaseAPISettings, type CaseImportSettings } from '@/api/integrations'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { useSession } from '@/lib/session'
import { unwrapOne } from '@/lib/unwrap'
import { Button, EmptyState, Input, InputNumber, PageHeader, Skeleton, Switch, errText, useFeedback } from '@/ui'

export function IntegrationsPage() {
  const owner = useSession(state => state.user?.user_id || '')
  return <Integrations key={owner} owner={owner} />
}

function Integrations({ owner }: { owner: string }) {
  const feedback = useFeedback()
  const cache = useQueryClient()
  const queryKey = ['admin', 'integrations', owner]
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const importKey = ['admin', 'case-import', owner]
  const query = useQuery({ queryKey, refetchOnWindowFocus: false, retry: false, queryFn: async () => {
    const data = unwrapOne<CaseAPISettings>(await getCaseAPISettings())
    if (!data?.base_url) throw new Error('服务端没有返回用例服务地址')
    return data
  } })
  const importQuery = useQuery({
    queryKey: importKey,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async () => unwrapOne<CaseImportSettings>(await getCaseImportSettings()),
  })
  const [importDraft, setImportDraft] = useState<CaseImportSettings | null>(null)
  const value = draft ?? query.data?.base_url ?? ''
  const dirty = draft !== null && draft !== query.data?.base_url
  const importValue = importDraft ?? importQuery.data ?? {}
  const importDirty = importDraft !== null
  useUnsavedChanges(dirty || importDirty)

  const save = async () => {
    setBusy(true); setError('')
    try {
      if (dirty) {
        const data = unwrapOne<CaseAPISettings>(await saveCaseAPISettings(value.trim()))
        if (!data?.base_url) throw new Error('服务端未确认保存结果，请重试读取配置')
        cache.setQueryData(queryKey, data)
        setDraft(null)
      }
      if (importDirty && importDraft) {
        const saved = unwrapOne<CaseImportSettings>(await saveCaseImportSettings(importDraft))
        cache.setQueryData(importKey, saved)
        setImportDraft(null)
      }
      feedback.ok('已保存集成配置')
    } catch (exception) { setError(errText(exception, '保存失败，请检查服务地址')) }
    finally { setBusy(false) }
  }

  return <div className="flex h-full flex-col">
    <PageHeader title="集成配置" subtitle="统一设置外部服务地址。" />
    {query.isPending ? <Skeleton active paragraph={{ rows: 3 }} /> : query.isError ? <EmptyState title="读取集成配置失败"
      hint={errText(query.error)} action={<Button onClick={() => void query.refetch()}>重试</Button>} /> :
      <section aria-label="用例服务 API" className="w-surface-card" style={{ maxWidth: 680, padding: 24 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>用例服务 API</h2>
        <label htmlFor="case-service-base-url">服务地址</label>
        <Input id="case-service-base-url" aria-label="用例服务地址" value={value} disabled={busy} maxLength={500}
          style={{ marginTop: 8 }} onChange={event => { setDraft(event.target.value); setError('') }} onPressEnter={() => { if (!busy && dirty && value.trim()) void save() }} />
        <p style={{ color: 'var(--w-text-tertiary)', lineHeight: 1.6 }}>填写服务根地址，无需添加 /api。所有项目手动导入用例时使用此地址；登录账号仍在各自的 Scout 接入配置中保存。</p>
        {error ? <p role="alert" style={{ color: 'var(--w-fail)' }}>{error}</p> : null}
        <Button type="primary" loading={busy} disabled={(!dirty || !value.trim()) && !importDirty} onClick={() => void save()}>保存</Button>
      </section>}
    {!query.isPending && !importQuery.isPending && !importQuery.isError ? <section aria-label="用例导入编译" className="w-surface-card" style={{ maxWidth: 680, padding: 24, marginTop: 16 }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>用例导入编译</h2>
      <p style={{ color: 'var(--w-text-tertiary)', lineHeight: 1.6 }}>控制表格导入时的步骤编译策略。默认关闭正则兜底，未命中模型的语句记为未映射，避免与意图识别打架。</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>启用目录正则兜底</span>
          <Switch checked={!!importValue.compile_regex_fallback} onChange={(checked) => setImportDraft({ ...importValue, compile_regex_fallback: checked })} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>密钥问题默认阻止提交</span>
          <Switch checked={!!importValue.block_on_step_key_issues_default} onChange={(checked) => setImportDraft({ ...importValue, block_on_step_key_issues_default: checked })} />
        </label>
        <label>
          <span>预览并行条数</span>
          <InputNumber min={1} max={20} style={{ width: 120, marginLeft: 12 }} value={importValue.preview_batch_size ?? 5}
            onChange={(num) => setImportDraft({ ...importValue, preview_batch_size: Number(num) || 5 })} />
        </label>
      </div>
    </section> : null}
  </div>
}
