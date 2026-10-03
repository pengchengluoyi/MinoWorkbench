import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Play, Smartphone, X } from 'lucide-react'
import { Button, Select, Tooltip, errText, useFeedback } from '@/ui'
import { runCaseRunner, type RunDevice } from '@/api/run'

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
export function RunBar({
  appId,
  selected,
  devices,
  devicesLoading,
  onClear,
  onDispatched,
}: {
  appId: string
  selected: string[]
  devices: RunDevice[]
  devicesLoading: boolean
  onClear: () => void
  onDispatched: (run: DispatchedRun) => void
}) {
  const fb = useFeedback()
  const [sn, setSn] = useState<string>('')

  const options = useMemo(
    () => devices.map((d) => ({
      value: d.sn,
      label: `${d.model || d.type || '设备'} · ${d.sn.slice(0, 10)}`,
    })),
    [devices],
  )

  const effectiveSn = sn || devices[0]?.sn || ''

  const blockReason = devicesLoading
    ? '正在查可用设备…'
    : !devices.length
      ? '没有在线设备。请先在设备上启动 Scout 并确认它已连上 Nexus。'
      : ''

  const dispatch = useMutation({
    mutationFn: async () => {
      const device = devices.find((d) => d.sn === effectiveSn)
      const res = await runCaseRunner({
        app_id: appId,
        case_ids: selected,
        sn: effectiveSn,
        sns: effectiveSn ? [effectiveSn] : [],
        platform: device?.platform || device?.type || undefined,
        action_scheme: 'visual',
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
      className="flex items-center gap-3"
      style={{
        position: 'sticky',
        bottom: 'var(--w-space-3)',
        alignSelf: 'center',
        padding: '8px 10px 8px 16px',
        borderRadius: 'var(--w-radius-pill)',
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

      <span className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
        <Smartphone size={13} style={{ opacity: 0.7, flexShrink: 0 }} />
        <Select
          size="small"
          value={effectiveSn || undefined}
          onChange={setSn}
          options={options}
          placeholder="无可用设备"
          disabled={!devices.length}
          loading={devicesLoading}
          style={{ width: 190 }}
          popupMatchSelectWidth={false}
        />
      </span>

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
