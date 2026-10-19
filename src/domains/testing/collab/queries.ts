import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  applyCollabDrafts,
  bindCollabIm,
  createCollabBot,
  createCollabTopic,
  decomposeCollabTopic,
  ensureCollabBots,
  installCollabMarketBot,
  listCollabBots,
  listCollabMarketplace,
  listCollabMessages,
  getCollabOpenHandsStatus,
  saveCollabOpenHandsConfig,
  listCollabTemplates,
  listCollabTopics,
  getCollabTopic,
  type OpenHandsStatus,
  listCollabWorkItems,
  patchCollabTopic,
  postCollabMessage,
  advanceCollabTopic,
  refreshCollabMemory,
  refreshCollabKnowledge,
  runCollabPipeline,
  transferCollabWorkItem,
  triggerCollabWorkItem,
  decideCollabApproval,
  listCollabApprovals,
  listCollabActivities,
  pauseCollabTopic,
  resumeCollabTopic,
  closeCollabTopic,
  deleteCollabTopic,
  type CollabActivity,
  type CollabBot,
  type CollabBotTemplate,
  type CollabMarketItem,
  type CollabMessage,
  type CollabTopic,
  type CollabWorkItem,
} from '@/api/collab'
import { getProjectMaintainers, type ProjectMaintainer, type ProjectMaintainers } from '@/api/project'
import { unwrapList, unwrapOne } from '@/lib/unwrap'

export const collabKeys = {
  topics: (projectId: string) => ['collab', 'topics', projectId] as const,
  topic: (projectId: string, topicId: string) => ['collab', 'topic', projectId, topicId] as const,
  bots: (projectId: string) => ['collab', 'bots', projectId] as const,
  templates: (projectId: string) => ['collab', 'templates', projectId] as const,
  marketplace: (projectId: string) => ['collab', 'marketplace', projectId] as const,
  maintainers: (projectId: string) => ['collab', 'maintainers', projectId] as const,
  messages: (projectId: string, topicId: string) => ['collab', 'messages', projectId, topicId] as const,
  workItems: (projectId: string, topicId: string) => ['collab', 'work-items', projectId, topicId] as const,
  activities: (projectId: string, topicId: string) => ['collab', 'activities', projectId, topicId] as const,
}

export const useCollabOpenHands = (projectId: string) =>
  useQuery<OpenHandsStatus>({
    queryKey: ['collab', 'openhands', projectId],
    enabled: !!projectId,
    queryFn: async () => unwrapOne<OpenHandsStatus>(await getCollabOpenHandsStatus(projectId)),
  })

export const useSaveCollabOpenHands = (projectId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (api_url: string) => saveCollabOpenHandsConfig(projectId, api_url),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['collab', 'openhands', projectId] })
      void qc.invalidateQueries({ queryKey: collabKeys.marketplace(projectId) })
    },
  })
}

export const useCollabTopics = (projectId: string) =>
  useQuery<CollabTopic[]>({
    queryKey: collabKeys.topics(projectId),
    enabled: !!projectId,
    staleTime: 15_000,
    queryFn: async ({ signal }) => {
      const res = await listCollabTopics(projectId, signal)
      return unwrapList<CollabTopic>(res, { keys: ['items'], label: 'GET collab/topics' })
    },
  })

export const useCollabTopic = (projectId: string, topicId: string) =>
  useQuery<CollabTopic>({
    queryKey: collabKeys.topic(projectId, topicId),
    enabled: !!projectId && !!topicId,
    staleTime: 8_000,
    queryFn: async ({ signal }) => unwrapOne<CollabTopic>(await getCollabTopic(projectId, topicId, signal)),
  })

export const useEnsureCollabBots = (projectId: string) =>
  useQuery({
    queryKey: ['collab', 'ensure-bots', projectId],
    enabled: !!projectId,
    staleTime: 60_000 * 10,
    queryFn: async () => {
      await ensureCollabBots(projectId)
      return true
    },
  })

export const useCollabBots = (projectId: string) =>
  useQuery<CollabBot[]>({
    queryKey: collabKeys.bots(projectId),
    enabled: !!projectId,
    queryFn: async () => {
      const res = await listCollabBots(projectId)
      return unwrapList<CollabBot>(res, { keys: ['items'], label: 'GET collab/bots' })
    },
  })

