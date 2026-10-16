import { useMemo, useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Smartphone, TriangleAlert } from 'lucide-react'
import { Alert, Button, EmptyState, Input, Skeleton, StatusPill, Tooltip, errText, useFeedback } from '@/ui'
import { listDevices, setAdbKeyboard, setDevicePassword, type DeviceRow } from '@/api/device'

import { nodeIsOnline } from '@/api/nodes'
import { useNodes } from '@/domains/settings/nodes/queries'
import { useSession } from '@/lib/session'

const deviceKeys = { get all() { return ['account', useSession.getState().user?.user_id || '', 'devices'] as const } }

const isOnline = (d: DeviceRow | undefined) => String(d?.status || '').toLowerCase() === 'online'

const isAndroid = (d: DeviceRow | undefined) => {
  const t = String(d?.type || d?.platform || '').toLowerCase()
  return t.includes('android') || t === 'mobile'
}

const typeLabel = (d: DeviceRow) => {
  const t = String(d.type || d.platform || '').toLowerCase()
  if (t.includes('android')) return 'Android'
  if (t.includes('ios')) return 'iOS'
  if (t.includes('web')) return 'Web'
  if (['desktop', 'pc', 'win', 'windows', 'mac', 'macos', 'linux'].includes(t)) return `PC 桌面 · ${d.os || t}`
  return d.type || d.platform || '未知类型'
}

