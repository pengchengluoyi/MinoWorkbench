import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import * as XLSX from 'xlsx'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, InputNumber, Modal, Select, StatusPill, errText, useFeedback } from '@/ui'
import { commitCaseImport, listImportRequirements, previewCaseImport, type ImportPreviewRow } from '@/api/projectCases'
import { getProjectEnv } from '@/api/projectEnv'
import { unwrapOne } from '@/lib/unwrap'
import { channelTitle, normalizeEnvDoc } from '../config/envModel'
import { caseKeys } from './queries'
import {
  FIELD_OPTS, FLAG_LABELS, detectHeaderRow, headerRowLooksValid, suggestColumnMap, suggestSkipRows,
} from './caseImportTable'
import { ScriptField } from './ScriptField'

type Step = 'file' | 'map' | 'preview'

function cellText(value: unknown) {
  if (value == null) return ''
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10)
  return String(value)
    .replace(/_x([0-9A-Fa-f]{4})_/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
}

function remarkOf(row: ImportPreviewRow) {
  const remark = String(row.remark || '').trim()
  if (remark) return remark
  const flags = Array.isArray(row.flags) ? row.flags.map(String).filter((flag) => flag !== 'ui_not_coverable') : []
  return flags.map((flag) => FLAG_LABELS[flag] || flag).join(' · ')
}

/**
 * 导入分三步：选文件、核对列名并跳过表头、看解析结果再写入。
 * 列对错了就不能直接进库，所以解析之前必须能改列名行和字段映射。
 */
