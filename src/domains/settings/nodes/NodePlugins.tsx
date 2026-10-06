import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Input, QRCode, errText, useFeedback } from '@/ui'
import {
  callNodePlugin,
  configNodePlugin,
  installNodePlugin,
  removeNodePlugin,
  nodeIsOnline,
  type NodePluginJob,
  type NodePluginStatus,
  type ScoutNode,
} from '@/api/nodes'
import { unwrapOne } from '@/lib/unwrap'
import { nodeKeys } from './queries'

interface FieldDef {
  key: string
  label: string
  secret?: boolean
}

interface ItemDef {
  id: string
  label: string
  needsInstall?: boolean
  wechat?: boolean
  fields?: FieldDef[]
}

export type PluginPane = 'cli' | 'bot' | 'mail'

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
      { id: 'wechat', label: '微信', wechat: true },
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
export function NodePlugins({ node }: { node: ScoutNode }) {
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
      const text = String(drafts[bag]?.[field.key] || '').trim()
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
    const st = statusOf(kind, item.id)
    if (item.needsInstall && !st?.installed) {
      const ok = await install(kind, item)
      if (!ok) return
    }
    const bag = `${kind}:${item.id}`
    const has = (item.fields || []).some((field) => String(drafts[bag]?.[field.key] || '').trim())
    if (!has) {
      fb.warn('先填写要保存的参数')
      return
    }
    await save(kind, item)
  }

  const selectedKey = openId || 'cli:feishu'
  const selected = GROUPS.flatMap((group) => group.items.map((item) => ({ group, item }))).find((row) => `${row.group.id}:${row.item.id}` === selectedKey)
    || { group: GROUPS[0], item: GROUPS[0].items[0] }
  const selectedSt = statusOf(selected.group.id, selected.item.id)
  const selectedReady = selected.item.wechat
    ? (wechat.logged_in || !!selectedSt?.configured)
    : !!selectedSt?.configured
  const selectedMissing = !!selected.item.needsInstall && !selectedSt?.installed && !selected.item.wechat
  const selectedTest = lastTest[selected.item.id]
  const selectedBag = `${selected.group.id}:${selected.item.id}`

  return (
    <div className="flex h-full min-h-0">
      <nav className="shrink-0 overflow-y-auto" aria-label="接入项" style={{ width: 'clamp(180px, 22%, 280px)', borderRight: '1px solid var(--w-border)' }}>
        {online && !known ? (
          <div style={{ padding: '10px 12px', fontSize: 'var(--w-font-meta)', color: 'var(--w-warn)' }}>先升级，才能保存</div>
        ) : null}
        {GROUPS.map((group) => (
          <div key={group.id}>
            <div style={{ padding: '10px 12px 4px', fontSize: 11, fontWeight: 700, color: 'var(--w-text-quaternary)' }}>{group.title}</div>
            {group.items.map((item) => {
              const st = statusOf(group.id, item.id)
              const logged = item.wechat && (wechat.logged_in || !!st?.configured)
              const ready = item.wechat ? logged : !!st?.configured
              const missing = !!item.needsInstall && !st?.installed && !item.wechat
              const installing = jobMatches(job, group.id, item.id)
              const on = `${group.id}:${item.id}` === `${selected.group.id}:${selected.item.id}`
              const label = item.wechat ? (logged ? '已登录' : '未登录') : missing ? '未安装' : installing ? '安装中' : ready ? '已配置' : '待填写'
              return (
                <button
                  key={item.id}
                  type="button"
                  data-active={on ? 'true' : 'false'}
                  className="w-hit flex w-full items-center gap-2"
                  onClick={() => setOpenId(`${group.id}:${item.id}`)}
                  style={{ border: 'none', cursor: 'pointer', textAlign: 'left', padding: '8px 12px', minHeight: 40 }}
                >
                  <span className="min-w-0 flex-1 truncate" style={{ fontWeight: on ? 700 : 600 }}>{item.label}</span>
                  <span style={{ fontSize: 'var(--w-font-meta)', fontWeight: 700, color: ready ? 'var(--w-pass)' : 'var(--w-text-quaternary)' }}>{label}</span>
                </button>
              )
            })}
          </div>
        ))}
      </nav>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto" style={{ padding: '16px 20px 40px' }}>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>{selected.item.label}</div>
        <p style={{ margin: '4px 0 16px', fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)' }}>{HINT[selected.item.id]}</p>
        {jobMatches(job, selected.group.id, selected.item.id) ? <JobBar job={job} /> : null}
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
            {(selected.item.fields || []).map((field) => {
              const savedText = selectedSt?.values?.[field.key] || ''
              const secretSaved = (selectedSt?.saved_secrets || []).includes(field.key) || (!selectedSt?.saved_secrets && !!selectedSt?.configured && !!field.secret)
              const draft = drafts[selectedBag]?.[field.key]
              return (
              <label key={field.key} className="flex flex-col" style={{ gap: 6 }}>
                <span className="flex items-center justify-between">
                  <span style={{ fontSize: 'var(--w-font-sm)', fontWeight: 650 }}>{field.label}</span>
                  {field.secret && secretSaved ? (
                    <span className="flex gap-1">
                      {draft === undefined ? (
                        <Button size="small" type="text" disabled={!!busy || locked} onClick={() => setField(selected.group.id, selected.item.id, field.key, '')}>更换</Button>
                      ) : null}
                      <Button size="small" type="text" disabled={!!busy || locked} onClick={() => clearField(selected.group.id, selected.item, field.key)}>清除</Button>
                    </span>
                  ) : null}
                </span>
                {field.secret ? (
                  secretSaved && draft === undefined ? (
                    <Input value="已保存在这台机器" readOnly />
                  ) : (
                    <Input.Password
                      value={draft || ''}
                      placeholder="填写新密钥后保存"
                      autoComplete="off"
                      onChange={(e) => setField(selected.group.id, selected.item.id, field.key, e.target.value)}
                    />
                  )
                ) : (
                  <Input
                    value={draft !== undefined ? draft : savedText}
                    autoComplete="off"
                    onChange={(e) => setField(selected.group.id, selected.item.id, field.key, e.target.value)}
                  />
                )}
              </label>
            )})}
            <div className="flex flex-wrap gap-2">
              <Button
                size="small"
                type="primary"
                disabled={!!busy || locked}
                loading={busy.startsWith('save:') || busy.startsWith('install:')}
                onClick={() => void submitEditItem(selected.group.id, selected.item)}
              >
                {selectedMissing ? '安装并保存' : '保存'}
              </Button>
              {selectedReady && testLabel(selected.item) ? (
                <Button size="small" disabled={!!busy || locked} onClick={() => void runProbe(selected.item)}>{testLabel(selected.item)}</Button>
              ) : null}
              {testExplain(selected.item) ? (
                <span style={{ width: '100%', fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)' }}>{testExplain(selected.item)}</span>
              ) : null}
              {selected.item.needsInstall && selectedSt?.installed ? (
                <Button size="small" type="text" disabled={!!busy || locked} onClick={() => remove(selected.group.id, selected.item)}>移除</Button>
              ) : null}
            </div>
            {selectedTest ? (
              <div style={{ fontSize: 'var(--w-font-sm)', color: selectedTest.ok ? 'var(--w-pass)' : 'var(--w-fail)' }}>
                上次测试：{selectedTest.text}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}


const HINT: Record<string, string> = {
  feishu: '拉需求，把结果写回去',
  meego: '读写工作项',
  wechat: '登录态只留在这台机器',
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
  if (state.qrcode_img) return '用手机微信扫这一张。登录态只留在这台机器。'
  return '点显示二维码，向微信要一张登录码。'
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

