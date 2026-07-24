import { coalesceBundleIdentities } from './identity.ts'

export const SERVICE_IDS = ['simkl', 'stremio', 'trakt', 'plex', 'jellyfin', 'nuvio'] as const

export type ServiceId = (typeof SERVICE_IDS)[number]
export type BridgeSlot = 'source' | 'destination'
export type MediaKind = 'movie' | 'series'
export type BridgeScope = 'history' | 'progress' | 'library'
export type CanonicalListKind = 'watchlist' | 'collection' | 'library' | 'favorites' | 'other'
export type HistoryWriteMode = 'events' | 'state'

export interface SyncScopes {
  history: boolean
  progress: boolean
  library: boolean
}

export interface ServiceCapabilities {
  read: SyncScopes
  write: SyncScopes
  historyWriteMode: HistoryWriteMode
  profiles: boolean
  nativeLists: readonly CanonicalListKind[]
}

export interface ServiceDefinition {
  id: ServiceId
  label: string
  accountLabel: string
  scopeLabels: Record<BridgeScope, string>
  capabilities: ServiceCapabilities
}

const FULL_SCOPES: SyncScopes = {
  history: true,
  progress: true,
  library: true
}

export const SERVICE_DEFINITIONS: Record<ServiceId, ServiceDefinition> = {
  simkl: {
    id: 'simkl',
    label: 'Simkl',
    accountLabel: 'Simkl account',
    scopeLabels: {
      history: 'Watch history',
      progress: 'Playback progress',
      library: 'Watchlist'
    },
    capabilities: {
      read: { ...FULL_SCOPES },
      write: { ...FULL_SCOPES },
      historyWriteMode: 'state',
      profiles: false,
      nativeLists: ['watchlist']
    }
  },
  stremio: {
    id: 'stremio',
    label: 'Stremio',
    accountLabel: 'Stremio account',
    scopeLabels: {
      history: 'Watched items',
      progress: 'Continue watching',
      library: 'Library'
    },
    capabilities: {
      read: { ...FULL_SCOPES },
      write: { ...FULL_SCOPES },
      historyWriteMode: 'state',
      profiles: false,
      nativeLists: ['library']
    }
  },
  trakt: {
    id: 'trakt',
    label: 'Trakt',
    accountLabel: 'Trakt account',
    scopeLabels: {
      history: 'Watch history',
      progress: 'Playback progress',
      library: 'Watchlist / collection'
    },
    capabilities: {
      read: { ...FULL_SCOPES },
      write: { ...FULL_SCOPES },
      historyWriteMode: 'events',
      profiles: false,
      nativeLists: ['watchlist', 'collection']
    }
  },
  plex: {
    id: 'plex',
    label: 'Plex',
    accountLabel: 'Plex server',
    scopeLabels: {
      history: 'Watched items',
      progress: 'Continue watching',
      library: 'Server library'
    },
    capabilities: {
      read: { ...FULL_SCOPES },
      write: { history: true, progress: true, library: false },
      historyWriteMode: 'state',
      profiles: false,
      nativeLists: ['library']
    }
  },
  jellyfin: {
    id: 'jellyfin',
    label: 'Jellyfin',
    accountLabel: 'Jellyfin server',
    scopeLabels: {
      history: 'Watched items',
      progress: 'Continue watching',
      library: 'Server library'
    },
    capabilities: {
      read: { ...FULL_SCOPES },
      write: { history: true, progress: true, library: false },
      historyWriteMode: 'state',
      profiles: false,
      nativeLists: ['library']
    }
  },
  nuvio: {
    id: 'nuvio',
    label: 'Nuvio',
    accountLabel: 'Nuvio profile',
    scopeLabels: {
      history: 'Watched items',
      progress: 'Continue watching',
      library: 'Library'
    },
    capabilities: {
      read: { ...FULL_SCOPES },
      write: { ...FULL_SCOPES },
      historyWriteMode: 'state',
      profiles: true,
      nativeLists: ['library']
    }
  }
}

export function serviceIdsForSlot(slot: BridgeSlot): ServiceId[] {
  const capability = slot === 'source' ? 'read' : 'write'
  return SERVICE_IDS.filter(service => (
    Object.values(SERVICE_DEFINITIONS[service].capabilities[capability]).some(Boolean)
  ))
}

export interface MediaIds {
  imdb?: string
  tmdb?: string | number
  tvdb?: string | number
  trakt?: string | number
  simkl?: string | number
  plex?: string
  jellyfin?: string
  stremio?: string
  slug?: string
  external?: Record<string, string | number>
}

export interface MediaRef {
  kind: MediaKind
  ids: MediaIds
  title?: string
  year?: number
  season?: number
  episode?: number
  absoluteEpisode?: number
  episodeTitle?: string
  videoId?: string
}

export interface RecordProvenance {
  service: ServiceId
  accountId?: string
  profileId?: string | number
}

