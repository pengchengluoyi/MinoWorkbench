import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, FormField, FormSection, Input, Select, Skeleton, errText } from '@/ui'
import { getLoginEvidencePolicy, saveLoginEvidencePolicy, type LoginEvidencePolicy } from '@/api/loginEvidencePolicy'
import { unwrapOne } from '@/lib/unwrap'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'

const INITIAL: LoginEvidencePolicy = { mode: 'ui_identity', env_profiles: [], env_surfaces: [], authenticated_content_hint: '', logout_navigation_hint: '' }
const split = (text: string) => [...new Set(text.split(/[,，]/).map(s => s.trim()).filter(Boolean))].sort()
export function LoginEvidencePolicyPanel({ appId }: { appId: string }) {
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['login-evidence-policy', appId], enabled: !!appId, queryFn: async () => unwrapOne<{ policy: LoginEvidencePolicy }>(await getLoginEvidencePolicy(appId)).policy })
  const [draft, setDraft] = useState(INITIAL)
  const [profiles, setProfiles] = useState('')
  const [surfaces, setSurfaces] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const baseline = useRef<LoginEvidencePolicy | null>(null)
  const touched = useRef(false)
  const value = { ...draft, env_profiles: split(profiles), env_surfaces: split(surfaces) }
  const dirty = !!baseline.current && JSON.stringify(value) !== JSON.stringify(baseline.current)
  touched.current = dirty
  useUnsavedChanges(dirty)
  useEffect(() => {
    baseline.current = null; touched.current = false; setDraft(INITIAL); setProfiles(''); setSurfaces(''); setNotice('')
  }, [appId])
  useEffect(() => {
    if (!query.data || touched.current) return
    baseline.current = query.data; setDraft(query.data)
    setProfiles(query.data.env_profiles.join(', ')); setSurfaces(query.data.env_surfaces.join(', '))
  }, [query.data])
  async function save() {
    if (!baseline.current) return
    setBusy(true); setNotice('')
    try {
      const result = unwrapOne<{ policy: LoginEvidencePolicy }>(await saveLoginEvidencePolicy(appId, value, baseline.current))
      baseline.current = result.policy; touched.current = false; setDraft(result.policy)
      setProfiles(result.policy.env_profiles.join(', ')); setSurfaces(result.policy.env_surfaces.join(', '))
      await qc.invalidateQueries({ queryKey: ['login-evidence-policy', appId] })
      setNotice('已保存，新任务生效。')
    } catch (error) { setNotice(errText(error, '保存失败，请重新读取配置。')) }
    finally { setBusy(false) }
  }
  if (query.isPending) return <Skeleton active />
  return <div className="w-surface-card">
    <FormSection title="应用登录校验" description="配置当前应用的账号绑定依据。登录成功仍需当前页面的正向证据，原业务结果继续独立校验。">
      <FormField label="账号绑定依据"><Select aria-label="账号绑定依据" disabled={busy || query.isError} value={draft.mode} options={[{ value: 'ui_identity', label: '页面身份核验（默认）' }, { value: 'submitted_account', label: '本次提交账号绑定（当前页面身份不可观察）' }]} onChange={mode => setDraft({ ...draft, mode: mode as LoginEvidencePolicy['mode'] })} /></FormField>
      <FormField label="生效环境" hint="环境 ID，多个用逗号分隔；提交绑定模式必须填写。"><Input aria-label="登录校验生效环境" disabled={busy || query.isError} value={profiles} onChange={e => setProfiles(e.target.value)} /></FormField>
      <FormField label="生效渠道" hint="渠道 ID，多个用逗号分隔；仅这些渠道使用该配置。"><Input aria-label="登录校验生效渠道" disabled={busy || query.isError} value={surfaces} onChange={e => setSurfaces(e.target.value)} /></FormField>
      <FormField label="登录专属页面说明" hint="描述仅在登录成功后出现的页面特征，留空则只依赖已有应用知识；实际截图必须与说明相符。"><Input aria-label="登录专属页面说明" disabled={busy || query.isError} maxLength={1200} value={draft.authenticated_content_hint || ''} onChange={e => setDraft({ ...draft, authenticated_content_hint: e.target.value })} /></FormField>
      <FormField label="退出登录导航说明" hint="填写本应用的退出入口与路径；仅在上述环境和渠道、提交绑定模式、前置要求登录且当前账号身份未知时，先退出再使用本次账号完整登录。留空则不自动退出。"><Input aria-label="退出登录导航说明" disabled={busy || query.isError} maxLength={1200} value={draft.logout_navigation_hint || ''} onChange={e => setDraft({ ...draft, logout_navigation_hint: e.target.value })} /></FormField>
      {draft.mode === 'submitted_account' && <p>仅绑定本次实际填写并提交的账号；页面身份保持未知。账号冲突、缺少提交证据或缺少页面登录证据时仍阻断。</p>}
      <Button disabled={busy || !dirty || query.isError || (draft.mode === 'submitted_account' && (!value.env_profiles.length || !value.env_surfaces.length))} onClick={() => void save()}>保存登录校验配置</Button>
      <Button disabled={busy} onClick={() => { touched.current = false; void query.refetch().then(result => { if (result.data) { baseline.current = result.data; setDraft(result.data); setProfiles(result.data.env_profiles.join(', ')); setSurfaces(result.data.env_surfaces.join(', ')) } }) }}>重新读取</Button>
      {(notice || query.isError) && <p role="status">{notice || errText(query.error, '读取失败')}</p>}
    </FormSection>
  </div>
}
