import { useState } from 'react'
import { splitNumbered } from './caseText'

/**
 * 用例的操作步骤 / 预期结果。
 *
 * 这两个字段的原文是「1. xxx\n2. yyy」或字符串数组，
 * 必须按行渲染 —— 挤成一行完全读不了（第一版只显示了前置条件，这两列直接漏了）。
 *
 * 行数多的时候先显示前 N 行，点开看全部：表格行高不能被一条长用例拉爆。
 */
export function NumberedLines({
  value,
  max = 3,
}: {
  value: unknown
  max?: number
}) {
  const [open, setOpen] = useState(false)
  const lines = splitNumbered(value)

  if (!lines.length) return <span style={{ color: 'var(--w-text-quaternary)' }}>—</span>

  const shown = open ? lines : lines.slice(0, max)
  const rest = lines.length - shown.length

  return (
    <div style={{ minWidth: 0 }}>
      <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {shown.map((line, i) => (
          <li
            key={i}
            className="flex gap-1.5"
            style={{
              fontSize: 'var(--w-font-sm)',
              lineHeight: 'var(--w-line-base)',
              color: 'var(--w-text-secondary)',
              marginBottom: 1,
            }}
          >
            <span
              style={{
                flexShrink: 0,
                minWidth: 14,
                color: 'var(--w-text-quaternary)',
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 650,
              }}
            >
              {line.num}.
            </span>
            <span style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{line.text}</span>
          </li>
        ))}
      </ol>
      {rest > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen(true) }}
          style={{
            marginTop: 2,
            border: 'none',
            background: 'transparent',
            padding: 0,
            cursor: 'pointer',
            fontSize: 'var(--w-font-meta)',
            fontWeight: 650,
            color: 'var(--w-primary)',
          }}
        >
          还有 {rest} 条
        </button>
      )}
      {open && lines.length > max && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen(false) }}
          style={{
            marginTop: 2,
            border: 'none',
            background: 'transparent',
            padding: 0,
            cursor: 'pointer',
            fontSize: 'var(--w-font-meta)',
            fontWeight: 650,
            color: 'var(--w-text-quaternary)',
          }}
        >
          收起
        </button>
      )}
    </div>
  )
}
