import { useEffect, useMemo, useState, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Checkbox, Input, Modal, errText, useFeedback } from '@/ui'
import { getProjectEnv } from '@/api/projectEnv'
import type { CaseRow } from '@/api/projectCases'
import { runCaseRunner, type RunDevice } from '@/api/run'
import { unwrapOne } from '@/lib/unwrap'
import { useProjectCases, useRunDevices } from '../cases/queries'
import { channelKindText, channelTitle, normalizeEnvDoc, type EnvChannel, type EnvDocument } from '../config/envModel'
import { taskKeys } from './queries'

/**
 * 从任务页直接开跑。
 * 网址跟运行环境走，不写在应用卡片上。设备只列出已经连上的，没有「暂不指定」。
 */
export function CreateTaskDialog({
  open, appId, projectId, onClose, onStarted,
}: {
  open: boolean
  appId: string
  projectId: string
  onClose: () => void
  onStarted: (runId: string) => void
}) {
  const fb = useFeedback()
  const qc = useQueryClient()
  const cases = useProjectCases(projectId)
  const devices = useRunDevices()
  const env = useQuery({
    queryKey: ['project', projectId, 'env'],
    enabled: open && !!projectId,
    queryFn: async () => normalizeEnvDoc(unwrapOne(await getProjectEnv(projectId))),
  })

  const doc = env.data
  const [surface, setSurface] = useState('')
  const [profile, setProfile] = useState('')
  const [sn, setSn] = useState('')
  const [scheme, setScheme] = useState<'visual' | 'dom'>('visual')
  const [picked, setPicked] = useState<string[]>([])
  const [kw, setKw] = useState('')

  useEffect(() => {
    if (!open) return
    setScheme('visual')
    setPicked([])
    setKw('')
  }, [open])
  useEffect(() => {
    if (!open || !doc) return
    setSurface((cur) => cur || doc.channels[0]?.id || '')
    setProfile((cur) => cur || doc.default_profile || doc.environments[0]?.key || '')
  }, [open, doc])
  useEffect(() => {
    if (!open) return
    setSn((cur) => cur || devices.data?.[0]?.sn || '')
  }, [open, devices.data])

  const groups = useMemo(() => {
    const q = kw.trim().toLowerCase()
    const matched = (cases.data || []).filter((row) => {
      if (!q) return true
      return `${row.case_id} ${row.title || ''} ${row.module || ''}`.toLowerCase().includes(q)
    })
    const buckets = new Map<string, CaseRow[]>()
    for (const row of matched) {
      const name = String(row.module || '').trim() || '未分组'
      const list = buckets.get(name) || []
      list.push(row)
      buckets.set(name, list)
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'zh'))
      .map(([name, items]) => ({
        name,
        items: items.sort((a, b) => String(a.title || a.case_id).localeCompare(String(b.title || b.case_id), 'zh')),
      }))
  }, [cases.data, kw])

  const device = (devices.data || []).find((item) => item.sn === sn)
  const block = devices.isLoading
    ? '正在查可用设备'
    : !(devices.data || []).length
      ? '没有在线设备'
      : !picked.length
        ? '先勾选用例'
        : ''

  const start = useMutation({
    mutationFn: async () => {
      const res = await runCaseRunner({
        app_id: appId,
        case_ids: picked,
        sn,
        sns: sn ? [sn] : [],
        platform: device?.platform || device?.type,
        env_profile: profile || undefined,
        env_surface: surface || undefined,
        action_scheme: scheme,
        run_type: 'manual',
      })
      const runId = res?.data?.run_id || res?.data?.task_id
      if (!runId) throw new Error('没有返回任务编号，无法跟踪这次执行')
      return runId
    },
    onSuccess: (runId) => {
      void qc.invalidateQueries({ queryKey: taskKeys.list(appId) })
      fb.ok(`已下发 ${picked.length} 条用例`)
      onStarted(runId)
    },
    onError: (error) => fb.fail(errText(error, '下发失败')),
  })

  return (
    <Modal
      open={open}
      title="新建任务"
      onCancel={onClose}
      destroyOnHidden
      width={880}
      footer={[
        <span key="count" style={{ float: 'left', lineHeight: '32px', fontWeight: 700 }}>已选 {picked.length} 条用例</span>,
        <Button key="cancel" onClick={onClose}>取消</Button>,
        <Button key="ok" type="primary" loading={start.isPending} disabled={!!block} onClick={() => start.mutate()}>
          启动
        </Button>,
      ]}
    >
      <div className="flex flex-col" style={{ gap: 14, maxHeight: '62vh', overflow: 'auto', paddingRight: 4 }}>
        <Section n="1" title="被测应用">
          {doc?.channels.length ? (
            <div style={grid(2)}>
              {doc.channels.map((channel) => (
                <Choice key={channel.id} pressed={surface === channel.id} onClick={() => setSurface(channel.id)} title={channelTitle(channel)} hint={channel.app_identifier || channel.id} />
              ))}
            </div>
          ) : (
            <p style={hint}>这个项目还没有配置被测应用。启动仍会落到当前应用。</p>
          )}
        </Section>

        <Section n="2" title="运行环境">
          <div style={grid(Math.min(3, doc?.environments.length || 3))}>
            {(doc?.environments || [{ key: 'test', label: '测试' }, { key: 'pre', label: '预发' }, { key: 'prod', label: '正式' }]).map((item) => {
              const channel = doc?.channels.find((row) => row.id === surface)
              const url = channel && doc ? launchUrl(doc, item.key, channel) : ''
              return (
                <Choice
                  key={item.key}
                  pressed={profile === item.key}
                  onClick={() => setProfile(item.key)}
                  title={`${item.label} ${item.key}`}
                  hint={`标识 ${item.key}`}
                  extra={url ? `${channel ? channelKindText(channel) : '地址'} · ${url}` : ''}
                />
              )
            })}
          </div>
        </Section>

        <Section n="3" title="设备（浏览器）">
          {(devices.data || []).length ? (
            <div style={grid((devices.data || []).length > 1 ? 2 : 1)}>
              {(devices.data || []).map((item) => (
                <Choice key={item.sn} pressed={sn === item.sn} onClick={() => setSn(item.sn)} title={deviceTitle(item)} hint={deviceHint(item)} />
              ))}
            </div>
          ) : (
            <p style={hint}>{devices.isLoading ? '正在查可用设备…' : '没有在线设备。请先在设备上启动 Scout 并确认它已连上。'}</p>
          )}
        </Section>

        <Section n="4" title="执行方案">
          <div style={grid(2)}>
            <Choice pressed={scheme === 'visual'} onClick={() => setScheme('visual')} title="看图 visual" hint="纯视觉：按模型坐标、输入、滑动" />
            <Choice pressed={scheme === 'dom'} onClick={() => setScheme('dom')} title="DOM" hint="纯层级：只按节点点，点不上不改走看图" />
          </div>
        </Section>

        <Section n="5" title="勾选用例">
          <Input size="small" value={kw} placeholder="按名称或编号筛选" onChange={(event) => setKw(event.target.value)} style={{ marginBottom: 8 }} />
          <div className="flex flex-col" style={{ gap: 4, maxHeight: 220, overflow: 'auto' }}>
            {cases.isLoading ? <p style={hint}>正在读取用例…</p> : null}
            {!cases.isLoading && !groups.length ? <p style={hint}>{projectId ? '没有可选用例' : '链接里没有项目，从应用列表重新进入后才能勾选用例。'}</p> : null}
            {groups.map((group) => (
              <div key={group.name}>
                <div style={{ margin: '8px 0 4px', fontSize: 12, fontWeight: 750, color: 'var(--w-text-tertiary)' }}>{group.name}</div>
                {group.items.map((row) => (
                  <label key={row.case_id} className="flex items-start gap-2" style={{ padding: '4px 2px', cursor: 'pointer' }}>
                    <Checkbox checked={picked.includes(row.case_id)} onChange={(event) => toggleCase(row, event.target.checked, setPicked)} />
                    <span className="min-w-0">
                      <span className="block truncate" style={{ fontWeight: 650 }}>{row.title || '无标题'}</span>
                      <span className="w-mono block truncate" style={{ fontSize: 11, color: 'var(--w-text-quaternary)' }}>{row.case_id}</span>
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </div>
          {block && picked.length === 0 ? null : block ? <p style={{ ...hint, marginTop: 8 }}>{block}</p> : null}
        </Section>
      </div>
    </Modal>
  )
}

function toggleCase(row: CaseRow, on: boolean, setPicked: Dispatch<SetStateAction<string[]>>) {
  setPicked((prev) => on ? [...prev, row.case_id] : prev.filter((id) => id !== row.case_id))
}

function launchUrl(doc: EnvDocument, envKey: string, channel: EnvChannel) {
  return String(doc.profiles[envKey]?.[channel.id]?.[channel.field] || '').trim()
}

function deviceTitle(device: RunDevice) {
  return `${device.model || device.type || '设备'} · ${device.platform || device.type || '浏览器'}`
}

function deviceHint(device: RunDevice) {
  const max = Number(device.web_parallel_max || 0)
  const used = Number(device.active_run_count || 0)
  const lanes = max ? ` · ${used}/${max} 路` : ''
  return `${device.sn}${lanes}`
}

function Section({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section>
      <p style={{ margin: '0 0 6px', fontWeight: 750 }}>
        <span style={index}>{n}</span>
        {title}
      </p>
      {children}
    </section>
  )
}

function Choice({ pressed, onClick, title, hint, extra }: { pressed: boolean; onClick: () => void; title: string; hint?: string; extra?: string }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} style={{ ...choice, ...(pressed ? choiceOn : {}) }}>
      <b style={{ display: 'block' }}>{title}</b>
      {hint ? <small style={sub}>{hint}</small> : null}
      {extra ? <small style={{ ...sub, fontFamily: 'var(--w-font-mono)', wordBreak: 'break-all' }}>{extra}</small> : null}
    </button>
  )
}

const grid = (columns: number): CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, columns)}, minmax(0, 1fr))`, gap: 8 })
const choice: CSSProperties = {
  textAlign: 'left', minHeight: 72, border: '1px solid var(--w-border-strong)', background: 'var(--w-surface)',
  borderRadius: 12, padding: '10px 12px', cursor: 'pointer',
}
const choiceOn: CSSProperties = { borderColor: 'var(--w-primary)', background: 'var(--w-primary-soft)', boxShadow: 'inset 0 0 0 1px var(--w-primary)' }
const sub: CSSProperties = { display: 'block', marginTop: 3, color: 'var(--w-text-tertiary)', fontWeight: 550, lineHeight: 1.4 }
const hint: CSSProperties = { margin: 0, color: 'var(--w-text-tertiary)', fontSize: 12 }
const index: CSSProperties = {
  display: 'inline-grid', placeItems: 'center', width: 18, height: 18, marginRight: 6,
  borderRadius: 99, background: 'var(--w-fill)', fontSize: 11,
}
