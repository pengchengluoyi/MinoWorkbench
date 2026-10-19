const STORAGE_KEY = 'mino.bots.projectId'

export const rememberBotsProject = (projectId: string) => {
  try {
    if (projectId) localStorage.setItem(STORAGE_KEY, projectId)
  } catch {
    /* private browsing */
  }
}

export const readBotsProject = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export const botsHref = (projectId: string, query: Record<string, string> | URLSearchParams = {}) => {
  const params = new URLSearchParams(query)
  const suffix = params.toString()
  return `/bots/projects/${encodeURIComponent(projectId)}${suffix ? `?${suffix}` : ''}`
}

export const botsRootHref = () => '/bots'
