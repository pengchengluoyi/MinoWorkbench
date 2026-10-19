import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import * as XLSX from 'xlsx'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Input, InputNumber, Modal, Select, StatusPill, errText, useFeedback } from '@/ui'
import { cancelImportPreview, commitCaseImport, createImportRequirement, getCaseImportReceipt, resumeCaseImportReceipt, getImportPreview, listImportRequirements, previewCaseImport, retryImportPreviewRow, type ImportPreviewRow } from '@/api/projectCases'
import { getProjectEnv } from '@/api/projectEnv'
import { unwrapOne } from '@/lib/unwrap'
import { channelTitle, normalizeEnvDoc } from '../config/envModel'
import { caseKeys } from './queries'
import {
  FIELD_OPTS, FLAG_LABELS, detectHeaderRow, headerRowLooksValid, suggestColumnMap,
} from './caseImportTable'
import { importSheetGrid, workbookSheets, resolveSkipRows, MAX_IMPORT_FILE_BYTES, MAPPING_PAGE_SIZE, type ImportSheet } from './caseImportWorkbook'
import { CaseImportResult } from './CaseImportResult'
import { CaseImportSource } from './CaseImportSource'
import { ImportConflictReview } from './ImportConflictReview'
import { buildImportReceipt, type ImportReceipt } from './caseImportReceipt'
import { useSession } from '@/lib/session'
import { readImportRecoveries, importRecoveryTaskKey, restoreImportDecisions, type ImportRecovery } from './importRecovery'
import { CaseReadingLayout, CaseReadingView } from './CaseReadingView'
import { importDecision, mergePreviewRows, recordOf, rowAttention } from './caseUnderstanding'
import './CaseImportDialog.css'

type Step = 'file' | 'sheet' | 'map' | 'preview' | 'result'

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
 * 导入按文件、工作表、字段映射、解析审阅逐层推进。单表文件可直接映射。
 * 列对错了就不能直接进库，所以解析之前必须能改列名行和字段映射。
 */
