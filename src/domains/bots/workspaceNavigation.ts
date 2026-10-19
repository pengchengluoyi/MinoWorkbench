import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { request } from '@/lib/request'

export interface WorkspaceSummary {
  topic_id: string
  title: string
  archived: number
  workspace_kind: string
  unread?: number
  progress?: string
}

export const workspaceBase = (projectId: string) => `/project/${encodeURIComponent(projectId)}/collab/workspaces`
export const workspaceKey = (projectId: string) => ['workspaces-v7', projectId]

/** The rail and conversation share one query and URL selection. */
export function useWorkspaceNavigation(projectId: string, { enabled = true, poll = true }: { enabled?: boolean; poll?: boolean } = {}) {
  const [params, setParams] = useSearchParams()
  const archived = params.get('archived') === '1'
  const selected = params.get('topic') || ''
  const topics = useQuery({
    queryKey: [...workspaceKey(projectId), 'list', archived],
    enabled: !!projectId && enabled,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: query => !poll || query.state.error ? false : 15000,
    queryFn: async () => (await request<WorkspaceSummary[]>({ url: workspaceBase(projectId), params: { archived } })).data!,
  })
  const selectedId = topics.data?.some(topic => topic.topic_id === selected) ? selected : topics.data?.[0]?.topic_id || ''
  const selectTopic = (topicId: string, showArchived = archived) => {
    setParams(current => {
      const next = new URLSearchParams(current)
      if (topicId) next.set('topic', topicId)
      else next.delete('topic')
      if (showArchived) next.set('archived', '1')
      else next.delete('archived')
      return next
    })
  }
  const setArchived = (value: boolean) => selectTopic('', value)
  return { topics, selectedId, selectTopic, archived, setArchived }
}
