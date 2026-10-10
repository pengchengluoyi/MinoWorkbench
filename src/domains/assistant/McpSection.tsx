import { useState } from 'react'
import { Alert, Button, DataTable, Input, Modal, Popconfirm, StatusPill, errText, useFeedback, type DataColumn } from '@/ui'
import { isAssistantNotReady, type McpToken, type McpTokenCreated } from '@/api/assistant'
import { fmtTime } from './format'
import { useAssistantMutations, useAssistantStatus, useMcpTokens } from './queries'
import { QueryProblem } from './AssistantNotReady'
import { CopyButton } from './CopyButton'

export const claudeCmd = (url: string, token: string) =>
  `claude mcp add --transport http mino ${url} --header "Authorization: Bearer ${token}"`

export const jsonSnippet = (url: string, token: string) =>
  JSON.stringify({ mcpServers: { mino: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2)

function Snippet({ title, text }: { title: string; text: string }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 'var(--w-font-sm)', fontWeight: 700 }}>{title}</span>
        <CopyButton text={text} />
      </div>
      <pre className="w-mono" style={{ margin: 0, padding: 10, overflow: 'auto', background: 'var(--w-fill)', borderRadius: 'var(--w-radius-sm)', fontSize: 'var(--w-font-sm)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{text}</pre>
    </div>
  )
}

/** MCP：给 Claude Code / OpenClaw 等客户端接入用的 token。token 只在创建时显示一次。 */
export function McpSection() {
  const fb = useFeedback()
  const q = useMcpTokens()
  const status = useAssistantStatus()
  const { createToken, revokeToken } = useAssistantMutations()
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [created, setCreated] = useState<McpTokenCreated | null>(null)

  const mcpUrl = status.data?.mcp_url || ''

  const submit = () => {
    const n = name.trim()
    if (!n) { fb.warn('先给 token 起个名字，方便以后认出它'); return }
    createToken.mutate(n, {
      onSuccess: (d) => { setNaming(false); setName(''); setCreated(d) },
      onError: (e) => fb.fail(errText(e, '生成失败')),
    })
  }

  const columns: DataColumn<McpToken>[] = [
    { key: 'name', title: '名称', alwaysVisible: true, ellipsis: true, render: (_: unknown, r) => <strong>{r.name}</strong> },
    { key: 'prefix', title: '前缀', width: 140, render: (_: unknown, r) => <span className="w-mono">{r.prefix}…</span> },
    { key: 'created', title: '创建时间', width: 170, render: (_: unknown, r) => <span className="w-mono">{fmtTime(r.created_at)}</span> },
    { key: 'last', title: '最近使用', width: 170, render: (_: unknown, r) => <span className="w-mono">{r.last_used_at ? fmtTime(r.last_used_at) : '从未使用'}</span> },
    { key: 'status', title: '状态', width: 90, render: (_: unknown, r) => <StatusPill status={r.revoked ? 'cancel' : 'pass'}>{r.revoked ? '已吊销' : '有效'}</StatusPill> },
    {
      key: 'op', title: '操作', width: 90, alwaysVisible: true,
      render: (_: unknown, r) => r.revoked ? null : (
        <Popconfirm
          title="吊销这个 token？"
          description="使用它的客户端会立刻失去访问，且不能恢复。"
          okText="吊销"
          okButtonProps={{ danger: true }}
          onConfirm={() => revokeToken.mutateAsync(r.id).then(() => fb.ok('已吊销')).catch((e) => fb.fail(errText(e, '吊销失败')))}
        >
          <Button size="small" type="text" danger>吊销</Button>
        </Popconfirm>
      ),
    },
  ]

  if (q.isError && isAssistantNotReady(q.error)) {
    return <div className="w-surface-card"><QueryProblem error={q.error} what="MCP token" onRetry={() => void q.refetch()} /></div>
  }

  return (
    <div className="flex flex-col" style={{ gap: 'var(--w-space-3)' }}>
      <section className="w-surface-card" style={{ padding: 14 }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 style={{ margin: 0, fontSize: 'var(--w-font-title)' }}>MCP 接入</h3>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)' }}>
              让 Claude Code 等 Agent 直接调用 Mino 的助手工具。端点：<code className="w-mono">{mcpUrl || '未提供'}</code>
            </p>
          </div>
          <Button type="primary" onClick={() => setNaming(true)}>生成 token</Button>
        </div>
      </section>

      <DataTable<McpToken>
        viewId="assistant.mcp-tokens"
        rowKey={(r) => String(r.id)}
        dataSource={q.data}
        loading={q.isLoading}
        error={q.error}
        columns={columns}
        emptyTitle="还没有 MCP token"
        emptyHint="点右上「生成 token」，复制后配到你的 MCP 客户端。"
      />

      <Modal open={naming} title="生成 MCP token" okText="生成" cancelText="取消" confirmLoading={createToken.isPending} onOk={submit} onCancel={() => setNaming(false)} destroyOnHidden>
        <p style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)' }}>起一个能认出用途的名字，例如「我的 Claude Code」。</p>
        <Input autoFocus maxLength={40} value={name} placeholder="token 名称" onChange={(e) => setName(e.target.value)} onPressEnter={submit} />
      </Modal>

      <Modal
        open={!!created}
        title="token 已生成"
        width={640}
        maskClosable={false}
        onCancel={() => setCreated(null)}
        footer={<Button type="primary" onClick={() => setCreated(null)}>我已保存，关闭</Button>}
        destroyOnHidden
      >
        {created ? (
          <>
            <Alert type="warning" showIcon message="这个 token 只显示这一次，关闭后无法再查看。丢了只能吊销重建。" />
            <div className="flex items-center gap-2" style={{ marginTop: 12 }}>
              <Input readOnly value={created.token} className="w-mono" onFocus={(e) => e.target.select()} />
              <CopyButton text={created.token} label="复制 token" />
            </div>
            <Snippet title="Claude Code 命令" text={claudeCmd(created.mcp_url || mcpUrl, created.token)} />
            <Snippet title="JSON 配置（.mcp.json / 其它客户端）" text={jsonSnippet(created.mcp_url || mcpUrl, created.token)} />
          </>
        ) : null}
      </Modal>
    </div>
  )
}
