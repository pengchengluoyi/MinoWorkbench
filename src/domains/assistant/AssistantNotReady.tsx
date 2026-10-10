import { TriangleAlert } from 'lucide-react'
import { Button, EmptyState, errText } from '@/ui'
import { isAssistantNotReady } from '@/api/assistant'

/**
 * 查询失败的统一呈现：后端还没上线（404 等）和真出错分开说，都不白屏。
 */
export function QueryProblem({ error, onRetry, what }: { error: unknown; onRetry?: () => void; what: string }) {
  const notReady = isAssistantNotReady(error)
  return (
    <EmptyState
      icon={<TriangleAlert size={28} strokeWidth={1.5} style={{ color: notReady ? 'var(--w-warn)' : 'var(--w-fail)' }} />}
      title={notReady ? '助手服务尚未就绪' : `读取${what}失败`}
      hint={notReady ? 'Nexus 还没有提供助手接口（可能尚未升级）。升级后刷新即可。' : errText(error, '确认 Nexus 可达。')}
      action={onRetry ? <Button size="small" onClick={onRetry}>重试</Button> : undefined}
    />
  )
}
