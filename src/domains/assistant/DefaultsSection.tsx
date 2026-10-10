import { Select, Skeleton, Switch, errText, useFeedback } from '@/ui'
import type { ProfilePatch } from '@/api/assistant'
import { useAppOptions, useAssistantMutations, useAssistantProfile, useDeviceOptions } from './queries'
import { QueryProblem } from './AssistantNotReady'

/** 我的默认值：一句话里没说应用/设备时用这里的。改完即存。 */
export function DefaultsSection() {
  const fb = useFeedback()
  const profile = useAssistantProfile()
  const apps = useAppOptions()
  const devices = useDeviceOptions()
  const { saveProfile } = useAssistantMutations()

  if (profile.isLoading) return <Skeleton active paragraph={{ rows: 3 }} title={{ width: 120 }} />
  if (profile.isError) {
    return <div className="w-surface-card"><QueryProblem error={profile.error} what="默认值" onRetry={() => void profile.refetch()} /></div>
  }
  const p = profile.data!

  const patch = (body: ProfilePatch, okText: string) =>
    saveProfile.mutate(body, { onSuccess: () => fb.ok(okText), onError: (e) => fb.fail(errText(e, '保存失败')) })

  // 已存的默认值不在候选里（应用被删 / 设备离线未列出）时仍要能看到当前值
  const appOpts = [...(apps.data ?? [])]
  if (p.default_app_id && !appOpts.some((o) => o.value === p.default_app_id)) {
    appOpts.unshift({ value: p.default_app_id, label: p.default_app_name || p.default_app_id })
  }
  const devOpts = (devices.data ?? []).map((d) => ({ value: d.value, label: `${d.label}${d.online ? '' : '（离线）'}` }))
  if (p.default_sn && !devOpts.some((o) => o.value === p.default_sn)) {
    devOpts.unshift({ value: p.default_sn, label: `${p.default_device_name || p.default_sn}（未在设备列表）` })
  }

  const row = (label: string, hint: string, control: React.ReactNode) => (
    <div className="flex flex-wrap items-center gap-3" style={{ padding: '8px 0', borderTop: '1px solid var(--w-border)' }}>
      <div style={{ width: 120 }}>
        <div style={{ fontWeight: 650, fontSize: 'var(--w-font-base)' }}>{label}</div>
        <div style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)' }}>{hint}</div>
      </div>
      {control}
    </div>
  )

  return (
    <section className="w-surface-card" style={{ padding: 14 }}>
      <h3 style={{ margin: 0, fontSize: 'var(--w-font-title)' }}>我的默认值</h3>
      <p style={{ margin: '4px 0 10px', fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)' }}>
        你说「跑一下支付登录」没指明应用和设备时，助手用这里的。修改后立即保存。
      </p>
      {row('默认应用', '未指明应用时使用', (
        <Select
          style={{ width: 320, maxWidth: '100%' }}
          showSearch
          optionFilterProp="label"
          loading={apps.isLoading}
          disabled={saveProfile.isPending}
          placeholder={apps.isError ? '应用列表读取失败' : '选择默认应用'}
          value={p.default_app_id || undefined}
          options={appOpts}
          onChange={(v: string) => patch({ default_app_id: v }, '默认应用已更新')}
        />
      ))}
      {row('默认设备', '未指明设备时使用', (
        <Select
          style={{ width: 320, maxWidth: '100%' }}
          showSearch
          optionFilterProp="label"
          loading={devices.isLoading}
          disabled={saveProfile.isPending}
          placeholder={devices.isError ? '设备列表读取失败' : '选择默认设备'}
          value={p.default_sn || undefined}
          options={devOpts}
          onChange={(v: string) => patch({ default_sn: v }, '默认设备已更新')}
        />
      ))}
      {row('启用助手', '关闭后 IM 和 MCP 都不再响应你', (
        <Switch
          checked={p.enabled}
          loading={saveProfile.isPending}
          onChange={(v: boolean) => patch({ enabled: v }, v ? '助手已启用' : '助手已停用')}
          aria-label="启用助手"
        />
      ))}
    </section>
  )
}
