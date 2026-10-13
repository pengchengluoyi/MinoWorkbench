import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, Select, Skeleton, useFeedback, errText } from '@/ui'
import { getAssistantMediaSettings, putAssistantMediaSettings } from '@/api/assistant'
import { assistantKeys } from './queries'
import { QueryProblem } from './AssistantNotReady'

export function MediaSettings() {
  const qc = useQueryClient()
  const feedback = useFeedback()
  const query = useQuery({ queryKey: [...assistantKeys.all, 'media-settings'], queryFn: getAssistantMediaSettings })
  const [draft, setDraft] = useState<{ asr_provider_id: string; asr_model: string } | null>(null)
  const update = useMutation({ mutationFn: putAssistantMediaSettings,
    onSuccess: () => { setDraft(null); void qc.invalidateQueries({ queryKey: [...assistantKeys.all, 'media-settings'] }) },
    onError: (error) => feedback.fail(errText(error)),
  })
  const settings = draft || query.data || { asr_provider_id: '', asr_model: '' }
  return <section className="w-surface-card" style={{ padding: 18 }}>
    <strong>图片与语音</strong>
    <p style={{ color: 'var(--w-text-tertiary)', fontSize: 13 }}>图片识别使用当前账号的视觉模型。语音需要支持转写的模型；附件由 Scout 本地保留，识别失败时可以直接改用文字。</p>
    {query.isLoading ? <Skeleton active paragraph={{ rows: 2 }} /> : query.isError ? <QueryProblem error={query.error} what="语音设置" onRetry={() => void query.refetch()} /> : <div className="flex flex-wrap items-end gap-3">
      <label>语音服务<Select aria-label="语音服务" style={{ display: 'block', width: 200, marginTop: 6 }} placeholder="选择已配置的服务" value={settings.asr_provider_id || undefined} options={(query.data?.providers || []).filter((provider) => provider.configured).map((provider) => ({ label: provider.name, value: provider.id }))} onChange={(value) => setDraft({ asr_provider_id: value, asr_model: settings.asr_model })} /></label>
      <label>转写模型<Input aria-label="转写模型" style={{ display: 'block', width: 240, marginTop: 6 }} value={settings.asr_model} placeholder="服务支持的语音转文字模型 ID" onChange={(event) => setDraft({ asr_provider_id: settings.asr_provider_id, asr_model: event.target.value })} /></label>
      <Button type="primary" disabled={!draft || !settings.asr_provider_id || !settings.asr_model.trim()} loading={update.isPending} onClick={() => update.mutate({ asr_provider_id: settings.asr_provider_id, asr_model: settings.asr_model.trim() })}>保存语音设置</Button>
      {query.data?.asr_provider_id ? <Button disabled={update.isPending} onClick={() => update.mutate({ asr_provider_id: '', asr_model: '' })}>停用语音转写</Button> : null}
    </div>}
  </section>
}