export interface ListProvenance extends RecordProvenance {
  kind: CanonicalListKind
  listId?: string
  name?: string
}

export interface HistoryRecord {
  media: MediaRef
  watchedAt: number
  eventId?: string | number
  playCount?: number
  source?: RecordProvenance
}

interface ProgressRecordBase {
  media: MediaRef
  updatedAt: number
  source?: RecordProvenance
}

export type ProgressRecord = ProgressRecordBase & (
  | {
      positionMs: number
      durationMs: number
      percentage?: number
    }
  | {
      percentage: number
      positionMs?: never
      durationMs?: never
    }
)

export interface LibraryRecord {
  media: MediaRef
  addedAt: number
  lists: readonly ListProvenance[]
  source?: RecordProvenance
}

export interface CanonicalBundle {
  history: HistoryRecord[]
  progress: ProgressRecord[]
  library: LibraryRecord[]
}

export function createEmptyBundle(): CanonicalBundle {
  return {
    history: [],
    progress: [],
    library: []
  }
}

export interface ConnectedEndpoint {
  slot: BridgeSlot
  service: ServiceId
  accountId: string
  profileId?: string | number | null
  serverId?: string | null
  displayName?: string
}

export type EndpointValidationCode =
  | 'ok'
  | 'missing_endpoint'
  | 'missing_account_id'
  | 'profile_required'
  | 'same_endpoint'

export interface EndpointPairValidation {
  valid: boolean
  code: EndpointValidationCode
  message: string
  sourceFingerprint: string | null
  destinationFingerprint: string | null
}

function normalizeIdentity(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase('en-US')
}

function normalizeProfileId(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase('en-US')
}

export function endpointFingerprint(endpoint: ConnectedEndpoint | null | undefined): string | null {
  if (!endpoint) return null
  const accountId = normalizeIdentity(endpoint.accountId)
  if (!accountId) return null
  const parts = [endpoint.service, accountId]
  if (endpoint.service === 'nuvio') {
    parts.push(normalizeProfileId(endpoint.profileId) || '*')
  } else if (endpoint.service === 'plex' || endpoint.service === 'jellyfin') {
    parts.push(normalizeIdentity(endpoint.serverId) || '*')
  }
  return parts.map(part => encodeURIComponent(part)).join(':')
}

export function validateEndpointPair(
  source: ConnectedEndpoint | null | undefined,
  destination: ConnectedEndpoint | null | undefined
): EndpointPairValidation {
  const sourceFingerprint = endpointFingerprint(source)
  const destinationFingerprint = endpointFingerprint(destination)
  const result = (
    valid: boolean,
    code: EndpointValidationCode,
    message: string
  ): EndpointPairValidation => ({
    valid,
    code,
    message,
    sourceFingerprint,
    destinationFingerprint
  })

  if (!source || !destination) {
    return result(false, 'missing_endpoint', 'Connect both a source and destination.')
  }
  if (!sourceFingerprint || !destinationFingerprint) {
    return result(false, 'missing_account_id', 'Both connections must expose a verified account ID.')
  }
  if (source.service !== destination.service) {
    return result(true, 'ok', 'The source and destination are distinct services.')
  }

  const sameAccount = normalizeIdentity(source.accountId) === normalizeIdentity(destination.accountId)
  if (!sameAccount) {
    return result(true, 'ok', 'The source and destination use different accounts.')
  }

  if (source.service === 'nuvio') {
    const sourceProfile = normalizeProfileId(source.profileId)
    const destinationProfile = normalizeProfileId(destination.profileId)
    if (!sourceProfile || !destinationProfile) {
      return result(false, 'profile_required', 'Choose both Nuvio profiles before syncing within one account.')
    }
    if (sourceProfile !== destinationProfile) {
      return result(true, 'ok', 'The source and destination use different Nuvio profiles.')
    }
  } else if (source.service === 'plex' || source.service === 'jellyfin') {
    const sourceServer = normalizeIdentity(source.serverId)
    const destinationServer = normalizeIdentity(destination.serverId)
    if (sourceServer && destinationServer && sourceServer !== destinationServer) {
      return result(true, 'ok', 'The source and destination use different media servers.')
    }
  }

  return result(
    false,
    'same_endpoint',
    'Source and destination must be different accounts, Nuvio profiles, or media servers.'
  )
}

export interface BridgeRoute {
  id: `${ServiceId}-to-${ServiceId}`
  source: ServiceId
  destination: ServiceId
  sameService: boolean
  supportedScopes: SyncScopes
}

const BRIDGE_SCOPES: readonly BridgeScope[] = ['history', 'progress', 'library']

