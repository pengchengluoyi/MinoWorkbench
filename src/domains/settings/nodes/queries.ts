import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getNodeLogs, listRuntimeNodes, sendNodeCommand, type NodeCommand, type ScoutNode } from '@/api/nodes'
import { unwrapList, unwrapOne } from '@/lib/unwrap'

export const nodeKeys = {
  all: ['runtime', 'nodes'] as const,
  logs: (id: string, lines: number) => ['runtime', 'nodes', id, 'logs', lines] as const,
}

/** 节点状态变化快，15 秒刷一次。 */
export const useNodes = () =>
  useQuery({
    queryKey: nodeKeys.all,
    refetchInterval: 15_000,
    queryFn: async () =>
      unwrapList<ScoutNode>(await listRuntimeNodes(), {
        keys: ['nodes', 'executors'],
        label: 'GET /runtime/nodes',
      }),
  })

export const useNodeLogs = (nodeId: string, lines: number, enabled: boolean) =>
  useQuery({
    queryKey: nodeKeys.logs(nodeId, lines),
    enabled: enabled && !!nodeId,
    retry: false,
    queryFn: async (): Promise<string[]> => {
      const res = await getNodeLogs(nodeId, lines)
      const body = unwrapOne<{ lines?: string[]; text?: string }>(res)
      if (Array.isArray(body?.lines)) return body.lines
      if (typeof body?.text === 'string') return body.text.split('\n')
      // 有些实现直接返回字符串
      if (typeof body === 'string') return (body as string).split('\n')
      return []
    },
  })

export const useNodeCommand = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ nodeId, command }: { nodeId: string; command: NodeCommand }) =>
      sendNodeCommand(nodeId, command),
    onSettled: () => { void qc.invalidateQueries({ queryKey: nodeKeys.all }) },
  })
}
