import { recordOf, textOf } from './caseUnderstanding'

export type ImportIssueTier = 'blocking' | 'advisory' | 'none'

export function stepKeyValidation(row: Record<string, unknown>) {
  const payload = recordOf(row.payload)
  return recordOf(row.step_key_validation || payload.step_key_validation)
}

export function blockingIssueCount(row: Record<string, unknown>) {
  const validation = stepKeyValidation(row)
  const fromValidation = Number(validation.blocking_issue_count)
  if (Number.isFinite(fromValidation) && fromValidation >= 0) return fromValidation
  const ua = recordOf(row.ui_automation || recordOf(row.payload).ui_automation)
  const blocked = Array.isArray(ua.blocked_by) ? ua.blocked_by : []
  return blocked.filter((item) => recordOf(item).severity === undefined || textOf(recordOf(item).severity) === 'blocking').length
}

export function advisoryIssueCount(row: Record<string, unknown>) {
  const validation = stepKeyValidation(row)
  const fromValidation = Number(validation.advisory_issue_count)
  if (Number.isFinite(fromValidation) && fromValidation >= 0) return fromValidation
  const ua = recordOf(row.ui_automation || recordOf(row.payload).ui_automation)
  const blocked = Array.isArray(ua.blocked_by) ? ua.blocked_by : []
  return blocked.filter((item) => ['human_only', 'advisory'].includes(textOf(recordOf(item).severity))).length
}

export function importIssueTier(row: Record<string, unknown>): ImportIssueTier {
  if (blockingIssueCount(row) > 0) return 'blocking'
  if (recordOf(row.ui_automation).coverable === false || advisoryIssueCount(row) > 0) return 'advisory'
  return 'none'
}