const relativeTime = (raw?: string) => {
  if (!raw) return '暂无数据'
  const t = Date.parse(raw)
  if (Number.isNaN(t)) return raw
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (sec < 60) return `${sec} 秒前`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} 分钟前`
  const hr = Math.round(min / 60)
  if (hr < 48) return `${hr} 小时前`
  return raw
}

/**
 * 单台设备：在线状态、锁屏密码、Android 输入法。
 * 从 Scout 节点页的设备行进来，返回仍回到节点页。
 */
export function DeviceDetailPage() {
  const { sn = '' } = useParams()
  const [params] = useSearchParams()
  const routeSn = params.get('device') || sn
  const returnNode = params.get('node') || ''
  const navigate = useNavigate()
  const feedback = useFeedback()
  const qc = useQueryClient()
  const [password, setPassword] = useState('')

  const list = useQuery({
    queryKey: deviceKeys.all,
    queryFn: listDevices,
  })

  const nodes = useNodes()
  const origin = nodes.data?.find(node => node.node_id === returnNode)
  const reported = origin?.devices?.find(device => device.sn === routeSn && device.node_id === returnNode && (!device.current_scout_id || device.current_scout_id === returnNode))
  const matches = useMemo(() => (list.data || []).filter(device => device.sn === routeSn), [list.data, routeSn])
  const scoped = returnNode ? matches.filter(device => device.current_scout_id === returnNode || device.node_id === returnNode) : matches
  const catalogDevice = scoped.length === 1 ? scoped[0] : matches.length === 1 && !matches[0].current_scout_id && !matches[0].node_id ? matches[0] : undefined
  const device: DeviceRow | undefined = catalogDevice || reported
  const reportOnly = !!reported && !catalogDevice
  const ambiguous = matches.length > 1 && scoped.length !== 1
  const moved = !!returnNode && matches.length > 0 && !catalogDevice && !reported
  const catalogAvailable = !!catalogDevice && list.isSuccess
  const canConfigure = catalogAvailable && (isAndroid(device) || String(device?.platform || device?.type || '').toLowerCase().includes('ios'))

  const savePassword = useMutation({
    mutationFn: () => { if (!canConfigure) throw new Error('设备目录信息尚未确认'); return setDevicePassword(device!.sn, password.trim()) },
    onSuccess: async () => {
      setPassword('')
      feedback.ok('密码已保存')
      await qc.invalidateQueries({ queryKey: deviceKeys.all })
    },
    onError: (e) => feedback.fail(errText(e, '保存失败')),
  })

  const ime = useMutation({
    mutationFn: (enabled: boolean) => { if (!canConfigure) throw new Error('设备目录信息尚未确认'); return setAdbKeyboard(device!.sn, enabled) },
    onSuccess: async (msg) => { feedback.ok(msg); await qc.invalidateQueries({ queryKey: deviceKeys.all }) },
    onError: (e) => feedback.fail(errText(e, '操作失败')),
  })

  if (!device && (list.isLoading || (returnNode && nodes.isLoading))) return <Skeleton active paragraph={{ rows: 6 }} title={{ width: 180 }} />

  if (!device && (list.isError || (returnNode && nodes.isError))) {
    return (
      <EmptyState
        icon={<TriangleAlert size={28} strokeWidth={1.5} style={{ color: 'var(--w-fail)' }} />}
        title="读不到设备列表"
        hint={errText(list.error || nodes.error)}
        action={<Button size="small" onClick={() => { void list.refetch(); void nodes.refetch() }}>重试</Button>}
      />
    )
  }

  if (!device) {
    return (
      <EmptyState
        title={ambiguous ? "设备身份需要确认" : moved ? "设备归属需要重新核对" : "设备不存在或已移除"}
        hint={ambiguous ? `发现多个相同序列号 ${routeSn}，请从所属节点重新进入。` : moved ? `设备 ${routeSn} 已出现在设备目录中，但不能确认仍属于当前节点；请刷新节点列表。` : `设备 ${routeSn} 未出现在当前账号设备目录或来源节点的上报中。`}
        action={(
          <Button size="small" icon={<ArrowLeft size={13} />} onClick={() => navigate(`/settings/runtime${returnNode ? `?node=${encodeURIComponent(returnNode)}&pane=overview` : ''}`)}>
            返回节点
          </Button>
        )}
      />
    )
  }

  const online = catalogAvailable ? isOnline(device) : !!(origin && nodeIsOnline(origin) && reported?.node_alive === true && ['online', 'connected', 'available'].includes(String(reported?.status || '').toLowerCase()))
  const knownOffline = device.status === 'offline' || reported?.node_alive === false || !!(origin && !nodeIsOnline(origin))

  return (
    <div className="w-workspace flex h-full min-h-0 flex-col overflow-y-auto" style={{ gap: 'var(--w-space-3)' }}>
      <header className="flex items-center gap-3">
        <Button
          size="small"
          type="text"
          icon={<ArrowLeft size={15} />}
          onClick={() => navigate(`/settings/runtime${returnNode ? `?node=${encodeURIComponent(returnNode)}&pane=overview` : ''}`)}
          aria-label="返回节点"
        />
        <Smartphone size={18} strokeWidth={1.7} />
        <strong className="min-w-0" style={{ overflowWrap: 'anywhere', fontSize: 'var(--w-font-h2)', fontWeight: 700 }}>{device.sn}</strong>
        <StatusPill status={online ? 'pass' : 'muted'}>{online ? '在线' : knownOffline ? '离线' : '连接状态未上报'}</StatusPill>
        <Button size="small" style={{ marginLeft: 'auto' }} onClick={() => { void list.refetch(); void nodes.refetch() }}>刷新</Button>
      </header>

      {reportOnly && <Alert type="info" showIcon message="节点已上报此设备，设备目录详情暂未同步" description="当前展示所属节点的设备信息；目录同步前不提供密码与输入法修改。" />}
      {device && list.isError && <Alert type="warning" message="设备目录读取失败，以下保留已知信息" description={errText(list.error)} />}
      {origin && !nodeIsOnline(origin) && <Alert type="warning" message="来源节点当前未确认在线，下方可能是最后已知信息" />}
      <section className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--w-space-3)' }}>
        <Stat label="类型" value={typeLabel(device)} />
        <Stat label="型号" value={device.model || '未上报'} />
        <Stat label="所属节点" value={String(device.current_scout_id || device.node_id || returnNode || '未上报')} />
        <Stat label="执行状态" value={String(device.blocked_reason || (device.executable === true ? '可执行' : device.desktop_state || '未上报'))} />
        <Stat label="最后在线" value={relativeTime(device.last_online)} />
      </section>

      {canConfigure && <section style={card}>
        <h2 style={heading}>锁屏密码</h2>
        <p style={hint}>
          {device.password_configured ? '已经配置过。再填一次会覆盖，留空不会改。' : '还没配置。跑批遇到锁屏时会用这里的密码。'}
        </p>
        <div className="flex items-center gap-2">
          <Input.Password
            value={password}
            placeholder={device.password_configured ? '输入新密码以覆盖' : '锁屏密码'}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            type="primary"
            loading={savePassword.isPending}
            onClick={() => {
              if (!password.trim()) {
                feedback.warn('请填写锁屏密码')
                return
              }
              savePassword.mutate()
            }}
          >
            保存
          </Button>
        </div>
      </section>}

      {canConfigure && isAndroid(device) && (
        <section style={card}>
          <h2 style={heading}>Android 输入法</h2>
          <p style={hint}>跑批时启用 ADB Keyboard。手动点验时恢复系统输入法。设备离线时这两个操作不可用。</p>
          <div className="flex gap-2">
            <Tooltip title={online ? '' : '设备离线，等它上线再切输入法'}>
              <span>
                <Button type="primary" disabled={!online} loading={ime.isPending} onClick={() => ime.mutate(true)}>
                  启用 ADB Keyboard
                </Button>
              </span>
            </Tooltip>
            <Button disabled={!online} loading={ime.isPending} onClick={() => ime.mutate(false)}>
              恢复系统输入法
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)', fontWeight: 700 }}>{label}</div>
      <div style={{ marginTop: 4, fontWeight: 650 }}>{value}</div>
    </div>
  )
}

const card: CSSProperties = {
  background: 'var(--w-surface)',
  border: '1px solid var(--w-border)',
  borderRadius: 'var(--w-radius-lg)',
  padding: 'var(--w-space-4)',
}

const heading: CSSProperties = {
  margin: 0,
  fontSize: 'var(--w-font-title)',
  fontWeight: 700,
}

const hint: CSSProperties = {
  margin: '6px 0 12px',
  fontSize: 'var(--w-font-sm)',
  color: 'var(--w-text-tertiary)',
}
