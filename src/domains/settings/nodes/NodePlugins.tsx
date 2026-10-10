import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Input, QRCode, Switch, errText, useFeedback } from '@/ui'
import {
  callNodePlugin,
  configNodePlugin,
  installNodePlugin,
  removeNodePlugin,
  heldChannels,
  nodeIsOnline,
  type NodePluginJob,
  type NodePluginStatus,
  type ScoutNode,
} from '@/api/nodes'
import { unwrapOne } from '@/lib/unwrap'
import { fmtAgo } from '@/lib/timeText'
import { nodeKeys } from './queries'

interface FieldDef {
  key: string
  label: string
  secret?: boolean
  optional?: boolean
  placeholder?: string
  group?: string
  type?: string
}

interface ItemDef {
  id: string
  label: string
  /** 节点插件快照里这一行的 class。缺省等于所在分类；微信在「对话」里展示，但数据仍是 class=bot */
  kind?: string
  needsInstall?: boolean
  wechat?: boolean
  /** 展示连接状态（对话类） */
  conn?: boolean
  hint?: string
  fields?: FieldDef[]
  /** 左侧选中用。LangBot 一家渠道一个，避免和插件 id 撞车 */
  navId?: string
  /** 实际下发的插件 id。渠道行仍是 langbot，不是渠道名 */
  pluginId?: string
  /** 这一行只编辑、只保存这个渠道 */
  groupId?: string
}

export type PluginPane = 'cli' | 'bot' | 'mail' | 'im'
export const PLUGIN_PANES: readonly PluginPane[] = ['cli', 'bot', 'mail', 'im']

const kindOf = (group: PluginPane, item: ItemDef) => item.kind ?? group
const pluginIdOf = (item: ItemDef) => item.pluginId || item.id
const navKey = (pane: string, item: ItemDef) => `${pane}:${item.navId || item.id}`

/** LangBot 是一个插件、多家渠道。字段 key 已经按渠道加了前缀，页面按渠道拆开编辑和保存。 */
function imChannels(row: NodePluginStatus): ItemDef[] {
  const fields = (row.fields || []) as FieldDef[]
  const grouped = new Map<string, FieldDef[]>()
  for (const field of fields) {
    if (!field.group) continue
    const list = grouped.get(field.group) || []
    list.push(field)
    grouped.set(field.group, list)
  }
  const labelOf = row.label || row.title || row.name || row.id
  if (grouped.size < 2) {
    return [{
      id: row.id,
      label: labelOf,
      kind: 'im',
      conn: true,
      needsInstall: row.installed !== undefined,
      fields,
      hint: '这是一整份配置。节点若把多家渠道放在同一插件里，会按渠道拆开。',
    }]
  }
  const names = new Map((row.groups || []).map((group) => [group.id, group.label]))
  return [...grouped.entries()].map(([groupId, groupFields]) => {
    const fromSwitch = groupFields.find((field) => field.type === 'bool')?.label.replace(/^启用/, '')
    const label = names.get(groupId) || fromSwitch || groupId
    return {
      id: row.id,
      navId: `${row.id}:${groupId}`,
      pluginId: row.id,
      groupId,
      label,
      kind: 'im' as const,
      conn: true,
      needsInstall: true,
      fields: groupFields,
      hint: `只保存${label}。每家渠道单独一份，保存这里不会改动其它渠道。`,
    }
  })
}

function channelFilled(st: NodePluginStatus | undefined, fields: FieldDef[] | undefined) {
  const required = (fields || []).filter((field) => !field.optional && field.type !== 'bool')
  if (!required.length) return !!st?.configured
  return required.every((field) => (
    field.secret
      ? (st?.saved_secrets || []).includes(field.key)
      : !!String(st?.values?.[field.key] || '').trim()
  ))
}

function channelState(st: NodePluginStatus | undefined, item: ItemDef) {
  if (!item.groupId) return ''
  const filled = channelFilled(st, item.fields)
  const flag = (item.fields || []).find((field) => field.type === 'bool' && field.key.endsWith('.enabled'))
  const on = flag ? st?.values?.[flag.key] === '1' : filled
  if (filled && on) return '已启用'
  if (filled) return '已填写'
  return '待填写'
}

