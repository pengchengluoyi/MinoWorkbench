import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getNodeTools, submitNodeToolTask } from '@/api/nodeTools'
import { useSession } from '@/lib/session'
import { nexusOrigin } from '@/lib/config'
import { nodeKeys } from './queries'

export function useNodeTools(nodeId: string, enabled = true) {
  const owner = useSession(state => state.user?.user_id || '')
  const qc = useQueryClient()
  const submitting = useRef(false)
  const [busy, setBusy] = useState('')
  const origin = nexusOrigin()
  const key = ['account', owner, origin, 'node-tools', nodeId]
  const query = useQuery({
    queryKey: key,
    queryFn: () => getNodeTools(nodeId),
    enabled: enabled && !!owner && !!nodeId,
    retry: false,
    refetchInterval: q => q.state.data?.tasks.some(t => t.active) ? 2000 : 15000,
  })
  const terminalSignature = query.data?.tasks.filter(task => !task.active).map(task => `${task.task_id}:${task.state}`).join('|') || ''
  useEffect(() => {
    if (terminalSignature) void qc.invalidateQueries({ queryKey: nodeKeys.all })
  }, [terminalSignature, qc])
  const install = async (toolId: string, originalId?: string) => {
    if (submitting.current) return
    submitting.current = true
    setBusy(toolId)
    const storageKey = `mino:tool-operation:${origin}:${owner}:${nodeId}:${toolId}`
    try {
      const stored = sessionStorage.getItem(storageKey)
      const receipt = query.data?.tasks.find(task => task.operation_id === stored)
      const operationId = originalId || (stored && (!receipt || receipt.active) ? stored : crypto.randomUUID())
      // Persist BEFORE dispatch. Transport failures keep this identifier across refresh.
      sessionStorage.setItem(storageKey, operationId)
      return await submitNodeToolTask(nodeId, toolId, operationId)
    } finally {
      submitting.current = false
      setBusy('')
      void qc.invalidateQueries({ queryKey: key })
      void qc.invalidateQueries({ queryKey: nodeKeys.all })
    }
  }
  return { ...query, install, busy }
}
