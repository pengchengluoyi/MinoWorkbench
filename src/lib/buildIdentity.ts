import type { ExecutionBuild } from '@/api/sessions'

declare const __MINO_WORKBENCH_BUILD__: ExecutionBuild

export async function workbenchBuildIdentity(): Promise<ExecutionBuild> {
  if (import.meta.env.DEV) {
    const response = await fetch('/__mino/workbench-build', { cache: 'no-store', credentials: 'omit' })
    if (!response.ok) throw new Error('开发 Workbench build 不可读取')
    const value = await response.json() as ExecutionBuild
    if (!value.build_id || !value.source_digest) throw new Error('开发 Workbench build 响应无效')
    return value
  }
  const release = window.__MINO_CONFIG__?.buildId
  return { ...__MINO_WORKBENCH_BUILD__, ...(release ? { build_id: release, identity_kind: 'release' } : {}) }
}