export function CaseImportDialog({ projectId, open, onClose }: { projectId: string; open: boolean; onClose: () => void }) {
  const fb = useFeedback()
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('file')
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState('')
  const [table, setTable] = useState<string[][]>([])
  const [headerRow, setHeaderRow] = useState(0)
  const [skip, setSkip] = useState<number[]>([])
  const [columnMap, setColumnMap] = useState<Record<string, number>>({})
  const [rows, setRows] = useState<ImportPreviewRow[]>([])
  const [token, setToken] = useState('')
  const [reqId, setReqId] = useState('')
  const [platform, setPlatform] = useState('')
  const [error, setError] = useState('')
  const [onlyIssues, setOnlyIssues] = useState(false)

  const requirements = useQuery({
    queryKey: ['project', projectId, 'import-requirements'],
    enabled: open && !!projectId,
    queryFn: async () => (await listImportRequirements(projectId)).data?.requirements || [],
  })
  const env = useQuery({
    queryKey: ['project', projectId, 'env'],
    enabled: open && !!projectId,
    queryFn: async () => normalizeEnvDoc(unwrapOne(await getProjectEnv(projectId))),
  })
  const reqs = requirements.data || []
  const platforms = (env.data?.channels || []).map((channel) => ({ id: channel.id, label: channelTitle(channel) }))

  useEffect(() => {
    if (!reqId && reqs[0]?.id) setReqId(reqs[0].id)
  }, [reqId, reqs])
  useEffect(() => {
    if (!platform && platforms[0]?.id) setPlatform(platforms[0].id)
  }, [platform, platforms])

  const labels = useMemo(
    () => (table[headerRow] || []).map((cell, index) => cell.trim() || `列${index + 1}`),
    [table, headerRow],
  )
  const headerOk = headerRowLooksValid(labels)
  const mapped = new Set(Object.values(columnMap))
  const colCount = Math.max(0, ...table.map((row) => row.length))
  const conflicts = rows.filter((row) => row.conflict)
  const issueCount = rows.filter((row) => row.conflict || remarkOf(row)).length
  const shown = onlyIssues ? rows.filter((row) => row.conflict || remarkOf(row)) : rows

  const reset = () => {
    setStep('file')
    setFileName('')
    setTable([])
    setHeaderRow(0)
    setSkip([])
    setColumnMap({})
    setRows([])
    setToken('')
    setError('')
    setOnlyIssues(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const onFile = async (file: File) => {
    setBusy(true)
    setError('')
    try {
      const book = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
      const names = book.SheetNames || []
      const sheetName = names.find((name) => /测试用例|用例/.test(name)) || names[0]
      if (!sheetName) throw new Error('Excel 里没有工作表')
      const grid = (XLSX.utils.sheet_to_json(book.Sheets[sheetName], { header: 1, defval: '', raw: false }) as unknown[][])
        .map((line) => (Array.isArray(line) ? line : []).map(cellText))
        .filter((line) => line.some((cell) => cell.trim()))
      if (!grid.length) throw new Error('工作表是空的')
      const head = detectHeaderRow(grid)
      setFileName(file.name)
      setTable(grid)
      setHeaderRow(head)
      setSkip([...suggestSkipRows(grid, head)])
      setColumnMap(suggestColumnMap((grid[head] || []).map((cell, index) => cell.trim() || `列${index + 1}`)))
      setRows([])
      setToken('')
      setStep('map')
    } catch (e) {
      setError(errText(e, '读取文件失败'))
      fb.fail(errText(e, '读取文件失败'))
    } finally {
      setBusy(false)
    }
  }

  const changeHeader = (value: number) => {
    const next = Math.max(0, Math.min(table.length - 1, value))
    setHeaderRow(next)
    setColumnMap(suggestColumnMap((table[next] || []).map((cell, index) => cell.trim() || `列${index + 1}`)))
  }

  const preview = async () => {
    const requirementId = reqId || reqs[0]?.id || ''
    if (!requirementId) {
      const message = requirements.isError
        ? errText(requirements.error, '读不到需求列表')
        : '这个项目还没有需求，导入的用例需要挂在一条需求下'
      setError(message)
      return fb.warn(message)
    }
    if (!headerOk) return fb.warn('这一行不像列名。改到含「用例编号」「名称」的那一行，其它表头勾选跳过。')
    if (columnMap.platform == null && platforms.length && !platform) return fb.warn('没有映射「端」列，先选一个默认端')
    setBusy(true)
    setError('')
    try {
      const res = await previewCaseImport(projectId, {
        requirement_id: requirementId,
        table,
        header_row: headerRow,
        skip_rows: skip,
        column_map: columnMap,
        default_platform: platform,
      })
      const data = res.data || {}
      setToken(data.preview_token || '')
      setRows((data.rows || []).map((row) => ({
        ...row,
        selected: row.selected_by_default !== false,
        on_conflict: row.conflict ? 'skip' : 'skip',
      })))
      setStep('preview')
      const count = data.parsed || data.rows?.length || 0
      if (data.conflicts?.length) fb.warn(`已解析 ${count} 条，${data.conflicts.length} 条和库里的用例冲突`)
      else fb.ok(`已解析 ${count} 条用例`)
    } catch (e) {
      const message = errText(e, '解析失败')
      setError(message)
      fb.fail(message)
    } finally {
      setBusy(false)
    }
  }

  const commit = async () => {
    const picked = rows.filter((row) => row.selected !== false)
    if (!token || !picked.length) return fb.warn('至少留下一条')
    setBusy(true)
    try {
      const res = await commitCaseImport(projectId, {
        requirement_id: reqId || reqs[0]?.id || '',
        preview_token: token,
        default_on_conflict: 'skip',
        default_platform: platform,
        rows: rows.map((row) => ({
          row_index: row.row_index,
          selected: row.selected !== false,
          on_conflict: String(row.on_conflict || 'skip'),
        })),
      })
      const data = res.data || {}
      fb.ok(`新增 ${data.created || 0}，更新 ${data.updated || 0}，跳过 ${data.skipped || 0}`)
      void qc.invalidateQueries({ queryKey: caseKeys.list(projectId) })
      reset()
      onClose()
    } catch (e) {
      fb.fail(errText(e, '写入失败'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="导入用例"
      open={open}
      onCancel={() => { reset(); onClose() }}
      width={step === 'file' ? 560 : 'min(1440px, calc(100vw - 32px))'}
      footer={null}
      destroyOnHidden
    >
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) void onFile(file)
      }} />
      {step === 'file' ? (
        <p style={{ margin: '0 0 12px', color: 'var(--w-text-tertiary)', fontSize: 'var(--w-font-sm)', lineHeight: 1.55 }}>
          先选表格。下一页核对哪一行是列名、哪些列对应字段，确认后再看解析结果。
        </p>
      ) : null}

      {step === 'file' && (
        <div className="flex flex-col items-start" style={{ gap: 12 }}>
          {reqs.length > 1 ? (
            <Select value={reqId || undefined} placeholder="挂到哪条需求" style={{ width: '100%' }} options={reqs.map((req) => ({ value: req.id, label: req.title || req.id }))} onChange={setReqId} />
          ) : reqs[0] ? <span style={{ color: 'var(--w-text-tertiary)' }}>写入需求：{reqs[0].title || reqs[0].id}</span> : null}
          <span style={{ color: 'var(--w-text-quaternary)', fontSize: 'var(--w-font-sm)' }}>多级表头时，第 0 行可能是「回归」，下一行才是列名。</span>
          {error ? <span style={{ color: 'var(--w-fail)' }}>{error}</span> : null}
          <Button type="primary" loading={busy} onClick={() => inputRef.current?.click()}>选择表格</Button>
        </div>
      )}

      {step === 'map' && (
        <div className="flex flex-col" style={{ gap: 12 }}>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2" style={{ fontSize: 'var(--w-font-sm)' }}>
              列名行（0 起）
              <InputNumber min={0} max={Math.max(0, table.length - 1)} value={headerRow} onChange={(value) => changeHeader(Number(value) || 0)} />
            </label>
            <span className="min-w-0 truncate" style={{ color: 'var(--w-text-tertiary)', fontSize: 'var(--w-font-sm)' }}>{fileName} · {labels.filter(Boolean).slice(0, 8).join(' · ') || '—'}</span>
          </div>
          {!headerOk ? (
            <p style={{ margin: 0, color: 'var(--w-warn)', fontSize: 'var(--w-font-sm)' }}>
              下拉框应出现「用例编号」「用例名称」，而不是具体用例的内容。把列名行改到真正的表头，其它说明行勾选跳过。
            </p>
          ) : null}
          {platforms.length ? (
            <label className="flex flex-wrap items-center gap-2" style={{ fontSize: 'var(--w-font-sm)' }}>
              默认端
              <Select value={platform || undefined} style={{ width: 200 }} options={platforms.map((item) => ({ value: item.id, label: item.label }))} onChange={setPlatform} />
              <span style={{ color: 'var(--w-text-quaternary)' }}>{columnMap.platform == null ? '没映射「端」列时，导入的用例都用这个端' : '已映射「端」列；格子空着时用这个端'}</span>
            </label>
          ) : null}
          <div className="grid" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8 }}>
            {FIELD_OPTS.map((field) => {
              const picked = columnMap[field.key]
              return (
                <label key={field.key} className="flex min-w-0 flex-col gap-1" style={{ padding: '8px 10px', border: '1px solid var(--w-border)', borderRadius: 'var(--w-radius)', background: picked == null ? 'var(--w-surface)' : 'var(--w-primary-soft)' }}>
                  <span style={{ fontWeight: 650 }}>{field.label}</span>
                  <Select
                    allowClear
                    size="small"
                    placeholder="未对应"
                    style={{ width: '100%' }}
                    value={picked}
                    options={labels.map((label, index) => ({ value: index, label: `${index} ${label}` }))}
                    onChange={(value) => setColumnMap((prev) => {
                      const next = { ...prev }
                      if (value == null) delete next[field.key]
                      else next[field.key] = Number(value)
                      return next
                    })}
                  />
                </label>
              )
            })}
          </div>
          <div className="overflow-auto" style={{ maxHeight: '42vh', border: '1px solid var(--w-border)', borderRadius: 'var(--w-radius-lg)' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 'var(--w-font-sm)', width: '100%', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '4%' }} />
                <col style={{ width: '3%' }} />
                {Array.from({ length: colCount }, (_, index) => (
                  <col key={index} style={{ width: `${colShare(mapped.has(index), colCount, mapped.size)}%` }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th style={th}>跳过</th>
                  <th style={th}>#</th>
                  {Array.from({ length: colCount }, (_, index) => {
                    const field = FIELD_OPTS.find((item) => columnMap[item.key] === index)
                    return <th key={index} style={{ ...th, color: field ? 'var(--w-primary)' : undefined, boxShadow: field ? 'inset 0 -2px 0 var(--w-primary)' : undefined }}>{field ? field.label : `列${index}`}</th>
                  })}
                </tr>
              </thead>
              <tbody>
                {table.map((line, rowIndex) => {
                  const isHead = rowIndex === headerRow
                  const isSkip = skip.includes(rowIndex)
                  return (
                    <tr key={rowIndex}>
                      <td style={sheetCell(isHead, isSkip)}>
                        <input
                          type="checkbox"
                          disabled={isHead}
                          checked={isSkip}
                          onChange={(e) => setSkip((prev) => e.target.checked ? [...prev, rowIndex] : prev.filter((item) => item !== rowIndex))}
                        />
                      </td>
                      <td style={sheetCell(isHead, isSkip)}>{rowIndex}</td>
                      {Array.from({ length: colCount }, (_, col) => (
                        <td key={col} style={{ ...sheetCell(isHead, isSkip), whiteSpace: 'pre-wrap' }}>
                          {line[col] || ''}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setStep('file')}>上一步</Button>
            <Button type="primary" loading={busy} onClick={() => void preview()}>解析预览</Button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="flex flex-col" style={{ gap: 12 }}>
          <div className="flex flex-wrap items-center gap-2">
            <span style={{ color: 'var(--w-text-tertiary)', fontSize: 'var(--w-font-sm)' }}>
              共 {rows.length} 条{issueCount ? `，${issueCount} 条需要看` : ''}{conflicts.length ? `，冲突 ${conflicts.length} 条` : ''}
            </span>
            <span style={{ flex: 1 }} />
            <Button size="small" type={onlyIssues ? 'primary' : 'default'} onClick={() => setOnlyIssues((value) => !value)}>
              {onlyIssues ? '显示全部' : '只看需处理'}
            </Button>
          </div>
          <div className="overflow-auto" style={{ maxHeight: '52vh', border: '1px solid var(--w-border)', borderRadius: 'var(--w-radius-lg)' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 'var(--w-font-sm)', minWidth: '100%' }}>
              <thead>
                <tr>
                  {['导入', '结果', '编号', '名称', '端', '前置条件', '步骤摘要', '预期摘要', '备注'].map((title) => <th key={title} style={th}>{title}</th>)}
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => {
                  const remark = remarkOf(row)
                  const tone = row.conflict ? 'fail' : remark ? 'warn' : undefined
                  const paint = (extra?: CSSProperties): CSSProperties => ({ ...td, ...toneCell(tone), ...extra })
                  return (
                    <tr key={row.row_index}>
                      <td style={paint({ boxShadow: tone === 'fail' ? 'inset 3px 0 0 var(--w-fail)' : tone === 'warn' ? 'inset 3px 0 0 var(--w-warn)' : undefined })}>
                        <input type="checkbox" checked={row.selected !== false} onChange={(e) => setRows((prev) => prev.map((item) => item.row_index === row.row_index ? { ...item, selected: e.target.checked } : item))} />
                      </td>
                      <td style={paint()}>
                        <StatusPill status={tone === 'fail' ? 'fail' : tone === 'warn' ? 'warn' : 'pass'}>
                          {tone === 'fail' ? '冲突' : tone === 'warn' ? '需处理' : '可导入'}
                        </StatusPill>
                      </td>
                      <td style={paint({ whiteSpace: 'nowrap' })}>{String(row.case_id || '（系统生成）')}</td>
                      <td style={paint({ fontWeight: 650 })}>{String(row.name || '')}</td>
                      <td style={paint()}>{String(row.platform || platform || '—')}</td>
                      <td style={paint({ width: '18%' })}><ScriptField kind="pre" value={row.precondition_preview || row.precondition} /></td>
                      <td style={paint({ width: '24%' })}><ScriptField kind="op" value={row.steps_preview || row.steps} compiled={row.steps_parsed ?? []} /></td>
                      <td style={paint({ width: '24%' })}><ScriptField kind="ex" value={row.expected_preview || row.expected} compiled={row.expected_parsed ?? []} /></td>
                      <td style={paint({ width: '12%' })}>{flagLine(row) || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setStep('map')}>上一步</Button>
            <Button type="primary" loading={busy} onClick={() => void commit()}>确认导入</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/** 选中的列比未选中的列多 30% 宽度。跳过和行号占掉 7%，其余铺满弹窗。 */
function colShare(selected: boolean, count: number, selectedCount: number) {
  const weight = selected ? 1.3 : 1
  const total = (count - selectedCount) + selectedCount * 1.3
  return total ? (weight / total) * 93 : 0
}

function flagLine(row: ImportPreviewRow) {
  const flags = Array.isArray(row.flags) ? row.flags.map(String) : []
  const text = flags.map((flag) => FLAG_LABELS[flag]).filter(Boolean).join(' · ')
  return text || (row.conflict ? '与库中已有用例冲突' : '')
}

function sheetCell(header: boolean, skip: boolean): CSSProperties {
  return {
    ...td,
    background: header ? 'var(--w-primary-soft)' : undefined,
    color: skip && !header ? 'var(--w-text-quaternary)' : undefined,
  }
}

function toneCell(tone: 'fail' | 'warn' | undefined): CSSProperties {
  if (tone === 'fail') return { background: 'var(--w-fail-bg)' }
  if (tone === 'warn') return { background: 'var(--w-warn-bg)' }
  return {}
}

const th: CSSProperties = {
  position: 'sticky',
  top: 0,
  textAlign: 'left',
  padding: '6px 8px',
  background: 'var(--w-surface)',
  borderBottom: '1px solid var(--w-border)',
  whiteSpace: 'nowrap',
}
const td: CSSProperties = {
  padding: '6px 8px',
  borderBottom: '1px solid var(--w-border)',
  verticalAlign: 'top',
}
