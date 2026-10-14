import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import * as XLSX from 'xlsx'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, InputNumber, Modal, Select, StatusPill, errText, useFeedback } from '@/ui'
import { cancelImportPreview, commitCaseImport, getImportPreview, listImportRequirements, previewCaseImport, retryImportPreviewRow, type ImportPreviewRow } from '@/api/projectCases'
import { getProjectEnv } from '@/api/projectEnv'
import { unwrapOne } from '@/lib/unwrap'
import { channelTitle, normalizeEnvDoc } from '../config/envModel'
import { caseKeys } from './queries'
import {
  FIELD_OPTS, FLAG_LABELS, detectHeaderRow, headerRowLooksValid, suggestColumnMap, suggestSkipRows,
} from './caseImportTable'
import { CasePreviewLegend, CaseScriptSections } from './CaseScriptSections'
import { importDecision, mergePreviewRows, recordOf, rowAttention } from './caseUnderstanding'
import './CaseImportDialog.css'

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

function selectable(row: ImportPreviewRow) {
  return row.parse_status === 'done'
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
  const [activeRow, setActiveRow] = useState<number | null>(null)
  const [progress, setProgress] = useState({ parsed: 0, total: 0, done: true })
  const [pollError, setPollError] = useState('')
  const [pollVersion, setPollVersion] = useState(0)

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
  const reqs = useMemo(() => requirements.data || [], [requirements.data])
  const platforms = useMemo(() => (env.data?.channels || []).map((channel) => ({ id: channel.id, label: channelTitle(channel) })), [env.data])

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
  const requiredFields = FIELD_OPTS.filter((field) => ['name', 'steps', 'expected'].includes(field.key))
  const missingFields = requiredFields.filter((field) => columnMap[field.key] == null)
  const duplicateMapping = mapped.size !== Object.keys(columnMap).length
  const hasDataRows = table.some((line, index) => index > headerRow && !skip.includes(index) && line.some((cell) => cell.trim()))
  const issues = rows.filter(rowAttention)
  const shown = onlyIssues ? issues : rows
  const current = shown.find((row) => row.row_index === activeRow) || shown[0]
  const readyCount = rows.filter(selectable).length
  const errorCount = rows.filter((row) => row.parse_status === 'error').length
  const createCount = rows.filter((row) => importDecision(row) === 'create').length
  const overwriteCount = rows.filter((row) => importDecision(row) === 'overwrite').length
  const skipCount = rows.filter((row) => importDecision(row) === 'skip').length
  const writeCount = createCount + overwriteCount

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
    setActiveRow(null)
    setPollError('')
    setProgress({ parsed: 0, total: 0, done: true })
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
      if (!grid.some((line) => line.some((cell) => cell.trim()))) throw new Error('工作表是空的')
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
    setSkip((previous) => [...new Set([...previous, ...suggestSkipRows(table, next)])].filter((index) => index !== next))
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
    if (missingFields.length) return fb.warn(`请对应必要字段：${missingFields.map((field) => field.label).join('、')}`)
    if (duplicateMapping) return fb.warn('一个表格列只能对应一个字段，请检查重复映射')
    if (!hasDataRows) return fb.warn('没有可解析的数据行，请检查列名行与跳过的行')
    if (columnMap.platform == null && platforms.length && !platform) return fb.warn('没有映射「端」列，先选一个默认端')
    setBusy(true)
    setError('')
    setPollError('')
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
      if (!data.preview_token) throw new Error('未返回预览标识，请重新解析')
      setToken(data.preview_token)
      setProgress({ parsed: data.parsed || 0, total: data.total || data.rows?.length || 0, done: Boolean(data.done) })
      setRows(mergePreviewRows([], data.rows || []))
      setActiveRow(null)
      setStep('preview')
      fb.ok(`开始解析 ${data.total || data.rows?.length || 0} 条，完成的用例会逐条显示`)
    } catch (e) {
      const message = errText(e, '解析失败')
      setError(message)
      fb.fail(message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!open || step !== 'preview' || !token || progress.done) return
    let stop = false
    let failures = 0
    let timer: number | undefined
    const poll = async () => {
      try {
        const res = await getImportPreview(projectId, token)
        if (stop) return
        const data = res.data || {}
        failures = 0
        setPollError('')
        setProgress({ parsed: data.parsed || 0, total: data.total || 0, done: Boolean(data.done) })
        if (data.rows) setRows((previous) => mergePreviewRows(previous, data.rows || []))
        if (!data.done) timer = window.setTimeout(() => void poll(), 1000)
      } catch (exception) {
        if (stop) return
        failures += 1
        if (failures >= 3) setPollError(errText(exception, '读取解析进度失败，请重新读取'))
        else timer = window.setTimeout(() => void poll(), 2000)
      }
    }
    void poll()
    return () => { stop = true; window.clearTimeout(timer) }
  }, [open, step, token, progress.done, projectId, pollVersion])

  const retryRow = async (rowIndex: number) => {
    setBusy(true)
    try {
      const res = await retryImportPreviewRow(projectId, token, rowIndex)
      const data = res.data || {}
      if (data.rows) setRows((previous) => mergePreviewRows(previous, data.rows || []))
      setProgress({ parsed: data.parsed || 0, total: data.total || 0, done: Boolean(data.done) })
      setPollError('')
      setPollVersion((value) => value + 1)
    } catch (exception) {
      fb.fail(errText(exception, '重试失败'))
    } finally {
      setBusy(false)
    }
  }

  const commit = async () => {
    if (!progress.done) return fb.warn('解析完成后才能导入')
    if (!token || !writeCount) return fb.warn('请选择可导入的用例；同名冲突需要选择覆盖才会写入')
    setBusy(true)
    try {
      const res = await commitCaseImport(projectId, {
        requirement_id: reqId || reqs[0]?.id || '',
        preview_token: token,
        default_on_conflict: 'skip',
        default_platform: platform,
        rows: rows.map((row) => ({
          row_index: row.row_index,
          selected: row.selected !== false && selectable(row),
          on_conflict: String(row.on_conflict || 'skip'),
        })),
      })
      const data = res.data || {}
      fb.ok(`新增 ${data.created || 0}，更新 ${data.updated || 0}，跳过 ${data.skipped || 0}${recordOf(data).blocked ? `，未写入 ${recordOf(data).blocked}` : ''}`)
      await qc.invalidateQueries({ queryKey: caseKeys.list(projectId) })
      reset()
      onClose()
    } catch (e) {
      fb.fail(errText(e, '写入失败'))
    } finally {
      setBusy(false)
    }
  }

  const leavePreview = async (close: boolean) => {
    if (busy) return
    setBusy(true)
    try {
      if (token) await cancelImportPreview(projectId, token)
      if (close) { reset(); onClose() }
      else { setToken(''); setRows([]); setPollError(''); setStep('map') }
    } catch (exception) {
      const message = errText(exception, '停止旧预览失败，请重试')
      if (close) { reset(); onClose(); fb.warn(`${message}；窗口已关闭，后台解析可能仍在继续`) }
      else { setPollError(message); fb.fail(message) }
    } finally { setBusy(false) }
  }

  return (
    <Modal
      title="导入用例"
      open={open}
      onCancel={() => void leavePreview(true)}
      closable={!busy}
      maskClosable={!busy}
      keyboard={!busy}
      width={step === 'file' ? 620 : 'min(1600px, calc(100vw - 32px))'}
      footer={null}
      destroyOnHidden
      className="case-import-dialog"
    >
      <div className="case-import-stages" aria-label="导入进度">{(['file', 'map', 'preview'] as Step[]).map((item, index) => <span key={item} data-active={step === item}><b>{index + 1}</b>{item === 'file' ? '选择表格' : item === 'map' ? '核对字段' : '审阅解析'}</span>)}</div>
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
              未自动识别这一行的列名。请确认表头位置，并手动对应名称、操作和预期；其它说明行勾选跳过。
            </p>
          ) : null}
          {platforms.length ? (
            <label className="flex flex-wrap items-center gap-2" style={{ fontSize: 'var(--w-font-sm)' }}>
              默认端
              <Select value={platform || undefined} style={{ width: 200 }} options={platforms.map((item) => ({ value: item.id, label: item.label }))} onChange={setPlatform} />
              <span style={{ color: 'var(--w-text-quaternary)' }}>{columnMap.platform == null ? '没映射「端」列时，导入的用例都用这个端' : '已映射「端」列；格子空着时用这个端'}</span>
            </label>
          ) : null}
          <div className="case-import-mapping">
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
          {missingFields.length || duplicateMapping ? <div className="case-import-mapping-notice" role="status">{duplicateMapping ? '存在重复列映射。每列只能对应一个字段。' : `还需对应：${missingFields.map((field) => field.label).join('、')}`}</div> : null}
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
            <Button type="primary" loading={busy} disabled={!!missingFields.length || duplicateMapping || !hasDataRows} onClick={() => void preview()}>解析预览</Button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="case-import-preview">
          {pollError ? <div role="alert" className="case-import-error">{pollError} <Button size="small" onClick={() => { setPollError(''); setPollVersion((value) => value + 1) }}>重新读取进度</Button></div> : null}
          <div className="case-import-summary">
            <div><strong>{progress.parsed} / {progress.total || rows.length}</strong><span>{progress.done ? '解析已结束' : '正在逐条解析'}</span></div>
            <div><strong>{readyCount}</strong><span>解析成功</span></div>
            <div data-tone="attention"><strong>{issues.length}</strong><span>需要审阅</span></div>
            <div data-tone={errorCount ? 'error' : undefined}><strong>{errorCount}</strong><span>解析失败</span></div>
            <div className="case-import-progress"><span style={{ width: `${Math.min(100, progress.total ? progress.parsed / progress.total * 100 : 0)}%` }} /></div>
          </div>
          <div className="case-import-review-layout">
            <aside className="case-import-list" aria-label="待导入用例">
              <div className="case-import-list-toolbar"><strong>用例清单 · {rows.length}</strong><Button size="small" type={onlyIssues ? 'primary' : 'text'} onClick={() => setOnlyIssues((value) => !value)}>{onlyIssues ? '显示全部' : '只看需处理'}</Button></div>
              <div className="case-import-selection-tools"><button type="button" disabled={busy} onClick={() => setRows((previous) => previous.map((row) => shown.some((item) => item.row_index === row.row_index) && selectable(row) ? { ...row, selected: true } : row))}>选择当前可导入项</button><button type="button" disabled={busy} onClick={() => setRows((previous) => previous.map((row) => shown.some((item) => item.row_index === row.row_index) ? { ...row, selected: false } : row))}>取消当前选择</button></div>
              <div className="case-import-row-list">
                {shown.map((row) => <div key={row.row_index} className="case-import-row" data-active={row.row_index === current?.row_index}>
                  <input aria-label={`导入${row.name || row.title || '用例'}`} type="checkbox" disabled={busy || !selectable(row)} checked={selectable(row) && row.selected !== false} onChange={(event) => setRows((previous) => previous.map((item) => item.row_index === row.row_index ? { ...item, selected: event.target.checked } : item))} />
                  <button type="button" className="case-import-row-main" onClick={() => setActiveRow(row.row_index)} aria-pressed={row.row_index === current?.row_index}>
                    <strong>{String(row.name || row.title || '未命名用例')}</strong>
                    <span>{String(row.module || '未分组')} · {String(row.platform || platform || '未指定端')}</span>
                    <span className="case-import-row-meta"><StatusPill status={row.parse_status === 'pending' ? 'running' : row.parse_status === 'error' ? 'fail' : row.parse_status === 'incomplete' || row.parse_status === 'cancelled' ? 'muted' : rowAttention(row) ? 'warn' : 'pass'}>{row.parse_status === 'pending' ? '解析中' : row.parse_status === 'error' ? '失败' : row.parse_status === 'incomplete' ? '缺列' : row.parse_status === 'cancelled' ? '已停止' : row.conflict ? '同名冲突' : rowAttention(row) ? '需审阅' : '可导入'}</StatusPill><span>{String(row.case_id || '自动生成编号')}</span></span>
                  </button>
                </div>)}
                {!shown.length ? <p className="case-import-empty">{onlyIssues ? '没有需要处理的用例' : '没有预览记录，请返回检查字段映射'}</p> : null}
              </div>
            </aside>
            <main className="case-import-review" aria-label="导入解析审阅">
              {current ? <>
                <div className="case-import-review-header"><div><span className="case-import-eyebrow">原文与解析 · 表格第 {Number(current.row_index) + 1} 行</span><h2>{String(current.name || current.title || '未命名用例')}</h2><span className="case-import-identifiers">{String(current.case_id || '保存时生成用例编号')} · {String(current.platform || platform || '未指定端')}</span></div>
                  {current.parse_status === 'error' ? <Button size="small" loading={busy} onClick={() => void retryRow(current.row_index)}>重新解析本条</Button> : null}
                </div>
                {current.conflict ? <div className="case-import-conflict"><div><strong>存在同名用例</strong><span>跳过会保留现有用例；覆盖会以本次解析结果更新。</span></div><Select aria-label="同名冲突处理" size="small" disabled={busy} value={String(current.on_conflict || 'skip')} options={[{ value: 'skip', label: '跳过本条' }, { value: 'overwrite', label: '覆盖现有用例' }]} onChange={(value) => setRows((previous) => previous.map((row) => row.row_index === current.row_index ? { ...row, on_conflict: value } : row))} /></div> : null}
                {remarkOf(current) && current.parse_status !== 'pending' ? <div className="case-import-remark" role={current.parse_status === 'error' ? 'alert' : 'status'}>{remarkOf(current)}</div> : null}
                <CasePreviewLegend />
                <CaseScriptSections row={current} status={current.parse_status === 'pending' ? 'pending' : current.parse_status === 'error' ? 'error' : current.parse_status === 'incomplete' ? 'incomplete' : current.parse_status === 'cancelled' ? 'cancelled' : 'ready'} />
              </> : null}
            </main>
          </div>
          <div className="case-import-footer"><div><strong>将写入 {writeCount} 条</strong><span>新增 {createCount} · 覆盖 {overwriteCount} · 冲突跳过 {skipCount}</span>{!progress.done ? <span>解析完成后可确认导入</span> : null}</div><div className="case-import-footer-actions"><Button disabled={busy} onClick={() => void leavePreview(false)}>返回字段映射</Button><Button type="primary" loading={busy} disabled={!progress.done || !writeCount} onClick={() => void commit()}>确认导入（{writeCount}）</Button></div></div>
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

function sheetCell(header: boolean, skip: boolean): CSSProperties {
  return {
    ...td,
    background: header ? 'var(--w-primary-soft)' : undefined,
    color: skip && !header ? 'var(--w-text-quaternary)' : undefined,
  }
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
