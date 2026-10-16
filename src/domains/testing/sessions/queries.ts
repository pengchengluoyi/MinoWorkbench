import { queryClient } from '@/lib/queryClient'
import { isExecutionActive, isExecutionTerminal, liveRefreshDelay } from '@/lib/liveQuery'
import { useQuery } from '@tanstack/react-query'
import { getSessionBundle, listSessions } from '@/api/sessions'
import { mergeSessionEvents, uniqueModelCalls, uniqueSessionTurns } from './sessionRecords'
import { useSession } from '@/lib/session'

export const sessionKeys = {
  list: (appId: string, status: string, page: number, pageSize: number) =>
    ['sessions', 'list', appId, status, page, pageSize, useSession.getState().user?.user_id || ''] as const,
  detail: (id: string) => ['sessions', 'detail', id, useSession.getState().user?.user_id || ''] as const,
}

export const useSessionList = (appId: string, status: string, page: number, pageSize: number) =>
  useQuery({
    queryKey: sessionKeys.list(appId, status, page, pageSize),
    queryFn: () => listSessions({
      appId,
      status,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
  })

const selectSessionBundle = (data: Awaited<ReturnType<typeof getSessionBundle>>) => ({
  ...data,
  events: mergeSessionEvents([], data.events),
  turns: uniqueSessionTurns(data.turns),
  llm: uniqueModelCalls(data.llm),
})

export const useSessionDetail = (sessionId: string, live = false) =>
  useQuery({
    queryKey: sessionKeys.detail(sessionId),
    enabled: Boolean(sessionId),
    refetchInterval: (query) => {
      const meta = query.state.data?.meta
      if (meta?.finished_at || isExecutionTerminal(meta?.status)) return false
      return live || isExecutionActive(meta?.status) ? liveRefreshDelay(query.state.fetchFailureCount) : false
    },
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const fresh = await getSessionBundle(sessionId)
      const previous = queryClient.getQueryData<Awaited<ReturnType<typeof getSessionBundle>>>(sessionKeys.detail(sessionId))
      if (!previous) return fresh
      const failed = (source: string) => fresh.sourceErrors.some((item) => item.source === source)
      const events = mergeSessionEvents(previous.events, fresh.events)
      return {
        ...fresh,
        meta: failed('事件流') ? previous.meta : fresh.meta,
        events,
        eventTotal: failed('事件流') ? previous.eventTotal : fresh.eventTotal,
        hasMore: failed('事件流') ? previous.hasMore : fresh.hasMore && events.length < fresh.eventTotal,
        llm: failed('模型调用') ? previous.llm : fresh.llm,
        metrics: failed('统计指标') ? previous.metrics : fresh.metrics,
        turns: failed('回合') ? previous.turns : fresh.turns,
      }
    },
    select: selectSessionBundle,
  })