export const useCollabMarketplace = (projectId: string) =>
  useQuery<CollabMarketItem[]>({
    queryKey: collabKeys.marketplace(projectId),
    enabled: !!projectId,
    queryFn: async () => {
      const res = await listCollabMarketplace(projectId)
      return unwrapList<CollabMarketItem>(res, { keys: ['items'], label: 'GET collab/marketplace' })
    },
  })

export const useCollabTemplates = (projectId: string) =>
  useQuery<CollabBotTemplate[]>({
    queryKey: collabKeys.templates(projectId),
    enabled: !!projectId,
    queryFn: async () => {
      const res = await listCollabTemplates(projectId)
      return unwrapList<CollabBotTemplate>(res, { keys: ['items'], label: 'GET collab/templates' })
    },
  })

export const useProjectMaintainers = (projectId: string) =>
  useQuery<ProjectMaintainer[]>({
    queryKey: collabKeys.maintainers(projectId),
    enabled: !!projectId,
    queryFn: async () => {
      const res = await getProjectMaintainers(projectId)
      const data = unwrapOne<ProjectMaintainers>(res)
      return data.items || []
    },
  })

export const useCollabMessages = (projectId: string, topicId: string) =>
  useQuery<CollabMessage[]>({
    queryKey: collabKeys.messages(projectId, topicId),
    enabled: !!projectId && !!topicId,
    refetchInterval: query => query.state.data?.some(m => m.reply_status === 'queued' || m.reply_status === 'running') ? 1_000 : 20_000,
    staleTime: 5_000,
    queryFn: async ({ signal }) => {
      const res = await listCollabMessages(projectId, topicId, signal)
      return unwrapList<CollabMessage>(res, { keys: ['items'], label: 'GET collab/messages' })
    },
  })

export const useCollabWorkItems = (projectId: string, topicId: string) =>
  useQuery<CollabWorkItem[]>({
    queryKey: collabKeys.workItems(projectId, topicId),
    enabled: !!projectId && !!topicId,
    refetchInterval: 15_000,
    staleTime: 5_000,
    queryFn: async ({ signal }) => {
      const res = await listCollabWorkItems(projectId, topicId, signal)
      return unwrapList<CollabWorkItem>(res, { keys: ['items'], label: 'GET collab/work-items' })
    },
  })

export const useCollabActivities = (projectId: string, topicId: string) =>
  useQuery<CollabActivity[]>({
    queryKey: collabKeys.activities(projectId, topicId),
    enabled: !!projectId && !!topicId,
    refetchInterval: 20_000,
    staleTime: 8_000,
    queryFn: async ({ signal }) => {
      const res = await listCollabActivities(projectId, topicId, signal)
      return unwrapList<CollabActivity>(res, { keys: ['items'], label: 'GET collab/activities' })
    },
  })

