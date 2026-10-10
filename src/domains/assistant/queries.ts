import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createBindCode, createMcpToken, deleteIdentity, deleteSubscription, getAssistantProfile, getAssistantStatus,
  getTurn, getTurnMessages, isAssistantNotReady, listIdentities, listMcpTokens, listSubscriptions, listTurns,
  putAssistantProfile, revokeMcpToken, listAssistantTools,
  type ProfilePatch,
} from '@/api/assistant'
import { listDevices } from '@/api/device'
import { getProjects } from '@/api/project'
import { unwrapList } from '@/lib/unwrap'
import type { ProjectRow } from '@/types/project'

export const assistantKeys = {
  all: ['assistant'] as const,
  status: ['assistant', 'status'] as const,
  profile: ['assistant', 'profile'] as const,
  identities: ['assistant', 'identities'] as const,
  tools: ['assistant', 'tools'] as const,
  turns: (page: number, size: number, surface: string) => ['assistant', 'turns', page, size, surface] as const,
  turn: (id: string) => ['assistant', 'turn', id] as const,
  messages: (id: string) => ['assistant', 'turn', id, 'messages'] as const,
  tokens: ['assistant', 'mcp-tokens'] as const,
  subs: ['assistant', 'subscriptions'] as const,
}

/** 后端没就绪（404 等）不重试，让页面马上给出降级提示。 */
const retryUnlessNotReady = (count: number, e: unknown) => !isAssistantNotReady(e) && count < 1

export const useAssistantStatus = () =>
  useQuery({ queryKey: assistantKeys.status, queryFn: getAssistantStatus, refetchInterval: 20_000, retry: retryUnlessNotReady })

export const useAssistantProfile = () =>
  useQuery({ queryKey: assistantKeys.profile, queryFn: getAssistantProfile, retry: retryUnlessNotReady })

export const useIdentities = () =>
  useQuery({ queryKey: assistantKeys.identities, queryFn: async () => (await listIdentities())?.items ?? [], retry: retryUnlessNotReady })

export const useAssistantTools = () =>
  useQuery({ queryKey: assistantKeys.tools, queryFn: async () => (await listAssistantTools())?.items ?? [], retry: retryUnlessNotReady })

export const useTurns = (page: number, size: number, surface: string) =>
  useQuery({
    queryKey: assistantKeys.turns(page, size, surface),
    queryFn: async () => {
      const r = await listTurns({ limit: size, offset: (page - 1) * size, surface })
      return { items: r?.items ?? [], total: r?.total ?? 0 }
    },
    retry: retryUnlessNotReady,
  })

export const useTurn = (id: string) =>
  useQuery({ queryKey: assistantKeys.turn(id), queryFn: () => getTurn(id), enabled: !!id, retry: retryUnlessNotReady })

export const useTurnMessages = (id: string) =>
  useQuery({ queryKey: assistantKeys.messages(id), queryFn: () => getTurnMessages(id), enabled: !!id, retry: false })

export const useMcpTokens = () =>
  useQuery({ queryKey: assistantKeys.tokens, queryFn: async () => (await listMcpTokens())?.items ?? [], retry: retryUnlessNotReady })

export const useSubscriptions = () =>
  useQuery({ queryKey: assistantKeys.subs, queryFn: async () => (await listSubscriptions())?.items ?? [], retry: retryUnlessNotReady })

/** 默认应用候选：沿用落地页的 /project/list，把项目下的应用摊平。 */
export const useAppOptions = () =>
  useQuery({
    queryKey: ['assistant', 'app-options'],
    queryFn: async () => {
      const projects = unwrapList<ProjectRow>(await getProjects(), { keys: ['projects'], label: 'GET /project/list' })
      return projects.flatMap((p) => (p.apps || []).map((a) => ({
        value: a.id,
        label: p.name ? `${a.name || a.id}（${p.name}）` : a.name || a.id,
      })))
    },
  })

export const useDeviceOptions = () =>
  useQuery({
    queryKey: ['assistant', 'device-options'],
    queryFn: async () => (await listDevices()).map((d) => ({
      value: d.sn,
      online: String(d.status || '').toLowerCase() === 'online',
      label: `${d.model || d.type || '设备'} · ${d.sn}`,
    })),
  })

export function useAssistantMutations() {
  const qc = useQueryClient()
  const inv = (key: readonly unknown[]) => () => qc.invalidateQueries({ queryKey: key })
  return {
    saveProfile: useMutation({
      mutationFn: (body: ProfilePatch) => putAssistantProfile(body),
      onSuccess: (data) => {
        qc.setQueryData(assistantKeys.profile, data)
        void qc.invalidateQueries({ queryKey: assistantKeys.status })
      },
    }),
    bindCode: useMutation({ mutationFn: createBindCode }),
    unbind: useMutation({ mutationFn: deleteIdentity, onSuccess: inv(assistantKeys.identities) }),
    createToken: useMutation({ mutationFn: createMcpToken, onSuccess: inv(assistantKeys.tokens) }),
    revokeToken: useMutation({ mutationFn: revokeMcpToken, onSuccess: inv(assistantKeys.tokens) }),
    cancelSub: useMutation({ mutationFn: deleteSubscription, onSuccess: inv(assistantKeys.subs) }),
  }
}
