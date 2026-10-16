import { usesDesktopExecutor } from '@/constants/platformContract'
import { useState } from 'react'
import { screenshotSource } from '@/lib/screenshot'
import type { SessionEvent } from '@/api/sessions'

const bag = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {}
const image = (event: SessionEvent | undefined) => screenshotSource(bag(event?.payload).thumb)

function EvidenceImage({ event, label, point }: { event?: SessionEvent; label: string; point?: { x: number; y: number } }) {
  const [failed, setFailed] = useState(false)
  const src = image(event)
  return <figure style={{ margin: '8px 0' }}>
    <figcaption>{label}{event?.seq != null ? ` · #${event.seq}` : ''}</figcaption>
    {src && !failed ? <div style={{ position: 'relative' }}><img src={src} alt={label} onError={() => setFailed(true)} style={{ width: '100%', display: 'block' }} />{point ? <span aria-label="请求落点" style={{ position: 'absolute', left: `${point.x / 10}%`, top: `${point.y / 10}%`, width: 12, height: 12, border: '2px solid #e33', borderRadius: '50%', transform: 'translate(-50%, -50%)' }} /> : null}</div>
      : <p>{failed ? '截图加载失败，请重新打开会话。原始事件中的引用已保留。' : '当前已加载事件中没有关联截图，可继续加载或查看原始事件。'}</p>}
  </figure>
}

export function DesktopEvidence({ event, events }: { event: SessionEvent; events: SessionEvent[] }) {
  const payload = bag(event.payload)
  const desktop = bag(payload.desktop)
  const scout = bag(payload.scout)
  if (!usesDesktopExecutor(scout.platform) && !desktop.capture_id) return null
  const action = bag(desktop.action)
  const index = events.findIndex(row => row.seq === event.seq)
  const before = events.slice(0, index).reverse().find(row => row.type === 'observe/screen' && bag(row.payload).capture_id === desktop.capture_id)
  const afterCapture = String(desktop.after_capture_id || action.after_capture_id || '')
  const after = afterCapture ? events.find(row => row.type === 'observe/screen' && bag(row.payload).capture_id === afterCapture) : undefined
  const assertion = events.slice(index + 1).find(row => row.type === 'assert/vision' && row.turn === event.turn)
  const call = events.slice(0, index).reverse().find(row => row.type === 'tool/call' && row.turn === event.turn)
  const params = bag(bag(call?.payload).params)
  return <section aria-label="PC 执行证据" style={{ borderTop: '1px solid var(--w-border)', paddingTop: 8 }}>
    <strong>PC 执行证据</strong>
    <p>{String(scout.node_id || '节点未知')} · {String(scout.platform === 'mac' || scout.platform === 'win' ? scout.platform : scout.os || '系统未知')} · {String(payload.executor_used || '')}</p>
    <p>驱动动作：{String(action.effect || '未采集')} · 路径：{String(action.route || '未采集')}</p>
    {params.x != null && params.y != null ? <p>请求落点：({String(params.x)}, {String(params.y)}) · 坐标单位 {String(params.coordinate_space || params.coordinate_unit || '未返回')}</p> : null}
    {Array.isArray(action.evidence) && action.evidence.length ? <p>原生证据：{action.evidence.map(row => String(bag(row).kind || '未知')).join('、')}（不展示可能含输入内容的详情）</p> : null}
    <p>捕获引用：{String(desktop.capture_id || '无')}<br />会话代际：{String(desktop.session_generation || '无')}</p>
    <EvidenceImage key={`before-${event.seq}`} event={before} label="执行前图" point={['normalized', 'normalized_1000', '1000'].includes(String(params.coordinate_space || params.coordinate_unit)) && typeof params.x === 'number' && typeof params.y === 'number' && params.x >= 0 && params.x <= 1000 && params.y >= 0 && params.y <= 1000 ? { x: params.x, y: params.y } : undefined} />
    <EvidenceImage key={`after-${event.seq}`} event={after} label="执行后观察图" />
    <p>驱动局部验证：未采集独立 verify_state，不等同于业务通过。</p>
    <p>业务断言：{assertion ? `见事件 #${assertion.seq} assert/vision` : '当前回合未采集业务断言。'}</p>
    {Array.isArray(payload.attempts) ? <p>执行器尝试：{payload.attempts.map(row => `${String(bag(row).executor || '')} ${String(bag(row).status || '')}`).join(' → ')}</p> : null}
  </section>
}