export function summarizeScopes(
  source: ServiceId,
  destination: ServiceId,
  requested: SyncScopes = { ...FULL_SCOPES }
): RouteScopeSummary[] {
  const sourceDefinition = SERVICE_DEFINITIONS[source]
  const destinationDefinition = SERVICE_DEFINITIONS[destination]
  return BRIDGE_SCOPES.map(scope => {
    const supported = sourceDefinition.capabilities.read[scope]
      && destinationDefinition.capabilities.write[scope]
    return {
      scope,
      requested: requested[scope],
      supported,
      enabled: requested[scope] && supported,
      sourceLabel: sourceDefinition.scopeLabels[scope],
      destinationLabel: destinationDefinition.scopeLabels[scope],
      mappingLabel: `${sourceDefinition.scopeLabels[scope]} → ${destinationDefinition.scopeLabels[scope]}`
    }
  })
}

export function generateRoutePairs(): BridgeRoute[] {
  return SERVICE_IDS.flatMap(source => SERVICE_IDS.map(destination => {
    const scopeSummary = summarizeScopes(source, destination)
    return {
      id: `${source}-to-${destination}` as const,
      source,
      destination,
      sameService: source === destination,
      supportedScopes: {
        history: Boolean(scopeSummary.find(item => item.scope === 'history')?.supported),
        progress: Boolean(scopeSummary.find(item => item.scope === 'progress')?.supported),
        library: Boolean(scopeSummary.find(item => item.scope === 'library')?.supported)
      }
    }
  }))
}

export const ROUTE_PAIRS = generateRoutePairs()

export interface RouteScopeSummary {
  scope: BridgeScope
  requested: boolean
  supported: boolean
  enabled: boolean
  sourceLabel: string
  destinationLabel: string
  mappingLabel: string
}

export interface RouteSummary {
  id: `${ServiceId}-to-${ServiceId}`
  label: string
  sameService: boolean
  scopes: RouteScopeSummary[]
  enabledScopeCount: number
}

export function routeLabel(source: ServiceId, destination: ServiceId): string {
  return `${SERVICE_DEFINITIONS[source].label} → ${SERVICE_DEFINITIONS[destination].label}`
}

export function summarizeRoute(
  source: ServiceId,
  destination: ServiceId,
  requested: SyncScopes = { ...FULL_SCOPES }
): RouteSummary {
  const scopes = summarizeScopes(source, destination, requested)
  return {
    id: `${source}-to-${destination}`,
    label: routeLabel(source, destination),
    sameService: source === destination,
    scopes,
    enabledScopeCount: scopes.filter(scope => scope.enabled).length
  }
}

function normalizeNumericId(value: unknown): string {
  const normalized = String(value ?? '').trim()
  if (!/^\d+$/.test(normalized)) return ''
  return normalized.replace(/^0+(?=\d)/, '')
}

function normalizeImdbId(value: unknown): string {
  const normalized = String(value ?? '').trim().toLocaleLowerCase('en-US')
  return /^tt\d+$/.test(normalized) ? normalized : ''
}

function normalizedStremioContentId(value: unknown): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) return ''
  return parseStremioVideoId(normalized)?.contentId || normalized
}

function collectCanonicalIds(ids: MediaIds): Array<[namespace: string, value: string]> {
  const aliases: Array<[namespace: string, value: string]> = []
  const seen = new Set<string>()
  const add = (namespace: string, value: string) => {
    const key = `${namespace}:${value}`
    if (!value || seen.has(key)) return
    seen.add(key)
    aliases.push([namespace, value])
  }

  const stremioId = normalizedStremioContentId(ids.stremio)
  const imdb = normalizeImdbId(ids.imdb) || normalizeImdbId(stremioId)
  if (imdb) add('imdb', imdb)

  const plex = String(ids.plex ?? '').trim().toLocaleLowerCase('en-US')
  if (plex) add('plex', plex)

  const jellyfin = String(ids.jellyfin ?? '').trim().toLocaleLowerCase('en-US')
  if (jellyfin) add('jellyfin', jellyfin)

  for (const namespace of ['tmdb', 'tvdb', 'trakt', 'simkl'] as const) {
    const value = normalizeNumericId(ids[namespace])
    if (value) add(namespace, value)
  }
  if (stremioId) add('stremio', stremioId.toLocaleLowerCase('en-US'))

  const slug = String(ids.slug ?? '').trim().toLocaleLowerCase('en-US')
  if (slug) add('slug', slug)

  const externalIds = Object.entries(ids.external || {})
    .map(([namespace, value]) => ({
      namespace: namespace.trim().toLocaleLowerCase('en-US'),
      value: String(value ?? '').trim()
    }))
    .filter(item => item.namespace && item.value)
    .sort((left, right) => (
      left.namespace.localeCompare(right.namespace) || left.value.localeCompare(right.value)
    ))
  for (const external of externalIds) {
    add(
      `external:${encodeURIComponent(external.namespace)}`,
      encodeURIComponent(external.value)
    )
  }
  return aliases
}

