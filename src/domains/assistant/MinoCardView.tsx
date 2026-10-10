import type { CSSProperties, ReactNode } from 'react'
import { CircleCheck, CircleX, Loader } from 'lucide-react'
import { StatusPill, type StatusKind } from '@/ui'
import type { CardBlock, CardStatus, CardTone, MinoCard } from '@/api/assistant'
import { fmtMs } from './format'

const TONE: Record<CardTone, { fg: string; bg: string }> = {
  info: { fg: 'var(--w-primary)', bg: 'var(--w-primary-soft)' },
  success: { fg: 'var(--w-pass)', bg: 'var(--w-pass-bg)' },
  warn: { fg: 'var(--w-warn)', bg: 'var(--w-warn-bg)' },
  danger: { fg: 'var(--w-fail)', bg: 'var(--w-fail-bg)' },
}

const STATUS: Record<CardStatus, { kind: StatusKind; text: string }> = {
  running: { kind: 'running', text: '进行中' },
  done: { kind: 'pass', text: '已完成' },
  failed: { kind: 'fail', text: '失败' },
  need_input: { kind: 'warn', text: '需要补充信息' },
}

const sectionLabel: CSSProperties = { fontSize: 'var(--w-font-meta)', fontWeight: 700, color: 'var(--w-text-quaternary)', marginBottom: 4 }

/** 图片 ref 可能是 URL / data URI；其余形式（内部引用）前端不猜怎么取，显示占位。 */
const isDirectImage = (ref: string) => /^(https?:\/\/|data:image\/|\/)/.test(ref)

/**
 * MinoCard 渲染器（设计 §5）。只做展示：actions 有 url 才可点，没有 url 的只列出来，
 * 因为动作 id 由 IM 渠道回调处理，Workbench 不代发。
 */
