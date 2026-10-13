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
  need_input: { kind: 'warn', text: '等待补充' },
  submitted: { kind: 'running', text: '已提交' },
  blocked: { kind: 'warn', text: '尚未执行' },
  uncertain: { kind: 'warn', text: '结果待确认' },
}

const sectionLabel: CSSProperties = { fontSize: 'var(--w-font-meta)', fontWeight: 700, color: 'var(--w-text-quaternary)', marginBottom: 4 }

/** 图片 ref 可能是 URL / data URI；其余形式（内部引用）前端不猜怎么取，显示占位。 */
const isDirectImage = (ref: string) => /^(https?:\/\/|data:image\/|\/)/.test(ref)

/**
 * MinoCard 渲染器（设计 §5）。只做展示：actions 有 url 才可点，没有 url 的只列出来，
 * 因为动作 id 由 IM 渠道回调处理，Workbench 不代发。
 */
export function MinoCardView({ card }: { card: MinoCard }) {
  if (card.body_redacted) return <div style={{ padding: 12, color: 'var(--w-text-tertiary)', fontSize: 13 }}>正文保存在 Scout 节点；下方对话正文可查看实际卡片。</div>
  const tone = TONE[card.header?.tone] || TONE.info
  const st = card.card_type === 'notification' && card.status === 'blocked'
    ? { kind: 'warn' as StatusKind, text: '未能执行' }
    : STATUS[card.status] || { kind: 'muted' as StatusKind, text: card.status }
  return (
    <div style={{ border: '1px solid var(--w-border-strong)', borderRadius: 'var(--w-radius-lg)', overflow: 'hidden', background: 'var(--w-surface)' }}>
      <div className="flex items-center justify-between gap-2" style={{ padding: '10px 12px', background: tone.bg, color: tone.fg }}>
        <strong style={{ fontSize: 'var(--w-font-title)' }}>{card.header?.title || '助手卡片'} <small style={{ fontWeight: 400, fontSize: 12 }}>· {({ clarification: '追问', notification: '通知', dialogue: '对话' })[card.card_type || 'notification']}</small></strong>
        <StatusPill status={st.kind}>{st.text}</StatusPill>
      </div>
      <div className="flex flex-col" style={{ padding: 12, gap: 12 }}>
        {[...(card.blocks || [])].sort((left, right) => (left.type === 'trace' ? 2 : left.type === 'summary' ? -1 : 0) - (right.type === 'trace' ? 2 : right.type === 'summary' ? -1 : 0)).map((b, i) => <Block key={i} block={b} />)}
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
    case 'problem':
      return <Section label="问题"><div style={{ whiteSpace: 'pre-wrap', color: 'var(--w-warn)' }}>{block.text}</div></Section>
    case 'next_steps':
      return <Section label="接下来"><ol style={{ margin: 0, paddingLeft: 20 }}>{block.items.map((text, index) => <li key={index} style={{ marginBottom: 6 }}>{text}</li>)}</ol></Section>
    case 'choices':
      return <Section label="可选项"><ol style={{ margin: 0, paddingLeft: 20 }}>{block.items.map((item) => <li key={item.value}>{item.label}</li>)}</ol></Section>
    case 'case_results':
      return <div className="flex flex-col gap-2">{block.items.map((item, index) => {
        const passed = item.status === 'pass'
        const skipped = item.status === 'skip' || item.status === 'skipped'
        const quiet = passed || skipped
        return <div key={`${item.case_id}:${index}`} style={{ padding: quiet ? '6px 0' : 12,
          borderRadius: 'var(--w-radius-sm)', background: quiet ? 'transparent' : item.status === 'fail' ? 'var(--w-fail-bg)' : 'var(--w-warn-bg)' }}>
          <div className="flex items-start justify-between gap-2">
            <span style={{ fontWeight: quiet ? 500 : 700, overflowWrap: 'anywhere' }}>{item.number ? `${item.number}. ` : ''}{item.name}</span>
            <StatusPill status={passed ? 'pass' : skipped ? 'muted' : item.status === 'fail' ? 'fail' : 'warn'}>{item.status_label}</StatusPill>
          </div>
          {item.summary ? <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.summary}</p> : null}
          {item.advice ? <p style={{ margin: '8px 0 0', color: 'var(--w-text-secondary)', fontSize: 13 }}>建议：{item.advice}</p> : null}
        </div>
      })}</div>
    case 'trace':
      return <details><summary style={{ cursor: 'pointer', color: 'var(--w-text-tertiary)', fontSize: 12 }}>查看处理过程（{block.steps.length} 项）</summary><div style={{ paddingTop: 8 }}><TraceList steps={block.steps || []} /></div></details>
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
