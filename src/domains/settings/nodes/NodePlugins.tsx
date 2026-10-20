import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Input, Switch, errText, useFeedback } from '@/ui'
import {
  callNodePlugin,
  configNodePlugin,
  installNodePlugin,
  removeNodePlugin,
  nodeIsOnline,
  type NodePluginStatus,
  type ScoutNode,
} from '@/api/nodes'
import { unwrapOne } from '@/lib/unwrap'
import { nodeKeys } from './queries'
import { assistantKeys } from '@/domains/assistant/queries'

import { GROUPS, kindOf, pluginIdOf, navKey, imChannels, channelState, type PluginPane, type ItemDef } from './pluginCatalog'
export { PLUGIN_PANES, type PluginPane } from './pluginCatalog'
import { ConnLine, ImNotes, HINT, WechatQr, wechatHint, testLabel, testExplain, jobMatches, JobBar } from './PluginStatusViews'
/**
 * 每台 Scout 自己的插件参数。密钥不进 Nexus，表单只负责下发到这台在线节点。
 * 分类按接入方式：CLI / MCP / Bot / 邮箱。
 */
export function NodePlugins({ node, initialPane }: { node: ScoutNode; initialPane?: PluginPane }) {
  const fb = useFeedback()
  const qc = useQueryClient()
  const online = nodeIsOnline(node)
  const known = node.plugins_ready !== false && Array.isArray(node.plugins) && node.plugins.length > 0
  const job = node.plugin_job
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({})
  const [busy, setBusy] = useState('')
  const [unknownJob, setUnknownJob] = useState('')
  useUnsavedChanges(Object.values(drafts).some(values => Object.keys(values).length > 0))
  const [wechat, setWechat] = useState({ qrcode_img: '', error: '', logged_in: false, need_verify: false, status: '' })
  const [verifyCode, setVerifyCode] = useState('')
  const [openId, setOpenId] = useState('')
  const [lastTest, setLastTest] = useState<Record<string, { ok: boolean; text: string }>>({})
  const wechatAsked = useRef('')


  const statusOf = (kind: string, id: string): NodePluginStatus | undefined =>
    (node.plugins || []).find((row) => row.class === kind && row.id === id)

  const setField = (kind: string, id: string, key: string, value: string) => {
    if (busy) return
    const bag = `${kind}:${id}`
    setDrafts((prev) => ({ ...prev, [bag]: { ...(prev[bag] || {}), [key]: value } }))
  }

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: nodeKeys.all }),
    qc.invalidateQueries({ queryKey: assistantKeys.status }),
    qc.invalidateQueries({ queryKey: assistantKeys.identities }),
  ])

  const save = async (kind: string, item: ItemDef) => {
    const bag = `${kind}:${item.id}`
    const values: Record<string, string> = {}
    for (const field of item.fields || []) {
      const draft = drafts[bag]?.[field.key]
      if (field.type === 'bool') {
        if (draft !== undefined) values[field.key] = draft === '1' ? '1' : '0'
        continue
      }
      const raw = String(draft || '')
      const text = item.id === 'case_api' && field.key === 'password' ? raw : raw.trim()
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
    if (unknownJob || busy || job?.active) { fb.warn('请先核对当前插件任务状态，避免重复派发'); return }
    setBusy(`install:${kind}:${item.id}`)
    try {
      await installNodePlugin(node.node_id, { kind, plugin_id: item.id })
      fb.ok('安装完成')
      void refresh()
      return true
    } catch (e) {
      setUnknownJob(`${kind}:${item.id}`); fb.fail(errText(e, '安装结果待确认，请先核对节点任务和插件状态，不重复派发'))
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

  const lockReason = !online ? '节点离线，恢复连接后才能编辑和保存配置。' : node.plugins_ready === false ? (node.plugin_warning || '插件尚未就绪，暂不能编辑配置。') : !known ? '插件状态未知，暂不能编辑配置；这不代表未配置或未安装。' : ''

  const dynamicIm: ItemDef[] = (node.plugins || [])
    .filter((row) => row.class === 'im' && row.id !== 'wechat')
    .flatMap((row) => imChannels(row))

  const groups = GROUPS.map((g) => {
    const items = g.items.map((item) => {
      const kind = item.kind ?? g.id
      const row = (node.plugins || []).find((plugin) => plugin.class === kind && plugin.id === item.id)
      if (row?.fields?.length) return { ...item, fields: item.id === 'case_api' ? row.fields.filter(field => field.key !== 'base_url') : row.fields, label: row.label || item.label }
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
  const locked = !!lockReason || !selectedSt
  const selectedReady = selected.item.wechat
    ? (wechat.logged_in || !!selectedSt?.configured)
    : !!selectedSt?.configured
  const selectedMissing = known && !!selectedSt && !!selected.item.needsInstall && !selectedSt?.installed && !selected.item.wechat
  const selectedTest = lastTest[selected.item.id]
  const selectedPluginId = pluginIdOf(selected.item)
  const selectedBag = `${selectedKind}:${selectedPluginId}`
  const selectedChannel = channelState(selectedSt, selected.item, node)
  const selectedPlatform = selected.item.groupId ? selectedSt?.platforms?.[selected.item.groupId] : undefined
  const wechatReported = !!(node.plugins || []).find((row) => row.id === 'wechat' && (row.class === 'im' || row.class === 'bot'))

  useEffect(() => {
    if (!selected.item.wechat || !wechatReported || !online || !known || wechatAsked.current === node.node_id) return
    wechatAsked.current = node.node_id
    void wechatAct('status')
    // 仅进入已上报的微信插件时读取一次，其他分类不触发微信操作。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.node_id, online, known, selected.item.wechat, wechatReported])

  return (
    <div className="w-node-config-shell">
      <div className="w-node-config-context"><span><strong>{node.hostname || node.node_id}</strong></span><Button size="small" disabled={!!busy} onClick={() => void refresh()}>刷新配置状态</Button></div>
      {lockReason && <Alert type="warning" showIcon message={lockReason} />}
      <div className="w-node-config-layout">{unknownJob && <p role="alert">插件 {unknownJob} 的执行结果待确认，未重新提交。<button type="button" onClick={() => { void refresh(); setUnknownJob('') }}>已核对节点状态，解除本地派发锁</button></p>}
      <nav className="w-node-config-nav" aria-label="接入项">
        {online && !known ? (
          <div style={{ padding: '10px 12px', fontSize: 'var(--w-font-meta)', color: 'var(--w-text-secondary)' }}>
            {lockReason}
          </div>
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
              const channel = channelState(st, item, node)
              const label = !known || !st ? '状态未知' : item.groupId
                ? (missing ? '未安装' : installing ? '安装中' : channel)
                : item.conn && st?.status?.connected ? '已连接' : item.wechat ? (logged ? '已登录' : '未登录') : missing ? '未安装' : installing ? '安装中' : ready ? '已配置' : '待填写'
              return (
                <button
                  key={item.navId || item.id}
                  type="button"
                  data-active={on ? 'true' : 'false'}
                  aria-current={on ? 'true' : undefined}
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
      <div className="w-node-config-editor">
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{selected.item.label}</h2>
        <p style={{ margin: '4px 0 16px', fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)' }}>{selected.item.hint || HINT[selected.item.id]}</p>
        {known && selectedSt && selected.item.conn ? <ConnLine st={selectedPlatform ? { ...selectedSt, status: selectedPlatform } : selectedSt} /> : null}
        {known && selectedSt && selected.item.groupId && selectedChannel ? (
          <div style={{ margin: '0 0 14px', fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)' }}>
            {selectedChannel === '已启用' ? '这家已启用，凭据只属于这一家。' : selectedChannel === '已填写' ? '必填项已齐，打开下面的启用才会连接。' : '这家还没填完。其它渠道不受影响。'}
          </div>
        ) : null}
        {jobMatches(job, selectedKind, selected.item.id) ? <JobBar job={job} /> : null}
        {selected.item.wechat ? (
          <div className="flex flex-col" style={{ gap: 10 }}>
            <WechatQr raw={wechat.qrcode_img} />
            <div style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-secondary)' }}>{known && selectedSt ? wechatHint(wechat) : '登录状态未知；等待插件就绪后读取。'}</div>
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
                <Input disabled={!!busy || locked} value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} style={{ maxWidth: 220 }} autoComplete="off" />
                <Button size="small" disabled={!!busy || locked || !verifyCode.trim()} onClick={() => wechatAct('verify', { verify_code: verifyCode })}>提交</Button>
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
                      disabled={!!busy || locked}
                      placeholder={field.placeholder || '填写新密钥后保存'}
                      autoComplete="off"
                      onChange={(e) => setField(selectedKind, selectedPluginId, field.key, e.target.value)}
                    />
                  )
                ) : (
                  <Input
                    value={draft !== undefined ? draft : savedText}
                    disabled={!!busy || locked}
                    placeholder={field.placeholder}
                    autoComplete="off"
                    onChange={(e) => setField(selectedKind, selectedPluginId, field.key, e.target.value)}
                  />
                )}
              </label>
            )})}
            <div className="w-node-config-actions">
              {Object.keys(drafts[selectedBag] || {}).length > 0 && <span className="w-form-hint" role="status" style={{ width: '100%' }}>当前配置有未保存的修改</span>}
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
                <Button size="small" type="text" danger disabled={!!busy || locked} onClick={() => {
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
    </div>
  )
}

/** 对话渠道的连接状态：读插件快照里的 status。Scout 没上报就明说「未知」，不猜。 */
