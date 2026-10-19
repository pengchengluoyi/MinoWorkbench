import type { CollabMessage } from '@/api/collab'

const LEGACY_MARKERS = [
  '已拆解为',
  '同步',
  '需求分析',
  '用例候选',
  '推进 QA',
  '多角色评审',
  '执行账号已固化',
  '从用例页进入',
  '编号：case-',
  '步骤摘要',
  '运行测试分析',
  '确认写入',
  '议题里还没有',
  '协作助手',
  '工作项已排队',
]

export function filterStewardChatMessages(messages: CollabMessage[]): CollabMessage[] {
  return messages.filter(msg => {
    if (msg.author_kind === 'user') return true
    const body = String(msg.body || '')
    if (!body.trim()) return false
    if (body.startsWith('【协作助手】') || body.startsWith('【测试 Bot】')) {
      return !LEGACY_MARKERS.some(m => body.includes(m))
    }
    return !LEGACY_MARKERS.some(m => body.includes(m))
  })
}
