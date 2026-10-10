/** 「N 分钟前」。入参是 epoch 秒（误传毫秒也认）。0/空 → 「尚未收到消息」。 */
export const fmtAgo = (ts?: number): string => {
  if (!ts) return '尚未收到消息'
  const sec = ts > 1e12 ? ts / 1000 : ts
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - sec))
  if (diff < 60) return '刚刚'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  return `${Math.floor(diff / 86400)} 天前`
}