export const useCollabMutations = (projectId: string, topicId: string) => {
  const qc = useQueryClient()
  const invalidateTopic = () => {
    void qc.invalidateQueries({ queryKey: collabKeys.topics(projectId) })
    if (topicId) {
      void qc.invalidateQueries({ queryKey: collabKeys.topic(projectId, topicId) })
      void qc.invalidateQueries({ queryKey: collabKeys.workItems(projectId, topicId) })
      void qc.invalidateQueries({ queryKey: collabKeys.messages(projectId, topicId) })
      void qc.invalidateQueries({ queryKey: collabKeys.activities(projectId, topicId) })
    }
  }
  return {
    createTopic: useMutation({
      mutationFn: (body: { title: string; goal?: string; app_id?: string; bot_ids?: string[] }) =>
        createCollabTopic(projectId, body),
      onSuccess: () => void qc.invalidateQueries({ queryKey: collabKeys.topics(projectId) }),
    }),
    patchTopic: useMutation({
      mutationFn: (body: { title?: string; goal?: string; status?: string }) => patchCollabTopic(projectId, topicId, body),
      onSuccess: () => void qc.invalidateQueries({ queryKey: collabKeys.topics(projectId) }),
    }),
    pauseTopic: useMutation({
      mutationFn: () => pauseCollabTopic(projectId, topicId),
      onSuccess: invalidateTopic,
    }),
    resumeTopic: useMutation({
      mutationFn: () => resumeCollabTopic(projectId, topicId),
      onSuccess: invalidateTopic,
    }),
    closeTopic: useMutation({
      mutationFn: () => closeCollabTopic(projectId, topicId),
      onSuccess: invalidateTopic,
    }),
    deleteTopic: useMutation({
      mutationFn: (force?: boolean) => deleteCollabTopic(projectId, topicId, force),
      onSuccess: () => void qc.invalidateQueries({ queryKey: collabKeys.topics(projectId) }),
    }),
    createBot: useMutation({
      mutationFn: (body: { name?: string; template_id: string }) => createCollabBot(projectId, body),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: collabKeys.bots(projectId) })
        void qc.invalidateQueries({ queryKey: collabKeys.topics(projectId) })
      },
    }),
    postMessage: useMutation({
      mutationFn: (body: string) => postCollabMessage(projectId, topicId, body),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: collabKeys.messages(projectId, topicId) })
        void qc.invalidateQueries({ queryKey: collabKeys.topic(projectId, topicId) })
      },
    }),
    decompose: useMutation({
      mutationFn: (opts: { goal?: string; bump_version?: boolean; include_case_run?: boolean }) =>
        decomposeCollabTopic(projectId, topicId, { goal: opts.goal, use_llm: true, ...opts }),
      onSuccess: invalidateTopic,
    }),
    pipeline: useMutation({
      mutationFn: (opts: { goal?: string; bump_version?: boolean; engine?: string }) => runCollabPipeline(projectId, topicId, opts),
      onSuccess: invalidateTopic,
    }),
    advance: useMutation({
      mutationFn: (opts: { goal?: string; message?: string; sync_memory?: boolean }) =>
        advanceCollabTopic(projectId, topicId, opts),
      onSuccess: invalidateTopic,
    }),
    refreshKnowledge: useMutation({
      mutationFn: () => refreshCollabKnowledge(projectId, topicId),
      onSuccess: () => void qc.invalidateQueries({ queryKey: collabKeys.topics(projectId) }),
    }),
    refreshMemory: useMutation({
      mutationFn: () => refreshCollabMemory(projectId, topicId),
      onSuccess: () => void qc.invalidateQueries({ queryKey: collabKeys.topics(projectId) }),
    }),
    bindIm: useMutation({
      mutationFn: (body: { channel: string; chat_id: string; node_id?: string; label?: string }) =>
        bindCollabIm(projectId, topicId, body),
      onSuccess: () => void qc.invalidateQueries({ queryKey: collabKeys.topics(projectId) }),
    }),
    installMarket: useMutation({
      mutationFn: (body: { market_id: string; name?: string }) => installCollabMarketBot(projectId, body),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: collabKeys.bots(projectId) })
        void qc.invalidateQueries({ queryKey: collabKeys.topics(projectId) })
      },
    }),
    applyDrafts: useMutation({
      mutationFn: ({ workItemId, replace }: { workItemId: string; replace?: boolean }) =>
        applyCollabDrafts(projectId, workItemId, true, replace),
      onSuccess: invalidateTopic,
    }),
    transfer: useMutation({
      mutationFn: ({ workItemId, holderUserId }: { workItemId: string; holderUserId: string }) =>
        transferCollabWorkItem(projectId, workItemId, { holder_user_id: holderUserId }),
      onSuccess: invalidateTopic,
    }),
    trigger: useMutation({
      mutationFn: ({ workItemId, forceRetry }: { workItemId: string; forceRetry?: boolean }) =>
        triggerCollabWorkItem(projectId, workItemId, { forceRetry }),
      onSuccess: invalidateTopic,
    }),
    decideApproval: useMutation({
      mutationFn: ({
        workItemId,
        approvalId,
        decision,
        comment,
      }: {
        workItemId: string
        approvalId: string
        decision: string
        comment?: string
      }) => decideCollabApproval(projectId, workItemId, approvalId, { decision, comment }),
      onSuccess: invalidateTopic,
    }),
    listApprovals: (workItemId: string) => listCollabApprovals(projectId, workItemId),
  }
}
