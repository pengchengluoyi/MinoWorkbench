import { useSession } from '@/lib/session'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getNodeLogs, getScoutRelease, listRuntimeNodes, releaseTargetOf, sendNodeCommand,
  createNodeInstallation, getNodeInstallationStatus, claimLegacyNode,
  type NodeCommand, type ScoutNode, type ScoutRelease,
  type NodeInstallation, type NodeInstallationStatus,
} from '@/api/nodes'
import { unwrapList, unwrapOne } from '@/lib/unwrap'
import { assistantKeys } from '@/domains/assistant/queries'

export const nodeKeys = {
  get all() { return ['account', useSession.getState().user?.user_id || '', 'runtime', 'nodes'] as const },
  logs: (id: string, lines: number) => ['account', useSession.getState().user?.user_id || '', 'runtime', 'nodes', id, 'logs', lines] as const,
  release: (os: string, arch: string) => ['releases', 'scout', os, arch] as const,
  installation: (id: string) => ['account', useSession.getState().user?.user_id || '', 'runtime', 'node-installation', id] as const,
}

export const useCreateNodeInstallation = () =>
  useMutation({
    retry: false,
    gcTime: 0,
    mutationFn: async (): Promise<NodeInstallation> => {
      const data = unwrapOne<NodeInstallation>(await createNodeInstallation())
      if (!data?.install_id || !data.commands || !data.targets) throw new Error('安装命令返回不完整，请重试')
      return data
    },
  })

export const useNodeInstallationStatus = (installId: string, enabled: boolean) =>
  useQuery({
    queryKey: nodeKeys.installation(installId),
    enabled: enabled && !!installId,
    staleTime: 0,
    retry: false,
    refetchInterval: (query) => query.state.data?.status === 'expired' ? false : 3_000,
    queryFn: async (): Promise<NodeInstallationStatus> => {
      const data = unwrapOne<NodeInstallationStatus>(await getNodeInstallationStatus(installId))
      if (!data?.install_id) throw new Error('安装状态返回不完整')
      return data
    },
  })

/** 平时 15 秒。有节点在下安装包时改成 2 秒，进度才跟得上。 */
export const useNodes = () =>
  useQuery({
    queryKey: nodeKeys.all,
    refetchInterval: (query) => {
      const rows = query.state.data as ScoutNode[] | undefined
      if (rows?.some((n) => n.update_job?.active || n.plugin_job?.active)) return 2_000
      return 15_000
    },
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
    retry: 1,
    staleTime: 30_000,
    refetchInterval: (query) => (query.state.data?.packaging ? 8_000 : false),
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
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: nodeKeys.all })
      void qc.invalidateQueries({ queryKey: assistantKeys.status })
    },
  })
}

export const useClaimLegacyNode = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: claimLegacyNode,
    onSuccess: () => qc.invalidateQueries({ queryKey: nodeKeys.all }),
  })
}
