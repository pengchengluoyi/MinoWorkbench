import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getNodeLogs, getScoutRelease, listRuntimeNodes, releaseTargetOf, sendNodeCommand,
  type NodeCommand, type ScoutNode, type ScoutRelease,
} from '@/api/nodes'
import { unwrapList, unwrapOne } from '@/lib/unwrap'

export const nodeKeys = {
  all: ['runtime', 'nodes'] as const,
  logs: (id: string, lines: number) => ['runtime', 'nodes', id, 'logs', lines] as const,
  release: (os: string, arch: string) => ['releases', 'scout', os, arch] as const,
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

/**
 * 该平台的 Scout 最新稳定版。用来回答"升级到哪个版本"——
 * 之前只有一个光秃秃的「升级」按钮，用户不知道会升到哪里去。
 */
export const useScoutRelease = (node: ScoutNode | undefined) => {
  const target = node ? releaseTargetOf(node) : { os: '', arch: '' }
  return useQuery({
    queryKey: nodeKeys.release(target.os, target.arch),
    enabled: !!node,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ScoutRelease> =>
      unwrapOne<ScoutRelease>(await getScoutRelease(target.os, target.arch)) || {},
  })
}

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
