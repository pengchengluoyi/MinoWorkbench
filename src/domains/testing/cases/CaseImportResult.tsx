import { useState } from 'react'
import { CheckCircle2, CircleAlert, Download } from 'lucide-react'
import { Button, Segmented, StatusPill, errText } from '@/ui'
import type { ImportPreviewRow } from '@/api/projectCases'
import { CaseScriptSections } from './CaseScriptSections'
import { downloadImportReceipt, isWritten, needsReceiptAttention, receiptReasonLabel, receiptStatusLabel, type ImportReceipt } from './caseImportReceipt'

export function CaseImportResult({ receipt, rows, onRefresh, onQuery, onResume, busy = false, onClose, onNew }: { receipt: ImportReceipt; rows: ImportPreviewRow[]; onRefresh: () => Promise<unknown>; onQuery?: () => Promise<unknown>; onResume?: () => Promise<unknown>; busy?: boolean; onClose: () => void; onNew: () => void }) {
  const [filter, setFilter] = useState('all')
  const [active, setActive] = useState(receipt.lines.find(needsReceiptAttention)?.id || receipt.lines[0]?.id || '')
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState('')
  const attention = receipt.lines.filter(needsReceiptAttention)
  const written = receipt.lines.filter(line => isWritten(line.status))
  const shown = filter === 'attention' ? attention : filter === 'written' ? written : receipt.lines
  const current = shown.find(line => line.id === active) || shown[0]
  const original = rows.find(row => row.row_index === current?.rowIndex)
  const refresh = async () => {
    setRefreshing(true); setRefreshMessage('')
    try { await onRefresh(); setRefreshMessage('列表已重新读取。请结合用例编号核对，列表存在同名用例不代表本次提交成功。') }
    catch (error) { setRefreshMessage(errText(error, '列表刷新失败，请重试')) }
    finally { setRefreshing(false) }
  }
  const needsAttention = receipt.state === 'unknown' || attention.length > 0 || receipt.warnings.length > 0
  const Icon = needsAttention ? CircleAlert : CheckCircle2
  return <div className="case-import-result">
    <header className="case-import-result-heading" data-state={needsAttention ? 'attention' : receipt.state}><Icon size={22} /><div><h2>{receipt.state === 'unknown' ? '提交结果尚未确认' : '服务端已返回导入结果'}</h2><p>{receipt.source.fileName} / {receipt.source.sheetName} · 需求：{receipt.source.requirement || '未返回'} · {new Date(receipt.receivedAt).toLocaleString()}</p></div></header>
    <div className="case-import-result-metrics">{(['created', 'updated', 'skipped', 'blocked', 'failed'] as const).map(key => <div key={key}><strong>{receipt.counts[key] ?? '—'}</strong><span>{({ created: '新增', updated: '更新', skipped: '跳过', blocked: '受阻未写入', failed: '准备失败' })[key]}</span></div>)}<p>数量来自服务端汇总，未返回的字段显示“—”。</p></div>
    {receipt.state === 'unknown' ? <div className="case-import-result-notice" role="alert"><strong>{receipt.error}</strong><p>请求未得到可核对的结果，部分用例可能已经写入。请查询本次服务端收据，保持原提交身份；不会自动重发旧预览。</p></div> : null}
    {receipt.pending ? <div className="case-import-result-notice" role="status"><strong>还有 {receipt.pending} 行尚未完成提交</strong><p>查询可核对最新结果；继续提交只处理待提交行，已写入行保持原编号。正在准备中的行等待原请求完成或租约到期。</p></div> : null}
    {receipt.warnings.length ? <div className="case-import-result-notice" role="status">{receipt.warnings.map(text => <p key={text}>{text}</p>)}</div> : null}
    <div className="case-import-result-toolbar"><Segmented value={filter} onChange={value => setFilter(String(value))} options={[{value:'all',label:`全部 ${receipt.lines.length}`},{value:'attention',label:`待核对 ${attention.length}`},{value:'written',label:`确认写入 ${written.length}`}]} /><span>点击结果行查看当时原文与理解</span></div>
    <div className="case-import-result-layout">
      <div className="case-import-result-table"><table aria-label="逐行导入结果"><thead><tr><th>Excel 行</th><th>用例 / 编号</th><th>实际结果</th></tr></thead><tbody>{shown.map(line => <tr key={line.id} aria-selected={current?.id === line.id} tabIndex={0} onClick={() => setActive(line.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActive(line.id) } }}><td>{line.rowIndex != null ? line.rowIndex + 1 : '未返回'}</td><td><strong>{line.title}</strong><span>{line.savedCaseId ? `服务端编号：${line.savedCaseId}` : line.inputCaseId ? `提交编号：${line.inputCaseId}` : '编号未返回'}</span><small>{receiptReasonLabel(line.reason)}</small></td><td><StatusPill status={isWritten(line.status) ? 'pass' : needsReceiptAttention(line) ? 'warn' : 'muted'}>{receiptStatusLabel(line.status)}</StatusPill></td></tr>)}</tbody></table>{!shown.length ? <p className="case-import-empty">此范围没有结果。</p> : null}</div>
      <div className="case-import-result-detail">{current ? <><div className="case-import-result-detail-header"><h3>{current.title}</h3><p>{receiptStatusLabel(current.status)}{receiptReasonLabel(current.reason) ? ` · ${receiptReasonLabel(current.reason)}` : ''}</p></div>{original ? <CaseScriptSections row={original} /> : <p className="case-import-empty">此结果没有匹配的提交原文，未使用其他用例补位。</p>}</> : <p className="case-import-empty">选择一个范围查看结果。</p>}</div>
    </div>
    {refreshMessage ? <p role="status" className="case-import-result-refresh">{refreshMessage}</p> : null}
    <footer className="case-import-footer"><div><span>{receipt.durable ? `服务端持久收据：${receipt.receiptId}。刷新后可重新查询；失败或受阻行需核对后新建预览。` : '尚未确认服务端持久收据；请先查询本次提交身份，再决定后续处理。'}</span></div><div className="case-import-footer-actions"><Button icon={<Download size={13} />} onClick={() => downloadImportReceipt(receipt)}>导出本次结果</Button>{onQuery && receipt.requestId ? <Button loading={busy} onClick={() => void onQuery()}>查询服务端收据</Button> : null}{onResume && receipt.receiptId && receipt.pending ? <Button disabled={busy} onClick={() => void onResume()}>继续提交待处理行</Button> : null}<Button loading={refreshing} disabled={busy} onClick={() => void refresh()}>重新读取用例列表</Button><Button disabled={busy} onClick={onNew}>新建导入</Button><Button type="primary" disabled={busy} onClick={onClose}>返回用例列表</Button></div></footer>
  </div>
}
