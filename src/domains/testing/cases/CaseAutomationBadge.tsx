import { recordOf, textOf } from './caseUnderstanding'
import type { CaseRow } from '@/api/projectCases'

export type AutomationTelemetry = 'green' | 'yellow' | 'red' | 'muted'

export function automationTelemetry(row: CaseRow | Record<string, unknown>): AutomationTelemetry {
  const summary = recordOf(row.step_keys_summary)
  const telemetry = textOf(summary.telemetry)
  if (telemetry === 'red' || telemetry === 'yellow' || telemetry === 'green') return telemetry
  const ua = recordOf(recordOf(row.meta).ui_automation || row.ui_automation)
  if (ua.coverable === false) return 'red'
  if (Number(summary.advisory_issue_count) > 0) return 'yellow'
  return 'green'
}

export function automationTelemetryLabel(tone: AutomationTelemetry) {
  if (tone === 'red') return '不可自动跑'
  if (tone === 'yellow') return '可跑 · 有提示'
  if (tone === 'muted') return '未编译'
  return '可自动跑'
}

export function CaseAutomationBadge({ row }: { row: CaseRow | Record<string, unknown> }) {
  const tone = automationTelemetry(row)
  const summary = recordOf(row.step_keys_summary)
  const blocking = Number(summary.blocking_issue_count || 0)
  const advisory = Number(summary.advisory_issue_count || 0)
  const hint = tone === 'red'
    ? `阻断 ${blocking || '—'}`
    : tone === 'yellow'
      ? `提示 ${advisory || '—'}`
      : ''
  return <span className="case-automation-badge" data-tone={tone} title={hint || automationTelemetryLabel(tone)}>
    {automationTelemetryLabel(tone)}
  </span>
}