const GROUPS: { id: PluginPane; title: string; items: ItemDef[] }[] = [
  {
    id: 'cli',
    title: '工作项',
    items: [
      {
        id: 'feishu',
        label: '飞书',
        needsInstall: true,
        fields: [
          { key: 'app_id', label: 'App ID' },
          { key: 'app_secret', label: 'App Secret', secret: true },
        ],
      },
      {
        id: 'meego',
        label: 'Meego',
        needsInstall: true,
        fields: [
          { key: 'plugin_id', label: '插件 ID' },
          { key: 'plugin_secret', label: '插件密钥', secret: true },
          { key: 'base_url', label: '地址' },
          { key: 'user_key', label: 'User Key' },
        ],
      },
    ],
  },
  {
    id: 'bot',
    title: '通知',
    items: [
      {
        id: 'feishu_bot',
        label: '飞书机器人',
        fields: [{ key: 'webhook_url', label: 'Webhook', secret: true }],
      },
      {
        id: 'wecom',
        label: '企业微信',
        fields: [{ key: 'webhook_url', label: 'Webhook', secret: true }],
      },
    ],
  },
  {
    id: 'im',
    title: '对话',
    items: [
      { id: 'wechat', label: '微信 iLink', kind: 'im', wechat: true, conn: true },
    ],
  },
  {
    id: 'mail',
    title: '收信',
    items: [
      {
        id: 'gmail',
        label: 'Gmail',
        fields: [
          { key: 'inbox_address', label: '收件箱' },
          { key: 'app_password', label: '应用专用密码', secret: true },
        ],
      },
    ],
  },
]

/**
 * 每台 Scout 自己的插件参数。密钥不进 Nexus，表单只负责下发到这台在线节点。
 * 分类按接入方式：CLI / MCP / Bot / 邮箱。
 */
