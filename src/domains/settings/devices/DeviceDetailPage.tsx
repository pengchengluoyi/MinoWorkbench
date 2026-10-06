import { useMemo, useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Smartphone, TriangleAlert } from 'lucide-react'
import { Button, EmptyState, Input, Skeleton, StatusPill, Tooltip, errText, useFeedback } from '@/ui'
import { listDevices, setAdbKeyboard, setDevicePassword, type DeviceRow } from '@/api/device'

const deviceKeys = { all: ['devices'] as const }

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
  const routeSn = decodeURIComponent(sn)
  const navigate = useNavigate()
  const feedback = useFeedback()
  const qc = useQueryClient()
  const [password, setPassword] = useState('')

  const list = useQuery({
    queryKey: deviceKeys.all,
    queryFn: listDevices,
  })

  const device = useMemo(
    () => (list.data || []).find((d) => d.sn === routeSn),
    [list.data, routeSn],
  )

  const savePassword = useMutation({
    mutationFn: () => setDevicePassword(device!.sn, password.trim()),
    onSuccess: async () => {
      setPassword('')
      feedback.ok('密码已保存')
      await qc.invalidateQueries({ queryKey: deviceKeys.all })
    },
    onError: (e) => feedback.fail(errText(e, '保存失败')),
  })

  const ime = useMutation({
    mutationFn: (enabled: boolean) => setAdbKeyboard(device!.sn, enabled),
    onSuccess: (msg) => feedback.ok(msg),
    onError: (e) => feedback.fail(errText(e, '操作失败')),
  })

  if (list.isLoading) return <Skeleton active paragraph={{ rows: 6 }} title={{ width: 180 }} />

  if (list.isError) {
    return (
      <EmptyState
        icon={<TriangleAlert size={28} strokeWidth={1.5} style={{ color: 'var(--w-fail)' }} />}
        title="读不到设备列表"
        hint={errText(list.error)}
        action={<Button size="small" onClick={() => void list.refetch()}>重试</Button>}
      />
    )
  }

  if (!device) {
    return (
      <EmptyState
        title="没有这台设备"
        hint={`序列号 ${routeSn} 不在当前设备列表里。`}
        action={(
          <Button size="small" icon={<ArrowLeft size={13} />} onClick={() => navigate('/settings/runtime')}>
            返回节点
          </Button>
        )}
      />
    )
  }

  const online = isOnline(device)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto" style={{ gap: 'var(--w-space-3)' }}>
      <header className="flex items-center gap-3">
        <Button
          size="small"
          type="text"
          icon={<ArrowLeft size={15} />}
          onClick={() => navigate('/settings/runtime')}
          aria-label="返回节点"
        />
        <Smartphone size={18} strokeWidth={1.7} />
        <strong className="truncate" style={{ fontSize: 'var(--w-font-h2)', fontWeight: 800 }}>{device.sn}</strong>
        <StatusPill status={online ? 'pass' : 'muted'}>{online ? '在线' : '离线'}</StatusPill>
        <Button size="small" style={{ marginLeft: 'auto' }} onClick={() => void list.refetch()}>刷新</Button>
      </header>

      <section className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--w-space-3)' }}>
        <Stat label="类型" value={typeLabel(device)} />
        <Stat label="型号" value={device.model || '暂无数据'} />
        <Stat label="最后在线" value={relativeTime(device.last_online)} />
      </section>

      <section style={card}>
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
      </section>

      {isAndroid(device) && (
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