export function normalizeTitle(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Returns the media title without episode coordinates. Older bridge versions
 * wrote a redundant SxEy suffix into Nuvio's title field even though season
 * and episode are stored separately. Strip that exact legacy suffix at the
 * boundary so it is not displayed or copied into another provider again.
 */
export function mediaTitle(media: MediaRef): string {
  const fallback = String(
    media.ids.imdb
      || media.ids.tmdb
      || media.ids.trakt
      || media.ids.simkl
      || media.ids.stremio
      || `Untitled ${media.kind}`
  )
  const title = String(media.title || '').trim() || fallback
  if (media.kind !== 'series') return title

  let clean = title
  if (validSeason(media.season) && validEpisode(media.episode)) {
    clean = clean.replace(
      new RegExp(`\\s*(?:[·\\-–—]\\s*)?S0*${media.season}\\s*E0*${media.episode}\\s*$`, 'i'),
      ''
    ).trim()
  }
  if (validEpisode(media.absoluteEpisode)) {
    clean = clean.replace(
      new RegExp(`\\s*(?:[·\\-–—]\\s*)?Episode\\s+0*${media.absoluteEpisode}\\s*$`, 'i'),
      ''
    ).trim()
  }
  return clean || title
}

function titleYearMediaKey(media: MediaRef): string | null {
  const title = normalizeTitle(mediaTitle(media))
  const year = Number(media.year)
  if (!title || !Number.isInteger(year) || year <= 0) return null
  return `${media.kind}:title:${title.replace(/\s+/g, '-')}:${year}`
}

/**
 * Returns every stable, namespace-qualified identity for a media item in
 * canonical priority order. Numeric IDs never match across namespaces.
 */
export function mediaAliasKeys(media: MediaRef): string[] {
  const aliases = collectCanonicalIds(media.ids)
    .map(([namespace, value]) => `${media.kind}:${namespace}:${value}`)
  if (aliases.length) return aliases
  const fallback = titleYearMediaKey(media)
  return fallback ? [fallback] : []
}

export function canonicalMediaKey(media: MediaRef): string | null {
  return mediaAliasKeys(media)[0] || null
}

function validSeason(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0
}

function validEpisode(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0
}

function episodeCoordinates(media: MediaRef): { season: number; episode: number } | null {
  let season = media.season
  let episode = media.episode
  if ((!validSeason(season) || !validEpisode(episode)) && media.videoId) {
    const parsed = parseStremioVideoId(media.videoId)
    if (parsed) {
      season = parsed.season
      episode = parsed.episode
    }
  }
  return validSeason(season) && validEpisode(episode) ? { season, episode } : null
}

/**
 * Expands every media alias with episode coordinates. Show-level aliases are
 * intentionally omitted so different episodes of one series cannot collide.
 */
export function episodeAliasKeys(media: MediaRef): string[] {
  if (media.kind !== 'series') return []
  const mediaKeys = mediaAliasKeys(media)
  const coordinates = episodeCoordinates(media)
  const aliases: string[] = []
  for (const mediaKey of mediaKeys) {
    if (coordinates) {
      aliases.push(`${mediaKey}:season:${coordinates.season}:episode:${coordinates.episode}`)
    }
    if (validEpisode(media.absoluteEpisode)) {
      aliases.push(`${mediaKey}:absolute:${media.absoluteEpisode}`)
    }
  }
  return aliases
}

export function canonicalEpisodeKey(media: MediaRef): string | null {
  return episodeAliasKeys(media)[0] || null
}

function recordMediaKey(media: MediaRef): string | null {
  return canonicalEpisodeKey(media) || canonicalMediaKey(media)
}

function cloneMedia(media: MediaRef): MediaRef {
  const ids: MediaIds = { ...media.ids }
  if (media.ids.external) ids.external = { ...media.ids.external }
  return { ...media, ids }
}

function normalizedTime(value: number): number {
  return Number.isFinite(value) ? value : 0
}

function dedupeLatest<T extends { media: MediaRef }>(
  records: readonly T[],
  timeOf: (record: T) => number,
  clone: (record: T) => T
): T[] {
  const selected = new Map<string, { record: T; index: number; time: number }>()
  records.forEach((record, index) => {
    const canonicalKey = recordMediaKey(record.media)
    const key = canonicalKey || `unresolved:${index}`
    const time = normalizedTime(timeOf(record))
    const existing = selected.get(key)
    if (!existing || time >= existing.time) {
      selected.set(key, { record, index, time })
    }
  })

  return [...selected.entries()]
    .sort(([leftKey, left], [rightKey, right]) => (
      right.time - left.time
      || leftKey.localeCompare(rightKey)
      || left.index - right.index
    ))
    .map(([, entry]) => clone(entry.record))
}

function cloneHistory(records: readonly HistoryRecord[]): HistoryRecord[] {
  return records
    .map((record, index) => ({ record, index, time: normalizedTime(record.watchedAt) }))
    .sort((left, right) => right.time - left.time || left.index - right.index)
    .map(({ record }) => ({
      ...record,
      media: cloneMedia(record.media),
      source: record.source ? { ...record.source } : undefined
    }))
}

/**
 * Reduces event history to the newest watched state per movie or episode.
 * Only providers that cannot represent individual play events should use this.
 */
export function collapseHistoryToWatchedState(records: readonly HistoryRecord[]): HistoryRecord[] {
  return dedupeLatest(
    records,
    record => record.watchedAt,
    record => ({
      ...record,
      media: cloneMedia(record.media),
      source: record.source ? { ...record.source } : undefined
    })
  )
}

function provenanceKey(provenance: ListProvenance): string {
  return [
    provenance.service,
    provenance.kind,
    normalizeIdentity(provenance.accountId),
    normalizeProfileId(provenance.profileId),
    normalizeIdentity(provenance.listId),
    normalizeIdentity(provenance.name)
  ].join(':')
}

function mergeListProvenance(lists: readonly ListProvenance[]): ListProvenance[] {
  const unique = new Map<string, ListProvenance>()
  lists.forEach(list => unique.set(provenanceKey(list), { ...list }))
  return [...unique.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, list]) => list)
}

