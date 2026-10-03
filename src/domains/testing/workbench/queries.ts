import { useQuery } from '@tanstack/react-query'
import { getAppDetail } from '@/api/project'
import type { AppRow } from '@/types/project'

export const appKeys = {
  detail: (appId: string) => ['app', appId] as const,
}

/**
 * 应用详情。
 *
 * 原实现只从 URL query 读 appName/projectName，不带 query 的链接打开后
 * 标题就是"应用"二字（契约「修掉一处真实缺陷」）。这里按 id 真拉详情。
 */
export const useAppDetail = (appId: string) =>
  useQuery({
    queryKey: appKeys.detail(appId),
    enabled: !!appId,
    queryFn: async (): Promise<AppRow> => {
      const res = await getAppDetail(appId)
      const row = (res?.data ?? res) as AppRow
      return row || ({ id: appId } as AppRow)
    },
  })
