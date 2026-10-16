/** V5 strict platform contract. Legacy presentation stays in appPlatforms.ts.
 * This module does not activate migration or normalize unknown input.
 */
export const TARGET_PLATFORMS = ['mac', 'win', 'android', 'web'] as const
export type TargetPlatform = typeof TARGET_PLATFORMS[number]
export type PlatformCoverage = { platform_scope: 'all' | 'explicit'; platforms: TargetPlatform[] }
export const PLATFORM_CONTRACT_VERSION = 1

export class PlatformContractError extends Error {
  constructor(public code: string, public field = 'platform') {
    super(`${code}:${field}`)
    this.name = 'PlatformContractError'
  }
}

export function targetPlatform(value: unknown, field = 'platform'): TargetPlatform {
  if (typeof value !== 'string' || !TARGET_PLATFORMS.includes(value as TargetPlatform)) {
    throw new PlatformContractError('target_platform_invalid', field)
  }
  return value as TargetPlatform
}

export function platformSet(value: unknown, field = 'platforms'): TargetPlatform[] {
  if (!Array.isArray(value)) throw new PlatformContractError('platform_set_required', field)
  const platforms = value.map(item => targetPlatform(item, field))
  if (new Set(platforms).size !== platforms.length) throw new PlatformContractError('platform_set_duplicate', field)
  return TARGET_PLATFORMS.filter(item => platforms.includes(item))
}

export function platformCoverage(document: Record<string, unknown>): PlatformCoverage {
  const scope = document.platform_scope
  if (scope !== 'all' && scope !== 'explicit') throw new PlatformContractError('platform_scope_required', 'platform_scope')
  const platforms = platformSet(document.platforms)
  if (scope === 'all' && platforms.length) throw new PlatformContractError('platform_scope_conflict', 'platforms')
  if (Object.hasOwn(document, 'platform')) {
    const single = targetPlatform(document.platform)
    if (scope !== 'explicit' || platforms.length !== 1 || platforms[0] !== single) {
      throw new PlatformContractError('platform_scope_conflict')
    }
  }
  return { platform_scope: scope, platforms }
}

export function environmentChannel(document: Record<string, unknown>): { kind: string; platform?: TargetPlatform } {
  if (document.kind === 'server') {
    if (Object.hasOwn(document, 'platform')) throw new PlatformContractError('server_platform_forbidden')
    return { kind: 'server' }
  }
  const platform = targetPlatform(document.platform)
  if (document.kind !== (platform === 'web' ? 'web' : 'app')) throw new PlatformContractError('channel_kind_conflict', 'kind')
  return { kind: platform === 'web' ? 'web' : 'app', platform }
}

export function batchPlatforms(value: unknown): TargetPlatform[] {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length) {
    throw new PlatformContractError('batch_targets_required', 'platforms_by_sn')
  }
  const entries = Object.entries(value)
  for (const [sn, platform] of entries) {
    if (!sn) throw new PlatformContractError('device_identity_missing', 'platforms_by_sn')
    targetPlatform(platform, 'platforms_by_sn')
  }
  return TARGET_PLATFORMS.filter(platform => entries.some(([, value]) => value === platform))
}

/** Display/routing compatibility only; does not validate a new platform write. */
export const usesDesktopExecutor = (platform: unknown): boolean =>
  platform === 'mac' || platform === 'win' || platform === 'desktop'