function dedupeLibrary(records: readonly LibraryRecord[]): LibraryRecord[] {
  const buckets = new Map<string, {
    winner: LibraryRecord
    index: number
    time: number
    lists: ListProvenance[]
  }>()

  records.forEach((record, index) => {
    const canonicalKey = recordMediaKey(record.media)
    const key = canonicalKey || `unresolved:${index}`
    const time = normalizedTime(record.addedAt)
    const existing = buckets.get(key)
    if (!existing) {
      buckets.set(key, {
        winner: record,
        index,
        time,
        lists: [...record.lists]
      })
      return
    }
    existing.lists.push(...record.lists)
    if (time >= existing.time) {
      existing.winner = record
      existing.index = index
      existing.time = time
    }
  })

  return [...buckets.entries()]
    .sort(([leftKey, left], [rightKey, right]) => (
      right.time - left.time
      || leftKey.localeCompare(rightKey)
      || left.index - right.index
    ))
    .map(([, bucket]) => ({
      ...bucket.winner,
      media: cloneMedia(bucket.winner.media),
      source: bucket.winner.source ? { ...bucket.winner.source } : undefined,
      lists: mergeListProvenance(bucket.lists)
    }))
}

export function dedupeBundle(bundle: CanonicalBundle): CanonicalBundle {
  const coalesced = coalesceBundleIdentities(bundle).bundle
  return {
    history: cloneHistory(coalesced.history),
    progress: dedupeLatest(
      coalesced.progress,
      record => record.updatedAt,
      record => ({
        ...record,
        media: cloneMedia(record.media),
        source: record.source ? { ...record.source } : undefined
      })
    ),
    library: dedupeLibrary(coalesced.library)
  }
}

export interface EpisodeRef {
  season: number
  episode: number
  absoluteEpisode?: number
  title?: string
  videoId?: string
}

export type MappingConfidence = 'exact' | 'high' | 'medium' | 'low' | 'none'

export interface EpisodeMappingEvidence {
  requested: EpisodeRef
  resolvedSource: EpisodeRef | null
  sourceCatalogSize: number
  destinationCatalogSize: number
  videoIdMatches: readonly EpisodeRef[]
  coordinateMatches: readonly EpisodeRef[]
  absoluteMatches: readonly EpisodeRef[]
  titleMatches: readonly EpisodeRef[]
  fuzzyTitleMatches?: readonly EpisodeSimilarityMatch[]
  sequenceCandidate?: EpisodeRef | null
  sequenceAnchors?: readonly EpisodeSequenceAnchor[]
}

export interface EpisodeSimilarityMatch {
  episode: EpisodeRef
  similarity: number
}

export interface EpisodeSequenceAnchor {
  source: EpisodeRef
  target: EpisodeRef
  sourceIndex: number
  targetIndex: number
}

type MappingEvidenceCarrier = {
  evidence?: EpisodeMappingEvidence
}

export type MappingOutcome = MappingEvidenceCarrier & (
  | {
      status: 'mapped'
      confidence: Exclude<MappingConfidence, 'none'>
      target: EpisodeRef
      candidates: readonly EpisodeRef[]
      reason: string
    }
  | {
      status: 'ambiguous'
      confidence: Exclude<MappingConfidence, 'none'>
      target: null
      candidates: readonly EpisodeRef[]
      reason: string
    }
  | {
      status: 'unresolved'
      confidence: 'none'
      target: null
      candidates: readonly []
      reason: string
    }
)

function episodeSort(left: EpisodeRef, right: EpisodeRef): number {
  const leftAbsolute = validEpisode(left.absoluteEpisode) ? left.absoluteEpisode : Number.MAX_SAFE_INTEGER
  const rightAbsolute = validEpisode(right.absoluteEpisode) ? right.absoluteEpisode : Number.MAX_SAFE_INTEGER
  return left.season - right.season
    || left.episode - right.episode
    || leftAbsolute - rightAbsolute
    || normalizeTitle(left.title).localeCompare(normalizeTitle(right.title))
    || String(left.videoId || '').localeCompare(String(right.videoId || ''))
}

