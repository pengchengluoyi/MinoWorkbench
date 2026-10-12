import { useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Play, Trash2, X } from 'lucide-react'
import { Button, Select, Tooltip, errText, useFeedback } from '@/ui'
import { getProjectEnv } from '@/api/projectEnv'
import { runCaseRunner, isExecutable } from '@/api/run'
import { unwrapOne } from '@/lib/unwrap'
import { normalizeEnvDoc, channelTitle } from '../config/envModel'
import { useRunDevices } from './queries'
import { DeviceSelect } from './DeviceSelect'

export interface DispatchedRun {
  runId: string
  caseCount: number
}

/**
 * 选中用例后的浮动操作条。
 *
 * 设计要点（docs/交互设计.md §二）：
 * 1. 主动作常驻视野 —— 选中就浮出来，不藏在二级入口
 * 2. **前置校验前移** —— 没在线设备就禁用并写明原因，不让人点一下再报错
 * 3. 下发后**不跳页** —— 把 run_id 回调给面板就地展示进度
 */
const FALLBACK_ENVS = [
  { key: 'test', label: '测试' },
  { key: 'pre', label: '预发' },
  { key: 'prod', label: '正式' },
]

export function RunBar({
  appId,
  projectId,
  selected,
  onClear,
  onDispatched,
  onDelete,
  deleting,
}: {
  appId: string
  projectId: string
  selected: string[]
  onClear: () => void
  onDispatched: (run: DispatchedRun) => void
  onDelete?: () => void
  deleting?: boolean
}) {
  const fb = useFeedback()
  const [sn, setSn] = useState<string>('')
  const [profile, setProfile] = useState('')
  const [surface, setSurface] = useState('')
  const [scheme, setScheme] = useState<'visual' | 'dom'>('visual')
  const env = useQuery({
    queryKey: ['project', projectId, 'env'],
    enabled: !!projectId && selected.length > 0,
    queryFn: async () => normalizeEnvDoc(unwrapOne(await getProjectEnv(projectId))),
  })
  const environments = env.data?.environments?.length ? env.data.environments : FALLBACK_ENVS
  useEffect(() => {
    const keys = environments.map((item) => item.key)
    setProfile((cur) => (cur && keys.includes(cur) ? cur : env.data?.default_profile || keys[0] || 'test'))
  }, [env.data, environments])

  const deviceQuery = useRunDevices(selected.length > 0, { app_id: appId, env_surface: surface, env_profile: profile, action_scheme: scheme })
  const devices = deviceQuery.data || []
  const devicesLoading = deviceQuery.isLoading
  const effectiveSn = sn
  const device = devices.find((item) => item.sn === effectiveSn)
  const blockReason = devicesLoading ? '正在查询设备…'
    : deviceQuery.isError ? errText(deviceQuery.error, '设备信息读取失败')
      : !device ? devices.some(isExecutable) ? '请选择执行设备' : '没有兼容且就绪的设备，请查看设备列表中的原因'
        : !isExecutable(device) ? device.blocked_reason || '所选设备未就绪'
        : ''

  const dispatch = useMutation({
    mutationFn: async () => {
      if (blockReason) throw new Error(blockReason)
      const device = devices.find((d) => d.sn === effectiveSn)
      const res = await runCaseRunner({
        app_id: appId,
        case_ids: selected,
        sn: effectiveSn,
        sns: effectiveSn ? [effectiveSn] : [],
        platform: device?.platform || device?.type || undefined,
        env_profile: profile || undefined,
        env_surface: surface || undefined,
        action_scheme: scheme,
        run_type: 'manual',
      })
      const runId = res?.data?.run_id || res?.data?.task_id
      if (!runId) throw new Error('Nexus 没有返回 run_id，无法跟踪这次执行')
      return runId
    },
    onSuccess: (runId) => {
      onDispatched({ runId, caseCount: selected.length })
      fb.ok(`已下发 ${selected.length} 条用例`)
    },
    // 失败不清空已选，用户可以直接重试
    onError: (e) => fb.fail(errText(e, '下发失败')),
  })

  if (!selected.length) return null

  return (
    <div
      className="flex items-center gap-3 flex-wrap"
      style={{
        position: 'sticky',
        bottom: 'var(--w-space-3)',
        alignSelf: 'center',
        width: 'fit-content',
        maxWidth: '100%',
        padding: '8px 10px 8px 16px',
        borderRadius: 'var(--w-radius-lg)',
        background: 'var(--w-text)',
        color: 'var(--w-text-inverse)',
        boxShadow: 'var(--w-shadow-lg)',
        zIndex: 10,
      }}
    >
      <span style={{ fontSize: 'var(--w-font-sm)', fontWeight: 700, whiteSpace: 'nowrap' }}>
        已选 {selected.length} 条
      </span>

      <span aria-hidden style={{ width: 1, height: 16, background: 'rgba(255,255,255,.22)' }} />

      <DeviceSelect devices={devices} value={effectiveSn} onChange={setSn} loading={devicesLoading}
        refreshing={deviceQuery.isFetching} onRefresh={() => void deviceQuery.refetch()} compact />

      <Field label="被测渠道">
        <Select size="small" value={surface || undefined} onChange={setSurface} placeholder="选择应用渠道"
          options={(env.data?.channels || []).map((channel) => ({ value: channel.id, label: channelTitle(channel) }))}
          loading={env.isLoading} style={{ width: 130 }} />
      </Field>
      {deviceQuery.isError ? <Button size="small" onClick={() => void deviceQuery.refetch()}>重试设备查询</Button> : null}

      <Field label="环境">
        <Select
          size="small"
          value={profile || undefined}
          onChange={setProfile}
          options={environments.map((item) => ({ value: item.key, label: item.label }))}
          loading={env.isLoading}
          style={{ width: 88 }}
          popupMatchSelectWidth={false}
        />
      </Field>

      <Field label="执行方案">
        <Select
          size="small"
          value={scheme}
          onChange={setScheme}
          options={[
            { value: 'visual', label: '看图' },
            { value: 'dom', label: 'DOM' },
          ]}
          style={{ width: 88 }}
          popupMatchSelectWidth={false}
        />
      </Field>

      <Tooltip title={blockReason || undefined}>
        <Button
          type="primary"
          size="small"
          icon={<Play size={13} />}
          loading={dispatch.isPending}
          disabled={!!blockReason}
          onClick={() => dispatch.mutate()}
        >
          下发执行
        </Button>
      </Tooltip>

      {onDelete ? (
        <Button
          type="text"
          size="small"
          icon={<Trash2 size={14} />}
          loading={deleting}
          onClick={onDelete}
          style={{ color: '#fecaca' }}
        >
          删除
        </Button>
      ) : null}

      <Button
        type="text"
        size="small"
        icon={<X size={14} />}
        onClick={onClear}
        style={{ color: 'rgba(255,255,255,.65)' }}
        aria-label="取消选择"
      />
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.72)', whiteSpace: 'nowrap' }}>{label}</span>
      {children}
    </span>
  )
}