export function CaseImportDialog({ projectId, appId, open, onClose, initialSourceUrl = '' }: { initialSourceUrl?: string; projectId: string; appId: string; open: boolean; onClose: () => void }) {
  const fb = useFeedback()
  const qc = useQueryClient()
  const owner = useSession(state => state.user?.user_id || '')
  const loadRecoveries = () => {
    try { return readImportRecoveries(sessionStorage, owner, projectId) }
    catch { return [] }
  }
  const [recoveries, setRecoveries] = useState(loadRecoveries)
  const [recoveryKey, setRecoveryKey] = useState('')
  const selectedRecovery = recoveries.find(item => item.key === recoveryKey) || recoveries[0]
  const recovery = selectedRecovery?.record
  const activeRecoveryKey = useRef('')
  const [storageError, setStorageError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const commitStarted = useRef(false)
  const requestId = useRef('')
  const [receipt, setReceipt] = useState<ImportReceipt | null>(null)
  const [cancelState, setCancelState] = useState<'active' | 'stopped' | 'unknown'>('active')
  const [step, setStep] = useState<Step>('file')
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState('')
  const [table, setTable] = useState<string[][]>([])
  const [headerRow, setHeaderRow] = useState(0)
  const [skipOverrides, setSkipOverrides] = useState<Record<number, boolean>>({})
  const workbook = useRef<XLSX.WorkBook | null>(null)
  const [sheets, setSheets] = useState<ImportSheet[]>([])
  const [sheetName, setSheetName] = useState('')
  const [readPhase, setReadPhase] = useState('')
  const [tablePage, setTablePage] = useState(0)
  const [columnMap, setColumnMap] = useState<Record<string, number>>({})
  const [rows, setRows] = useState<ImportPreviewRow[]>([])
  const [token, setToken] = useState('')
  const [reqId, setReqId] = useState('')
  const [requirementName, setRequirementName] = useState('导入用例')
  const [creatingRequirement, setCreatingRequirement] = useState(false)
  const [platform, setPlatform] = useState('')
  const [error, setError] = useState('')
  const [onlyIssues, setOnlyIssues] = useState(false)
  const [activeRow, setActiveRow] = useState<number | null>(null)
  const [progress, setProgress] = useState({ parsed: 0, total: 0, done: true })
  const [pollError, setPollError] = useState('')
  const [pollVersion, setPollVersion] = useState(0)

  const persist = useCallback((record: ImportRecovery) => {
    try {
      if (!owner) throw new Error('当前账号身份未确认')
      const key = activeRecoveryKey.current || importRecoveryTaskKey(record)
      sessionStorage.setItem(key, JSON.stringify(record))
      activeRecoveryKey.current = key
      setStorageError('')
      return true
    } catch {
      setStorageError('浏览器未能保存恢复记录，请勿刷新；提交结果可在结果页导出。')
      return false
    }
  }, [owner])
  const recoveryRecord = useCallback((phase: ImportRecovery['phase'], result?: ImportReceipt): ImportRecovery => ({
    version: 1, owner, projectId, updatedAt: Date.now(), phase, token, fileName, sheetName, requirementId: reqId, platform,
    decisions: rows.map(row => ({ row_index: row.row_index, selected: row.selected !== false, on_conflict: row.on_conflict === 'overwrite' ? 'overwrite' : 'skip' })),
    receipt: result, requestId: requestId.current || undefined,
  }), [owner, projectId, token, fileName, sheetName, reqId, platform, rows])
  useEffect(() => {
    if (busy || !owner) return
    if (step === 'preview' && token) persist(recoveryRecord('preview'))
    if (step === 'result' && receipt) persist(recoveryRecord('result', receipt))
  }, [busy, owner, step, token, receipt, persist, recoveryRecord])

  const restore = async () => {
    if (!recovery || busy) return
    setBusy(true)
    setError('')
    try {
      if (recovery.owner !== useSession.getState().user?.user_id) throw new Error('账号已切换，不能恢复其他账号的记录')
      const saved = recovery
      const source = { fileName: saved.fileName, sheetName: saved.sheetName, requirement: saved.requirementId, platform: saved.platform }
      let restored: ImportPreviewRow[] = []
      let previewData: Awaited<ReturnType<typeof getImportPreview>>['data']
      if (saved.phase === 'preview') {
        previewData = (await getImportPreview(projectId, saved.token)).data
        if (!Array.isArray(previewData?.rows)) throw new Error('未返回可恢复的预览行；记录可能已过期，请核对用例列表。')
        restored = restoreImportDecisions(previewData.rows, saved)
      }
      let recoveredReceipt: ImportReceipt | undefined
      if (saved.phase !== 'preview' && saved.requestId) {
        requestId.current = saved.requestId
        const data = (await getCaseImportReceipt(projectId, saved.requestId)).data
        if (!data?.receipt_id) throw new Error('服务端没有返回持久收据，请重试查询；不会自动重发提交。')
        restored = data.rows || []
        recoveredReceipt = buildImportReceipt(restored, source, data)
      }
      if (saved.owner !== useSession.getState().user?.user_id) return
      activeRecoveryKey.current = selectedRecovery.key
      setFileName(saved.fileName); setSheetName(saved.sheetName); setReqId(saved.requirementId); setPlatform(saved.platform)
      setRows(restored)
      if (saved.phase === 'preview') {
        setToken(saved.token)
        setProgress({ parsed: previewData!.parsed || 0, total: previewData!.total || restored.length, done: previewData!.done === true })
        setCancelState(previewData!.cancelled ? 'stopped' : 'active')
        setStep('preview')
      } else {
        commitStarted.current = true
        setToken('')
        setReceipt(recoveredReceipt || saved.receipt || buildImportReceipt(saved.decisions.map(item => ({ ...item, parse_status: 'done' })), source, undefined, '浏览器在提交期间离开，服务端写入结果未知；请先核对列表，不自动重发。'))
        setStep('result')
      }
    } catch (exception) { setError(errText(exception, '恢复失败，请重试读取；不会重新提交导入。')) }
    finally { setBusy(false) }
  }

  const requirements = useQuery({
    queryKey: ['project', owner, projectId, 'import-requirements'],
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

  const addRequirement = async () => {
    if (busy || creatingRequirement || !requirementName.trim()) return
    setCreatingRequirement(true)
    setError('')
    try {
      const created = (await createImportRequirement(projectId, appId, requirementName.trim())).data?.requirement
      if (!created?.id) throw new Error('未返回需求分组，请重新读取分组列表')
      if (owner !== useSession.getState().user?.user_id) return
      qc.setQueryData<{ id: string; title?: string }[]>(['project', owner, projectId, 'import-requirements'], current =>
        current?.some(item => item.id === created.id) ? current : [...(current || []), created])
      setReqId(created.id)
    } catch (failure) { setError(errText(failure, '添加分组失败')) }
    finally { setCreatingRequirement(false) }
  }

  useEffect(() => {
    if (!reqId && reqs[0]?.id) setReqId(reqs[0].id)
  }, [reqId, reqs])
  useEffect(() => {
    if (!platform && platforms[0]?.id) setPlatform(platforms[0].id)
  }, [platform, platforms])

  const labels = useMemo(
    () => Array.from({ length: table.reduce((count, line) => Math.max(count, line.length), 0) }, (_, index) => table[headerRow]?.[index]?.trim() || `列${index + 1}`),
    [table, headerRow],
  )
  const headerOk = headerRowLooksValid(labels)
  const mapped = new Set(Object.values(columnMap))
  const colCount = table.reduce((count, row) => Math.max(count, row.length), 0)
  const skip = useMemo(() => resolveSkipRows(table, headerRow, skipOverrides), [table, headerRow, skipOverrides])
  const skipSet = useMemo(() => new Set(skip), [skip])
  const sheet = sheets.find(item => item.name === sheetName)
  const gridStats = useMemo(() => ({
    empty: table.filter((line, index) => index > headerRow && !line.some(cell => cell.trim())).length,
    skipped: table.filter((line, index) => index > headerRow && skipSet.has(index) && line.some(cell => cell.trim())).length,
    candidates: table.filter((line, index) => index > headerRow && !skipSet.has(index) && line.some(cell => cell.trim())).length,
  }), [table, headerRow, skipSet])
  const tableStart = tablePage * MAPPING_PAGE_SIZE
  const tableWindow = table.slice(tableStart, tableStart + MAPPING_PAGE_SIZE)
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
    activeRecoveryKey.current = ''
    setRecoveries(loadRecoveries())
    setRecoveryKey('')
    setStorageError('')
    commitStarted.current = false
    requestId.current = ''
    setReceipt(null)
    setCancelState('active')
    setStep('file')
    setFileName('')
    setTable([])
    setHeaderRow(0)
    setSkipOverrides({})
    workbook.current = null
    setSheets([])
    setSheetName('')
    setReadPhase('')
    setTablePage(0)
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

  const selectSheet = (name: string, preparedGrid?: string[][]) => {
    const book = workbook.current
    if (!book && !preparedGrid) return
    const grid = preparedGrid || importSheetGrid(book!, name)
    const head = detectHeaderRow(grid)
    commitStarted.current = false
    setReceipt(null)
    setCancelState('active')
    setSheetName(name)
    setTable(grid)
    setHeaderRow(head)
    setSkipOverrides({})
    setTablePage(Math.floor(head / MAPPING_PAGE_SIZE))
    setColumnMap(suggestColumnMap((grid[head] || []).map((cell, index) => cell.trim() || `列${index + 1}`)))
    setRows([])
    setToken('')
    setError('')
    setStep('map')
  }

  const onFile = async (file: File) => {
    setBusy(true)
    setError('')
    setReadPhase('正在读取文件…')
    try {
      if (file.size > MAX_IMPORT_FILE_BYTES) throw new Error('文件超过 20 MB，请拆分文件后导入；已有映射和内容已保留。')
      const buffer = await file.arrayBuffer()
      setReadPhase('正在识别工作表…')
      await new Promise<void>(resolve => window.setTimeout(resolve, 20))
      const book = XLSX.read(buffer, { type: 'array', cellDates: true, ...(file.name.toLowerCase().endsWith('.csv') ? { codepage: 65001 } : {}) })
      const choices = workbookSheets(book)
      if (!choices.length || choices.every(item => item.empty)) throw new Error('文件中没有包含内容的工作表。')
      const recommended = choices.find(item => !item.empty && /测试用例|用例/.test(item.name)) || choices.find(item => !item.empty)!
      const grid = choices.length === 1 ? importSheetGrid(book, recommended.name) : undefined
      workbook.current = book
      setFileName(file.name)
      setSheets(choices)
      setSheetName(recommended.name)
      setRows([])
      setToken('')
      if (choices.length > 1) setStep('sheet')
      else selectSheet(recommended.name, grid)
    } catch (exception) {
      const message = errText(exception, '读取文件失败')
      setError(message)
      fb.fail(message)
    } finally {
      setBusy(false)
      setReadPhase('')
    }
  }

  const changeHeader = (value: number) => {
    const next = Math.max(0, Math.min(table.length - 1, value))
    setHeaderRow(next)
    setTablePage(Math.floor(next / MAPPING_PAGE_SIZE))
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
    setCancelState('active')
    commitStarted.current = false
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
      activeRecoveryKey.current = ''
      persist({ ...recoveryRecord('preview'), token: data.preview_token, requirementId, decisions: [] })
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
    if (!open || step !== 'preview' || !token || busy) return
    let stop = false
    let failures = 0
    let timer: number | undefined
    const poll = async () => {
      try {
        const res = await getImportPreview(projectId, token)
        if (stop) return
        const data = res.data || {}
        failures = 0
        if (typeof data.cancelled === 'boolean') setCancelState(data.cancelled ? 'stopped' : 'active')
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
  }, [open, step, token, busy, projectId, pollVersion])

  const retryRow = async (rowIndex: number) => {
    setBusy(true)
    try {
      const res = await retryImportPreviewRow(projectId, token, rowIndex)
      const data = res.data || {}
      if (data.rows) setRows((previous) => mergePreviewRows(previous, data.rows || []))
      if (typeof data.cancelled === 'boolean') setCancelState(data.cancelled ? 'stopped' : 'active')
      setProgress({ parsed: data.parsed || 0, total: data.total || 0, done: Boolean(data.done) })
      setPollError('')
      setPollVersion((value) => value + 1)
    } catch (exception) {
      fb.fail(errText(exception, '重试失败'))
    } finally {
      setBusy(false)
    }
  }

  const receiptContext = () => ({ fileName, sheetName, requirement: reqs.find(item => item.id === reqId)?.title || reqId, platform })
  const commit = async () => {
    if (busy || commitStarted.current || cancelState !== 'active') return
    if (!progress.done) return fb.warn('解析完成后才能导入')
    if (!token || !writeCount) return fb.warn('请选择可导入的用例；同名冲突需要选择覆盖才会写入')
    commitStarted.current = true
    requestId.current = 'import-' + crypto.randomUUID()
    const submitted = rows.map(row => ({ ...row }))
    const context = receiptContext()
    persist(recoveryRecord('committing'))
    setBusy(true)
    try {
      const res = await commitCaseImport(projectId, {
        requirement_id: reqId || reqs[0]?.id || '', preview_token: token,
        client_request_id: requestId.current,
        default_on_conflict: 'skip', default_platform: platform,
        rows: submitted.map(row => ({ row_index: row.row_index, selected: row.selected !== false && selectable(row), on_conflict: String(row.on_conflict || 'skip') })),
      })
      const data = res.data
      if (!data || !(['created', 'updated', 'skipped', 'blocked'].some(key => typeof recordOf(data)[key] === 'number') || Array.isArray(data.results))) throw new Error('提交响应没有返回可核对的导入结果')
      const received = buildImportReceipt(submitted, context, data)
      persist(recoveryRecord('result', received))
      setReceipt(received)
      setToken('')
    } catch (exception) {
      const uncertain = { ...buildImportReceipt(submitted, context, undefined, errText(exception, '提交响应未收到，写入结果未知')), requestId: requestId.current }
      persist(recoveryRecord('result', uncertain))
      setReceipt(uncertain)
    } finally {
      setStep('result')
      setBusy(false)
    }
  }

  const queryReceipt = async (resume = false) => {
    const identity = receipt?.requestId || requestId.current
    if (busy || !identity) return
    const capturedOwner = owner
    setError('')
    setBusy(true)
    try {
      const data = (await (resume && receipt?.receiptId
        ? resumeCaseImportReceipt(projectId, receipt.receiptId)
        : getCaseImportReceipt(projectId, identity))).data
      if (capturedOwner !== useSession.getState().user?.user_id) return
      if (!data?.receipt_id) throw new Error('服务端未返回提交收据，请继续查询；不会重新提交原预览。')
      const sourceRows = data.rows || rows
      const received = buildImportReceipt(sourceRows, receipt?.source || receiptContext(), data)
      setRows(sourceRows)
      setReceipt(received)
      persist(recoveryRecord('result', received))
    } catch (exception) { setError(errText(exception, '收据查询失败，请重试查询；已提交行不会重新写入。')) }
    finally { setBusy(false) }
  }

  const requestStop = async () => {
    if (busy || !token) return false
    setBusy(true)
    try {
      const response = await cancelImportPreview(projectId, token)
      if (response.data?.cancelled !== true) throw new Error('服务端未确认停止，请重新读取解析状态')
      setCancelState('stopped')
      setPollError('')
      setPollVersion(value => value + 1)
      return true
    } catch (exception) {
      setCancelState('unknown')
      setPollError(errText(exception, '停止请求未得到确认，请重新读取状态'))
      return false
    } finally { setBusy(false) }
  }
  const returnToMapping = async () => {
    if (busy) return
    if (!workbook.current) {
      const confirmed = await fb.confirm({ title: '重新选择原表格？', content: '恢复记录不保存表格原文。返回后需要重新选择文件并核对映射；当前尚在解析时会先请求停止此次解析。', okText: '重新选择表格' })
      if (!confirmed) return
      if (token && !progress.done && cancelState !== 'stopped' && !await requestStop()) return
      reset()
      return
    }
    if (token && (!progress.done || cancelState === 'unknown') && cancelState !== 'stopped' && !await requestStop()) return
    setToken(''); setRows([]); setPollError(''); setCancelState('active'); setStep('map')
  }
  const closeResult = () => { reset(); onClose(); void qc.invalidateQueries({ queryKey: caseKeys.list(projectId) }) }
  const refreshCases = () => qc.invalidateQueries({ queryKey: caseKeys.list(projectId) }, { throwOnError: true })

  return (
    <Modal
      title="导入用例"
      open={open}
      onCancel={() => { if (!busy) { onClose(); if (step === 'result') void qc.invalidateQueries({ queryKey: caseKeys.list(projectId) }) } }}
      closable={!busy}
      maskClosable={!busy}
      keyboard={!busy}
      width={step === 'file' ? 620 : 'min(1600px, calc(100vw - 32px))'}
      footer={null}
      destroyOnHidden
      className="case-import-dialog"
    >
      <div className="case-import-stages" aria-label="导入进度">{(sheets.length > 1 ? ['file', 'sheet', 'map', 'preview', 'result'] : ['file', 'map', 'preview', 'result']).map((item, index) => <span key={item} data-active={step === item}><b>{index + 1}</b>{item === 'file' ? '选择来源' : item === 'sheet' ? '选择工作表' : item === 'map' ? '核对字段' : item === 'preview' ? '审阅解析' : '导入结果'}</span>)}</div>
      {storageError ? <p role="alert" className="case-import-error">{storageError}</p> : token || receipt ? <p className="case-import-source-summary">此标签页按当前账号和项目保留24小时恢复记录；不保存表格原文，刷新后可读取同一次预览或已收到的结果。</p> : null}
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => {
        const file = e.target.files?.[0]
        e.currentTarget.value = ''
        if (file) void onFile(file)
      }} />
      {['file', 'sheet', 'map'].includes(step) && requirements.isError && <p role="alert">需求分组读取失败：{errText(requirements.error)}<Button size="small" onClick={() => void requirements.refetch()}>重试分组</Button></p>}
      {['file', 'sheet', 'map'].includes(step) && requirements.isSuccess && !reqs.length && <div style={{ marginBottom: 12 }}>
        <p>当前项目还没有需求分组，添加一个即可继续导入。</p>
        <div className="flex items-center gap-2">
          <Input aria-label="需求分组名称" placeholder="分组名称" maxLength={200} value={requirementName} disabled={busy || creatingRequirement} onChange={event => setRequirementName(event.target.value)} onPressEnter={() => void addRequirement()} style={{ maxWidth: 320 }} />
          <Button loading={creatingRequirement} disabled={busy || !appId || !requirementName.trim()} onClick={() => void addRequirement()}>添加分组</Button>
        </div>
      </div>}
      {step === 'file' && (
        <div className="flex flex-col items-start" style={{ gap: 12 }}>
          {reqs.length > 1 ? (
            <Select value={reqId || undefined} placeholder="挂到哪条需求" style={{ width: '100%' }} options={reqs.map((req) => ({ value: req.id, label: req.title || req.id }))} onChange={setReqId} />
          ) : reqs[0] ? <span style={{ color: 'var(--w-text-tertiary)' }}>写入需求：{reqs[0].title || reqs[0].id}</span> : null}
          {error ? <span style={{ color: 'var(--w-fail)' }}>{error}</span> : null}
          <CaseImportSource initialSourceUrl={initialSourceUrl} projectId={projectId} busy={busy} onBusy={setBusy} onFile={() => inputRef.current?.click()} onTable={(grid, filename) => {
            workbook.current = null
            setSheets([])
            setFileName(filename)
            selectSheet('读取内容', grid)
          }} />
          {recovery ? <section className="case-import-recovery-option" aria-label="可选的导入恢复">
            <strong>有上次导入记录，可继续处理</strong>
            <p>可以直接选择新来源。新建导入不会清除旧记录，也不会取消或重新提交旧任务。</p>
            {recoveries.length > 1 ? <Select aria-label="选择导入记录" value={selectedRecovery.key} disabled={busy} onChange={setRecoveryKey} options={recoveries.map(item => ({ value: item.key, label: `${item.record.fileName || '上次导入'} · ${new Date(item.record.updatedAt).toLocaleString()}` }))} style={{ width: '100%' }} /> : <p>{recovery.fileName || '上次导入'} · {recovery.sheetName || '工作表未记录'}</p>}
            <p>{recovery.phase === 'preview' ? '恢复原解析进度和选择，不重新解析。' : '查询原提交结果，不重复提交。'}</p>
            <Button disabled={busy} onClick={() => void restore()}>恢复上次导入</Button>
          </section> : null}
        </div>
      )}

      {readPhase ? <p role="status" className="case-import-read-status">{readPhase}</p> : null}
      {error && step !== 'file' ? <div className="case-import-mapping-notice" role="alert">{error}</div> : null}
      {step === 'sheet' ? <div className="case-import-sheet-picker">
        <div><h2>选择要导入的工作表</h2><p>{fileName} · {sheets.length} 张工作表。推荐项仅作建议，请核对名称、规模和内容。</p></div>
        <div className="case-import-sheet-list">{sheets.map(item => <button key={item.name} type="button" disabled={busy || item.empty} aria-pressed={sheetName === item.name} onClick={() => { setSheetName(item.name); setError('') }}><strong>{item.name}</strong><span>{item.rows.toLocaleString()} 行 · {item.columns} 列{item.empty ? ' · 空工作表' : ''}{item.merges ? ` · ${item.merges} 处合并` : ''}</span></button>)}</div>
        {sheet ? <div className="case-import-sheet-sample"><strong>内容样本 · {sheet.name}</strong>{Object.entries(workbook.current?.Sheets[sheet.name] || {}).filter(([key]) => !key.startsWith('!')).map(([cell, value]) => ({ cell, text: String((value as XLSX.CellObject).w ?? (value as XLSX.CellObject).v ?? '') })).filter(item => item.text.trim()).slice(0, 8).map(item => <p key={item.cell}><span>{item.cell}</span>{item.text}</p>)}</div> : null}
        <div className="case-import-footer-actions"><Button disabled={busy} onClick={() => inputRef.current?.click()}>更换文件</Button><Button type="primary" disabled={busy || !sheetName} onClick={() => { try { selectSheet(sheetName) } catch (exception) { setError(errText(exception)) } }}>使用此工作表</Button></div>
      </div> : null}
      {step === 'map' && (
        <div className="flex flex-col" style={{ gap: 12 }}>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2" style={{ fontSize: 'var(--w-font-sm)' }}>
              表格列名行
              <InputNumber disabled={busy} aria-label="表格列名行" min={1} max={Math.max(1, table.length)} value={headerRow + 1} onChange={(value) => changeHeader((Number(value) || 1) - 1)} />
            </label>
            <span className="min-w-0 truncate" style={{ color: 'var(--w-text-tertiary)', fontSize: 'var(--w-font-sm)' }}>{fileName} / {sheetName} · {labels.filter(Boolean).slice(0, 8).join(' · ') || '—'}</span>
          </div>
          <div className="case-import-source-summary"><span>已读取 {table.length.toLocaleString()} 行</span><strong>可解析 {gridStats.candidates.toLocaleString()} 行</strong><span>表头及前文 {headerRow + 1} 行 · 空行 {gridStats.empty} 行 · 跳过非空行 {gridStats.skipped} 行</span><div><Button size="small" disabled={busy} onClick={() => { setError(''); setStep('file') }}>更换来源</Button>{sheets.length > 1 ? <Button size="small" disabled={busy} onClick={() => { setError(''); setStep('sheet') }}>切换工作表</Button> : null}</div></div>
          {sheet?.merges || sheet?.uncachedFormulas ? <p className="case-import-sheet-warning">{sheet.merges ? `${sheet.merges} 处合并单元格：保留原始值，不自动填充到其他行。` : ''}{sheet.uncachedFormulas ? ` ${sheet.uncachedFormulas} 个公式没有缓存结果，请在表格软件中重新计算后再导入。` : ''}</p> : null}
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
                    disabled={busy}
                    size="small"
                    placeholder="未对应"
                    style={{ width: '100%' }}
                    value={picked}
                    options={labels.map((label, index) => ({ value: index, label: `${XLSX.utils.encode_col(index)} · ${label}` }))}
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
                  <th style={th}>行号</th>
                  {Array.from({ length: colCount }, (_, index) => {
                    const field = FIELD_OPTS.find((item) => columnMap[item.key] === index)
                    return <th key={index} style={{ ...th, color: field ? 'var(--w-primary)' : undefined, boxShadow: field ? 'inset 0 -2px 0 var(--w-primary)' : undefined }}>{field ? `${XLSX.utils.encode_col(index)} · ${field.label}` : XLSX.utils.encode_col(index)}</th>
                  })}
                </tr>
              </thead>
              <tbody>
                {tableWindow.map((line, windowIndex) => {
                  const rowIndex = tableStart + windowIndex
                  const isHead = rowIndex === headerRow
                  const isSkip = rowIndex < headerRow || skipSet.has(rowIndex)
                  return (
                    <tr key={rowIndex}>
                      <td style={sheetCell(isHead, isSkip)}>
                        <input
                          type="checkbox"
                          disabled={busy || isHead || rowIndex < headerRow}
                          checked={isSkip}
                          aria-label={`跳过 Excel 第 ${rowIndex + 1} 行`}
                          onChange={(e) => setSkipOverrides((previous) => ({ ...previous, [rowIndex]: e.target.checked }))}
                        />
                      </td>
                      <td style={sheetCell(isHead, isSkip)}>{rowIndex + 1}</td>
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
          <div className="case-import-grid-pages"><span>映射样本：第 {tableStart + 1}–{Math.min(tableStart + MAPPING_PAGE_SIZE, table.length)} 行 / 共 {table.length} 行。解析提交完整工作表，原文不截断。</span><Button size="small" disabled={tablePage === 0} onClick={() => setTablePage(value => value - 1)}>上一页</Button><Button size="small" disabled={tableStart + MAPPING_PAGE_SIZE >= table.length} onClick={() => setTablePage(value => value + 1)}>下一页</Button></div>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setStep('file')}>上一步</Button>
            <Button type="primary" loading={busy} disabled={!!missingFields.length || duplicateMapping || !hasDataRows} onClick={() => void preview()}>解析预览</Button>
          </div>
        </div>
      )}

      {step === 'result' && receipt ? <CaseImportResult receipt={receipt} rows={rows} onRefresh={refreshCases} onQuery={() => queryReceipt()} onResume={() => queryReceipt(true)} busy={busy} onClose={closeResult} onNew={reset} /> : null}
      {step === 'preview' && (
        <div className="case-import-preview">
          <div className="case-import-session-note"><span>{cancelState === 'stopped' ? '服务端已确认取消预览，本次预览不能提交；进行中的解析可能仍在结束，可返回映射重新解析。' : cancelState === 'unknown' ? '停止状态尚未确认，暂不提交；重新读取可核对当前状态。' : '关闭窗口只暂停前台查看，后台解析可能继续；恢复记录保存成功时，同一标签页刷新后可读取原预览，不重复创建解析任务。'}</span><div>{cancelState !== 'stopped' && !progress.done ? <Button size="small" disabled={busy} onClick={() => void requestStop()}>请求停止解析</Button> : null}<Button size="small" disabled={busy} onClick={onClose}>暂时关闭</Button></div></div>
          {pollError ? <div role="alert" className="case-import-error">{pollError} <Button size="small" onClick={() => { setPollError(''); setPollVersion((value) => value + 1) }}>重新读取进度</Button></div> : null}
          <div className="case-import-summary">
            <div><strong>{progress.parsed} / {progress.total || rows.length}</strong><span>{progress.done ? '解析已结束' : '正在逐条解析'}</span></div>
            <div><strong>{readyCount}</strong><span>解析成功</span></div>
            <div data-tone="attention"><strong>{issues.length}</strong><span>需要审阅</span></div>
            <div data-tone={errorCount ? 'error' : undefined}><strong>{errorCount}</strong><span>解析失败</span></div>
            <div className="case-import-progress"><span style={{ width: `${Math.min(100, progress.total ? progress.parsed / progress.total * 100 : 0)}%` }} /></div>
          </div>
          <CaseReadingLayout className="case-import-review-layout" listLabel="待导入用例" detailLabel="导入解析审阅" list={<>
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
            </>}>
              {current ? <>
                <div className="case-import-review-header"><div><span className="case-import-eyebrow">原文与解析 · {sheetName} / Excel 第 {Number(current.row_index) + 1} 行</span><h2>{String(current.name || current.title || '未命名用例')}</h2><span className="case-import-identifiers">{String(current.case_id || '保存时生成用例编号')} · {String(current.platform || platform || '未指定端')}</span></div>
                  {current.parse_status === 'error' ? <Button size="small" loading={busy} onClick={() => void retryRow(current.row_index)}>重新解析本条</Button> : null}
                </div>
                {current.conflict ? <ImportConflictReview key={current.row_index} projectId={projectId} row={current} busy={busy} onChange={(value) => setRows(previous => previous.map(row => row.row_index === current.row_index ? { ...row, on_conflict: value } : row))} /> : null}
                {remarkOf(current) && current.parse_status !== 'pending' ? <div className="case-import-remark" role={current.parse_status === 'error' ? 'alert' : 'status'}>{remarkOf(current)}</div> : null}
                <CaseReadingView row={current} status={current.parse_status === 'pending' ? 'pending' : current.parse_status === 'error' ? 'error' : current.parse_status === 'incomplete' ? 'incomplete' : current.parse_status === 'cancelled' ? 'cancelled' : 'ready'} />
              </> : null}
            </CaseReadingLayout>
          <div className="case-import-footer"><div><strong>将写入 {writeCount} 条</strong><span>新增 {createCount} · 覆盖 {overwriteCount} · 冲突跳过 {skipCount}</span>{!progress.done ? <span>解析完成后可确认导入</span> : null}</div><div className="case-import-footer-actions"><Button disabled={busy} onClick={() => void returnToMapping()}>返回字段映射</Button><Button type="primary" loading={busy} disabled={!progress.done || !writeCount || cancelState !== 'active'} onClick={() => void commit()}>确认导入（{writeCount}）</Button></div></div>
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