function sortedEpisodes(episodes: readonly EpisodeRef[]): EpisodeRef[] {
  return [...episodes].sort(episodeSort)
}

function meaningfulEpisodeTitle(value: unknown): string {
  const normalized = normalizeTitle(value)
  if (!normalized || /^(episode|ep|e|chapter|aflevering)\s*\d+$/.test(normalized)) return ''
  return normalized
}

const FUZZY_TITLE_THRESHOLD = 0.94
const SEQUENCE_TITLE_THRESHOLD = 0.72
const MAX_SEQUENCE_ANCHOR_DISTANCE = 5

function fuzzyTitleEligible(title: string): boolean {
  return title.length >= 12 && title.split(' ').filter(Boolean).length >= 3
}

function boundedLevenshteinDistance(
  left: string,
  right: string,
  maxDistance: number
): number | null {
  if (Math.abs(left.length - right.length) > maxDistance) return null
  if (left === right) return 0

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    const current = [leftIndex]
    let rowMinimum = current[0]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      const distance = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost
      )
      current.push(distance)
      rowMinimum = Math.min(rowMinimum, distance)
    }
    if (rowMinimum > maxDistance) return null
    previous = current
  }
  return previous[right.length] <= maxDistance ? previous[right.length] : null
}

function episodeTitleSimilarity(
  left: string,
  right: string,
  threshold: number
): number | null {
  if (!fuzzyTitleEligible(left) || !fuzzyTitleEligible(right)) return null
  const maximumLength = Math.max(left.length, right.length)
  const maximumDistance = Math.floor(maximumLength * (1 - threshold))
  const distance = boundedLevenshteinDistance(left, right, maximumDistance)
  return distance === null ? null : 1 - (distance / maximumLength)
}

function fuzzyEpisodeTitleMatches(
  sourceTitle: string,
  targetEpisodes: readonly EpisodeRef[]
): EpisodeSimilarityMatch[] {
  if (!fuzzyTitleEligible(sourceTitle)) return []
  return targetEpisodes
    .map(episode => {
      const targetTitle = meaningfulEpisodeTitle(episode.title)
      const similarity = episodeTitleSimilarity(sourceTitle, targetTitle, FUZZY_TITLE_THRESHOLD)
      return similarity === null ? null : { episode, similarity }
    })
    .filter((match): match is EpisodeSimilarityMatch => Boolean(match))
    .sort((left, right) => (
      right.similarity - left.similarity || episodeSort(left.episode, right.episode)
    ))
}

function uniqueTitleIndexes(episodes: readonly EpisodeRef[]): Map<string, number> {
  const occurrences = new Map<string, number[]>()
  episodes.forEach((episode, index) => {
    const title = meaningfulEpisodeTitle(episode.title)
    if (!fuzzyTitleEligible(title)) return
    const indexes = occurrences.get(title) || []
    indexes.push(index)
    occurrences.set(title, indexes)
  })
  const unique = new Map<string, number>()
  for (const [title, indexes] of occurrences) {
    if (indexes.length === 1) unique.set(title, indexes[0])
  }
  return unique
}

function anchoredSequenceCandidate(
  source: EpisodeRef,
  sourceEpisodes: readonly EpisodeRef[],
  targetEpisodes: readonly EpisodeRef[]
): { candidate: EpisodeRef | null; anchors: EpisodeSequenceAnchor[] } {
  const orderedSource = sortedEpisodes(sourceEpisodes)
  const orderedTarget = sortedEpisodes(targetEpisodes)
  const sourceIndex = orderedSource.indexOf(source)
  if (sourceIndex < 0) return { candidate: null, anchors: [] }

  const sourceTitles = uniqueTitleIndexes(orderedSource)
  const targetTitles = uniqueTitleIndexes(orderedTarget)
  const anchors: EpisodeSequenceAnchor[] = []
  for (const [title, anchorSourceIndex] of sourceTitles) {
    const targetIndex = targetTitles.get(title)
    if (targetIndex === undefined || anchorSourceIndex === sourceIndex) continue
    anchors.push({
      source: orderedSource[anchorSourceIndex],
      target: orderedTarget[targetIndex],
      sourceIndex: anchorSourceIndex,
      targetIndex
    })
  }
  anchors.sort((left, right) => left.sourceIndex - right.sourceIndex)

  const before = [...anchors].reverse().find(anchor => anchor.sourceIndex < sourceIndex)
  const after = anchors.find(anchor => anchor.sourceIndex > sourceIndex)
  if (!before || !after) return { candidate: null, anchors: [] }

  const beforeDistance = sourceIndex - before.sourceIndex
  const afterDistance = after.sourceIndex - sourceIndex
  const sourceSpan = after.sourceIndex - before.sourceIndex
  const targetSpan = after.targetIndex - before.targetIndex
  if (
    beforeDistance > MAX_SEQUENCE_ANCHOR_DISTANCE
    || afterDistance > MAX_SEQUENCE_ANCHOR_DISTANCE
    || sourceSpan !== targetSpan
    || targetSpan <= 1
  ) return { candidate: null, anchors: [before, after] }

  const candidateIndex = before.targetIndex + beforeDistance
  const candidate = orderedTarget[candidateIndex]
  const sourceTitle = meaningfulEpisodeTitle(source.title)
  const targetTitle = meaningfulEpisodeTitle(candidate?.title)
  const similarity = episodeTitleSimilarity(sourceTitle, targetTitle, SEQUENCE_TITLE_THRESHOLD)
  if (!candidate || similarity === null) return { candidate: null, anchors: [before, after] }
  return { candidate, anchors: [before, after] }
}

