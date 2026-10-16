import type { LlmCall, SessionEvent, SessionTurn } from '@/api/sessions'
import { bagOf, integerOf, stepRefsOf, turnOf } from './executionLinks'

const sessionOf = (value: unknown) => {
  const row = bagOf(value)
  return String(row.session_id || bagOf(row.payload).session_id || '')
}
const compatibleEvent = (left: SessionEvent, right: SessionEvent) => {
  if (sessionOf(left) && sessionOf(right) && sessionOf(left) !== sessionOf(right)) return false
  const a = turnOf(left), b = turnOf(right)
  if (a != null && b != null && a !== b) return false
  if (left.phase && right.phase && left.phase !== right.phase) return false
  const refs = stepRefsOf(left), next = stepRefsOf(right)
  return !refs.length || !next.length || refs.some(ref => next.includes(ref))
}

/** Raw event sequence identifies a record; equal message text never does. */
export function mergeSessionEvents(previous: SessionEvent[], incoming: SessionEvent[]) {
  const merged: SessionEvent[] = []
  for (const event of [...previous, ...incoming]) {
    const seq = integerOf(event.seq)
    const index = seq == null ? -1 : merged.findIndex(old => integerOf(old.seq) === seq
      && old.type === event.type && compatibleEvent(old, event))
    if (index < 0) merged.push(event)
    else merged[index] = { ...merged[index], ...event }
  }
  return merged
}

function snapshot(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(snapshot).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${snapshot(item)}`).join(',')}}`
  return JSON.stringify(value) ?? 'undefined'
}

/** Only exact copies with a usable identity are removed; distinct phases/attempts stay visible. */
function uniqueSnapshots<T>(rows: T[], identity: (row: T) => string | undefined): T[] {
  const seen = new Set<string>()
  return rows.filter(row => {
    const id = identity(row)
    if (!id) return true
    const key = `${id}:${snapshot(row)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const uniqueSessionTurns = (rows: SessionTurn[]) => uniqueSnapshots(rows, row => {
  const turn = turnOf(row)
  return turn == null ? undefined : `${sessionOf(row)}:${turn}:${row.phase || ''}`
})
export const uniqueModelCalls = (rows: LlmCall[]) => uniqueSnapshots(rows, row =>
  row.dispatch_id ? `${sessionOf(row)}:${row.dispatch_id}` : undefined)
