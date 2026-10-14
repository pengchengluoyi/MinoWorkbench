import type { LlmCall, SessionEvent, SessionTurn } from '@/api/sessions'

export type ExecutionScope = { key: string; sessionId: string; title: string; stepRef?: string; turns: number[] }
export type ExecutionEntry = { request: number; scope: ExecutionScope | null; returnLabel: string }
export const bagOf = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
export const integerOf = (value: unknown): number | undefined => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return undefined
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : undefined
}
const candidates = (value: unknown) => {
  const row = bagOf(value)
  const payload = bagOf(row.payload)
  return [row, payload, bagOf(row.action), bagOf(payload.action), bagOf(row.think), ...(Array.isArray(row.tools) ? row.tools.map(bagOf) : []), ...(Array.isArray(row.decisions) ? row.decisions.map(bagOf) : [])]
}
export const turnOf = (value: unknown) => {
  for (const row of candidates(value)) {
    const turn = integerOf(row.turn)
    if (turn != null) return turn
  }
  return undefined
}
export const normalizeStepRef = (value: unknown) => {
  const match = String(value || '').trim().match(/^(操作|预期|前置)\s*(\d+)\s*-\s*(\d+)$/)
  return match ? `${match[1]} ${Number(match[2])}-${Number(match[3])}` : ''
}
export const stepRefsOf = (value: unknown) => {
  const refs = new Set<string>()
  for (const row of candidates(value)) {
    const direct = normalizeStepRef(row.stepRef || row.step_ref)
    if (direct) refs.add(direct)
    const step = integerOf(row.script_step ?? row.case_step ?? row.item_no)
    const point = integerOf(row.script_point ?? row.clause)
    if (step == null || point == null) continue
    const kind = String(row.script_kind || row.kind || row.column || '')
    if (!kind) continue
    const label = /expect|预期|assert/i.test(kind) ? '预期' : /precondition|前置/i.test(kind) ? '前置' : /op|操作|action/i.test(kind) ? '操作' : ''
    if (label) refs.add(`${label} ${step}-${point}`)
  }
  return [...refs]
}
export const stepIdOf = (ref: string) => {
  const matched = normalizeStepRef(ref).match(/^(操作|预期|前置) (\d+)-(\d+)$/)
  return matched ? `${matched[1] === '预期' ? 'ex' : matched[1] === '前置' ? 'pre' : 'op'}-${matched[2]}-${matched[3]}` : ''
}
export const belongsToSession = (value: unknown, sessionId: string) => {
  const row = bagOf(value)
  const id = row.sessionId || row.session_id || bagOf(row.payload).session_id
  return !id || id === sessionId
}
export const linkedTurns = (ref: string | undefined, seed: number[], records: unknown[], sessionId: string) => {
  const turns = new Set(seed.filter((turn) => integerOf(turn) != null))
  if (ref) for (const record of records) {
    const turn = turnOf(record)
    if (turn != null && belongsToSession(record, sessionId) && stepRefsOf(record).includes(ref)) turns.add(turn)
  }
  return [...turns].sort((left, right) => left - right)
}
export const inStepScope = (value: unknown, scope: ExecutionScope | null, turns: number[]) => {
  if (!scope) return true
  if (!belongsToSession(value, scope.sessionId)) return false
  const turn = turnOf(value)
  return (turn != null && turns.includes(turn)) || Boolean(scope.stepRef && stepRefsOf(value).includes(scope.stepRef))
}
export const inTurnScope = (value: unknown, turn: string) => !turn || (turn === 'unassigned' ? turnOf(value) == null : turnOf(value) === Number(turn))
export const knownTurns = (rows: (SessionEvent | SessionTurn | LlmCall)[]) => [...new Set(rows.map(turnOf).filter((turn): turn is number => turn != null))].sort((left, right) => left - right)
