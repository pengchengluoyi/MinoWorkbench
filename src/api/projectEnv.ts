import { request } from '@/lib/request'

export interface EnvChannel {
  id: string
  label?: string
  /** 该端的值字段名，默认 value（android 常用 package_id，web 常用 url） */
  field?: string
}

/** profiles[环境名][端 id][字段] = 值 */
export type EnvProfiles = Record<string, Record<string, Record<string, unknown>>>

export interface EnvDoc {
  profiles?: EnvProfiles
  channels?: EnvChannel[]
  project_name?: string
  env?: EnvDoc
  [key: string]: unknown
}

export const getProjectEnv = (projectId: string) =>
  request<EnvDoc>({ url: `/project/${projectId}/env`, method: 'get' })

export const updateProjectEnv = (projectId: string, payload: EnvDoc) =>
  request({ url: `/project/${projectId}/env`, method: 'put', data: payload })

export const DEFAULT_CHANNELS: EnvChannel[] = [
  { id: 'android', label: 'Android', field: 'package_id' },
  { id: 'ios', label: 'iOS', field: 'bundle_id' },
  { id: 'web', label: 'Web', field: 'url' },
]

/**
 * 归一环境文档。
 *
 * 返回体历史上有两种：直接是 profiles 映射，或包在 {profiles, channels} 里。
 * channels 没给时从 profiles 的键反推（原实现就是这么做的），
 * 反推不出来再退到三个默认端。
 */
export function normalizeEnvDoc(raw: unknown): { profiles: EnvProfiles; channels: EnvChannel[] } {
  const src = (raw && typeof raw === 'object' ? raw : {}) as EnvDoc
  const body = (src.env && typeof src.env === 'object' ? src.env : src) as EnvDoc

  const hasShape = !!(body.profiles || body.channels)
  const profilesIn = (hasShape ? body.profiles : body) as EnvProfiles | undefined
  const profiles: EnvProfiles = profilesIn && typeof profilesIn === 'object' ? { ...profilesIn } : {}

  let channels: EnvChannel[] = Array.isArray(body.channels) ? body.channels.filter((c) => c?.id) : []

  if (!channels.length) {
    const inferred = new Set<string>()
    for (const snap of Object.values(profiles)) {
      if (snap && typeof snap === 'object') Object.keys(snap).forEach((k) => inferred.add(k))
    }
    channels = inferred.size
      ? [...inferred].map((id) => DEFAULT_CHANNELS.find((c) => c.id === id) || { id, label: id, field: 'value' })
      : DEFAULT_CHANNELS.map((c) => ({ ...c }))
  }

  return { profiles, channels }
}

export const channelField = (c: EnvChannel): string => c.field || 'value'

export const readCell = (profiles: EnvProfiles, profile: string, c: EnvChannel): string => {
  const v = profiles?.[profile]?.[c.id]?.[channelField(c)]
  return v == null ? '' : String(v)
}
