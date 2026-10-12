import { useSession } from '@/lib/session'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createBindCode, createMcpToken, deleteIdentity, deleteSubscription, getAssistantProfile, getAssistantStatus,
  getTurn, getTurnMessages, isAssistantNotReady, listIdentities, listMcpTokens, listSubscriptions, listTurns,
  putAssistantProfile, revokeMcpToken, listAssistantTools,
  type ProfilePatch,
} from '@/api/assistant'

export const assistantKeys = {
  get all() { return ['account', useSession.getState().user?.user_id || '', 'assistant'] as const },
  get status() { return ['account', useSession.getState().user?.user_id || '', 'assistant', 'status'] as const },
  get profile() { return ['account', useSession.getState().user?.user_id || '', 'assistant', 'profile'] as const },
  get identities() { return ['account', useSession.getState().user?.user_id || '', 'assistant', 'identities'] as const },
  get tools() { return ['account', useSession.getState().user?.user_id || '', 'assistant', 'tools'] as const },
  turns: (page: number, size: number, surface: string) => ['account', useSession.getState().user?.user_id || '', 'assistant', 'turns', page, size, surface] as const,
  turn: (id: string) => ['account', useSession.getState().user?.user_id || '', 'assistant', 'turn', id] as const,
  messages: (id: string) => ['account', useSession.getState().user?.user_id || '', 'assistant', 'turn', id, 'messages'] as const,
  get tokens() { return ['account', useSession.getState().user?.user_id || '', 'assistant', 'mcp-tokens'] as const },
  get subs() { return ['account', useSession.getState().user?.user_id || '', 'assistant', 'subscriptions'] as const },
}

/** 后端没就绪（404 等）不重试，让页面马上给出降级提示。 */
const retryUnlessNotReady = (count: number, e: unknown) => !isAssistantNotReady(e) && count < 1

export const useAssistantStatus = () =>
  useQuery({ queryKey: assistantKeys.status, queryFn: getAssistantStatus, refetchInterval: 20_000, retry: retryUnlessNotReady })

export const useAssistantProfile = () =>
  useQuery({ queryKey: assistantKeys.profile, queryFn: getAssistantProfile, retry: retryUnlessNotReady })

export const useIdentities = () =>
  useQuery({ queryKey: assistantKeys.identities, queryFn: async () => (await listIdentities())?.items ?? [], refetchInterval: 20_000, retry: retryUnlessNotReady })

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
    unbind: useMutation({ mutationFn: deleteIdentity, onSuccess: () => {
      void qc.invalidateQueries({ queryKey: assistantKeys.identities })
      void qc.invalidateQueries({ queryKey: assistantKeys.status })
    } }),
    createToken: useMutation({ mutationFn: createMcpToken, onSuccess: inv(assistantKeys.tokens) }),
    revokeToken: useMutation({ mutationFn: revokeMcpToken, onSuccess: inv(assistantKeys.tokens) }),
    cancelSub: useMutation({ mutationFn: deleteSubscription, onSuccess: inv(assistantKeys.subs) }),
  }
}
