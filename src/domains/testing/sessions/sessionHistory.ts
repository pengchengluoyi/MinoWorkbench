import { getSessionEventsPage, type SessionEvent } from '@/api/sessions'

export function nextEventCursor(events: SessionEvent[]): number {
  let cursor = 0
  for (const event of events) {
    const raw: unknown = event.seq
    const sequence = typeof raw === 'number' || typeof raw === 'string' && raw.trim() ? Number(raw) : NaN
    if (Number.isSafeInteger(sequence) && sequence >= 0 && sequence < Number.MAX_SAFE_INTEGER) cursor = Math.max(cursor, sequence + 1)
  }
  return cursor
}

export async function readEventHistory({ sessionId, fromSeq, signal, onPage, maxPages = 50, fetchPage = getSessionEventsPage }: {
  sessionId: string; fromSeq: number; signal: AbortSignal; maxPages?: number
  onPage: (page: Awaited<ReturnType<typeof getSessionEventsPage>>) => void
  fetchPage?: typeof getSessionEventsPage
}) {
  let cursor = fromSeq
  let pages = 0
  let hasMore = true
  while (hasMore && pages < maxPages) {
    signal.throwIfAborted()
    const page = await fetchPage(sessionId, cursor, signal)
    signal.throwIfAborted()
    const next = nextEventCursor(page.events)
    if (page.hasMore && next <= cursor) throw new Error('事件分页没有返回更大的有效序号，已中断检索以避免重复请求。已读取内容保留。')
    onPage(page)
    pages += 1
    hasMore = page.hasMore
    cursor = next
  }
  return { pages, hasMore }
}
