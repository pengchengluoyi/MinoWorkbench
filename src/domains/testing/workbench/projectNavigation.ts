export const projectHref = (projectId: string, query: Record<string, string> | URLSearchParams = {}) => {
  const params = new URLSearchParams(query)
  params.delete('projectId')
  params.delete('projectName')
  params.delete('appName')
  const suffix = params.toString()
  return `/testing/projects/${encodeURIComponent(projectId)}${suffix ? `?${suffix}` : ''}`
}
