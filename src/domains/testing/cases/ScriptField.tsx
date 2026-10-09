import { useState, type CSSProperties } from 'react'
import { conditionPair, markClauses, scriptSource, splitNumbered } from './caseText'

/**
 * 用例的一格：前置、操作或预期。
 * 原文和预览各有自己的开关，只切换这一格。
 */
export function ScriptField({
  value,
  kind,
  max = 4,
  compiled,
}: {
  value: unknown
  kind: 'pre' | 'op' | 'ex'
  max?: number
  /** 编译器产出的步骤文案。传入后，预览只画这些，不再按逗号拆原文。 */
  compiled?: unknown
}) {
  const [mode, setMode] = useState<'raw' | 'preview'>('preview')
  const [open, setOpen] = useState(false)
  const compiledLines = compiled == null ? null : stringList(compiled)
  const lines = splitNumbered(scriptSource(value))
  const previewRows = compiledLines ? compiledRows(compiledLines, lines) : lines.map((line) => ({ num: line.num, line, items: null as { text: string }[] | null }))
  const shown = mode === 'preview' && compiledLines ? previewRows : lines.map((line) => ({ num: line.num, line, items: null as { text: string }[] | null }))
  const visible = open ? shown : shown.slice(0, max)

  return (
    <div style={{ minWidth: 0, maxWidth: '100%', overflow: 'hidden' }} onClick={(event) => event.stopPropagation()}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
        <ModeButton pressed={mode === 'raw'} onClick={() => setMode('raw')}>查看原文</ModeButton>
        <ModeButton pressed={mode === 'preview'} onClick={() => setMode('preview')}>预览</ModeButton>
      </div>
      {!shown.length ? <span style={{ color: 'var(--w-text-quaternary)' }}>无</span> : (
        <>
          {visible.map((item) => (
            <div key={item.num} style={row}>
              <span style={num}>{item.num}</span>
              {mode === 'raw' ? (
                <span style={plain}>{item.line?.text || '无'}</span>
              ) : item.items ? (
                <CompiledLine items={item.items} />
              ) : kind === 'pre' ? (
                <PreLine text={item.line?.text || ''} />
              ) : (
                <MarkedLine text={item.line?.text || ''} />
              )}
            </div>
          ))}
          {shown.length > max && (
            <button type="button" onClick={() => setOpen((value) => !value)} style={more}>
              {open ? '收起' : `还有 ${shown.length - max} 条`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

function compiledRows(
  compiledLines: { step: string; text: string }[],
  lines: { num: number; text: string }[],
) {
  if (!compiledLines.length) {
    return lines.map((line) => ({ num: line.num, line, items: [] as { text: string }[] }))
  }
  const order: string[] = []
  const groups = new Map<string, { text: string }[]>()
  for (const item of compiledLines) {
    const key = item.step || '1'
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key)!.push({ text: item.text })
  }
  return order.map((key) => ({
    num: Number(key) || 1,
    line: lines.find((line) => String(line.num) === key),
    items: groups.get(key) || [],
  }))
}

function PreLine({ text }: { text: string }) {
  const pair = conditionPair(text)
  return (
    <span style={chip}>
      {pair.label ? <span style={verb}>{pair.label}</span> : null}
      <b>{pair.value}</b>
    </span>
  )
}

function stringList(value: unknown): { step: string; text: string }[] {
  const rows = Array.isArray(value) ? value : typeof value === 'string' && value.trim() ? value.split('\n') : []
  return rows.map((item) => String(item ?? '').trim()).filter(Boolean).map((line) => {
    const matched = line.match(/^(\d+)\.\s*(.*)$/)
    return matched ? { step: matched[1], text: matched[2] } : { step: '', text: line }
  })
}

function CompiledLine({ items }: { items: { text: string }[] }) {
  if (!items.length) return <span style={plain}>未编译</span>
  return (
    <span style={{ lineHeight: 1.7 }}>
      {items.map((item, index) => {
        const blocked = item.text.startsWith('×') || item.text.includes('无法')
        return (
          <span key={index} style={{ display: 'block', marginBottom: 4 }}>
            <span style={{ ...chip, ...(blocked ? skip : {}) }}>
              <i style={{ ...badge, background: blocked ? 'var(--w-warn)' : 'var(--w-primary)' }}>{index + 1}</i>
              <b>{item.text}</b>
            </span>
          </span>
        )
      })}
    </span>
  )
}

function MarkedLine({ text }: { text: string }) {
  const clauses = markClauses(text)
  return (
    <span style={{ lineHeight: 1.7 }}>
      {clauses.map((clause, index) => (
        <span key={index}>
          {index > 0 ? <span>，</span> : null}
          <span style={{ ...chip, ...(clause.skip ? skip : {}) }}>
            <i style={{ ...badge, background: clause.skip ? 'var(--w-warn)' : 'var(--w-primary)' }}>{index + 1}</i>
            {clause.verb ? <span style={verb}>{clause.verb}</span> : null}
            <b>{clause.param}</b>
          </span>
          {clause.skip ? <span style={cant}>无法执行</span> : null}
        </span>
      ))}
    </span>
  )
}

function ModeButton({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} style={{ ...mode, ...(pressed ? modeOn : {}) }}>
      {children}
    </button>
  )
}

const row: CSSProperties = { display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr)', gap: 6, padding: '3px 0', alignItems: 'start', minWidth: 0 }
const num: CSSProperties = { color: 'var(--w-text-tertiary)', fontWeight: 750, fontVariantNumeric: 'tabular-nums', fontSize: 12 }
const plain: CSSProperties = { minWidth: 0, color: 'var(--w-text-secondary)', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
const chip: CSSProperties = { display: 'inline', background: '#e7ebf8', borderRadius: 5, padding: '1px 5px', lineHeight: 1.7, fontSize: 12, overflowWrap: 'anywhere' }
const skip: CSSProperties = { background: 'var(--w-warn-bg)' }
const verb: CSSProperties = { fontWeight: 750, color: '#312e81', marginRight: 3 }
const badge: CSSProperties = {
  display: 'inline-grid', placeItems: 'center', width: 15, height: 15, marginRight: 3,
  borderRadius: 4, color: '#fff', fontSize: 10, fontWeight: 800, fontStyle: 'normal', verticalAlign: '1px',
}
const cant: CSSProperties = { marginLeft: 4, color: 'var(--w-warn)', fontSize: 11, fontWeight: 750 }
const mode: CSSProperties = {
  border: '1px solid var(--w-border-strong)', background: 'var(--w-surface)', borderRadius: 8,
  padding: '2px 8px', fontSize: 11, fontWeight: 700, color: 'var(--w-text-secondary)', cursor: 'pointer',
}
const modeOn: CSSProperties = { borderColor: 'var(--w-primary)', background: 'var(--w-primary-soft)', color: 'var(--w-primary)' }
const more: CSSProperties = { marginTop: 2, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontSize: 11, fontWeight: 650, color: 'var(--w-primary)' }
