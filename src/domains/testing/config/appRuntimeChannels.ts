import { normalizePlatforms } from '@/constants/appPlatforms'
import type { AppRow } from '@/types/project'
import type { EnvChannel, EnvDocument } from './envModel'

/** Read old environment responses without inventing ownership or changing saved channel keys. */
export function appRuntimeChannels(doc: EnvDocument | null | undefined, app: AppRow | undefined, apps: AppRow[]) {
  const owned = (doc?.channels || []).filter(c => c.app_id === app?.id && !!app)
  if (owned.length) return { channels: owned, legacy: false, needsSelection: false }
  const platforms = normalizePlatforms(app?.platforms)
  const channels: EnvChannel[] = app ? (doc?.channels || []).filter(c => !c.app_id && platforms.includes(c.platform || c.kind)) : []
  const unique = channels.length === 1 && apps.filter(a => normalizePlatforms(a.platforms).includes(channels[0].platform || channels[0].kind)).length === 1
  return { channels, legacy: channels.length > 0, needsSelection: channels.length > 0 && !unique }
}
