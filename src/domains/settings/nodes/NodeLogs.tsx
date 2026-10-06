import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button, EmptyState, Segmented, Skeleton, Tooltip, errText } from '@/ui'
import { useNodeLogs } from './queries'

/**
 * Scout 日志。
 *
 * Nexus 的 GET /runtime/nodes/:id/logs 是现成接口 —— 纯 Web 下完全可用，
 * 不需要原来那个"打开本机日志文件夹"的 Electron 调用。
 */
export function NodeLogs({ nodeId, embedded = false }: { nodeId: string; embedded?: boolean }) {
  const [lines, setLines] = useState(200)
  const [open, setOpen] = useState(embedded)
  const logs = useNodeLogs(nodeId, lines, open)

  if (!open) {
    return (
      <Button size="small" onClick={() => setOpen(true)}>查看日志</Button>
    )
  }

  return (
    <div className="flex flex-col" style={{ gap: 'var(--w-space-2)', minHeight: 0 }}>
      <div className="flex items-center gap-2">
        <Segmented
          size="small"
          value={String(lines)}
          onChange={(v) => setLines(Number(v))}
          options={[{ value: '100', label: '100 行' }, { value: '200', label: '200 行' }, { value: '1000', label: '1000 行' }]}
        />
        <Tooltip title="刷新">
          <Button size="small" icon={<RefreshCw size={13} />} loading={logs.isFetching} onClick={() => void logs.refetch()} aria-label="刷新日志" />
        </Tooltip>
        <span style={{ flex: 1 }} />
        <Button size="small" type="text" onClick={() => setOpen(false)}>收起</Button>
      </div>

      {logs.isLoading ? (
        <Skeleton active title={false} paragraph={{ rows: 6 }} />
      ) : logs.isError ? (
        <EmptyState title="读取日志失败" hint={errText(logs.error, '节点可能已离线，或 Nexus 没有缓存到它的日志。')} />
      ) : !logs.data?.length ? (
        <EmptyState title="没有日志" hint="Scout 还没有上报日志，或这个节点刚启动。" />
      ) : (
        <pre
          className="w-mono"
          style={{
            margin: 0,
            padding: 'var(--w-space-3)',
            maxHeight: 320,
            overflow: 'auto',
            background: 'var(--w-surface-subtle)',
            border: '1px solid var(--w-border)',
            borderRadius: 'var(--w-radius-sm)',
            fontSize: 'var(--w-font-meta)',
            lineHeight: 1.55,
            color: 'var(--w-text-secondary)',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
        >
          {logs.data.join('\n')}
        </pre>
      )}
    </div>
  )
}
