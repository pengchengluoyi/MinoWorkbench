import { nodeIsOnline, type NodePluginStatus, type ScoutNode } from '@/api/nodes'
import { imConnectionLabel } from '@/lib/imStatus'
export interface FieldDef {
  key: string
  label: string
  secret?: boolean
  optional?: boolean
  placeholder?: string
  group?: string
  type?: string
}

export interface ItemDef {
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

export const kindOf = (group: PluginPane, item: ItemDef) => item.kind ?? group
export const pluginIdOf = (item: ItemDef) => item.pluginId || item.id
export const navKey = (pane: string, item: ItemDef) => `${pane}:${item.navId || item.id}`

/** LangBot 是一个插件、多家渠道。字段 key 已经按渠道加了前缀，页面按渠道拆开编辑和保存。 */
export function imChannels(row: NodePluginStatus): ItemDef[] {
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

export function channelFilled(st: NodePluginStatus | undefined, fields: FieldDef[] | undefined) {
  const required = (fields || []).filter((field) => !field.optional && field.type !== 'bool')
  if (!required.length) return !!st?.configured
  return required.every((field) => (
    field.secret
      ? (st?.saved_secrets || []).includes(field.key)
      : !!String(st?.values?.[field.key] || '').trim()
  ))
}

export function channelState(st: NodePluginStatus | undefined, item: ItemDef, node: ScoutNode) {
  if (!item.groupId) return ''
  const channel = node.im_channels?.find((row) => row.channel === `langbot:${item.groupId}`)
  if (channel || !nodeIsOnline(node)) return imConnectionLabel(channel, nodeIsOnline(node)).text
  const filled = channelFilled(st, item.fields)
  const flag = (item.fields || []).find((field) => field.type === 'bool' && field.key.endsWith('.enabled'))
  const on = flag ? st?.values?.[flag.key] === '1' : filled
  if (filled && on) return '状态未上报'
  if (filled) return '已填写'
  return '待填写'
}

export const GROUPS: { id: PluginPane; title: string; items: ItemDef[] }[] = [
  {
    id: 'cli',
    title: '工作项',
    items: [
      {
        id: 'case_api',
        label: '用例服务 API',
        hint: '填写用例服务的地址和登录账号；密码由所选 Scout 的凭据管理保存。每个节点配置一个服务账号，来源维护通过该节点读取项目和会话。',
        fields: [
          { key: 'base_url', label: '服务地址', placeholder: 'http://SERVER_IP:8001' },
          { key: 'email', label: '登录邮箱' },
          { key: 'password', label: '登录密码', secret: true },
        ],
      },
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
