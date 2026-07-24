import type { ProviderAdapter } from '../contracts.ts'
import type { ServiceId } from '../core.ts'
import { jellyfinAdapter } from './jellyfin.ts'
import { nuvioAdapter } from './nuvio.ts'
import { plexAdapter } from './plex.ts'
import { simklAdapter } from './simkl.ts'
import { stremioAdapter } from './stremio.ts'
import { traktAdapter } from './trakt.ts'

export const PROVIDER_ADAPTERS: Readonly<Record<ServiceId, ProviderAdapter>> = Object.freeze({
  trakt: traktAdapter,
  simkl: simklAdapter,
  stremio: stremioAdapter,
  plex: plexAdapter,
  jellyfin: jellyfinAdapter,
  nuvio: nuvioAdapter
})
