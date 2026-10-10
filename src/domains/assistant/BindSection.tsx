import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, EmptyState, Popconfirm, Skeleton, errText, useFeedback } from '@/ui'
import type { AssistantIdentity } from '@/api/assistant'
import { channelLabel, fmtTime } from './format'
import { useAssistantMutations, useIdentities } from './queries'
import { QueryProblem } from './AssistantNotReady'
import { CopyButton } from './CopyButton'

/** 绑定 IM：生成 6 位码 → 在 IM 里发 /绑定 码。已绑定的可解绑。 */
export function BindSection() {
  const fb = useFeedback()
  const m = useAssistantMutations()
  const ids = useIdentities()
  const [issued, setIssued] = useState<{ code: string; expiresAt: number } | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!issued) return undefined
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [issued])

  const left = issued ? Math.max(0, Math.ceil((issued.expiresAt - now) / 1000)) : 0
  const expired = !!issued && left === 0

  const gen = () => m.bindCode.mutate(undefined, {
    onSuccess: (d) => { setNow(Date.now()); setIssued({ code: d.code, expiresAt: Date.now() + d.expires_in * 1000 }) },
    onError: (e) => fb.fail(errText(e, '生成绑定码失败')),
  })

  return (
    <section className="w-surface-card" style={{ padding: 14 }}>
      <h3 style={{ margin: 0, fontSize: 'var(--w-font-title)' }}>认领我的 IM 账号</h3>
      <p style={{ margin: '4px 0 10px', fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)' }}>
        这一步不是登录机器人。机器人要先在 <Link to="/settings/runtime">Scout 节点 → 接入 → 对话</Link> 扫码登录。然后在这里生成绑定码，到已经在线的机器人里发送，Nexus 才知道这条微信是你。
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="primary" loading={m.bindCode.isPending} onClick={gen}>{issued ? '重新生成绑定码' : '生成绑定码'}</Button>
        {issued ? (
          <>
            <span className="w-mono" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '0.15em', color: expired ? 'var(--w-text-quaternary)' : 'var(--w-text)', textDecoration: expired ? 'line-through' : 'none' }}>
              {issued.code}
            </span>
            <span style={{ fontSize: 'var(--w-font-sm)', fontWeight: 650, color: expired ? 'var(--w-fail)' : 'var(--w-text-tertiary)' }}>
              {expired ? '已过期，请重新生成' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} 后过期`}
            </span>
            {!expired ? <CopyButton text={`/绑定 ${issued.code}`} label="复制指令" /> : null}
          </>
        ) : null}
      </div>
      {issued && !expired ? (
        <div style={{ marginTop: 8, fontSize: 'var(--w-font-sm)', color: 'var(--w-text-secondary)' }}>
          在 IM 里对机器人发送：<code className="w-mono">/绑定 {issued.code}</code>
        </div>
      ) : null}

      <div style={{ marginTop: 16, fontSize: 'var(--w-font-sm)', fontWeight: 700 }}>已绑定渠道</div>
      {ids.isLoading ? <Skeleton active paragraph={{ rows: 2 }} title={false} /> : ids.isError ? (
        <QueryProblem error={ids.error} what="绑定列表" onRetry={() => void ids.refetch()} />
      ) : !(ids.data ?? []).length ? (
        <EmptyState title="还没有绑定任何 IM" hint="点上面的「生成绑定码」，再到 IM 里发给机器人。" />
      ) : (
        <div style={{ marginTop: 6 }}>
          {(ids.data as AssistantIdentity[]).map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-3" style={{ padding: '8px 0', borderTop: '1px solid var(--w-border)', fontSize: 'var(--w-font-base)' }}>
              <strong style={{ minWidth: 72 }}>{channelLabel(i.channel)}</strong>
              <span className="w-mono">{i.sender_id_masked}</span>
              {i.tenant ? <span style={{ color: 'var(--w-text-tertiary)' }}>{i.tenant}</span> : null}
              <span style={{ color: 'var(--w-text-quaternary)', fontSize: 'var(--w-font-sm)' }}>绑定于 {fmtTime(i.bound_at)}</span>
              <span style={{ flex: 1 }} />
              <Popconfirm
                title="解除这个绑定？"
                description="解绑后该账号在 IM 里发的话不再以你的身份执行。"
                okText="解绑"
                okButtonProps={{ danger: true }}
                onConfirm={() => m.unbind.mutateAsync(i.id).then(() => fb.ok('已解绑')).catch((e) => fb.fail(errText(e, '解绑失败')))}
              >
                <Button size="small" danger loading={m.unbind.isPending && m.unbind.variables === i.id}>解绑</Button>
              </Popconfirm>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
