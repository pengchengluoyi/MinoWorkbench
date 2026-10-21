import { Navigate, useSearchParams } from 'react-router-dom'

/** 兼容原助手书签，统一进入 Scout。 */
export function AssistantPage() {
  const [params] = useSearchParams()
  const next = new URLSearchParams(params)
  const tab = params.get('tab') || 'turns'
  next.set('pane', tab === 'setup' ? 'connect' : !['preferences', 'mcp'].includes(tab) ? 'assistant' : 'settings')
  if (tab === 'setup') next.delete('tab')
  else next.set('tab', tab)
  return <Navigate to={`/settings/runtime?${next}`} replace />
}