function ambiguous(
  confidence: Exclude<MappingConfidence, 'none'>,
  candidates: readonly EpisodeRef[],
  reason: string
): MappingOutcome {
  return {
    status: 'ambiguous',
    confidence,
    target: null,
    candidates: sortedEpisodes(candidates),
    reason
  }
}

function mapped(
  confidence: Exclude<MappingConfidence, 'none'>,
  target: EpisodeRef,
  reason: string
): MappingOutcome {
  return {
    status: 'mapped',
    confidence,
    target,
    candidates: [target],
    reason
  }
}

function uniqueCandidate(
  confidence: Exclude<MappingConfidence, 'low' | 'none'>,
  candidates: readonly EpisodeRef[],
  mappedReason: string,
  ambiguousReason: string
): MappingOutcome | null {
  if (candidates.length === 1) return mapped(confidence, candidates[0], mappedReason)
  if (candidates.length > 1) return ambiguous(confidence, candidates, ambiguousReason)
  return null
}

function resolveSourceEpisode(
  requested: EpisodeRef,
  sourceEpisodes: readonly EpisodeRef[]
): EpisodeRef | MappingOutcome {
  if (!sourceEpisodes.length) return requested

  if (requested.videoId) {
    const matches = sourceEpisodes.filter(item => item.videoId === requested.videoId)
    if (matches.length === 1) return matches[0]
    if (matches.length > 1) {
      return ambiguous('exact', matches, 'The source video ID identifies more than one episode.')
    }
  }

  const coordinates = sourceEpisodes.filter(item => (
    item.season === requested.season && item.episode === requested.episode
  ))
  if (coordinates.length === 1) return coordinates[0]
  if (coordinates.length > 1) {
    return ambiguous('high', coordinates, 'The source season and episode identify more than one episode.')
  }

  if (validEpisode(requested.absoluteEpisode)) {
    const absoluteMatches = sourceEpisodes.filter(item => item.absoluteEpisode === requested.absoluteEpisode)
    if (absoluteMatches.length === 1) return absoluteMatches[0]
    if (absoluteMatches.length > 1) {
      return ambiguous('medium', absoluteMatches, 'The source absolute number identifies more than one episode.')
    }
  }

  const title = meaningfulEpisodeTitle(requested.title)
  if (title) {
    const titleMatches = sourceEpisodes.filter(item => meaningfulEpisodeTitle(item.title) === title)
    if (titleMatches.length === 1) return titleMatches[0]
    if (titleMatches.length > 1) {
      return ambiguous('high', titleMatches, 'The source title identifies more than one episode.')
    }
  }

  return requested
}