export function MinoCardView({ card }: { card: MinoCard }) {
  const tone = TONE[card.header?.tone] || TONE.info
  const st = STATUS[card.status] || { kind: 'muted' as StatusKind, text: card.status }
  return (
    <div style={{ border: '1px solid var(--w-border-strong)', borderRadius: 'var(--w-radius-lg)', overflow: 'hidden', background: 'var(--w-surface)' }}>
      <div className="flex items-center justify-between gap-2" style={{ padding: '10px 12px', background: tone.bg, color: tone.fg }}>
        <strong style={{ fontSize: 'var(--w-font-title)' }}>{card.header?.title || '助手卡片'}</strong>
        <StatusPill status={st.kind}>{st.text}</StatusPill>
      </div>
      <div className="flex flex-col" style={{ padding: 12, gap: 12 }}>
        {(card.blocks || []).map((b, i) => <Block key={i} block={b} />)}
        {!(card.blocks || []).length ? <span style={{ color: 'var(--w-text-quaternary)', fontSize: 'var(--w-font-sm)' }}>卡片没有内容块</span> : null}
      </div>
      {(card.actions || []).length ? (
        <div className="flex flex-wrap items-center gap-2" style={{ padding: '8px 12px', borderTop: '1px solid var(--w-border)' }}>
          {card.actions.map((a) => a.url ? (
            <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="w-hit" style={actionStyle(true)}>{a.label}</a>
          ) : (
            <span key={a.id} title="该动作在 IM 里点击触发，这里只是预览" style={actionStyle(false)}>{a.label}</span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

const actionStyle = (live: boolean): CSSProperties => ({
  padding: '3px 10px',
  borderRadius: 'var(--w-radius-sm)',
  fontSize: 'var(--w-font-sm)',
  fontWeight: 650,
  border: '1px solid var(--w-border-strong)',
  color: live ? 'var(--w-primary)' : 'var(--w-text-tertiary)',
  cursor: live ? 'pointer' : 'default',
  textDecoration: 'none',
})

function Section({ label, children }: { label: string; children: ReactNode }) {
  return <div><div style={sectionLabel}>{label}</div>{children}</div>
}

function Block({ block }: { block: CardBlock }) {
  switch (block.type) {
    case 'intent':
      return <Section label="我理解成了"><div style={{ fontSize: 'var(--w-font-base)' }}>{block.text}</div></Section>
    case 'summary':
      return <Section label="结果"><div style={{ fontSize: 'var(--w-font-base)', whiteSpace: 'pre-wrap' }}>{block.text}</div></Section>
    case 'trace':
      return (
        <Section label="我做了什么">
          <TraceList steps={block.steps || []} />
        </Section>
      )
    case 'kv':
      return (
        <div className="grid" style={{ gridTemplateColumns: 'max-content 1fr', columnGap: 12, rowGap: 4, fontSize: 'var(--w-font-sm)' }}>
          {(block.items || []).map(([k, v], i) => (
            <div key={i} style={{ display: 'contents' }}>
              <span style={{ color: 'var(--w-text-tertiary)' }}>{k}</span>
              <span style={{ wordBreak: 'break-all' }}>{v}</span>
            </div>
          ))}
        </div>
      )
    case 'table':
      return (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 'var(--w-font-sm)' }}>
            <thead>
              <tr>{(block.columns || []).map((c, i) => <th key={i} style={cell(true)}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {(block.rows || []).map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} style={cell(false)}>{v}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      )
    case 'progress': {
      const total = Math.max(0, block.total || 0)
      const pct = total ? Math.min(100, Math.round(((block.done || 0) / total) * 100)) : 0
      return (
        <div>
          <div style={{ height: 6, borderRadius: 99, background: 'var(--w-muted-bg)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--w-primary)' }} />
          </div>
          <div style={{ marginTop: 4, fontSize: 'var(--w-font-meta)', color: 'var(--w-text-tertiary)' }}>{block.done}/{block.total}（{pct}%）</div>
        </div>
      )
    }
    case 'image':
      return isDirectImage(block.ref) ? (
        <img src={block.ref} alt="卡片截图" style={{ maxWidth: '100%', maxHeight: 280, objectFit: 'contain', borderRadius: 'var(--w-radius-sm)' }} />
      ) : (
        <div className="w-mono" style={{ padding: 10, border: '1px dashed var(--w-border-strong)', borderRadius: 'var(--w-radius-sm)', fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)' }}>
          图片引用：{block.ref}（预览暂不能取图）
        </div>
      )
    default:
      return <div style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-quaternary)' }}>未识别的内容块：{String((block as { type?: string }).type)}</div>
  }
}

const cell = (head: boolean): CSSProperties => ({
  textAlign: 'left',
  padding: '4px 8px',
  borderBottom: '1px solid var(--w-border)',
  fontWeight: head ? 700 : 400,
  color: head ? 'var(--w-text-secondary)' : 'var(--w-text)',
  whiteSpace: 'nowrap',
})

export function TraceList({ steps }: { steps: { tool: string; label: string; status: string; ms: number; args_brief?: string }[] }) {
  if (!steps.length) return <span style={{ color: 'var(--w-text-quaternary)', fontSize: 'var(--w-font-sm)' }}>没有调用步骤</span>
  return (
    <div className="flex flex-col" style={{ gap: 4 }}>
      {steps.map((s, i) => {
        const ok = s.status === 'ok'
        const Icon = ok ? CircleCheck : (s.status === 'error' || s.status === 'fail') ? CircleX : Loader
        return (
          <div key={i} className="flex items-baseline gap-2" style={{ fontSize: 'var(--w-font-sm)' }}>
            <Icon size={13} style={{ color: ok ? 'var(--w-pass)' : 'var(--w-fail)', flexShrink: 0, alignSelf: 'center' }} />
            <span style={{ fontWeight: 650 }}>{s.label || s.tool}</span>
            <span className="w-mono" style={{ color: 'var(--w-text-quaternary)' }}>{s.tool}</span>
            <span style={{ color: 'var(--w-text-tertiary)' }}>{fmtMs(s.ms)}</span>
            {s.args_brief ? <span className="w-mono truncate" style={{ color: 'var(--w-text-tertiary)', minWidth: 0 }} title={s.args_brief}>{s.args_brief}</span> : null}
          </div>
        )
      })}
    </div>
  )
}
