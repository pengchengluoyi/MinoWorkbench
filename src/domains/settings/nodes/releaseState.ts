import { compareVersion, releaseTargetOf, type ScoutNode, type ScoutRelease } from '@/api/nodes'

export type ReleaseState = { kind: 'checking' | 'failed' | 'unavailable' | 'unknown' | 'available' | 'current' | 'updating'; label: string; detail: string; canUpgrade: boolean }
export function scoutReleaseState(node: ScoutNode, query: { data?: ScoutRelease; isPending?: boolean; isLoading?: boolean; isFetching?: boolean; isError?: boolean }): ReleaseState {
  const current = String(node.scout_version || '').trim()
  const latest = String(query.data?.version || '').trim()
  const target = releaseTargetOf(node)
  const state = (kind: ReleaseState['kind'], label: string, detail: string, canUpgrade = false): ReleaseState => ({ kind, label, detail, canUpgrade })
  if (node.update_job?.active) return state('updating', node.update_job.label || '正在升级', '请等待安装与节点重连；以重新上报的运行版本确认结果。')
  if (!target.os || !target.arch) return state('unknown', '安装适配信息未上报', '节点的系统或架构未知，暂不能判断可安装版本。')
  if (query.isFetching || query.isPending || query.isLoading) return state('checking', '正在检查可安装版本', '检查完成前不能下发升级。')
  if (query.isError) return state('failed', '暂未能确认更新', '版本检查失败，不代表没有新版本。请重试检查。')
  if (query.data?.packaging || query.data?.manifest_ready === false) return state('unavailable', '没有适用于此节点的新版本', latest ? `已发布 ${latest}，但此系统 / 架构的安装包尚未就绪。` : '当前发布没有适用于此系统 / 架构的安装包。')
  if (query.data?.manifest_ready !== true || !latest) return state('unknown', '可安装状态未确认', '当前返回的信息不足以确认存在适用安装包。')
  if (!current) return state('unknown', '当前运行版本未上报', `可安装版本 ${latest}，尚不能与当前节点比较。`)
  const comparison = compareVersion(current, latest)
  if (comparison == null) return state('unknown', '暂无法比较版本', `运行版本 ${current}；可安装版本 ${latest}。`)
  if (comparison < 0) return state('available', `升级至 ${latest.replace(/^v/i, '')}`, `当前 ${current} → 可安装 ${latest}`, true)
  return state('current', '没有新版本', comparison > 0 ? `当前运行 ${current}，不降级到 ${latest}。` : `当前运行 ${current}，与适用发布版本一致。`)
}