export function remapEpisode(
  requested: EpisodeRef,
  sourceEpisodes: readonly EpisodeRef[],
  targetEpisodes: readonly EpisodeRef[]
): MappingOutcome {
  const baseEvidence = {
    requested: { ...requested },
    resolvedSource: null,
    sourceCatalogSize: sourceEpisodes.length,
    destinationCatalogSize: targetEpisodes.length,
    videoIdMatches: [],
    coordinateMatches: [],
    absoluteMatches: [],
    titleMatches: []
  } satisfies EpisodeMappingEvidence
  if (!targetEpisodes.length) {
    return {
      status: 'unresolved',
      confidence: 'none',
      target: null,
      candidates: [],
      reason: 'The destination has no episode metadata.',
      evidence: baseEvidence
    }
  }

  const resolvedSource = resolveSourceEpisode(requested, sourceEpisodes)
  if ('status' in resolvedSource) {
    return { ...resolvedSource, evidence: baseEvidence }
  }
  const source = resolvedSource
  const sourceTitle = meaningfulEpisodeTitle(source.title)
  const videoIdMatches = source.videoId
    ? targetEpisodes.filter(item => item.videoId === source.videoId)
    : []
  const coordinateMatches = targetEpisodes.filter(item => (
    item.season === source.season && item.episode === source.episode
  ))
  const absoluteMatches = validEpisode(source.absoluteEpisode)
    ? targetEpisodes.filter(item => item.absoluteEpisode === source.absoluteEpisode)
    : []
  const titleMatches = sourceTitle
    ? targetEpisodes.filter(item => meaningfulEpisodeTitle(item.title) === sourceTitle)
    : []
  const evidence: EpisodeMappingEvidence = {
    ...baseEvidence,
    resolvedSource: { ...source },
    videoIdMatches: sortedEpisodes(videoIdMatches),
    coordinateMatches: sortedEpisodes(coordinateMatches),
    absoluteMatches: sortedEpisodes(absoluteMatches),
    titleMatches: sortedEpisodes(titleMatches)
  }

  if (source.videoId) {
    const result = uniqueCandidate(
      'exact',
      videoIdMatches,
      'The source and destination share the same video ID.',
      'The destination contains duplicate matches for the video ID.'
    )
    if (result) return { ...result, evidence }
  }

  if (coordinateMatches.length > 1) {
    return {
      ...ambiguous('high', coordinateMatches, 'The destination contains duplicate season/episode matches.'),
      evidence
    }
  }
  if (coordinateMatches.length === 1) {
    const targetTitle = meaningfulEpisodeTitle(coordinateMatches[0].title)
    const reason = sourceTitle && targetTitle && sourceTitle !== targetTitle
      ? 'Season and episode numbering match; provider episode titles differ.'
      : 'Season and episode numbering match.'
    return {
      ...mapped('high', coordinateMatches[0], reason),
      evidence
    }
  }

  if (validEpisode(source.absoluteEpisode)) {
    const result = uniqueCandidate(
      'medium',
      absoluteMatches,
      'A unique absolute episode number matched.',
      'The absolute episode number matches multiple destination episodes.'
    )
    if (result) return { ...result, evidence }
  }

  if (sourceTitle) {
    if (titleMatches.length === 1) {
      return {
        ...mapped('high', titleMatches[0], 'A unique normalized episode title matched.'),
        evidence
      }
    }

    if (titleMatches.length > 1) {
      return {
        ...ambiguous('high', titleMatches, 'The normalized episode title matches multiple destination episodes.'),
        evidence
      }
    }
  }

  const fuzzyTitleMatches = sourceTitle
    ? fuzzyEpisodeTitleMatches(sourceTitle, targetEpisodes)
    : []
  const fuzzyEvidence: EpisodeMappingEvidence = {
    ...evidence,
    fuzzyTitleMatches
  }
  if (fuzzyTitleMatches.length === 1) {
    return {
      ...mapped(
        'high',
        fuzzyTitleMatches[0].episode,
        `A unique highly similar episode title matched (${Math.round(fuzzyTitleMatches[0].similarity * 100)}%).`
      ),
      evidence: fuzzyEvidence
    }
  }
  if (fuzzyTitleMatches.length > 1) {
    return {
      ...ambiguous(
        'high',
        fuzzyTitleMatches.map(match => match.episode),
        'Multiple destination episodes have highly similar titles.'
      ),
      evidence: fuzzyEvidence
    }
  }

  const sequence = anchoredSequenceCandidate(source, sourceEpisodes, targetEpisodes)
  const sequenceEvidence: EpisodeMappingEvidence = {
    ...fuzzyEvidence,
    sequenceCandidate: sequence.candidate,
    sequenceAnchors: sequence.anchors
  }
  if (sequence.candidate) {
    return {
      ...mapped(
        'medium',
        sequence.candidate,
        'Nearby unique episode titles confirm the same sequence position across differently numbered catalogs.'
      ),
      evidence: sequenceEvidence
    }
  }

  return {
    status: 'unresolved',
    confidence: 'none',
    target: null,
    candidates: [],
    reason: 'No deterministic episode mapping was found.',
    evidence: sequenceEvidence
  }
}

export interface StremioVideoId {
  contentId: string
  season: number
  episode: number
}

export function parseStremioVideoId(value: unknown): StremioVideoId | null {
  const normalized = String(value ?? '').trim()
  const match = /^(.*):(\d+):(\d+)$/.exec(normalized)
  if (!match || !match[1]) return null
  const season = Number(match[2])
  const episode = Number(match[3])
  if (!validSeason(season) || !validEpisode(episode)) return null
  return { contentId: match[1], season, episode }
}

export function buildStremioVideoId(contentId: unknown, season: number, episode: number): string {
  const normalizedContentId = String(contentId ?? '').trim()
  if (!normalizedContentId) throw new TypeError('A Stremio content ID is required.')
  if (!validSeason(season)) throw new RangeError('Stremio season must be a non-negative integer.')
  if (!validEpisode(episode)) throw new RangeError('Stremio episode must be a positive integer.')
  return `${normalizedContentId}:${season}:${episode}`
}