export function NodePlugins({ node, initialPane }: { node: ScoutNode; initialPane?: PluginPane }) {
  const fb = useFeedback()
  const qc = useQueryClient()
  const online = nodeIsOnline(node)
  const known = Array.isArray(node.plugins)
  const job = node.plugin_job
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({})
  const [busy, setBusy] = useState('')
  const [wechat, setWechat] = useState({ qrcode_img: '', error: '', logged_in: false, need_verify: false, status: '' })
  const [verifyCode, setVerifyCode] = useState('')
  const [openId, setOpenId] = useState('')
  const [lastTest, setLastTest] = useState<Record<string, { ok: boolean; text: string }>>({})
  const wechatAsked = useRef('')

  useEffect(() => {
    if (!job?.active) return undefined
    const timer = window.setInterval(() => {
      void qc.invalidateQueries({ queryKey: nodeKeys.all })
    }, 1500)
    return () => window.clearInterval(timer)
  }, [job?.active, qc])

  const statusOf = (kind: string, id: string): NodePluginStatus | undefined =>
    (node.plugins || []).find((row) => row.class === kind && row.id === id)

  const setField = (kind: string, id: string, key: string, value: string) => {
    const bag = `${kind}:${id}`
    setDrafts((prev) => ({ ...prev, [bag]: { ...(prev[bag] || {}), [key]: value } }))
  }

  const refresh = () => qc.invalidateQueries({ queryKey: nodeKeys.all })

  const save = async (kind: string, item: ItemDef) => {
    const bag = `${kind}:${item.id}`
    const values: Record<string, string> = {}
    for (const field of item.fields || []) {
      const draft = drafts[bag]?.[field.key]
      if (field.type === 'bool') {
        if (draft !== undefined) values[field.key] = draft === '1' ? '1' : '0'
        continue
      }
      const text = String(draft || '').trim()
      if (text) values[field.key] = text
    }
    if (!Object.keys(values).length) {
      fb.warn('先填写要保存的参数')
      return
    }
    setBusy(`save:${bag}`)
    try {
      await configNodePlugin(node.node_id, { kind, plugin_id: item.id, values, clear: [] })
      setDrafts((prev) => ({ ...prev, [bag]: {} }))
      fb.ok('已保存到这台节点')
      void refresh()
      return true
    } catch (e) {
      fb.fail(errText(e, '保存失败'))
      return false
    } finally {
      setBusy('')
    }
  }

  const clearField = async (kind: string, item: ItemDef, key: string) => {
    setBusy(`clear:${kind}:${item.id}:${key}`)
    try {
      await configNodePlugin(node.node_id, { kind, plugin_id: item.id, values: {}, clear: [key] })
      fb.ok('已清除')
      void refresh()
    } catch (e) {
      fb.fail(errText(e, '清除失败'))
    } finally {
      setBusy('')
    }
  }

  const install = async (kind: string, item: ItemDef) => {
    setBusy(`install:${kind}:${item.id}`)
    try {
      await installNodePlugin(node.node_id, { kind, plugin_id: item.id })
      fb.ok('安装完成')
      void refresh()
      return true
    } catch (e) {
      fb.fail(errText(e, '安装失败'))
      return false
    } finally {
      setBusy('')
    }
  }

  const remove = async (kind: string, item: ItemDef) => {
    setBusy(`remove:${kind}:${item.id}`)
    try {
      await removeNodePlugin(node.node_id, { kind, plugin_id: item.id })
      fb.ok('已移除')
      void refresh()
    } catch (e) {
      fb.fail(errText(e, '移除失败'))
    } finally {
      setBusy('')
    }
  }

  const invoke = async (capabilityId: string, params: Record<string, unknown>, timeout = 90_000) => {
    const res = await callNodePlugin(node.node_id, { capability_id: capabilityId, params }, timeout)
    const body = unwrapOne<{ data?: Record<string, unknown>; summary?: string }>(res)
    void refresh()
    const payload: Record<string, unknown> = { summary: body?.summary || '', ...(body?.data || {}) }
    return payload
  }

  const wechatAct = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(`wx:${action}`)
    try {
      const data = await invoke('plugin.bot.wechat', { action, ...extra }, 60_000)
      setWechat((prev) => {
        const status = String(data.status || '')
        const loggedIn = Boolean(data.logged_in)
        const incoming = String(data.qrcode_img || '').trim()
        const drop = loggedIn || status === 'expired' || status === 'idle'
        return {
          qrcode_img: incoming || (drop ? '' : prev.qrcode_img),
          error: String(data.error || ''),
          logged_in: loggedIn,
          need_verify: Boolean(data.need_verify),
          status,
        }
      })
    } catch (e) {
      fb.fail(errText(e, '微信操作失败'))
    } finally {
      setBusy('')
    }
  }

  const probe = async (itemId: string, capabilityId: string, params: Record<string, unknown>) => {
    setBusy(`probe:${capabilityId}`)
    try {
      const data = await invoke(capabilityId, params)
      const text = String(data.summary || '调用完成')
      setLastTest((prev) => ({ ...prev, [itemId]: { ok: true, text } }))
      fb.ok(text)
    } catch (e) {
      const text = errText(e, '调用失败')
      setLastTest((prev) => ({ ...prev, [itemId]: { ok: false, text } }))
      fb.fail(text)
    } finally {
      setBusy('')
    }
  }

  const locked = !online || !known

  const dynamicIm: ItemDef[] = (node.plugins || [])
    .filter((row) => row.class === 'im' && row.id !== 'wechat')
    .flatMap((row) => imChannels(row))

  const groups = GROUPS.map((g) => {
    const items = g.items.map((item) => {
      const kind = item.kind ?? g.id
      const row = (node.plugins || []).find((plugin) => plugin.class === kind && plugin.id === item.id)
      if (row?.fields?.length) return { ...item, fields: row.fields, label: row.label || item.label }
      return item
    })
    if (g.id !== 'im') return { ...g, items }
    const have = new Set(items.map((item) => item.navId || item.id))
    return { ...g, items: [...items, ...dynamicIm.filter((item) => !have.has(item.navId || item.id))] }
  })

  const runProbe = (item: ItemDef) => {
    if (item.id === 'feishu') return probe(item.id, 'plugin.cli.feishu', { action: 'check' })
    if (item.id === 'meego') return probe(item.id, 'plugin.cli.meego', { action: 'token' })
    if (item.id === 'feishu_bot' || item.id === 'wecom') return probe(item.id, 'plugin.bot.send', { kind: item.id, text: 'Mino 测试消息' })
    return undefined
  }

  useEffect(() => {
    if (!online || !known || wechatAsked.current === node.node_id) return
    wechatAsked.current = node.node_id
    void wechatAct('status')
    // 只在进入这台节点时问一次登录态，避免刷新把二维码清掉
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.node_id, online, known])

  const submitEditItem = async (kind: PluginPane, item: ItemDef) => {
    kind = kindOf(kind, item) as PluginPane
    const st = statusOf(kind, item.id)
    if (!item.groupId && item.needsInstall && !st?.installed) {
      const ok = await install(kind, item)
      if (!ok) return
    }
    const bag = `${kind}:${item.id}`
    const has = (item.fields || []).some((field) => {
      const draft = drafts[bag]?.[field.key]
      if (field.type === 'bool') return draft !== undefined
      return !!String(draft || '').trim()
    })
    if (!has) {
      fb.warn('先填写要保存的参数')
      return
    }
    await save(kind, item)
  }

  const selectedKey = openId || (initialPane ? navKey(initialPane, groups.find((g) => g.id === initialPane)?.items[0] || groups[0].items[0]) : 'cli:feishu')
  const selected = groups.flatMap((group) => group.items.map((item) => ({ group, item }))).find((row) => navKey(row.group.id, row.item) === selectedKey)
    || { group: groups[0], item: groups[0].items[0] }
  const selectedKind = kindOf(selected.group.id, selected.item)
  const selectedSt = statusOf(selectedKind, selected.item.id)
  const selectedReady = selected.item.wechat
    ? (wechat.logged_in || !!selectedSt?.configured)
    : !!selectedSt?.configured
  const selectedMissing = !!selected.item.needsInstall && !selectedSt?.installed && !selected.item.wechat
  const selectedTest = lastTest[selected.item.id]
  const selectedPluginId = pluginIdOf(selected.item)
  const selectedBag = `${selectedKind}:${selectedPluginId}`
  const selectedChannel = channelState(selectedSt, selected.item)
  const selectedPlatform = selected.item.groupId ? selectedSt?.platforms?.[selected.item.groupId] : undefined

  return (
    <div className="flex h-full min-h-0">
      <nav className="shrink-0 overflow-y-auto" aria-label="接入项" style={{ width: 'clamp(180px, 22%, 280px)', borderRight: '1px solid var(--w-border)' }}>
        {online && !known ? (
          <div style={{ padding: '10px 12px', fontSize: 'var(--w-font-meta)', color: 'var(--w-warn)' }}>先升级，才能保存</div>
        ) : null}
        {groups.map((group) => (
          <div key={group.id}>
            <div style={{ padding: '10px 12px 4px', fontSize: 11, fontWeight: 700, color: 'var(--w-text-quaternary)' }}>{group.title}</div>
            {group.items.map((item) => {
              const st = statusOf(kindOf(group.id, item), item.id)
              const logged = item.wechat && (wechat.logged_in || !!st?.configured)
              const ready = item.wechat ? logged : !!st?.configured
              const missing = !!item.needsInstall && !st?.installed && !item.wechat
              const installing = jobMatches(job, kindOf(group.id, item), item.id)
              const on = navKey(group.id, item) === navKey(selected.group.id, selected.item)
              const channel = channelState(st, item)
              const label = item.groupId
                ? (missing ? '未安装' : installing ? '安装中' : channel)
                : item.conn && st?.status?.connected ? '已连接' : item.wechat ? (logged ? '已登录' : '未登录') : missing ? '未安装' : installing ? '安装中' : ready ? '已配置' : '待填写'
              return (
                <button
                  key={item.navId || item.id}
                  type="button"
                  data-active={on ? 'true' : 'false'}
                  className="w-hit flex w-full items-center gap-2"
                  onClick={() => setOpenId(navKey(group.id, item))}
                  style={{ border: 'none', cursor: 'pointer', textAlign: 'left', padding: '8px 12px', minHeight: 40 }}
                >
                  <span className="min-w-0 flex-1 truncate" style={{ fontWeight: on ? 700 : 600 }}>{item.label}</span>
                  <span style={{ fontSize: 'var(--w-font-meta)', fontWeight: 700, color: (item.groupId ? channel === '已启用' : ready) ? 'var(--w-pass)' : 'var(--w-text-quaternary)' }}>{label}</span>
                </button>
              )
            })}
            {group.id === 'im' && !dynamicIm.length ? (
              <div style={{ padding: '4px 12px 8px', fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)' }}>
                LangBot 渠道层将在节点安装后出现
              </div>
            ) : null}
          </div>
        ))}
      </nav>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto" style={{ padding: '16px 20px 40px' }}>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>{selected.item.label}</div>
        <p style={{ margin: '4px 0 16px', fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)' }}>{selected.item.hint || HINT[selected.item.id]}</p>
        {selected.item.conn ? <ConnLine st={selectedPlatform ? { ...selectedSt, status: selectedPlatform } : selectedSt} /> : null}
        {selected.item.groupId && selectedChannel ? (
          <div style={{ margin: '0 0 14px', fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)' }}>
            {selectedChannel === '已启用' ? '这家已启用，凭据只属于这一家。' : selectedChannel === '已填写' ? '必填项已齐，打开下面的启用才会连接。' : '这家还没填完。其它渠道不受影响。'}
          </div>
        ) : null}
        {jobMatches(job, selectedKind, selected.item.id) ? <JobBar job={job} /> : null}
        {selected.item.wechat ? (
          <div className="flex flex-col" style={{ gap: 10 }}>
            <WechatQr raw={wechat.qrcode_img} />
            <div style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-secondary)' }}>{wechatHint(wechat)}</div>
            <div className="flex flex-wrap gap-2">
              {selectedReady ? null : <Button size="small" type="primary" disabled={!!busy || locked} onClick={() => wechatAct('qr')}>显示二维码</Button>}
              <Button size="small" disabled={!!busy || locked} onClick={() => wechatAct('status')}>刷新状态</Button>
              {selectedReady ? (
                <Button size="small" disabled={!!busy || locked} onClick={() => {
                  void fb.confirm({ title: '退出这台机器上的微信？', content: '退出之后才能重新扫码。', okText: '退出' }).then((ok) => {
                    if (ok) void wechatAct('logout')
                  })
                }}>退出</Button>
              ) : null}
            </div>
            {wechat.need_verify ? (
              <label className="flex items-center gap-2">
                <span style={{ width: 72, fontSize: 'var(--w-font-sm)' }}>配对码</span>
                <Input value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} style={{ maxWidth: 220 }} autoComplete="off" />
                <Button size="small" disabled={!!busy} onClick={() => wechatAct('verify', { verify_code: verifyCode })}>提交</Button>
              </label>
            ) : null}
          </div>
        ) : (
          <div className="grid" style={{ gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))' }}>
            {(selected.item.fields || []).filter((field) => field.type === 'bool').map((field) => {
              const draft = drafts[selectedBag]?.[field.key]
              const on = draft !== undefined ? draft === '1' : selectedSt?.values?.[field.key] === '1'
              return (
                <label key={field.key} className="flex items-center justify-between" style={{ gridColumn: '1 / -1', padding: '8px 0' }}>
                  <span style={{ fontSize: 'var(--w-font-sm)', fontWeight: 650 }}>{field.label}</span>
                  <Switch checked={on} disabled={!!busy || locked} onChange={(checked) => setField(selectedKind, selectedPluginId, field.key, checked ? '1' : '0')} />
                </label>
              )
            })}
            {(selected.item.fields || []).filter((field) => field.type !== 'bool').map((field) => {
              const savedText = selectedSt?.values?.[field.key] || ''
              const secretSaved = (selectedSt?.saved_secrets || []).includes(field.key) || (!selectedSt?.saved_secrets && !!selectedSt?.configured && !selected.item.groupId && !!field.secret)
              const draft = drafts[selectedBag]?.[field.key]
              return (
              <label key={field.key} className="flex flex-col" style={{ gap: 6 }}>
                <span className="flex items-center justify-between">
                  <span style={{ fontSize: 'var(--w-font-sm)', fontWeight: 650 }}>{field.label}{field.optional ? <span style={{ fontWeight: 400, color: 'var(--w-text-quaternary)' }}>（可选）</span> : null}</span>
                  {field.secret && secretSaved ? (
                    <span className="flex gap-1">
                      {draft === undefined ? (
                        <Button size="small" type="text" disabled={!!busy || locked} onClick={() => setField(selectedKind, selectedPluginId, field.key, '')}>更换</Button>
                      ) : null}
                      <Button size="small" type="text" disabled={!!busy || locked} onClick={() => clearField(selectedKind, selected.item, field.key)}>清除</Button>
                    </span>
                  ) : null}
                </span>
                {field.secret ? (
                  secretSaved && draft === undefined ? (
                    <Input value="已保存在这台机器" readOnly />
                  ) : (
                    <Input.Password
                      value={draft || ''}
                      placeholder={field.placeholder || '填写新密钥后保存'}
                      autoComplete="off"
                      onChange={(e) => setField(selectedKind, selectedPluginId, field.key, e.target.value)}
                    />
                  )
                ) : (
                  <Input
                    value={draft !== undefined ? draft : savedText}
                    placeholder={field.placeholder}
                    autoComplete="off"
                    onChange={(e) => setField(selectedKind, selectedPluginId, field.key, e.target.value)}
                  />
                )}
              </label>
            )})}
            <div className="flex flex-wrap gap-2">
              {selected.item.groupId && selectedMissing ? (
                <Button
                  size="small"
                  disabled={!!busy || locked}
                  loading={busy.startsWith('install:')}
                  onClick={() => void install(selectedKind, selected.item)}
                >
                  安装 LangBot
                </Button>
              ) : null}
              <Button
                size="small"
                type="primary"
                disabled={!!busy || locked}
                loading={busy.startsWith('save:') || (!selected.item.groupId && busy.startsWith('install:'))}
                onClick={() => void submitEditItem(selected.group.id, selected.item)}
              >
                {selected.item.groupId ? `保存${selected.item.label}` : selectedMissing ? '安装并保存' : '保存'}
              </Button>
              {selectedReady && testLabel(selected.item) ? (
                <Button size="small" disabled={!!busy || locked} onClick={() => void runProbe(selected.item)}>{testLabel(selected.item)}</Button>
              ) : null}
              {testExplain(selected.item) ? (
                <span style={{ width: '100%', fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)' }}>{testExplain(selected.item)}</span>
              ) : null}
              {selected.item.needsInstall && selectedSt?.installed ? (
                <Button size="small" type="text" disabled={!!busy || locked} onClick={() => {
                  const title = selected.item.groupId ? '移除 LangBot？' : '移除这个插件？'
                  const content = selected.item.groupId ? 'LangBot 是共用的运行层。移除后，飞书、钉钉、企业微信的配置都会从这台机器清掉。' : '移除后需要重新安装才能再用。'
                  void fb.confirm({ title, content, okText: '移除' }).then((ok) => {
                    if (ok) void remove(selectedKind, selected.item)
                  })
                }}>{selected.item.groupId ? '移除 LangBot' : '移除'}</Button>
              ) : null}
            </div>
            {selectedTest ? (
              <div style={{ fontSize: 'var(--w-font-sm)', color: selectedTest.ok ? 'var(--w-pass)' : 'var(--w-fail)' }}>
                上次测试：{selectedTest.text}
              </div>
            ) : null}
          </div>
        )}
        {selected.group.id === 'im' ? <ImNotes node={node} hasDynamic={dynamicIm.length > 0} /> : null}
      </div>
    </div>
  )
}

/** 对话渠道的连接状态：读插件快照里的 status。Scout 没上报就明说「未知」，不猜。 */
function ConnLine({ st }: { st: NodePluginStatus | undefined }) {
  const s = st?.status
  const known = s && typeof s.connected === 'boolean'
  return (
    <div className="flex flex-wrap items-center gap-3" style={{ margin: '-8px 0 14px', fontSize: 'var(--w-font-sm)' }}>
      <span style={{ fontWeight: 700, color: !known ? 'var(--w-text-tertiary)' : s.connected ? 'var(--w-pass)' : 'var(--w-warn)' }}>
        {!known ? '连接状态：未知' : s.connected ? '● 已连接' : '○ 未连接'}
      </span>
      {known ? <span style={{ color: 'var(--w-text-tertiary)' }}>最后收到消息 {fmtAgo(s.last_message_at)}</span> : null}
      {s?.error ? <span style={{ color: 'var(--w-fail)' }}>{s.error}</span> : null}
    </div>
  )
}

function ImNotes({ node, hasDynamic }: { node: ScoutNode; hasDynamic: boolean }) {
  const held = heldChannels(node)
  const box = { marginTop: 20, padding: '10px 12px', borderRadius: 'var(--w-radius-sm)', border: '1px solid var(--w-border)', fontSize: 'var(--w-font-sm)', color: 'var(--w-text-secondary)' } as const
  return (
    <>
      <div style={{ ...box, background: held.length ? 'var(--w-warn-bg)' : 'var(--w-surface-subtle)' }}>
          <strong>这台机器上的机器人</strong>
        <div style={{ marginTop: 2 }}>
          这里只让机器人登录到这台 Scout。谁的微信账号可以指挥它，在「我的助手」里用绑定码认领，两步都要做，不是二选一。
          {held.length
            ? ` 本节点正连着「${held.join('、')}」，需要常驻。`
            : ' 本节点当前没有连着对话渠道。'}
        </div>
      </div>
      {!hasDynamic ? (
        <div style={{ ...box, background: 'var(--w-surface-subtle)' }}>
          <strong>LangBot 渠道层</strong>
          <div style={{ marginTop: 2 }}>飞书 / 企业微信 / 钉钉等渠道由 LangBot 提供，将在节点安装后出现在这里。当前节点还没有上报这类条目。</div>
        </div>
      ) : null}
    </>
  )
}


const HINT: Record<string, string> = {
  feishu: '拉需求，把结果写回去',
  meego: '读写工作项',
  wechat: '让机器人登录到这台机器。登录态只留在这里。个人账号的认领在「我的助手」，不要在这里填绑定码。',
  feishu_bot: '往群里发一条消息',
  wecom: '往群里发一条消息',
  gmail: '收验证码',
}

/** 微信返回的常常是登录链接，不是图片。已经是图就直接显示，否则画成二维码。 */
function WechatQr({ raw }: { raw: string }) {
  const text = raw.trim()
  if (!text) return null
  const compact = text.replace(/\s/g, '')
  const image = text.startsWith('data:image')
    || compact.startsWith('/9j/')
    || compact.startsWith('iVBORw0K')
    || /\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(text)
    || (/^[A-Za-z0-9+/=]+$/.test(compact) && compact.length > 80)
  if (image) {
    const src = text.startsWith('data:image') || text.startsWith('http')
      ? text
      : `data:${compact.startsWith('/9j/') ? 'image/jpeg' : 'image/png'};base64,${compact}`
    return (
      <img
        src={src}
        alt="微信登录二维码"
        width={220}
        height={220}
        style={{ width: 220, height: 220, objectFit: 'contain', alignSelf: 'center', background: 'var(--w-surface)' }}
      />
    )
  }
  return <QRCode value={text} size={220} style={{ alignSelf: 'center' }} />
}

function wechatHint(state: { error: string; logged_in: boolean; status: string; qrcode_img: string }) {
  if (state.error) return state.error
  if (state.logged_in) return '这台机器已登录微信'
  if (state.status === 'expired') return '二维码过期了，重新拿一张。'
  if (state.status === 'scaned' || state.status === 'scanned') return '已扫码，在手机上确认。'
  if (state.qrcode_img) return '用将要作为机器人的微信号扫这一张。扫完后，每个人再到「我的助手」生成绑定码。'
  return '点显示二维码，让机器人微信号登录这台机器。'
}

function testLabel(item: ItemDef) {
  if (item.id === 'feishu') return '测试鉴权'
  if (item.id === 'meego') return '测试换票'
  if (item.id === 'feishu_bot' || item.id === 'wecom') return '发测试消息'
  return ''
}

function testExplain(item: ItemDef) {
  if (item.id === 'feishu') return '用已保存的 App ID 和 Secret 向飞书换访问凭证，不改文档。'
  if (item.id === 'meego') return '用已保存的插件 ID 和密钥向 Meego 换访问凭证，不改工作项。'
  if (item.id === 'feishu_bot' || item.id === 'wecom') return '往已保存的 Webhook 发一条「Mino 测试消息」。'
  return ''
}

function jobMatches(job: NodePluginJob | undefined, kind: string, id: string) {
  return !!job?.active && job.class === kind && job.id === id
}

function JobBar({ job }: { job: NodePluginJob | undefined }) {
  const percent = Math.max(0, Math.min(100, Number(job?.percent) || 0))
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ height: 6, borderRadius: 99, background: 'var(--w-muted-bg)', overflow: 'hidden' }}>
        <div style={{ width: `${percent}%`, height: '100%', background: 'var(--w-primary)' }} />
      </div>
      <div style={{ marginTop: 4, fontSize: 'var(--w-font-meta)', color: 'var(--w-text-tertiary)' }}>
        {job?.label || job?.stage || '安装中'}
      </div>
    </div>
  )
}

