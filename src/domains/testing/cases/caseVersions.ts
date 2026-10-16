import { fieldSource, hasSavedUnderstanding, recordOf, type ScriptKind } from './caseUnderstanding'

export function revisionLabel(value: unknown): string | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? `r${value}` : null
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

const sourceKeys: Record<ScriptKind, string[]> = { pre: ['precondition'], op: ['steps_raw', 'steps'], ex: ['expected_raw', 'expected'] }
const sourceValue = (value: unknown) => Array.isArray(value) ? value.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('\n') : typeof value === 'string' ? value.replace(/\r\n/g, '\n') : ''

export function compareCaseSources(current: Record<string, unknown>, historical: Record<string, unknown>): 'same' | 'changed' | 'unknown' {
  let complete = true
  let reportedFields = 0
  for (const kind of ['pre', 'op', 'ex'] as const) {
    const original = sourceValue(fieldSource(current, kind))
    const reported = sourceKeys[kind].some(key => Object.hasOwn(historical, key))
    if (!reported) { if (original) complete = false; continue }
    reportedFields += 1
    if (original !== sourceValue(fieldSource(historical, kind))) return 'changed'
  }
  return complete && reportedFields > 0 ? 'same' : 'unknown'
}

export function caseVersionSummary(row: Record<string, unknown>) {
  const publication = recordOf(row.v5_publication)
  const match = compareCaseSources(row, recordOf(publication.source))
  return {
    understood: hasSavedUnderstanding(row),
    sourceRevision: revisionLabel(row.source_revision),
    frozenRevision: revisionLabel(publication.frozen_revision),
    match,
  }
}
