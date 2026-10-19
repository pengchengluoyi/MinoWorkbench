const STORAGE_KEY = 'mino-bots-canvas-layout:v1'

type LayoutStore = Record<string, Record<string, { x: number; y: number }>>

function readStore(): LayoutStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as LayoutStore
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStore(store: LayoutStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    /* quota / private mode */
  }
}

export function layoutStorageKey(projectId: string, topicId: string) {
  return `${projectId}::${topicId}`
}

export function loadTopicNodeLayout(
  projectId: string,
  topicId: string,
): Record<string, { x: number; y: number }> {
  const store = readStore()
  return { ...(store[layoutStorageKey(projectId, topicId)] || {}) }
}

export function saveTopicNodePosition(
  projectId: string,
  topicId: string,
  nodeId: string,
  position: { x: number; y: number },
) {
  const key = layoutStorageKey(projectId, topicId)
  const store = readStore()
  const topic = { ...(store[key] || {}) }
  topic[nodeId] = { x: position.x, y: position.y }
  store[key] = topic
  writeStore(store)
}

export function resetTopicNodeLayout(projectId: string, topicId: string) {
  const key = layoutStorageKey(projectId, topicId)
  const store = readStore()
  delete store[key]
  writeStore(store)
}
