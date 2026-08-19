import {
  collapseHistoryToWatchedState,
  canonicalEpisodeKey,
  createEmptyBundle,
  dedupeBundle,
  mediaAliasKeys,
  mediaTitle,
  normalizeTitle,
  parseStremioVideoId,
  remapEpisode,
  type BridgeScope,
  type BridgeSlot,
  type CanonicalBundle,
  type ConnectedEndpoint,
  type EpisodeRef,
  type HistoryRecord,
  type LibraryRecord,
  type MappingOutcome,
  type MediaIds,
  type MediaRef,
  type ProgressRecord,
  type ServiceId,
  type SyncScopes
} from './core.ts'
import {
  mergeStremioWatchedVideoIds,
  readStremioWatchedVideoIds
} from '../stremioWatched.ts'
import {
  chunk,
  createAsyncLimiter,
  errorDetail,
  mapLimit,
  requestBridgeJson,
  retryBridgeOperation,
  sleep,
  waitForWriteSlot,
  type AsyncLimiter,
  type BridgeRequestInit
} from './transport.ts'

export { requestBridgeJson } from './transport.ts'

const TRAKT_API = 'https://api.trakt.tv'
const SIMKL_API = 'https://api.simkl.com'
const STREMIO_API = 'https://api.strem.io/api'
const PLEX_TV_API = 'https://plex.tv/api/v2'
const PLEX_CLIENTS_API = 'https://clients.plex.tv/api/v2'
const PLEX_PRODUCT = 'Nuvio Wiki Sync Bridge'
const JELLYFIN_CLIENT = 'Nuvio Wiki Sync Bridge'
const JELLYFIN_VERSION = '1.0.0'
const CINEMETA_API = 'https://v3-cinemeta.strem.io'
const KITSU_API = 'https://kitsu.io/api/edge'
const NUVIO_API = 'https://api.nuvio.tv'
const TRAKT_MAX_RESUME_PROGRESS = 79
const TRAKT_PAGE_SIZE = 100
const TRAKT_READ_CONCURRENCY = 6
const TRAKT_PAGE_CONCURRENCY = 4
const PROVIDER_READ_REQUEST_TIMEOUT_MS = 30_000
const PROVIDER_WRITE_REQUEST_TIMEOUT_MS = 60_000
const NUVIO_WATCHED_PAGE_SIZE = 900
const NUVIO_LIBRARY_PAGE_SIZE = 500
const NUVIO_LIBRARY_MUTATION_BATCH_SIZE = 500
const BRIDGE_METADATA_BATCH_SIZE = 400
const BRIDGE_METADATA_BATCH_CONCURRENCY = 4
const BRIDGE_METADATA_REQUEST_TIMEOUT_MS = 120_000
const NUVIO_ADDON_QUERY_TIMEOUT_MS = 12_000
const ADDON_RESOURCE_TIMEOUT_MS = 12_000
const NUVIO_KITSU_RESOLUTION_TIMEOUT_MS = 45_000
const NUVIO_KITSU_FALLBACK_TIMEOUT_MS = 15_000
const NUVIO_KITSU_SEARCH_CONCURRENCY = 6
const NUVIO_KITSU_CANDIDATE_CONCURRENCY = 4
const NUVIO_ADDON_MANIFEST_CONCURRENCY = 4
const NUVIO_KITSU_PROGRESS_INTERVAL = 25
const DESTINATION_MAPPING_CONCURRENCY = 6
const DESTINATION_MAPPING_PROGRESS_INTERVAL = 10
const DESTINATION_MAPPING_HEARTBEAT_MS = 15_000
const LOCAL_SERVER_WRITE_CONCURRENCY = 4
const NUVIO_WRITE_CONCURRENCY = 3
const STREMIO_WRITE_CONCURRENCY = 2

const SIMKL_EXTERNAL_ID_NAMESPACES = [
  'mal',
  'anidb',
  'anilist',
  'kitsu',
  'livechart',
  'anisearch',
  'animeplanet',
  'crunchyroll',
  'netflix',
  'letterboxd',
  'hulu'
] as const

const SIMKL_ANIME_ID_NAMESPACES = ['mal', 'anidb', 'anilist', 'kitsu'] as const

const STANDARD_MEDIA_ID_KEYS = new Set([
  'imdb', 'imdb_id',
  'tmdb', 'tmdb_id',
  'tvdb', 'tvdb_id',
  'trakt', 'trakt_id', 'traktslug',
  'simkl', 'simkl_id',
  'plex', 'jellyfin', 'stremio', 'slug', 'external'
])

const EXTERNAL_ID_NAMESPACE_ALIASES: Record<string, string> = {
  myanimelist: 'mal',
  'my-anime-list': 'mal',
  mal_id: 'mal',
  'ani-list': 'anilist',
  anilist_id: 'anilist',
  anidb_id: 'anidb',
  kitsu_id: 'kitsu',
  'anime-planet': 'animeplanet',
  animeplanet_id: 'animeplanet',
  livechartme: 'livechart',
  livechart_id: 'livechart',
  anisearch_id: 'anisearch',
  crunchyroll_id: 'crunchyroll'
}

export const NUVIO_PUBLIC_KEY = 'sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN'

export interface TraktTokens {
  access_token: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
  created_at?: number
}

export interface TraktCredentials {
  service: 'trakt'
  clientId: string
  tokens: TraktTokens
  refreshUrl: string
  archiveBundle?: CanonicalBundle
  archiveWarnings?: string[]
}

export interface SimklCredentials {
  service: 'simkl'
  clientId: string
  accessToken: string
}

export type SimklAccountType = 'free' | 'pro' | 'vip'

export interface StremioCredentials {
  service: 'stremio'
  authKey: string
}

export interface NuvioSession {
  access_token: string
  refresh_token?: string
  expires_at?: number
  expires_in?: number
  user?: Record<string, any>
  [key: string]: any
}

export interface NuvioCredentials {
  service: 'nuvio'
  session: NuvioSession
  publicKey: string
}

export interface PlexServer {
  id: string
  name: string
  baseUrl: string
  accessToken: string
  owned: boolean
}

export interface PlexCredentials {
  service: 'plex'
  accountToken: string
  clientIdentifier: string
  server: PlexServer
}

export interface JellyfinCredentials {
  service: 'jellyfin'
  baseUrl: string
  accessToken: string
  userId: string
  serverId: string
  serverName: string
  deviceId: string
}

export type BridgeCredentials =
  | TraktCredentials
  | SimklCredentials
  | StremioCredentials
  | PlexCredentials
  | JellyfinCredentials
  | NuvioCredentials

export interface BridgeConnection extends ConnectedEndpoint {
  credentials: BridgeCredentials
  simklAccountType?: SimklAccountType
  profiles?: NuvioProfile[]
  servers?: PlexServer[]
}

export interface NuvioProfile {
  profile_index: number
  name?: string
  avatar?: string
  [key: string]: any
}

export type BridgeLog = (message: string) => void

export interface BridgeIssue {
  scope: keyof SyncScopes
  status: 'ambiguous' | 'unresolved' | 'warning' | 'note'
  media?: MediaRef
  reason: string
  /** Stable machine-readable category for grouping and diagnostics. */
  code?: string
  /** Optional proof used to make or reject an identity mapping. */
  evidence?: {
    sourceKey?: string | null
    targetKey?: string | null
    aliases?: string[]
    confidence?: string
    candidates?: string[]
    sharedAliases?: string[]
    conflictingNamespaces?: string[]
  }
}

export interface PullResult {
  bundle: CanonicalBundle
  issues: BridgeIssue[]
  /** Duplicate destination rows retained as cleanup evidence after snapshot dedupe. */
  duplicates?: Array<{
    scope: BridgeScope
    aliases: string[]
    media: MediaRef
  }>
}

export interface PushCounts {
  history: number
  progress: number
  library: number
}

export interface PushResult {
  written: PushCounts
  issues: BridgeIssue[]
  skipped?: Partial<PushCounts>
  /** Scopes whose write responses account for every submitted record. */
  confirmedScopes?: BridgeScope[]
}

export interface MediaBridgeVerificationCheckpoint {
  simklActivity?: string
}

export interface VerificationPullOptions extends PullOptions {
  baseline: CanonicalBundle
  checkpoint: MediaBridgeVerificationCheckpoint
}

export interface PullOptions {
  connection: BridgeConnection
  scopes: SyncScopes
  log?: BridgeLog
}

export interface PushOptions extends PullOptions {
  bundle: CanonicalBundle
  sourceConnection?: BridgeConnection
}

const traktTokenRefreshes = new WeakMap<object, Promise<string>>()
const nuvioTokenRefreshes = new WeakMap<object, Promise<string>>()
const NUVIO_ORIGIN_CLIENT_ID_STORAGE_KEY = 'nuvio-sync-origin-client-id'
let cachedNuvioOriginClientId = ''

const traktReadLimiters = new WeakMap<object, AsyncLimiter>()
const nuvioWriteLimiters = new WeakMap<object, AsyncLimiter>()
const simklRequestLimiters = new WeakMap<object, AsyncLimiter>()
const simklLastGetCompletion = new WeakMap<object, number>()
const simklLastWriteCompletion = new WeakMap<object, number>()
const simklMediaSnapshotCaches = new Map<string, Map<string, MediaRef>>()
const simklEpisodeCatalogCaches = new Map<string, Map<string, EpisodeRef[]>>()

function traktReadLimiter(credentials: object): AsyncLimiter {
  let limiter = traktReadLimiters.get(credentials)
  if (!limiter) {
    limiter = createAsyncLimiter(TRAKT_READ_CONCURRENCY)
    traktReadLimiters.set(credentials, limiter)
  }
  return limiter
}

function nuvioWriteLimiter(credentials: object): AsyncLimiter {
  let limiter = nuvioWriteLimiters.get(credentials)
  if (!limiter) {
    limiter = createAsyncLimiter(NUVIO_WRITE_CONCURRENCY)
    nuvioWriteLimiters.set(credentials, limiter)
  }
  return limiter
}

function createNuvioOriginClientId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = new Uint8Array(32)
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  return `nuvio-tv-${[...bytes].map(value => alphabet[value % alphabet.length]).join('')}`
}

function nuvioOriginClientId(): string {
  if (cachedNuvioOriginClientId) return cachedNuvioOriginClientId
  try {
    const stored = globalThis.localStorage?.getItem(NUVIO_ORIGIN_CLIENT_ID_STORAGE_KEY) || ''
    if (/^nuvio-tv-[a-z0-9]{32}$/.test(stored)) {
      cachedNuvioOriginClientId = stored
      return stored
    }
  } catch {
    // Storage can be unavailable in private or server-rendered contexts.
  }
  cachedNuvioOriginClientId = createNuvioOriginClientId()
  try {
    globalThis.localStorage?.setItem(NUVIO_ORIGIN_CLIENT_ID_STORAGE_KEY, cachedNuvioOriginClientId)
  } catch {
    // The module-level value remains stable for this browser session.
  }
  return cachedNuvioOriginClientId
}

function simklRequestLimiter(credentials: object): AsyncLimiter {
  let limiter = simklRequestLimiters.get(credentials)
  if (!limiter) {
    // Simkl permits one uncached request at a time for a user token.
    limiter = createAsyncLimiter(1)
    simklRequestLimiters.set(credentials, limiter)
  }
  return limiter
}

async function waitForSimklRequestSlot(credentials: object, isWrite: boolean): Promise<void> {
  const completions = isWrite ? simklLastWriteCompletion : simklLastGetCompletion
  const minimumGapMs = isWrite ? 1_000 : 100
  const waitMs = Math.max(0, (completions.get(credentials) || 0) + minimumGapMs - Date.now())
  if (waitMs) await sleep(waitMs)
}

function recordSimklRequestCompletion(credentials: object, isWrite: boolean): void {
  const completions = isWrite ? simklLastWriteCompletion : simklLastGetCompletion
  completions.set(credentials, Date.now())
}

function logTo(log: BridgeLog | undefined, message: string) {
  log?.(message)
}

function asEpochMs(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000
  }
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : fallback
}

function nuvioWatchedAt(value: unknown): number {
  const compact = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(
    String(value ?? '').trim()
  )
  if (!compact) return asEpochMs(value)
  const [, year, month, day, hour, minute, second] = compact
  const parts = [year, month, day, hour, minute, second].map(Number)
  const timestamp = Date.UTC(
    parts[0],
    parts[1] - 1,
    parts[2],
    parts[3],
    parts[4],
    parts[5]
  )
  const date = new Date(timestamp)
  return date.getUTCFullYear() === parts[0]
    && date.getUTCMonth() === parts[1] - 1
    && date.getUTCDate() === parts[2]
    && date.getUTCHours() === parts[3]
    && date.getUTCMinutes() === parts[4]
    && date.getUTCSeconds() === parts[5]
    ? timestamp
    : 0
}

function positiveNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function progressPercentage(record: ProgressRecord): number {
  const positionMs = Number(record.positionMs)
  const durationMs = Number(record.durationMs)
  if (Number.isFinite(positionMs) && Number.isFinite(durationMs) && positionMs > 0 && durationMs > 0) {
    return Math.min(100, positionMs / durationMs * 100)
  }
  const explicit = Number(record.percentage)
  return Number.isFinite(explicit) && explicit > 0 ? Math.min(100, explicit) : 0
}

function absoluteProgress(
  record: ProgressRecord,
  fallbackDurationMs = 0
): { positionMs: number; durationMs: number } | null {
  const positionMs = Number(record.positionMs)
  const durationMs = Number(record.durationMs)
  if (Number.isFinite(positionMs) && Number.isFinite(durationMs) && positionMs > 0 && durationMs > 0) {
    return { positionMs, durationMs }
  }

  const percentage = progressPercentage(record)
  const fallback = Number(fallbackDurationMs)
  if (!percentage || !Number.isFinite(fallback) || fallback <= 0) return null
  return {
    positionMs: Math.round(fallback * percentage / 100),
    durationMs: fallback
  }
}

function externalIdNamespace(value: unknown): string | null {
  const raw = String(value || '').trim().toLowerCase()
  const namespace = EXTERNAL_ID_NAMESPACE_ALIASES[raw] || raw
  if (!/^[a-z][a-z0-9_-]*$/.test(namespace) || STANDARD_MEDIA_ID_KEYS.has(namespace)) return null
  return namespace
}

function externalIdValue(value: unknown): string | number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = String(value ?? '').trim()
  if (!text) return null
  if (/^\d+$/.test(text)) {
    const numeric = Number(text)
    if (Number.isSafeInteger(numeric)) return numeric
  }
  return text
}

function firstExternalContentId(media: MediaRef): string | null {
  const entries = Object.entries(media.ids.external || {})
  const preferred = new Map<string, number>(
    SIMKL_EXTERNAL_ID_NAMESPACES.map((namespace, index) => [namespace, index] as const)
  )
  entries.sort(([left], [right]) => (
    (preferred.get(left) ?? Number.MAX_SAFE_INTEGER) - (preferred.get(right) ?? Number.MAX_SAFE_INTEGER)
    || left.localeCompare(right)
  ))
  for (const [rawNamespace, rawValue] of entries) {
    const namespace = externalIdNamespace(rawNamespace)
    const value = externalIdValue(rawValue)
    if (namespace && value !== null) return `${namespace}:${value}`
  }
  return null
}

function normalizedKitsuContentId(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  const match = /^kitsu:(\d+)$/i.exec(normalized)
  if (!match) return null
  const id = Number(match[1])
  return Number.isSafeInteger(id) && id > 0 ? `kitsu:${id}` : null
}

function kitsuContentId(media: MediaRef): string | null {
  const mappedVideoContentId = parseStremioVideoId(media.videoId)?.contentId
  const fromMappedVideo = normalizedKitsuContentId(mappedVideoContentId)
  if (fromMappedVideo) return fromMappedVideo

  const external = normalizedKitsuContentId(`kitsu:${media.ids.external?.kitsu ?? ''}`)
  if (external) return external

  return normalizedKitsuContentId(media.ids.stremio)
}

function applyKitsuContentId(media: MediaRef, contentId: string): void {
  const normalized = normalizedKitsuContentId(contentId)
  if (!normalized) return
  const rawId = normalized.slice('kitsu:'.length)
  const numericId = Number(rawId)
  media.ids = {
    ...media.ids,
    external: {
      ...(media.ids.external || {}),
      kitsu: Number.isSafeInteger(numericId) ? numericId : rawId
    }
  }
}

function normalizeIds(raw: any, slugService?: 'trakt' | 'simkl'): MediaIds {
  if (!raw || typeof raw !== 'object') return {}
  const ids: MediaIds = {}
  const imdb = String(raw.imdb || raw.imdb_id || '').trim()
  if (/^tt\d+$/i.test(imdb)) ids.imdb = imdb.toLowerCase()
  const numeric = [
    ['tmdb', raw.tmdb ?? raw.tmdb_id],
    ['tvdb', raw.tvdb ?? raw.tvdb_id],
    ['trakt', raw.trakt ?? raw.trakt_id],
    ['simkl', raw.simkl ?? raw.simkl_id]
  ] as const
  for (const [key, value] of numeric) {
    if (value !== undefined && value !== null && String(value).trim()) ids[key] = value
  }
  if (raw.traktslug || (slugService === 'trakt' && raw.slug)) {
    ids.slug = String(raw.traktslug || raw.slug)
  }
  if (raw.stremio) ids.stremio = String(raw.stremio)
  if (raw.jellyfin) ids.jellyfin = String(raw.jellyfin)
  const external: Record<string, string | number> = {}
  if (slugService === 'simkl' && raw.slug) external.simklslug = String(raw.slug)
  for (const source of [raw.external, raw]) {
    if (!source || typeof source !== 'object') continue
    for (const [rawNamespace, rawValue] of Object.entries(source)) {
      const namespace = externalIdNamespace(rawNamespace)
      const value = externalIdValue(rawValue)
      if (namespace && value !== null) external[namespace] = value
    }
  }
  if (Object.keys(external).length) ids.external = external
  return ids
}

export function parseNuvioContentId(contentId: unknown): MediaIds {
  const value = String(contentId || '').trim()
  if (!value) return {}
  if (/^tt\d+$/i.test(value)) return { imdb: value.toLowerCase(), stremio: value }
  const match = /^([a-z][a-z0-9_-]*):(.+)$/i.exec(value)
  if (match) {
    const namespace = match[1].toLowerCase()
    if (['tmdb', 'tvdb', 'trakt', 'simkl'].includes(namespace)) {
      const standardValue = externalIdValue(match[2])
      if (standardValue !== null) {
        const standardNamespace = namespace as 'tmdb' | 'tvdb' | 'trakt' | 'simkl'
        return { [standardNamespace]: standardValue, stremio: value }
      }
    }
    const externalNamespace = externalIdNamespace(namespace)
    const externalValue = externalIdValue(match[2])
    if (externalNamespace && externalValue !== null) {
      return { external: { [externalNamespace]: externalValue }, stremio: value }
    }
  }
  return { stremio: value }
}

function nuvioContentIds(media: MediaRef): string[] {
  const ids: string[] = []
  const add = (value: string | null) => {
    if (value && !ids.includes(value)) ids.push(value)
  }
  add(String(media.destinationContentId || '').trim() || null)
  // When an enabled Nuvio addon resolves this title through Kitsu, retain that
  // native catalog identity for both metadata lookup and the persisted row.
  // IMDb remains canonical for every title that has no Kitsu resolution.
  add(kitsuContentId(media))
  if (media.ids.imdb && /^tt\d+$/i.test(String(media.ids.imdb))) {
    add(String(media.ids.imdb).toLowerCase())
  }
  if (media.ids.tmdb !== undefined && media.ids.tmdb !== null && String(media.ids.tmdb).trim()) {
    add(`tmdb:${media.ids.tmdb}`)
  }
  for (const namespace of ['tvdb', 'trakt', 'simkl'] as const) {
    const value = media.ids[namespace]
    if (value !== undefined && value !== null && String(value).trim()) {
      add(`${namespace}:${value}`)
    }
  }
  if (media.ids.stremio) add(String(media.ids.stremio))
  add(firstExternalContentId(media))
  return ids
}

function nuvioContentId(media: MediaRef): string | null {
  return nuvioContentIds(media)[0] || null
}

function stremioContentId(media: MediaRef): string | null {
  if (media.ids.imdb && /^tt\d+$/i.test(String(media.ids.imdb))) {
    return String(media.ids.imdb).toLowerCase()
  }
  if (media.ids.stremio) {
    const raw = String(media.ids.stremio)
    const match = /^(.*):\d+:\d+$/.exec(raw)
    return match?.[1] || raw
  }
  if (media.ids.tmdb !== undefined) return `tmdb:${media.ids.tmdb}`
  return firstExternalContentId(media)
}

function sourceOf(connection: BridgeConnection) {
  return {
    service: connection.service,
    accountId: connection.accountId,
    profileId: connection.profileId ?? undefined
  }
}

function mediaLabel(media: MediaRef): string {
  const title = mediaTitle(media)
  return media.kind === 'series' && media.season !== undefined && media.episode !== undefined
    ? `${title} S${media.season}E${media.episode}`
    : String(title)
}

function traktWriteIds(media: MediaRef): Record<string, string | number> | null {
  const ids: Record<string, string | number> = {}
  for (const key of ['trakt', 'imdb', 'tmdb', 'tvdb', 'slug'] as const) {
    const value = media.ids[key]
    if (value !== undefined && value !== null && String(value).trim()) ids[key] = value
  }
  return Object.keys(ids).length ? ids : null
}

function traktEpisodeWriteIds(videoId: unknown): Record<string, number> | null {
  const match = /^(trakt|tvdb):(\d+)$/.exec(String(videoId || ''))
  const id = Number(match?.[2])
  if (!match || !Number.isSafeInteger(id) || id < 1) return null
  return { [match[1]]: id }
}

function simklWriteIds(
  media: MediaRef,
  options: { stripAnimeEntryIds?: boolean } = {}
): Record<string, string | number> | null {
  const ids: Record<string, string | number> = {}
  for (const key of ['simkl', 'imdb', 'tmdb', 'tvdb'] as const) {
    const value = media.ids[key]
    if (value !== undefined && value !== null && String(value).trim()) ids[key] = value
  }
  for (const namespace of SIMKL_EXTERNAL_ID_NAMESPACES) {
    const value = media.ids.external?.[namespace]
    if (value !== undefined && value !== null && String(value).trim()) ids[namespace] = value
  }
  if (media.ids.slug && String(media.ids.slug).trim()) ids.traktslug = String(media.ids.slug).trim()
  if (options.stripAnimeEntryIds) {
    delete ids.simkl
    for (const namespace of SIMKL_ANIME_ID_NAMESPACES) delete ids[namespace]
  }
  return Object.keys(ids).length ? ids : null
}

interface SimklAnimeVideoIdParts {
  namespace: typeof SIMKL_ANIME_ID_NAMESPACES[number]
  id: string | number
  episode: number
}

function parseSimklAnimeVideoId(value: unknown): SimklAnimeVideoIdParts | null {
  const normalized = String(value ?? '').trim()
  const match = /^(mal|anidb|anilist|kitsu):(\d+):(\d+)(?::|$)/i.exec(normalized)
  if (!match) return null
  const id = Number(match[2])
  const episode = Number(match[3])
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(episode) || episode < 1) {
    return null
  }
  return {
    namespace: match[1].toLowerCase() as SimklAnimeVideoIdParts['namespace'],
    id,
    episode
  }
}

function nuvioVideoContentId(value: unknown): string | null {
  const anime = parseSimklAnimeVideoId(value)
  if (anime) return `${anime.namespace}:${anime.id}`
  return parseStremioVideoId(value)?.contentId || null
}

function simklAnimeContentId(media: MediaRef): string | null {
  const destination = /^((?:mal|anidb|anilist|kitsu)):(\d+)$/i.exec(
    String(media.destinationContentId || '').trim()
  )
  if (destination) return `${destination[1].toLowerCase()}:${Number(destination[2])}`
  const video = parseSimklAnimeVideoId(media.videoId)
  if (video) return `${video.namespace}:${video.id}`
  for (const namespace of ['kitsu', 'mal', 'anidb', 'anilist'] as const) {
    const value = externalIdValue(media.ids.external?.[namespace])
    if (value !== null) return `${namespace}:${value}`
  }
  return null
}

function isSimklAnimeMedia(media: MediaRef): boolean {
  return Boolean(
    parseSimklAnimeVideoId(media.videoId)
    || SIMKL_ANIME_ID_NAMESPACES.some(namespace => (
      externalIdValue(media.ids.external?.[namespace]) !== null
    ))
  )
}

interface SimklEpisodeWriteResolution {
  ids: Record<string, string | number> | null
  season?: number
  episode?: number
  isAnime: boolean
  nativeAnime: boolean
}

function resolveSimklEpisodeWrite(media: MediaRef): SimklEpisodeWriteResolution {
  const animeVideo = parseSimklAnimeVideoId(media.videoId)
  if (media.kind === 'series' && animeVideo) {
    return {
      ids: { [animeVideo.namespace]: animeVideo.id },
      episode: animeVideo.episode,
      isAnime: true,
      nativeAnime: true
    }
  }

  const parsedVideo = parseStremioVideoId(media.videoId)
  const season = Number.isInteger(media.season)
    ? Number(media.season)
    : parsedVideo?.season
  const episode = Number.isInteger(media.episode)
    ? Number(media.episode)
    : parsedVideo?.episode
  const isAnime = isSimklAnimeMedia(media)
  const flatAnimeEpisode = Number.isInteger(media.absoluteEpisode)
    ? Number(media.absoluteEpisode)
    : episode
  if (isAnime && season === undefined && Number.isInteger(flatAnimeEpisode)) {
    return {
      ids: simklWriteIds(media),
      episode: flatAnimeEpisode,
      isAnime: true,
      nativeAnime: true
    }
  }
  return {
    ids: simklWriteIds(media, {
      stripAnimeEntryIds: Boolean(isAnime && Number.isInteger(season) && Number(season) > 0)
    }),
    season,
    episode,
    isAnime,
    nativeAnime: false
  }
}

function simklSubject(
  media: MediaRef,
  ids: Record<string, string | number> | null
): Record<string, any> | null {
  const title = String(media.title || '').trim()
  if (!ids && !title) return null
  return {
    ...(title ? { title } : {}),
    ...(Number.isInteger(media.year) && Number(media.year) > 0 ? { year: Number(media.year) } : {}),
    ...(ids ? { ids } : {})
  }
}

function simklCacheAccountKey(connection: BridgeConnection): string {
  return `${connection.accountId || 'unknown'}:${connection.credentials.service}`
}

function simklSnapshotLookupKeys(media: MediaRef): string[] {
  // Match the destination snapshot through provider identities exactly as
  // Nuvio does. Title/year remains a valid Simkl write fallback, but it must
  // not merge conflicting/remade catalog entries inside the snapshot index.
  return mediaAliasKeys(media)
}

function mergeSimklMediaIds(primary: MediaIds, secondary: MediaIds): MediaIds {
  const external = {
    ...(secondary.external || {}),
    ...(primary.external || {})
  }
  return {
    ...secondary,
    ...primary,
    ...(Object.keys(external).length ? { external } : {})
  }
}

function resetSimklSnapshotCaches(connection: BridgeConnection): void {
  const key = simklCacheAccountKey(connection)
  simklMediaSnapshotCaches.delete(key)
  simklEpisodeCatalogCaches.delete(key)
}

function rememberSimklMediaSnapshot(connection: BridgeConnection, media: MediaRef): MediaRef {
  const accountKey = simklCacheAccountKey(connection)
  let cache = simklMediaSnapshotCaches.get(accountKey)
  if (!cache) {
    cache = new Map()
    simklMediaSnapshotCaches.set(accountKey, cache)
  }

  const incomingKeys = simklSnapshotLookupKeys(media)
  const existingEntries = [...new Set(incomingKeys.map(key => cache!.get(key)).filter(Boolean))] as MediaRef[]
  const canonical = existingEntries[0] || {
    ...media,
    ids: mergeSimklMediaIds(media.ids, {})
  }
  canonical.ids = mergeSimklMediaIds(canonical.ids, media.ids)
  canonical.title = canonical.title || media.title
  canonical.year = canonical.year || media.year

  // A later bucket can expose another alias for an entry already indexed by
  // IMDb/TVDB. Merge those objects and repoint their old aliases so every ID
  // resolves to the same complete Simkl snapshot reference.
  for (const duplicate of existingEntries.slice(1)) {
    canonical.ids = mergeSimklMediaIds(canonical.ids, duplicate.ids)
    canonical.title = canonical.title || duplicate.title
    canonical.year = canonical.year || duplicate.year
    for (const [key, value] of cache.entries()) {
      if (value === duplicate) cache.set(key, canonical)
    }
  }
  for (const key of simklSnapshotLookupKeys(canonical)) cache.set(key, canonical)
  for (const key of incomingKeys) cache.set(key, canonical)
  return canonical
}

function enrichMediaFromSimklSnapshot(connection: BridgeConnection, media: MediaRef): MediaRef {
  const cache = simklMediaSnapshotCaches.get(simklCacheAccountKey(connection))
  const snapshot = simklSnapshotLookupKeys(media)
    .map(key => cache?.get(key))
    .find(Boolean)
  if (!snapshot) return media
  return {
    ...media,
    title: snapshot.title || media.title,
    year: snapshot.year || media.year,
    ids: mergeSimklMediaIds(snapshot.ids, media.ids)
  }
}

function simklEpisodeIdentity(episode: EpisodeRef): string {
  return [
    String(episode.contentId || ''),
    episode.season,
    episode.episode,
    episode.absoluteEpisode || '',
    String(episode.videoId || '')
  ].join(':')
}

function mergeSimklEpisodeCatalogs(catalogs: readonly (readonly EpisodeRef[])[]): EpisodeRef[] {
  const merged = new Map<string, EpisodeRef>()
  for (const episode of catalogs.flat()) merged.set(simklEpisodeIdentity(episode), episode)
  return [...merged.values()]
}

function rememberSimklEpisodeCatalog(
  connection: BridgeConnection,
  media: MediaRef,
  episodes: readonly EpisodeRef[]
): void {
  if (!episodes.length) return
  const accountKey = simklCacheAccountKey(connection)
  let cache = simklEpisodeCatalogCaches.get(accountKey)
  if (!cache) {
    cache = new Map()
    simklEpisodeCatalogCaches.set(accountKey, cache)
  }
  const keys = simklSnapshotLookupKeys(media)
  const existing = [...new Set(keys.map(key => cache!.get(key)).filter(Boolean))] as EpisodeRef[][]
  const canonical = existing[0] || []
  const merged = mergeSimklEpisodeCatalogs([...existing, episodes])
  const nativeOwners = new Set(
    merged.map(episode => episode.contentId).filter(Boolean)
  )
  const ordered = simklAnimeContentId(media) && nativeOwners.size > 1
    ? merged.map((episode, sequenceIndex) => ({ ...episode, sequenceIndex }))
    : merged.map(({ sequenceIndex: _sequenceIndex, ...episode }) => episode)
  canonical.splice(0, canonical.length, ...ordered)
  for (const duplicate of existing.slice(1)) {
    duplicate.splice(0, duplicate.length, ...ordered)
    for (const [key, value] of cache.entries()) {
      if (value === duplicate) cache.set(key, canonical)
    }
  }
  for (const key of keys) cache.set(key, canonical)
}

function nowIso() {
  return new Date().toISOString()
}

function normalizeTraktTokens(tokens: any): TraktTokens {
  return {
    access_token: String(tokens?.access_token || ''),
    refresh_token: tokens?.refresh_token ? String(tokens.refresh_token) : undefined,
    token_type: String(tokens?.token_type || 'bearer'),
    expires_in: Number(tokens?.expires_in || 7_776_000),
    created_at: Number(tokens?.created_at || Math.floor(Date.now() / 1000))
  }
}

async function ensureTraktToken(connection: BridgeConnection): Promise<string> {
  if (connection.credentials.service !== 'trakt') throw new Error('Expected Trakt credentials.')
  const credentials = connection.credentials
  const token = credentials.tokens
  if (!token.access_token) throw new Error('Reconnect this Trakt account.')
  const expiresAt = Number(token.created_at || 0) + Number(token.expires_in || 0)
  const now = Math.floor(Date.now() / 1000)
  if (!expiresAt || now < expiresAt - 90) return token.access_token
  if (!token.refresh_token) throw new Error('The Trakt session expired. Reconnect the account.')
  const currentRefresh = traktTokenRefreshes.get(credentials)
  if (currentRefresh) return currentRefresh
  const refresh = requestBridgeJson(credentials.refreshUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: token.refresh_token })
  }).then(({ data }) => {
    credentials.tokens = normalizeTraktTokens(data)
    return credentials.tokens.access_token
  })
  traktTokenRefreshes.set(credentials, refresh)
  try {
    return await refresh
  } finally {
    if (traktTokenRefreshes.get(credentials) === refresh) {
      traktTokenRefreshes.delete(credentials)
    }
  }
}

async function traktRequest(
  connection: BridgeConnection,
  path: string,
  params: Record<string, any> = {},
  options: BridgeRequestInit = {}
): Promise<JsonResponse> {
  if (connection.credentials.service !== 'trakt') throw new Error('Expected Trakt credentials.')
  const token = await ensureTraktToken(connection)
  const url = new URL(`${TRAKT_API}${path}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }
  const isWrite = String(options.method || 'GET').toUpperCase() !== 'GET'
  const requestOptions: BridgeRequestInit = {
    ...options,
    timeoutMs: options.timeoutMs || (
      isWrite ? PROVIDER_WRITE_REQUEST_TIMEOUT_MS : PROVIDER_READ_REQUEST_TIMEOUT_MS
    ),
    timeoutMessage: options.timeoutMessage || `Trakt ${isWrite ? 'write' : 'read'} did not respond before the deadline.`,
    headers: {
      'Content-Type': 'application/json',
      'trakt-api-key': connection.credentials.clientId,
      'trakt-api-version': '2',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  }
  if (isWrite) await waitForWriteSlot(connection.credentials, 1_050)
  try {
    const request = () => requestBridgeJson(url.toString(), requestOptions)
    return await (isWrite
      ? request()
      : traktReadLimiter(connection.credentials)(() => retryBridgeOperation(request, { retries: 1 })))
  } catch (error: any) {
    if (!isWrite || error?.status !== 429) throw error
    const retrySeconds = Math.max(1, Number(error.headers?.get?.('retry-after') || 1))
    await sleep(retrySeconds * 1000)
    await waitForWriteSlot(connection.credentials, 1_050)
    return requestBridgeJson(url.toString(), requestOptions)
  }
}

async function traktGetAll(
  connection: BridgeConnection,
  path: string,
  params: Record<string, any> = {}
): Promise<any[]> {
  const output: any[] = []
  const seenPageStarts = new Set<string>()
  let limit = TRAKT_PAGE_SIZE
  const firstResponse = await traktRequest(connection, path, { ...params, page: 1, limit })
  const firstRows = Array.isArray(firstResponse.data) ? firstResponse.data : []
  if (!firstRows.length) return output
  output.push(...firstRows)
  seenPageStarts.add(JSON.stringify(firstRows[0]))

  const responsePage = Number(firstResponse.headers.get('x-pagination-page'))
  const pageCount = Number(firstResponse.headers.get('x-pagination-page-count'))
  const responseLimit = Number(firstResponse.headers.get('x-pagination-limit'))
  let page = Number.isInteger(responsePage) && responsePage > 0 ? responsePage : 1
  if (Number.isInteger(responseLimit) && responseLimit > 0) limit = responseLimit

  if (Number.isInteger(pageCount) && pageCount > page) {
    const remainingPages = Array.from(
      { length: pageCount - page },
      (_, index) => page + index + 1
    )
    const responses = await mapLimit(
      remainingPages,
      TRAKT_PAGE_CONCURRENCY,
      nextPage => traktRequest(connection, path, { ...params, page: nextPage, limit })
    )
    for (const response of responses) {
      const rows = Array.isArray(response.data) ? response.data : []
      if (!rows.length) continue
      const pageStart = JSON.stringify(rows[0])
      if (seenPageStarts.has(pageStart)) break
      seenPageStarts.add(pageStart)
      output.push(...rows)
    }
    return output
  }
  if (Number.isInteger(pageCount) && pageCount > 0 && page >= pageCount) return output

  while (true) {
    page++
    const response = await traktRequest(connection, path, { ...params, page, limit })
    const rows = Array.isArray(response.data) ? response.data : []
    if (!rows.length) break
    // Some Trakt endpoints paginate without exposing their pagination headers
    // through CORS, while legacy watched endpoints can ignore page entirely.
    // Continue until an empty page, but stop before appending a repeated first
    // row so an unpaginated endpoint cannot create an infinite duplicate loop.
    const pageStart = JSON.stringify(rows[0])
    if (seenPageStarts.has(pageStart)) break
    seenPageStarts.add(pageStart)
    output.push(...rows)
    const nextResponsePage = Number(response.headers.get('x-pagination-page'))
    const nextPageCount = Number(response.headers.get('x-pagination-page-count'))
    const nextResponseLimit = Number(response.headers.get('x-pagination-limit'))
    const currentPage = Number.isInteger(nextResponsePage) && nextResponsePage > 0
      ? nextResponsePage
      : page
    if (Number.isInteger(nextResponseLimit) && nextResponseLimit > 0) limit = nextResponseLimit
    if (Number.isInteger(nextPageCount) && nextPageCount > 0 && currentPage >= nextPageCount) break
    if (currentPage > page) page = currentPage
  }
  return output
}

async function ensureNuvioToken(connection: BridgeConnection): Promise<string> {
  if (connection.credentials.service !== 'nuvio') throw new Error('Expected Nuvio credentials.')
  const credentials = connection.credentials
  const session = credentials.session
  if (!session.access_token) throw new Error('Reconnect this Nuvio account.')
  const expiresAt = Number(session.expires_at || 0)
  const now = Math.floor(Date.now() / 1000)
  if (!expiresAt || now < expiresAt - 90) return session.access_token
  if (!session.refresh_token) throw new Error('The Nuvio session expired. Reconnect the account.')
  const currentRefresh = nuvioTokenRefreshes.get(credentials)
  if (currentRefresh) return currentRefresh
  const refresh = requestBridgeJson<NuvioSession>(
    `${NUVIO_API}/auth/v1/token?grant_type=refresh_token`,
    {
      method: 'POST',
      headers: { apikey: credentials.publicKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    }
  ).then(({ data }) => {
    credentials.session = {
      ...data,
      expires_at: data.expires_at || (data.expires_in ? now + Number(data.expires_in) : 0)
    }
    return credentials.session.access_token
  })
  nuvioTokenRefreshes.set(credentials, refresh)
  try {
    return await refresh
  } finally {
    if (nuvioTokenRefreshes.get(credentials) === refresh) {
      nuvioTokenRefreshes.delete(credentials)
    }
  }
}

export async function nuvioRpc(
  connection: BridgeConnection,
  name: string,
  body: Record<string, any> = {}
): Promise<any> {
  if (connection.credentials.service !== 'nuvio') throw new Error('Expected Nuvio credentials.')
  const isMutation = /^sync_(?:push|delete)_/.test(name)
  const requestBody = isMutation
    ? { ...body, p_origin_client_id: body.p_origin_client_id || nuvioOriginClientId() }
    : body
  const request = () => retryBridgeOperation(async () => {
    const token = await ensureNuvioToken(connection)
    const { data } = await requestBridgeJson(`${NUVIO_API}/rest/v1/rpc/${name}`, {
      method: 'POST',
      timeoutMs: PROVIDER_WRITE_REQUEST_TIMEOUT_MS,
      timeoutMessage: `Nuvio ${name} did not respond before the deadline.`,
      headers: {
        apikey: connection.credentials.publicKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })
    return data
  })
  return isMutation
    ? nuvioWriteLimiter(connection.credentials)(request)
    : request()
}

export async function nuvioRest(
  connection: BridgeConnection,
  path: string,
  params: Record<string, any> = {},
  options: Omit<BridgeRequestInit, 'body' | 'headers' | 'method'> = {}
): Promise<any> {
  if (connection.credentials.service !== 'nuvio') throw new Error('Expected Nuvio credentials.')
  const token = await ensureNuvioToken(connection)
  const url = new URL(`${NUVIO_API}/rest/v1/${path}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
  }
  const { data } = await requestBridgeJson(url.toString(), {
    ...options,
    headers: {
      apikey: connection.credentials.publicKey,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  })
  return data
}

async function simklRequest(
  connection: BridgeConnection,
  path: string,
  params: Record<string, any> = {},
  options: BridgeRequestInit = {}
): Promise<JsonResponse> {
  if (connection.credentials.service !== 'simkl') throw new Error('Expected Simkl credentials.')
  const url = new URL(`${SIMKL_API}${path}`)
  const query = {
    ...params,
    client_id: connection.credentials.clientId,
    'app-name': 'nuvio-wiki',
    'app-version': '2.0'
  }
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }
  const requestOptions = {
    ...options,
    timeoutMs: options.timeoutMs || (
      String(options.method || 'GET').toUpperCase() === 'GET'
        ? PROVIDER_READ_REQUEST_TIMEOUT_MS
        : PROVIDER_WRITE_REQUEST_TIMEOUT_MS
    ),
    timeoutMessage: options.timeoutMessage || `Simkl ${path} did not respond before the deadline.`,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${connection.credentials.accessToken}`,
      'User-Agent': 'Nuvio-Wiki-Sync-Bridge/2.0',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  }
  const isWrite = String(options.method || 'GET').toUpperCase() !== 'GET'
  return simklRequestLimiter(connection.credentials)(async () => {
    const request = async () => {
      await waitForSimklRequestSlot(connection.credentials, isWrite)
      try {
        return await requestBridgeJson(url.toString(), requestOptions)
      } finally {
        recordSimklRequestCompletion(connection.credentials, isWrite)
      }
    }
    const retryOptions = {
      retries: 4,
      baseDelayMs: 1_000,
      maxDelayMs: 16_000,
      signal: options.signal || undefined,
      shouldRetry(error: any) {
        const status = Number(error?.status)
        return status === 429
          || [500, 502, 503].includes(status)
          || error?.name === 'TimeoutError'
          || error?.name === 'TypeError'
      }
    }
    try {
      return await retryBridgeOperation(request, retryOptions)
    } catch (error: any) {
      const rateLimitCode = String(error?.body?.error || error?.body?.code || '').toUpperCase()
      if (error?.status !== 400 || rateLimitCode !== 'RATE_LIMIT') throw error
      const retrySeconds = Math.max(3, Number(error.headers?.get?.('retry-after') || 0))
      await sleep(retrySeconds * 1000, options.signal || undefined)
      return retryBridgeOperation(request, retryOptions)
    }
  })
}

export async function stremioRequest(
  connection: BridgeConnection,
  path: string,
  body: Record<string, any>
): Promise<any> {
  if (connection.credentials.service !== 'stremio') throw new Error('Expected Stremio credentials.')
  const { data } = await retryBridgeOperation(() => requestBridgeJson(
    `${STREMIO_API}/${path.replace(/^\//, '')}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authKey: connection.credentials.authKey, ...body })
    }
  ))
  if (data?.error) throw new Error(errorDetail(data.error, 'Stremio request failed'))
  return data?.result ?? data
}

function plexHeaders(clientIdentifier: string, token?: string): Record<string, string> {
  return {
    Accept: 'application/json',
    'X-Plex-Client-Identifier': clientIdentifier,
    'X-Plex-Product': PLEX_PRODUCT,
    ...(token ? { 'X-Plex-Token': token } : {})
  }
}

function createClientIdentifier(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `nuvio-wiki-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export interface PlexPinLink {
  id: number
  code: string
  link: string
  clientIdentifier: string
}

export async function createPlexPinLink(
  clientIdentifier = createClientIdentifier()
): Promise<PlexPinLink> {
  const { data } = await requestBridgeJson(`${PLEX_TV_API}/pins?strong=true`, {
    method: 'POST',
    headers: plexHeaders(clientIdentifier)
  })
  const id = Number(data?.id)
  const code = String(data?.code || '')
  if (!Number.isSafeInteger(id) || !code) throw new Error('Plex returned an incomplete sign-in PIN.')
  const params = new URLSearchParams({
    clientID: clientIdentifier,
    code,
    'context[device][product]': PLEX_PRODUCT
  })
  return {
    id,
    code,
    link: `https://app.plex.tv/auth#?${params.toString()}`,
    clientIdentifier
  }
}

export async function readPlexPinLink(pin: PlexPinLink): Promise<string | null> {
  const { data } = await requestBridgeJson(`${PLEX_TV_API}/pins/${pin.id}`, {
    headers: plexHeaders(pin.clientIdentifier)
  })
  return String(data?.authToken || data?.auth_token || '') || null
}

function plexConnectionCandidates(resource: any): any[] {
  const allowHttp = typeof window === 'undefined' || window.location.protocol === 'http:'
  return (Array.isArray(resource?.connections) ? resource.connections : [])
    .filter((connection: any) => {
      const uri = String(connection?.uri || '')
      return uri.startsWith('https://') || (allowHttp && uri.startsWith('http://'))
    })
    .sort((left: any, right: any) => (
      Number(Boolean(right.local)) - Number(Boolean(left.local))
      || Number(Boolean(left.relay)) - Number(Boolean(right.relay))
      || Number(String(right.protocol || '').toLowerCase() === 'https')
        - Number(String(left.protocol || '').toLowerCase() === 'https')
    ))
}

async function reachablePlexServer(resource: any, clientIdentifier: string): Promise<PlexServer | null> {
  const accessToken = String(resource?.accessToken || '')
  if (!accessToken) return null
  for (const candidate of plexConnectionCandidates(resource)) {
    const baseUrl = String(candidate.uri || '').replace(/\/+$/, '')
    try {
      await requestBridgeJson(`${baseUrl}/identity`, {
        headers: plexHeaders(clientIdentifier, accessToken)
      })
      return {
        id: String(resource?.clientIdentifier || resource?.machineIdentifier || ''),
        name: String(resource?.name || 'Plex Media Server'),
        baseUrl,
        accessToken,
        owned: Boolean(resource?.owned)
      }
    } catch {
      // Try the next advertised direct or relay connection.
    }
  }
  return null
}

export async function signInPlex(accountToken: string, clientIdentifier: string): Promise<{
  accountToken: string
  clientIdentifier: string
  accountId: string
  displayName: string
  servers: PlexServer[]
}> {
  const headers = plexHeaders(clientIdentifier, accountToken)
  const [{ data: user }, { data: resources }] = await Promise.all([
    requestBridgeJson(`${PLEX_TV_API}/user`, { headers }),
    requestBridgeJson(`${PLEX_CLIENTS_API}/resources?includeHttps=1&includeRelay=1&includeIPv6=1`, { headers })
  ])
  const accountId = String(user?.id || user?.uuid || user?.username || user?.email || '')
  if (!accountId) throw new Error('Plex did not expose a verified account identity.')
  const mediaServers = (Array.isArray(resources) ? resources : [])
    .filter(resource => (
      resource?.product === 'Plex Media Server'
      || String(resource?.provides || '').split(',').includes('server')
    ))
  const servers = (await Promise.all(
    mediaServers.map(resource => reachablePlexServer(resource, clientIdentifier))
  ))
    .filter((server): server is PlexServer => Boolean(server?.id))
    .sort((left, right) => (
      Number(right.owned) - Number(left.owned) || left.name.localeCompare(right.name)
    ))
  if (!servers.length) {
    throw new Error('No reachable Plex Media Server with an HTTPS connection was found for this account.')
  }
  return {
    accountToken,
    clientIdentifier,
    accountId,
    displayName: String(user?.friendlyName || user?.username || user?.email || accountId),
    servers
  }
}

async function plexRequest(
  connection: BridgeConnection,
  path: string,
  params: Record<string, any> = {},
  options: RequestInit = {}
): Promise<JsonResponse> {
  if (connection.credentials.service !== 'plex') throw new Error('Expected Plex credentials.')
  const url = new URL(`${connection.credentials.server.baseUrl}${path.startsWith('/') ? path : `/${path}`}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }
  return retryBridgeOperation(() => requestBridgeJson(url.toString(), {
    ...options,
    headers: {
      ...plexHeaders(
        connection.credentials.clientIdentifier,
        connection.credentials.server.accessToken
      ),
      'X-Plex-Pms-Api-Version': '1.0',
      ...(options.headers || {})
    }
  }))
}

function plexRows(data: any): any[] {
  const container = data?.MediaContainer || data || {}
  return Array.isArray(container.Metadata)
    ? container.Metadata
    : Array.isArray(container.Directory)
      ? container.Directory
      : []
}

async function plexGetAll(
  connection: BridgeConnection,
  path: string,
  params: Record<string, any> = {}
): Promise<any[]> {
  const output: any[] = []
  const size = 500
  for (let start = 0; start < 100_000; start += size) {
    const { data } = await plexRequest(connection, path, params, {
      headers: {
        'X-Plex-Container-Start': String(start),
        'X-Plex-Container-Size': String(size)
      }
    })
    const rows = plexRows(data)
    output.push(...rows)
    const container = data?.MediaContainer || data || {}
    const total = Number(container.totalSize || container.size || 0)
    if (!rows.length || rows.length < size || (total && output.length >= total)) break
  }
  return output
}

function jellyfinAuthorization(deviceId: string, token?: string): string {
  const escapeValue = (value: string) => value.replace(/[\\"\u0000-\u001f\u007f]/g, '')
  const fields = [
    `Client="${escapeValue(JELLYFIN_CLIENT)}"`,
    'Device="Browser"',
    `DeviceId="${escapeValue(deviceId)}"`,
    `Version="${escapeValue(JELLYFIN_VERSION)}"`
  ]
  if (token) fields.push(`Token="${escapeValue(token)}"`)
  return `MediaBrowser ${fields.join(', ')}`
}

function jellyfinHeaders(deviceId: string, token?: string): Record<string, string> {
  return {
    Accept: 'application/json',
    Authorization: jellyfinAuthorization(deviceId, token),
    ...(token ? { 'X-Emby-Token': token } : {})
  }
}

function normalizeJellyfinBaseUrl(value: string): string {
  const raw = value.trim()
  if (!raw) throw new Error('Enter the Jellyfin server URL.')
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    throw new Error('Enter a valid Jellyfin server URL.')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Use an HTTP or HTTPS Jellyfin server URL without embedded credentials.')
  }
  url.search = ''
  url.hash = ''
  url.pathname = url.pathname
    .replace(/\/web(?:\/index\.html)?\/?$/i, '')
    .replace(/\/+$/, '')
  const loopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname.toLowerCase())
  if (
    typeof window !== 'undefined'
    && window.location.protocol === 'https:'
    && url.protocol === 'http:'
    && !loopback
  ) {
    throw new Error('This HTTPS page can connect only to an HTTPS Jellyfin URL (except a loopback server).')
  }
  return url.toString().replace(/\/+$/, '')
}

export async function signInJellyfin(
  serverUrl: string,
  username: string,
  password: string
): Promise<{
  baseUrl: string
  accessToken: string
  userId: string
  serverId: string
  serverName: string
  deviceId: string
  displayName: string
}> {
  const baseUrl = normalizeJellyfinBaseUrl(serverUrl)
  const deviceId = createClientIdentifier()
  let data: any
  try {
    data = (await requestBridgeJson(`${baseUrl}/Users/AuthenticateByName`, {
      method: 'POST',
      headers: {
        ...jellyfinHeaders(deviceId),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ Username: username.trim(), Pw: password })
    })).data
  } catch (error: any) {
    if (error?.status) throw error
    throw new Error(
      'The Jellyfin server could not be reached from this browser. Check its public HTTPS URL and cross-origin access.'
    )
  }
  const user = data?.User || data?.user || {}
  const accessToken = String(data?.AccessToken || data?.accessToken || '')
  const userId = String(user?.Id || user?.id || '')
  if (!accessToken || !userId) throw new Error('Jellyfin returned an incomplete authenticated session.')

  let serverId = String(data?.ServerId || data?.serverId || user?.ServerId || user?.serverId || '')
  let serverName = String(user?.ServerName || user?.serverName || '')
  if (!serverId || !serverName) {
    try {
      const info = (await requestBridgeJson(`${baseUrl}/System/Info/Public`, {
        headers: jellyfinHeaders(deviceId, accessToken)
      })).data
      serverId ||= String(info?.Id || info?.id || '')
      serverName ||= String(info?.ServerName || info?.serverName || '')
    } catch {
      // Authentication already proved the server is reachable; use stable fallbacks below.
    }
  }
  serverId ||= baseUrl.toLocaleLowerCase('en-US')
  serverName ||= new URL(baseUrl).hostname
  const displayName = String(user?.Name || user?.name || username.trim() || userId)
  return { baseUrl, accessToken, userId, serverId, serverName, deviceId, displayName }
}

async function jellyfinRequest(
  connection: BridgeConnection,
  path: string,
  params: Record<string, any> = {},
  options: RequestInit = {}
): Promise<JsonResponse> {
  if (connection.credentials.service !== 'jellyfin') throw new Error('Expected Jellyfin credentials.')
  const url = new URL(`${connection.credentials.baseUrl}${path.startsWith('/') ? path : `/${path}`}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }
  return retryBridgeOperation(() => requestBridgeJson(url.toString(), {
    ...options,
    headers: {
      ...jellyfinHeaders(connection.credentials.deviceId, connection.credentials.accessToken),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  }))
}

async function jellyfinRequestWithLegacy(
  connection: BridgeConnection,
  path: string,
  legacyPath: string,
  params: Record<string, any> = {},
  options: RequestInit = {}
): Promise<JsonResponse> {
  try {
    return await jellyfinRequest(connection, path, params, options)
  } catch (error: any) {
    if (error?.status !== 404 || path === legacyPath) throw error
    return jellyfinRequest(connection, legacyPath, params, options)
  }
}

function jellyfinRows(data: any): any[] {
  return Array.isArray(data?.Items)
    ? data.Items
    : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data)
        ? data
        : []
}

async function jellyfinGetAll(
  connection: BridgeConnection,
  path: string,
  params: Record<string, any> = {},
  legacyPath = path
): Promise<any[]> {
  const output: any[] = []
  const size = 500
  for (let start = 0; start < 100_000; start += size) {
    const { data } = await jellyfinRequestWithLegacy(connection, path, legacyPath, {
      ...params,
      StartIndex: start,
      Limit: size
    })
    const rows = jellyfinRows(data)
    output.push(...rows)
    const total = Number(data?.TotalRecordCount ?? data?.totalRecordCount ?? 0)
    if (!rows.length || rows.length < size || (total && output.length >= total)) break
  }
  return output
}

export async function signInNuvio(email: string, password: string): Promise<{
  session: NuvioSession
  profiles: NuvioProfile[]
  accountId: string
  displayName: string
}> {
  const now = Math.floor(Date.now() / 1000)
  const { data } = await requestBridgeJson<NuvioSession>(
    `${NUVIO_API}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: { apikey: NUVIO_PUBLIC_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password })
    }
  )
  if (!data?.access_token) throw new Error('Nuvio did not return an access token.')
  const session = {
    ...data,
    expires_at: data.expires_at || (data.expires_in ? now + Number(data.expires_in) : 0)
  }
  const temporary: BridgeConnection = {
    slot: 'source',
    service: 'nuvio',
    accountId: String(session.user?.id || session.user?.email || email.trim()),
    displayName: String(session.user?.email || email.trim()),
    profileId: null,
    credentials: { service: 'nuvio', session, publicKey: NUVIO_PUBLIC_KEY }
  }
  const profiles = await nuvioRpc(temporary, 'sync_pull_profiles', {})
  return {
    session,
    profiles: Array.isArray(profiles) ? profiles : [],
    accountId: temporary.accountId,
    displayName: temporary.displayName || email.trim()
  }
}

export async function signInStremio(email: string, password: string): Promise<{
  authKey: string
  accountId: string
  displayName: string
}> {
  const { data } = await requestBridgeJson(`${STREMIO_API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'Login', email: email.trim(), password, facebook: false })
  })
  if (data?.error) throw new Error(errorDetail(data.error, 'Stremio sign-in failed'))
  const result = data?.result || data
  const authKey = String(result?.authKey || '')
  const user = result?.user || {}
  const accountId = String(user?._id || user?.id || user?.email || email.trim())
  if (!authKey) throw new Error('Stremio did not return an auth key.')
  return { authKey, accountId, displayName: String(user?.email || user?.name || email.trim()) }
}

export interface StremioDeviceLink {
  code: string
  link: string
  qrcode?: string
}

export async function createStremioDeviceLink(): Promise<StremioDeviceLink> {
  const url = new URL('https://link.stremio.com/api/v2/create')
  url.searchParams.set('type', 'Create')
  const { data } = await requestBridgeJson(url.toString())
  if (data?.error) throw new Error(errorDetail(data.error, 'Stremio link creation failed'))
  const result = data?.result || data
  if (!result?.code || !result?.link) throw new Error('Stremio returned an incomplete device link.')
  return {
    code: String(result.code),
    link: String(result.link),
    qrcode: result.qrcode ? String(result.qrcode) : undefined
  }
}

export async function readStremioDeviceLink(code: string): Promise<string | null> {
  const url = new URL('https://link.stremio.com/api/v2/read')
  url.searchParams.set('type', 'Read')
  url.searchParams.set('code', code)
  try {
    const { data } = await requestBridgeJson(url.toString())
    return String(data?.result?.authKey || data?.authKey || '') || null
  } catch {
    return null
  }
}

export async function createStremioLinkedConnection(
  slot: BridgeSlot,
  authKey: string
): Promise<BridgeConnection> {
  const { data } = await requestBridgeJson(`${STREMIO_API}/getUser`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'GetUser', authKey })
  })
  if (data?.error) throw new Error(errorDetail(data.error, 'Stremio account lookup failed'))
  const user = data?.result || data
  const stableUserId = String(user?._id || '')
  if (!stableUserId) throw new Error('Stremio did not expose a stable account identity.')
  const connection: BridgeConnection = {
    slot,
    service: 'stremio',
    accountId: stableUserId,
    displayName: String(user?.email || `Stremio ${stableUserId.slice(-6)}`),
    credentials: { service: 'stremio', authKey }
  }
  return connection
}

export async function identifyOAuthConnection(
  slot: BridgeSlot,
  credentials: TraktCredentials | SimklCredentials,
  sourceService?: ServiceId
): Promise<BridgeConnection> {
  const temporary: BridgeConnection = {
    slot,
    service: credentials.service,
    accountId: 'pending',
    credentials
  }
  if (credentials.service === 'trakt') {
    const { data } = await traktRequest(temporary, '/users/settings')
    const user = data?.user || data
    const accountId = String(
      user?.ids?.uuid
      || user?.ids?.trakt
      || user?.ids?.slug
      || user?.username
      || ''
    )
    if (!accountId) throw new Error('Trakt did not expose a verified account identity.')
    return {
      ...temporary,
      accountId,
      displayName: String(user?.name || user?.username || user?.ids?.slug || accountId)
    }
  }
  const { data } = await simklRequest(temporary, '/users/settings', {}, { method: 'POST' })
  const user = data?.user || data
  const account = data?.account || {}
  let accountType: SimklAccountType | undefined
  if (slot === 'destination') {
    const rawAccountType = String(account?.type || '').trim().toLowerCase()
    accountType = (
      rawAccountType === 'free' || rawAccountType === 'pro' || rawAccountType === 'vip'
    ) ? rawAccountType : undefined
    if (sourceService !== 'nuvio' && accountType === 'free') {
      throw new Error('Importing to Simkl is not available for Free accounts. A Simkl Pro or VIP account is required.')
    }
    if (sourceService !== 'nuvio' && accountType !== 'pro' && accountType !== 'vip') {
      throw new Error('Could not verify a Simkl Pro or VIP account, so importing to Simkl is not available.')
    }
  }
  const accountId = String(
    account?.id
    || account?.ids?.simkl
    || user?.ids?.simkl
    || user?.simkl_id
    || user?.id
    || user?.email
    || user?.name
    || ''
  )
  if (!accountId) throw new Error('Simkl did not expose a verified account identity.')
  return {
    ...temporary,
    accountId,
    ...(accountType ? { simklAccountType: accountType } : {}),
    displayName: String(user?.name || user?.username || user?.email || accountId)
  }
}

interface PlexCatalogEntry {
  media: MediaRef
  ratingKey: string
  key: string
  sectionId: string
  sectionName: string
  addedAt: number
  updatedAt: number
  lastViewedAt: number
  viewCount: number
  viewOffset: number
  duration: number
}

interface PlexCatalog {
  movies: PlexCatalogEntry[]
  shows: PlexCatalogEntry[]
  episodes: PlexCatalogEntry[]
}

function plexGuidIds(value: any, parent?: any): MediaIds {
  const ids: MediaIds = {}
  const identity = parent || value
  const plexGuid = String(identity?.guid || '').trim().toLowerCase()
  if (plexGuid) ids.plex = plexGuid
  else if (identity?.ratingKey) ids.plex = `rating:${identity.ratingKey}`

  const guidValues = [
    plexGuid,
    ...(Array.isArray(identity?.Guid) ? identity.Guid.map((guid: any) => guid?.id) : [])
  ]
  for (const raw of guidValues) {
    const guid = String(raw || '').trim().toLowerCase().split('?')[0]
    if (!guid) continue
    if (guid.includes('imdb')) {
      const imdb = /tt\d+/.exec(guid)?.[0]
      if (imdb) ids.imdb = imdb
    }
    const numeric = /^(tmdb|tvdb):\/\/(\d+)$/i.exec(guid)
    if (numeric?.[1] === 'tmdb') ids.tmdb = numeric[2]
    if (numeric?.[1] === 'tvdb') ids.tvdb = numeric[2]
    const legacyTmdb = /(?:themoviedb|tmdb):\/\/(\d+)$/i.exec(guid)?.[1]
    const legacyTvdb = /(?:thetvdb|tvdb):\/\/(\d+)$/i.exec(guid)?.[1]
    if (legacyTmdb) ids.tmdb = legacyTmdb
    if (legacyTvdb) ids.tvdb = legacyTvdb
  }
  return ids
}

function plexCatalogEntry(
  value: any,
  section: any,
  kind: 'movie' | 'series',
  parentShow?: any
): PlexCatalogEntry | null {
  const ratingKey = String(value?.ratingKey || '')
  if (!ratingKey) return null
  const media: MediaRef = {
    kind,
    ids: plexGuidIds(value, parentShow),
    title: kind === 'series' && parentShow
      ? String(value?.grandparentTitle || parentShow?.title || '') || undefined
      : String(value?.title || '') || undefined,
    year: Number(parentShow?.year || value?.year) || undefined
  }
  if (kind === 'series' && parentShow) {
    media.season = Number(value?.parentIndex)
    media.episode = Number(value?.index)
    media.absoluteEpisode = Number(value?.absoluteIndex) || undefined
    media.episodeTitle = String(value?.title || '') || undefined
    media.videoId = `plex:${ratingKey}`
  }
  return {
    media,
    ratingKey,
    key: String(value?.key || `/library/metadata/${ratingKey}`),
    sectionId: String(section?.key || section?.uuid || ''),
    sectionName: String(section?.title || 'Plex library'),
    addedAt: asEpochMs(value?.addedAt),
    updatedAt: asEpochMs(value?.updatedAt || value?.lastViewedAt || value?.addedAt),
    lastViewedAt: asEpochMs(value?.lastViewedAt || value?.updatedAt),
    viewCount: Math.max(0, Number(value?.viewCount || 0)),
    viewOffset: Math.max(0, Number(value?.viewOffset || 0)),
    duration: Math.max(0, Number(value?.duration || 0))
  }
}

const plexCatalogCache = new WeakMap<object, { expiresAt: number; promise: Promise<PlexCatalog> }>()

async function loadPlexCatalog(connection: BridgeConnection, log?: BridgeLog): Promise<PlexCatalog> {
  if (connection.credentials.service !== 'plex') throw new Error('Expected Plex credentials.')
  const cached = plexCatalogCache.get(connection.credentials)
  if (cached && cached.expiresAt > Date.now()) return cached.promise

  const promise = (async () => {
    logTo(log, `Reading Plex libraries from ${connection.credentials.server.name}...`)
    const { data } = await plexRequest(connection, '/library/sections')
    const sections = plexRows(data).filter(section => ['movie', 'show'].includes(String(section?.type)))
    const movies: PlexCatalogEntry[] = []
    const shows: PlexCatalogEntry[] = []
    const episodes: PlexCatalogEntry[] = []

    await mapLimit(sections, 3, async section => {
      const path = `/library/sections/${encodeURIComponent(String(section.key))}/all`
      if (section.type === 'movie') {
        const rows = await plexGetAll(connection, path, { type: 1, includeGuids: 1 })
        for (const row of rows) {
          const entry = plexCatalogEntry(row, section, 'movie')
          if (entry) movies.push(entry)
        }
        return
      }

      const [showRows, episodeRows] = await Promise.all([
        plexGetAll(connection, path, { type: 2, includeGuids: 1 }),
        plexGetAll(connection, path, { type: 4, includeGuids: 1 })
      ])
      const showsByRatingKey = new Map<string, any>()
      for (const row of showRows) {
        showsByRatingKey.set(String(row.ratingKey), row)
        const entry = plexCatalogEntry(row, section, 'series')
        if (entry) shows.push(entry)
      }
      for (const row of episodeRows) {
        const parentShow = showsByRatingKey.get(String(row.grandparentRatingKey))
        const entry = plexCatalogEntry(row, section, 'series', parentShow || {
          ratingKey: row.grandparentRatingKey,
          guid: row.grandparentGuid,
          title: row.grandparentTitle,
          year: row.year
        })
        if (entry && Number.isInteger(entry.media.season) && Number.isInteger(entry.media.episode)) {
          episodes.push(entry)
        }
      }
    })
    logTo(log, `Indexed ${movies.length} Plex movies, ${shows.length} shows, and ${episodes.length} episodes.`)
    return { movies, shows, episodes }
  })()

  plexCatalogCache.set(connection.credentials, { expiresAt: Date.now() + 30_000, promise })
  try {
    return await promise
  } catch (error) {
    plexCatalogCache.delete(connection.credentials)
    throw error
  }
}

function plexCandidates(media: MediaRef, entries: readonly PlexCatalogEntry[]): PlexCatalogEntry[] {
  const aliases = new Set(mediaAliasKeys(media))
  if (aliases.size) {
    const exact = entries.filter(entry => mediaAliasKeys(entry.media).some(alias => aliases.has(alias)))
    if (exact.length) return exact
  }
  const title = normalizeTitle(media.title)
  const year = Number(media.year)
  if (!title) return []
  return entries.filter(entry => (
    normalizeTitle(entry.media.title) === title
    && (!Number.isInteger(year) || !entry.media.year || Number(entry.media.year) === year)
    && (['imdb', 'tmdb', 'tvdb'] as const).every(namespace => {
      const sourceId = String(media.ids[namespace] ?? '').trim().toLowerCase()
      const targetId = String(entry.media.ids[namespace] ?? '').trim().toLowerCase()
      return !sourceId || !targetId || sourceId === targetId
    })
  ))
}

function uniquePlexCandidate(media: MediaRef, entries: readonly PlexCatalogEntry[]): PlexCatalogEntry | null {
  const candidates = plexCandidates(media, entries)
  return candidates.length === 1 ? candidates[0] : null
}

async function plexTargetEpisodes(
  connection: BridgeConnection,
  media: MediaRef
): Promise<EpisodeRef[]> {
  const catalog = await loadPlexCatalog(connection)
  const show = uniquePlexCandidate(media, catalog.shows)
  if (!show) return []
  return catalog.episodes
    .filter(entry => plexCandidates(show.media, [{ ...show, media: entry.media }]).length > 0)
    .map(entry => ({
      season: Number(entry.media.season),
      episode: Number(entry.media.episode),
      absoluteEpisode: entry.media.absoluteEpisode,
      title: entry.media.episodeTitle,
      videoId: `plex:${entry.ratingKey}`
    }))
}

function plexEpisodeEntriesForShow(
  media: MediaRef,
  catalog: PlexCatalog
): PlexCatalogEntry[] {
  const show = uniquePlexCandidate(media, catalog.shows)
  if (!show) return []
  const showAliases = new Set(mediaAliasKeys(show.media))
  return catalog.episodes.filter(entry => (
    mediaAliasKeys(entry.media).some(alias => showAliases.has(alias))
  ))
}

function resolvePlexEntry(
  media: MediaRef,
  catalog: PlexCatalog,
  scope: 'history' | 'progress' | 'library'
): { entry: PlexCatalogEntry | null; issue?: BridgeIssue } {
  if (media.kind === 'movie') {
    const candidates = plexCandidates(media, catalog.movies)
    if (candidates.length === 1) return { entry: candidates[0] }
    return {
      entry: null,
      issue: {
        scope,
        status: candidates.length > 1 ? 'ambiguous' : 'unresolved',
        media,
        reason: candidates.length > 1
          ? 'Multiple Plex movies matched this title and ID set.'
          : 'This movie is not present in the selected Plex server library.'
      }
    }
  }
  if (scope === 'library' || !Number.isInteger(media.season) || !Number.isInteger(media.episode)) {
    const candidates = plexCandidates(media, catalog.shows)
    if (candidates.length === 1) return { entry: candidates[0] }
    return {
      entry: null,
      issue: {
        scope,
        status: candidates.length > 1 ? 'ambiguous' : 'unresolved',
        media,
        reason: candidates.length > 1
          ? 'Multiple Plex shows matched this title and ID set.'
          : 'This show is not present in the selected Plex server library.'
      }
    }
  }

  const episodes = plexEpisodeEntriesForShow(media, catalog)
  const requested: EpisodeRef = {
    season: Number(media.season),
    episode: Number(media.episode),
    absoluteEpisode: media.absoluteEpisode,
    title: media.episodeTitle,
    videoId: media.videoId
  }
  const targets = episodes.map(entry => ({
    season: Number(entry.media.season),
    episode: Number(entry.media.episode),
    absoluteEpisode: entry.media.absoluteEpisode,
    title: entry.media.episodeTitle,
    videoId: `plex:${entry.ratingKey}`
  }))
  const mapping = remapEpisode(requested, [requested], targets)
  if (mapping.status !== 'mapped') {
    return {
      entry: null,
      issue: { scope, status: mapping.status, media, reason: mapping.reason }
    }
  }
  const ratingKey = String(mapping.target.videoId || '').replace(/^plex:/, '')
  const entry = episodes.find(candidate => candidate.ratingKey === ratingKey) || null
  return entry
    ? { entry }
    : {
        entry: null,
        issue: { scope, status: 'unresolved', media, reason: 'The mapped Plex episode could not be resolved.' }
      }
}

async function pullPlex(options: PullOptions): Promise<PullResult> {
  const { connection, scopes, log } = options
  const catalog = await loadPlexCatalog(connection, log)
  const bundle = createEmptyBundle()
  const provenance = sourceOf(connection)

  if (scopes.history) {
    for (const entry of [...catalog.movies, ...catalog.episodes]) {
      if (entry.viewCount < 1) continue
      bundle.history.push({
        media: entry.media,
        watchedAt: entry.lastViewedAt || entry.updatedAt || entry.addedAt,
        playCount: entry.viewCount,
        source: provenance
      })
    }
  }

  if (scopes.progress) {
    for (const entry of [...catalog.movies, ...catalog.episodes]) {
      if (!entry.viewOffset || !entry.duration || entry.viewOffset >= entry.duration) continue
      bundle.progress.push({
        media: entry.media,
        positionMs: entry.viewOffset,
        durationMs: entry.duration,
        percentage: Math.min(100, entry.viewOffset / entry.duration * 100),
        updatedAt: entry.updatedAt || entry.lastViewedAt || entry.addedAt,
        source: provenance
      })
    }
  }

  if (scopes.library) {
    for (const entry of [...catalog.movies, ...catalog.shows]) {
      bundle.library.push({
        media: entry.media,
        addedAt: entry.addedAt,
        lists: [{
          ...provenance,
          kind: 'library',
          listId: entry.sectionId,
          name: entry.sectionName
        }],
        source: provenance
      })
    }
  }

  return { bundle: dedupeBundle(bundle), issues: [] }
}

async function pushPlex(options: PushOptions): Promise<PushResult> {
  const { connection, bundle, scopes, log } = options
  if (connection.credentials.service !== 'plex') throw new Error('Expected Plex credentials.')
  const catalog = await loadPlexCatalog(connection, log)
  const written: PushCounts = { history: 0, progress: 0, library: 0 }
  const skipped: PushCounts = { history: 0, progress: 0, library: 0 }
  const issues: BridgeIssue[] = []
  const confirmedScopes: BridgeScope[] = []

  if (scopes.history) {
    const outcomes = await mapLimit(
      collapseHistoryToWatchedState(bundle.history),
      LOCAL_SERVER_WRITE_CONCURRENCY,
      async record => {
        const resolved = resolvePlexEntry(record.media, catalog, 'history')
        if (!resolved.entry) return { written: false, issue: resolved.issue }
        try {
          await plexRequest(connection, '/:/scrobble', {
            identifier: 'com.plexapp.plugins.library',
            key: resolved.entry.ratingKey
          }, { method: 'PUT' })
          return { written: true }
        } catch (error: any) {
          return {
            written: false,
            issue: {
              scope: 'history' as const,
              status: 'warning' as const,
              media: record.media,
              reason: `Plex could not mark this item watched: ${errorDetail(error?.body, error?.message)}`
            }
          }
        }
      }
    )
    for (const outcome of outcomes) {
      if (outcome.written) written.history++
      else {
        skipped.history++
        if ('issue' in outcome && outcome.issue) issues.push(outcome.issue)
      }
    }
    confirmedScopes.push('history')
    logTo(log, `Marked ${written.history} Plex items watched.`)
  }

  if (scopes.progress) {
    const outcomes = await mapLimit(bundle.progress, LOCAL_SERVER_WRITE_CONCURRENCY, async record => {
      const resolved = resolvePlexEntry(record.media, catalog, 'progress')
      if (!resolved.entry) return { written: false, issue: resolved.issue }
      const absolute = absoluteProgress(record)
      const durationMs = absolute?.durationMs || resolved.entry.duration
      const percentage = progressPercentage(record)
      const positionMs = absolute?.positionMs || (durationMs && percentage
        ? Math.round(durationMs * percentage / 100)
        : 0)
      if (!durationMs || !positionMs) {
        return {
          written: false,
          issue: {
            scope: 'progress' as const,
            status: 'unresolved' as const,
            media: record.media,
            reason: 'Plex progress needs a valid position and duration.'
          }
        }
      }
      try {
        await plexRequest(connection, '/:/timeline', {
          key: resolved.entry.key,
          ratingKey: resolved.entry.ratingKey,
          state: 'stopped',
          time: Math.max(1, Math.min(Math.round(positionMs), Math.round(durationMs) - 1)),
          duration: Math.round(durationMs),
          updated: Math.floor(record.updatedAt / 1000),
          offline: 1
        }, {
          method: 'POST',
          headers: { 'X-Plex-Session-Identifier': createClientIdentifier() }
        })
        return { written: true }
      } catch (error: any) {
        return {
          written: false,
          issue: {
            scope: 'progress' as const,
            status: 'warning' as const,
            media: record.media,
            reason: `Plex could not update this resume point: ${errorDetail(error?.body, error?.message)}`
          }
        }
      }
    })
    for (const outcome of outcomes) {
      if (outcome.written) written.progress++
      else {
        skipped.progress++
        if ('issue' in outcome && outcome.issue) issues.push(outcome.issue)
      }
    }
    confirmedScopes.push('progress')
    logTo(log, `Updated ${written.progress} Plex resume points.`)
  }

  if (scopes.library && bundle.library.length) {
    skipped.library = bundle.library.length
    issues.push({
      scope: 'library',
      status: 'note',
      reason: 'Plex server libraries are read-only in Sync Bridge because adding a title requires adding its media files to the server.'
    })
  }

  plexCatalogCache.delete(connection.credentials)
  return { written, skipped, issues, confirmedScopes }
}

interface JellyfinCatalogEntry {
  media: MediaRef
  itemId: string
  addedAt: number
  updatedAt: number
  lastPlayedAt: number
  playCount: number
  played: boolean
  playbackPositionTicks: number
  runTimeTicks: number
  userData: Record<string, any>
}

interface JellyfinCatalog {
  movies: JellyfinCatalogEntry[]
  shows: JellyfinCatalogEntry[]
  episodes: JellyfinCatalogEntry[]
}

function jellyfinProviderIds(value: any, parent?: any): MediaIds {
  const identity = parent || value
  const raw = identity?.ProviderIds || identity?.providerIds || {}
  const normalized: Record<string, any> = {}
  for (const [key, id] of Object.entries(raw)) normalized[key.toLowerCase()] = id
  const ids = normalizeIds(normalized)
  const itemId = String(identity?.Id || identity?.id || '')
  if (itemId) ids.jellyfin = `item:${itemId}`
  return ids
}

function jellyfinCatalogEntry(
  value: any,
  kind: 'movie' | 'series',
  parent?: any
): JellyfinCatalogEntry | null {
  const itemId = String(value?.Id || value?.id || '')
  if (!itemId) return null
  const identity = parent || value
  const userData = value?.UserData || value?.userData || {}
  const type = String(value?.Type || value?.type || '').toLowerCase()
  const addedAt = asEpochMs(value?.DateCreated || value?.dateCreated)
  const lastPlayedAt = asEpochMs(userData?.LastPlayedDate || userData?.lastPlayedDate)
  const updatedAt = lastPlayedAt || asEpochMs(
    value?.DateLastSaved || value?.dateLastSaved || value?.DateCreated || value?.dateCreated
  )
  const media: MediaRef = {
    kind,
    ids: jellyfinProviderIds(value, parent),
    title: String(identity?.Name || identity?.name || value?.SeriesName || value?.seriesName || ''),
    year: Number(identity?.ProductionYear || identity?.productionYear) || undefined
  }
  if (type === 'episode') {
    media.season = Number(value?.ParentIndexNumber ?? value?.parentIndexNumber)
    media.episode = Number(value?.IndexNumber ?? value?.indexNumber)
    media.episodeTitle = String(value?.Name || value?.name || '') || undefined
    media.videoId = `jellyfin:${itemId}`
  }
  return {
    media,
    itemId,
    addedAt,
    updatedAt,
    lastPlayedAt,
    playCount: Math.max(0, Number(userData?.PlayCount ?? userData?.playCount) || 0),
    played: Boolean(userData?.Played ?? userData?.played),
    playbackPositionTicks: Math.max(
      0,
      Number(userData?.PlaybackPositionTicks ?? userData?.playbackPositionTicks) || 0
    ),
    runTimeTicks: Math.max(0, Number(value?.RunTimeTicks ?? value?.runTimeTicks) || 0),
    userData: { ...userData }
  }
}

const jellyfinCatalogCache = new WeakMap<object, {
  expiresAt: number
  promise: Promise<JellyfinCatalog>
}>()

async function loadJellyfinCatalog(
  connection: BridgeConnection,
  log?: BridgeLog
): Promise<JellyfinCatalog> {
  if (connection.credentials.service !== 'jellyfin') throw new Error('Expected Jellyfin credentials.')
  const cached = jellyfinCatalogCache.get(connection.credentials)
  if (cached && cached.expiresAt > Date.now()) return cached.promise

  const promise = (async () => {
    logTo(log, `Indexing the Jellyfin library on ${connection.credentials.serverName}...`)
    const rows = await jellyfinGetAll(connection, '/Items', {
      UserId: connection.credentials.userId,
      Recursive: true,
      IncludeItemTypes: 'Movie,Series,Episode',
      Fields: 'ProviderIds,DateCreated',
      ExcludeLocationTypes: 'Virtual',
      EnableUserData: true,
      EnableImages: false,
      CollapseBoxSetItems: false,
      EnableTotalRecordCount: true
    }, `/Users/${encodeURIComponent(connection.credentials.userId)}/Items`)
    const showsById = new Map<string, any>()
    for (const row of rows) {
      if (String(row?.Type || row?.type || '').toLowerCase() === 'series') {
        showsById.set(String(row?.Id || row?.id || ''), row)
      }
    }
    const movies: JellyfinCatalogEntry[] = []
    const shows: JellyfinCatalogEntry[] = []
    const episodes: JellyfinCatalogEntry[] = []
    for (const row of rows) {
      const type = String(row?.Type || row?.type || '').toLowerCase()
      if (type === 'movie') {
        const entry = jellyfinCatalogEntry(row, 'movie')
        if (entry) movies.push(entry)
      } else if (type === 'series') {
        const entry = jellyfinCatalogEntry(row, 'series')
        if (entry) shows.push(entry)
      } else if (type === 'episode') {
        const seriesId = String(row?.SeriesId || row?.seriesId || '')
        const parent = showsById.get(seriesId) || {
          Id: seriesId,
          Name: row?.SeriesName || row?.seriesName,
          ProductionYear: row?.ProductionYear || row?.productionYear
        }
        const entry = jellyfinCatalogEntry(row, 'series', parent)
        if (entry && Number.isInteger(entry.media.season) && Number.isInteger(entry.media.episode)) {
          episodes.push(entry)
        }
      }
    }
    logTo(log, `Indexed ${movies.length} Jellyfin movies, ${shows.length} shows, and ${episodes.length} episodes.`)
    return { movies, shows, episodes }
  })()

  jellyfinCatalogCache.set(connection.credentials, { expiresAt: Date.now() + 30_000, promise })
  try {
    return await promise
  } catch (error) {
    jellyfinCatalogCache.delete(connection.credentials)
    throw error
  }
}

function jellyfinCandidates(
  media: MediaRef,
  entries: readonly JellyfinCatalogEntry[]
): JellyfinCatalogEntry[] {
  const aliases = new Set(mediaAliasKeys(media))
  if (aliases.size) {
    const exact = entries.filter(entry => mediaAliasKeys(entry.media).some(alias => aliases.has(alias)))
    if (exact.length) return exact
  }
  const title = normalizeTitle(media.title)
  const year = Number(media.year)
  if (!title) return []
  return entries.filter(entry => (
    normalizeTitle(entry.media.title) === title
    && (!Number.isInteger(year) || !entry.media.year || Number(entry.media.year) === year)
    && (['imdb', 'tmdb', 'tvdb'] as const).every(namespace => {
      const sourceId = String(media.ids[namespace] ?? '').trim().toLowerCase()
      const targetId = String(entry.media.ids[namespace] ?? '').trim().toLowerCase()
      return !sourceId || !targetId || sourceId === targetId
    })
  ))
}

function uniqueJellyfinCandidate(
  media: MediaRef,
  entries: readonly JellyfinCatalogEntry[]
): JellyfinCatalogEntry | null {
  const candidates = jellyfinCandidates(media, entries)
  return candidates.length === 1 ? candidates[0] : null
}

function jellyfinEpisodeEntriesForShow(
  media: MediaRef,
  catalog: JellyfinCatalog
): JellyfinCatalogEntry[] {
  const show = uniqueJellyfinCandidate(media, catalog.shows)
  if (!show) return []
  const showAliases = new Set(mediaAliasKeys(show.media))
  return catalog.episodes.filter(entry => (
    mediaAliasKeys(entry.media).some(alias => showAliases.has(alias))
  ))
}

async function jellyfinTargetEpisodes(
  connection: BridgeConnection,
  media: MediaRef
): Promise<EpisodeRef[]> {
  const catalog = await loadJellyfinCatalog(connection)
  return jellyfinEpisodeEntriesForShow(media, catalog).map(entry => ({
    season: Number(entry.media.season),
    episode: Number(entry.media.episode),
    absoluteEpisode: entry.media.absoluteEpisode,
    title: entry.media.episodeTitle,
    videoId: `jellyfin:${entry.itemId}`
  }))
}

function resolveJellyfinEntry(
  media: MediaRef,
  catalog: JellyfinCatalog,
  scope: 'history' | 'progress' | 'library'
): { entry: JellyfinCatalogEntry | null; issue?: BridgeIssue } {
  if (media.kind === 'movie') {
    const candidates = jellyfinCandidates(media, catalog.movies)
    if (candidates.length === 1) return { entry: candidates[0] }
    return {
      entry: null,
      issue: {
        scope,
        status: candidates.length > 1 ? 'ambiguous' : 'unresolved',
        media,
        reason: candidates.length > 1
          ? 'Multiple Jellyfin movies matched this title and ID set.'
          : 'This movie is not present in the connected Jellyfin server library.'
      }
    }
  }
  if (scope === 'library' || !Number.isInteger(media.season) || !Number.isInteger(media.episode)) {
    const candidates = jellyfinCandidates(media, catalog.shows)
    if (candidates.length === 1) return { entry: candidates[0] }
    return {
      entry: null,
      issue: {
        scope,
        status: candidates.length > 1 ? 'ambiguous' : 'unresolved',
        media,
        reason: candidates.length > 1
          ? 'Multiple Jellyfin shows matched this title and ID set.'
          : 'This show is not present in the connected Jellyfin server library.'
      }
    }
  }

  const episodes = jellyfinEpisodeEntriesForShow(media, catalog)
  const requested: EpisodeRef = {
    season: Number(media.season),
    episode: Number(media.episode),
    absoluteEpisode: media.absoluteEpisode,
    title: media.episodeTitle,
    videoId: media.videoId
  }
  const targets = episodes.map(entry => ({
    season: Number(entry.media.season),
    episode: Number(entry.media.episode),
    absoluteEpisode: entry.media.absoluteEpisode,
    title: entry.media.episodeTitle,
    videoId: `jellyfin:${entry.itemId}`
  }))
  const mapping = remapEpisode(requested, [requested], targets)
  if (mapping.status !== 'mapped') {
    return {
      entry: null,
      issue: { scope, status: mapping.status, media, reason: mapping.reason }
    }
  }
  const itemId = String(mapping.target.videoId || '').replace(/^jellyfin:/, '')
  const entry = episodes.find(candidate => candidate.itemId === itemId) || null
  return entry
    ? { entry }
    : {
        entry: null,
        issue: { scope, status: 'unresolved', media, reason: 'The mapped Jellyfin episode could not be resolved.' }
      }
}

async function pullJellyfin(options: PullOptions): Promise<PullResult> {
  const { connection, scopes, log } = options
  if (connection.credentials.service !== 'jellyfin') throw new Error('Expected Jellyfin credentials.')
  const catalog = await loadJellyfinCatalog(connection, log)
  const bundle = createEmptyBundle()
  const provenance = sourceOf(connection)

  if (scopes.history) {
    for (const entry of [...catalog.movies, ...catalog.episodes]) {
      if (!entry.played && entry.playCount < 1) continue
      bundle.history.push({
        media: entry.media,
        watchedAt: entry.lastPlayedAt || entry.updatedAt || entry.addedAt,
        playCount: Math.max(1, entry.playCount),
        source: provenance
      })
    }
  }

  if (scopes.progress) {
    for (const entry of [...catalog.movies, ...catalog.episodes]) {
      if (
        !entry.playbackPositionTicks
        || !entry.runTimeTicks
        || entry.playbackPositionTicks >= entry.runTimeTicks
      ) continue
      const positionMs = entry.playbackPositionTicks / 10_000
      const durationMs = entry.runTimeTicks / 10_000
      bundle.progress.push({
        media: entry.media,
        positionMs,
        durationMs,
        percentage: Math.min(100, positionMs / durationMs * 100),
        updatedAt: entry.updatedAt || entry.addedAt,
        source: provenance
      })
    }
  }

  if (scopes.library) {
    for (const entry of [...catalog.movies, ...catalog.shows]) {
      bundle.library.push({
        media: entry.media,
        addedAt: entry.addedAt,
        lists: [{
          ...provenance,
          kind: 'library',
          listId: connection.credentials.serverId,
          name: connection.credentials.serverName
        }],
        source: provenance
      })
    }
  }

  return { bundle: dedupeBundle(bundle), issues: [] }
}

async function pushJellyfin(options: PushOptions): Promise<PushResult> {
  const { connection, bundle, scopes, log } = options
  if (connection.credentials.service !== 'jellyfin') throw new Error('Expected Jellyfin credentials.')
  const credentials = connection.credentials
  const catalog = await loadJellyfinCatalog(connection, log)
  const written: PushCounts = { history: 0, progress: 0, library: 0 }
  const skipped: PushCounts = { history: 0, progress: 0, library: 0 }
  const issues: BridgeIssue[] = []
  const confirmedScopes: BridgeScope[] = []

  if (scopes.history) {
    const outcomes = await mapLimit(
      collapseHistoryToWatchedState(bundle.history),
      LOCAL_SERVER_WRITE_CONCURRENCY,
      async record => {
        const resolved = resolveJellyfinEntry(record.media, catalog, 'history')
        if (!resolved.entry) return { written: false, issue: resolved.issue }
        try {
          await jellyfinRequestWithLegacy(
            connection,
            `/UserPlayedItems/${encodeURIComponent(resolved.entry.itemId)}`,
            `/Users/${encodeURIComponent(credentials.userId)}/PlayedItems/${encodeURIComponent(resolved.entry.itemId)}`,
            {
              userId: credentials.userId,
              datePlayed: new Date(record.watchedAt || Date.now()).toISOString()
            },
            { method: 'POST' }
          )
          return { written: true }
        } catch (error: any) {
          return {
            written: false,
            issue: {
              scope: 'history' as const,
              status: 'warning' as const,
              media: record.media,
              reason: `Jellyfin could not mark this item watched: ${errorDetail(error?.body, error?.message)}`
            }
          }
        }
      }
    )
    for (const outcome of outcomes) {
      if (outcome.written) written.history++
      else {
        skipped.history++
        if ('issue' in outcome && outcome.issue) issues.push(outcome.issue)
      }
    }
    confirmedScopes.push('history')
    logTo(log, `Marked ${written.history} Jellyfin items watched.`)
  }

  if (scopes.progress) {
    const outcomes = await mapLimit(bundle.progress, LOCAL_SERVER_WRITE_CONCURRENCY, async record => {
      const resolved = resolveJellyfinEntry(record.media, catalog, 'progress')
      if (!resolved.entry) return { written: false, issue: resolved.issue }
      const absolute = absoluteProgress(record)
      const durationMs = absolute?.durationMs || resolved.entry.runTimeTicks / 10_000
      const percentage = progressPercentage(record)
      const positionMs = absolute?.positionMs || (durationMs && percentage
        ? Math.round(durationMs * percentage / 100)
        : 0)
      if (!durationMs || !positionMs) {
        return {
          written: false,
          issue: {
            scope: 'progress' as const,
            status: 'unresolved' as const,
            media: record.media,
            reason: 'Jellyfin progress needs a valid position and duration.'
          }
        }
      }
      const clampedPositionMs = Math.max(1, Math.min(positionMs, durationMs - 1))
      const userData = resolved.entry.userData
      const body = {
        PlaybackPositionTicks: Math.round(clampedPositionMs * 10_000),
        PlayedPercentage: Math.min(100, clampedPositionMs / durationMs * 100),
        PlayCount: Math.max(0, Number(userData?.PlayCount ?? userData?.playCount) || 0),
        IsFavorite: Boolean(userData?.IsFavorite ?? userData?.isFavorite),
        Likes: userData?.Likes ?? userData?.likes,
        LastPlayedDate: new Date(record.updatedAt || Date.now()).toISOString(),
        Played: Boolean(userData?.Played ?? userData?.played),
        Key: userData?.Key ?? userData?.key,
        ItemId: resolved.entry.itemId
      }
      try {
        await jellyfinRequestWithLegacy(
          connection,
          `/UserItems/${encodeURIComponent(resolved.entry.itemId)}/UserData`,
          `/Users/${encodeURIComponent(credentials.userId)}/Items/${encodeURIComponent(resolved.entry.itemId)}/UserData`,
          { userId: credentials.userId },
          { method: 'POST', body: JSON.stringify(body) }
        )
        return { written: true }
      } catch (error: any) {
        return {
          written: false,
          issue: {
            scope: 'progress' as const,
            status: 'warning' as const,
            media: record.media,
            reason: `Jellyfin could not update this resume point: ${errorDetail(error?.body, error?.message)}`
          }
        }
      }
    })
    for (const outcome of outcomes) {
      if (outcome.written) written.progress++
      else {
        skipped.progress++
        if ('issue' in outcome && outcome.issue) issues.push(outcome.issue)
      }
    }
    confirmedScopes.push('progress')
    logTo(log, `Updated ${written.progress} Jellyfin resume points.`)
  }

  if (scopes.library && bundle.library.length) {
    skipped.library = bundle.library.length
    issues.push({
      scope: 'library',
      status: 'note',
      reason: 'Jellyfin server libraries are read-only in Sync Bridge because adding a title requires adding its media files to the server.'
    })
  }

  jellyfinCatalogCache.delete(connection.credentials)
  return { written, skipped, issues, confirmedScopes }
}

function sourceGenres(value: any, extras: readonly string[] = []): string[] | undefined {
  const genres = [
    ...(Array.isArray(value?.genres) ? value.genres : []),
    ...extras
  ].filter((value): value is string => typeof value === 'string')
    .map(value => value.trim())
    .filter(Boolean)
  if (!genres.length) return undefined
  return [...new Map(genres.map(genre => [genre.toLowerCase(), genre])).values()]
}

function publicPosterUrl(value: unknown): string | undefined {
  const raw = String(value || '').trim()
  if (!raw) return undefined
  const normalized = raw.startsWith('//') ? `https:${raw}` : raw
  if (!/^https:\/\//i.test(normalized)) return undefined
  try {
    const url = new URL(normalized)
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

function traktPosterUrl(value: any): string | undefined {
  const posters = Array.isArray(value?.images?.poster)
    ? value.images.poster
    : [value?.images?.poster]
  for (const poster of posters) {
    const raw = String(poster || '').trim()
    if (!raw || (raw.startsWith('/') && !raw.startsWith('//')) || raw.includes('\\')) continue
    const normalized = /^https:\/\//i.test(raw)
      ? raw
      : raw.startsWith('//')
        ? `https:${raw}`
        : /^[a-z][a-z0-9+.-]*:/i.test(raw)
          ? ''
          : `https://${raw}`
    const posterUrl = publicPosterUrl(normalized)
    if (posterUrl) return posterUrl
  }
  return undefined
}

function mediaFromTrakt(value: any, kind: 'movie' | 'series'): MediaRef {
  return {
    kind,
    ids: normalizeIds(value?.ids, 'trakt'),
    title: value?.title,
    year: Number(value?.year) || undefined,
    genres: sourceGenres(value)
  }
}

function traktEpisodeVideoId(value: any): string | undefined {
  const traktId = Number(value?.ids?.trakt)
  if (Number.isSafeInteger(traktId) && traktId > 0) return `trakt:${traktId}`
  const tvdbId = Number(value?.ids?.tvdb)
  if (Number.isSafeInteger(tvdbId) && tvdbId > 0) return `tvdb:${tvdbId}`
  const tmdbId = Number(value?.ids?.tmdb)
  if (Number.isSafeInteger(tmdbId) && tmdbId > 0) return `tmdb:${tmdbId}`
  return undefined
}

async function pullTrakt(options: PullOptions): Promise<PullResult> {
  const { connection, scopes, log } = options
  if (connection.credentials.service === 'trakt' && connection.credentials.archiveBundle) {
    logTo(log, 'Reading watch data from the local Trakt export ZIP...')
    const archive = connection.credentials.archiveBundle
    const firstScope = (['history', 'progress', 'library'] as const).find(scope => scopes[scope])
    return {
      bundle: dedupeBundle({
        history: scopes.history ? archive.history : [],
        progress: scopes.progress ? archive.progress : [],
        library: scopes.library ? archive.library : []
      }),
      issues: firstScope
        ? (connection.credentials.archiveWarnings || []).map(reason => ({
            scope: firstScope,
            status: 'note' as const,
            reason
          }))
        : []
    }
  }
  const bundle = createEmptyBundle()
  const issues: BridgeIssue[] = []
  const provenance = sourceOf(connection)

  const historyRequest = scopes.history
    ? (logTo(log, 'Reading Trakt paginated movie and episode history...'),
      traktGetAll(connection, '/users/me/history', { extended: 'full' }))
    : Promise.resolve<any[] | null>(null)
  const progressRequest = scopes.progress
    ? (logTo(log, 'Reading Trakt playback progress...'),
      traktGetAll(connection, '/sync/playback', { extended: 'full' }))
    : Promise.resolve<any[] | null>(null)
  const libraryRequest = scopes.library
    ? (logTo(log, 'Reading Trakt watchlist and collection...'),
      Promise.all([
        traktGetAll(connection, '/sync/watchlist/movies', { extended: 'full,images' }),
        traktGetAll(connection, '/sync/watchlist/shows', { extended: 'full,images' }),
        traktGetAll(connection, '/sync/collection/movies', { extended: 'full,images' }),
        traktGetAll(connection, '/sync/collection/shows', { extended: 'full,images' })
      ]))
    : Promise.resolve<null>(null)

  const [historyRows, progressRows, libraryRows] = await Promise.all([
    historyRequest,
    progressRequest,
    libraryRequest
  ])

  if (historyRows) {
    let invalidRows = 0
    for (const item of historyRows) {
      if ((item.type === 'movie' || item.movie) && item.movie) {
        bundle.history.push({
          media: mediaFromTrakt(item.movie, 'movie'),
          watchedAt: asEpochMs(item.watched_at),
          eventId: typeof item.id === 'string' || typeof item.id === 'number' ? item.id : undefined,
          playCount: 1,
          source: provenance
        })
        continue
      }

      if ((item.type === 'episode' || item.episode) && item.episode && item.show) {
        const season = Number(item.episode.season)
        const episode = Number(item.episode.number)
        if (!Number.isInteger(season) || season < 0 || !Number.isInteger(episode) || episode < 1) {
          invalidRows++
          continue
        }
        bundle.history.push({
          media: {
            ...mediaFromTrakt(item.show, 'series'),
            season,
            episode,
            absoluteEpisode: Number(item.episode.number_abs) || undefined,
            episodeTitle: item.episode.title,
            videoId: traktEpisodeVideoId(item.episode)
          },
          watchedAt: asEpochMs(item.watched_at),
          eventId: typeof item.id === 'string' || typeof item.id === 'number' ? item.id : undefined,
          playCount: 1,
          source: provenance
        })
        continue
      }

      invalidRows++
    }
    if (invalidRows) {
      issues.push({
        scope: 'history',
        status: 'warning',
        reason: `Skipped ${invalidRows} Trakt history row${invalidRows === 1 ? '' : 's'} that did not include a movie or a parent show with valid episode coordinates.`
      })
    }
  }

  if (progressRows) {
    for (const item of progressRows) {
      const percentage = positiveNumber(item.progress)
      if (!percentage) continue
      const isMovie = item.type === 'movie' || Boolean(item.movie)
      const media = mediaFromTrakt(isMovie ? item.movie : item.show, isMovie ? 'movie' : 'series')
      if (!isMovie) {
        media.season = Number(item.episode?.season)
        media.episode = Number(item.episode?.number)
        media.absoluteEpisode = Number(item.episode?.number_abs) || undefined
        media.episodeTitle = item.episode?.title
        media.videoId = traktEpisodeVideoId(item.episode)
      }
      const runtimeMinutes = positiveNumber(item.movie?.runtime || item.episode?.runtime)
      const normalizedPercentage = Math.min(100, percentage)
      const updatedAt = asEpochMs(item.paused_at || item.updated_at)
      if (runtimeMinutes) {
        const durationMs = runtimeMinutes * 60_000
        bundle.progress.push({
          media,
          positionMs: Math.round(durationMs * normalizedPercentage / 100),
          durationMs,
          percentage: normalizedPercentage,
          updatedAt,
          source: provenance
        })
      } else {
        bundle.progress.push({
          media,
          percentage: normalizedPercentage,
          updatedAt,
          source: provenance
        })
      }
    }
  }

  if (libraryRows) {
    const [watchlistMovies, watchlistShows, collectionMovies, collectionShows] = libraryRows
    const addRows = (rows: any[], kind: 'movie' | 'series', listKind: 'watchlist' | 'collection') => {
      for (const item of rows) {
        const subject = kind === 'movie' ? item.movie : item.show
        const media = mediaFromTrakt(subject, kind)
        const posterUrl = traktPosterUrl(subject)
        bundle.library.push({
          media,
          addedAt: asEpochMs(item.listed_at || item.collected_at || item.updated_at),
          lists: [{ ...provenance, kind: listKind }],
          source: provenance,
          ...(posterUrl ? { posterUrl } : {})
        })
      }
    }
    addRows(watchlistMovies, 'movie', 'watchlist')
    addRows(watchlistShows, 'series', 'watchlist')
    addRows(collectionMovies, 'movie', 'collection')
    addRows(collectionShows, 'series', 'collection')
  }

  return { bundle: dedupeBundle(bundle), issues }
}

function groupTraktHistory(records: readonly HistoryRecord[]) {
  const movies: any[] = []
  const shows = new Map<string, { ids: Record<string, any>; seasons: Map<number, any> }>()
  const issues: BridgeIssue[] = []
  for (const record of records) {
    const ids = traktWriteIds(record.media)
    if (!ids) {
      issues.push({ scope: 'history', status: 'unresolved', media: record.media, reason: 'Trakt needs a Trakt, IMDb, TMDB, TVDB, or slug ID.' })
      continue
    }
    if (record.media.kind === 'movie') {
      movies.push({ ids, watched_at: new Date(record.watchedAt).toISOString() })
      continue
    }
    if (!Number.isInteger(record.media.season) || !Number.isInteger(record.media.episode)) {
      issues.push({ scope: 'history', status: 'unresolved', media: record.media, reason: 'The episode has no deterministic season and episode number.' })
      continue
    }
    const key = JSON.stringify(ids)
    if (!shows.has(key)) shows.set(key, { ids, seasons: new Map() })
    const show = shows.get(key)!
    const seasonNumber = Number(record.media.season)
    if (!show.seasons.has(seasonNumber)) show.seasons.set(seasonNumber, { number: seasonNumber, episodes: [] })
    show.seasons.get(seasonNumber).episodes.push({
      number: Number(record.media.episode),
      watched_at: new Date(record.watchedAt).toISOString()
    })
  }
  return {
    movies,
    shows: [...shows.values()].map(show => ({ ids: show.ids, seasons: [...show.seasons.values()] })),
    issues
  }
}

function traktHistoryPayloadCount(payload: { movies?: any[]; shows?: any[] }): number {
  return (payload.movies?.length || 0) + (payload.shows || []).reduce((showCount: number, show: any) => (
    showCount + (show.seasons || []).reduce((seasonCount: number, season: any) => (
      seasonCount + (season.episodes?.length || 0)
    ), 0)
  ), 0)
}

function traktHistoryResponseCount(data: any): number | null {
  const counts = [
    data?.added?.movies,
    data?.added?.episodes,
    data?.updated?.movies,
    data?.updated?.episodes
  ]
  if (
    !data?.not_found
    || counts.some(value => !Number.isInteger(value) || value < 0)
  ) return null
  return counts.reduce((total, value) => total + Number(value), 0)
}

async function pushTrakt(options: PushOptions): Promise<PushResult> {
  const { connection, bundle, scopes, log } = options
  const issues: BridgeIssue[] = []
  const written: PushCounts = { history: 0, progress: 0, library: 0 }
  const skipped: Partial<PushCounts> = {}
  const confirmedScopes: BridgeScope[] = []
  let completedResumePoints = 0

  if (scopes.history && bundle.history.length) {
    const grouped = groupTraktHistory(bundle.history)
    issues.push(...grouped.issues)
    if (grouped.issues.length) skipped.history = grouped.issues.length
    const payloads = [
      ...chunk(grouped.movies, 100).map(movies => ({ movies })),
      ...chunk(grouped.shows, 50).map(shows => ({ shows }))
    ]
    let responsesComplete = true
    let notFound = 0
    for (const payload of payloads) {
      const { data } = await traktRequest(connection, '/sync/history', {}, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      const submitted = traktHistoryPayloadCount(payload)
      const confirmed = traktHistoryResponseCount(data)
      if (confirmed === null || confirmed > submitted) {
        // Retain the destination-reread fallback for legacy or malformed
        // responses that do not account for every submitted record.
        responsesComplete = false
        written.history += submitted
      } else {
        written.history += confirmed
        notFound += submitted - confirmed
      }
      logTo(log, `Added ${written.history} Trakt history records.`)
    }
    if (notFound) {
      skipped.history = (skipped.history || 0) + notFound
      issues.push({
        scope: 'history',
        status: 'unresolved',
        reason: `Trakt could not match ${notFound} submitted history record${notFound === 1 ? '' : 's'}.`
      })
    }
    if (responsesComplete) confirmedScopes.push('history')
  }

  if (scopes.progress && bundle.progress.length) {
    for (const record of bundle.progress) {
      const percentage = progressPercentage(record)
      if (!percentage) {
        issues.push({ scope: 'progress', status: 'unresolved', media: record.media, reason: 'Trakt progress needs a valid percentage or absolute position.' })
        continue
      }
      if (percentage >= 80) {
        // Trakt treats 80% and above as completed and no longer accepts it as
        // playback state. Do not call /scrobble/stop because that would turn a
        // progress-only transfer into a new watch-history event.
        completedResumePoints++
        continue
      }
      const payload: any = {
        // /scrobble/stop returns a paused playback record from 1% through 79%.
        // Cap after rounding so a 79.x% source never crosses into a scrobble.
        progress: Math.max(1, Math.min(TRAKT_MAX_RESUME_PROGRESS, Math.round(percentage))),
        app_version: '2.0',
        app_date: new Date(record.updatedAt).toISOString().slice(0, 10)
      }
      if (record.media.kind === 'movie') {
        const ids = traktWriteIds(record.media)
        if (!ids) {
          issues.push({ scope: 'progress', status: 'unresolved', media: record.media, reason: 'Trakt movie progress needs a supported external ID.' })
          continue
        }
        payload.movie = { title: record.media.title, year: record.media.year, ids }
      } else if (Number.isInteger(record.media.season) && Number.isInteger(record.media.episode)) {
        const requested: EpisodeRef = {
          season: Number(record.media.season),
          episode: Number(record.media.episode),
          absoluteEpisode: record.media.absoluteEpisode,
          title: record.media.episodeTitle,
          videoId: record.media.videoId
        }
        const mapping = remapEpisode(
          requested,
          [requested],
          await traktTargetEpisodes(connection, record.media)
        )
        if (mapping.status !== 'mapped') {
          issues.push({
            scope: 'progress',
            status: mapping.status,
            media: record.media,
            reason: mapping.reason
          })
          continue
        }
        const ids = traktEpisodeWriteIds(mapping.target.videoId)
        if (!ids) {
          issues.push({
            scope: 'progress',
            status: 'unresolved',
            media: record.media,
            reason: 'The mapped Trakt episode has no Trakt or TVDB episode ID for scrobbling.'
          })
          continue
        }
        payload.episode = { ids }
      } else {
        issues.push({ scope: 'progress', status: 'unresolved', media: record.media, reason: 'The Trakt episode progress record has no season and episode number.' })
        continue
      }
      try {
        await traktRequest(connection, '/scrobble/stop', {}, { method: 'POST', body: JSON.stringify(payload) })
        written.progress++
      } catch (error: any) {
        // Validation failures are specific to this media record. Keep writing
        // the rest of the transfer instead of failing after earlier scopes
        // have already committed successfully.
        if (error?.status !== 422) throw error
        issues.push({
          scope: 'progress',
          status: 'unresolved',
          media: record.media,
          reason: `Trakt rejected this resume point: ${errorDetail(error.body, error.message)}`
        })
      }
    }
    if (completedResumePoints) {
      skipped.progress = (skipped.progress || 0) + completedResumePoints
      issues.push({
        scope: 'progress',
        status: 'note',
        reason: 'Trakt cannot store resume points at 80% or higher; it treats them as watched. Transfer watch history to preserve the completed state.'
      })
    }
    logTo(log, `Updated ${written.progress} Trakt resume points.`)
  }

  if (scopes.library && bundle.library.length) {
    const lists = {
      watchlist: { movies: [] as any[], shows: [] as any[] },
      collection: { movies: [] as any[], shows: [] as any[] }
    }
    for (const record of bundle.library) {
      const ids = traktWriteIds(record.media)
      if (!ids) {
        issues.push({ scope: 'library', status: 'unresolved', media: record.media, reason: 'Trakt needs a supported external ID for this saved title.' })
        continue
      }
      const item = { title: record.media.title, year: record.media.year, ids }
      const listKinds = new Set(record.lists.map(list => list.kind))
      const destinations = [
        ...(listKinds.has('watchlist') ? ['watchlist'] as const : []),
        ...(listKinds.has('collection') ? ['collection'] as const : [])
      ]
      if (!destinations.length) destinations.push('watchlist')
      for (const destination of destinations) {
        ;(record.media.kind === 'movie'
          ? lists[destination].movies
          : lists[destination].shows
        ).push(item)
      }
    }
    for (const destination of ['watchlist', 'collection'] as const) {
      const path = `/sync/${destination}`
      for (const movieBatch of chunk(lists[destination].movies, 100)) {
        await traktRequest(connection, path, {}, { method: 'POST', body: JSON.stringify({ movies: movieBatch }) })
        written.library += movieBatch.length
      }
      for (const showBatch of chunk(lists[destination].shows, 100)) {
        await traktRequest(connection, path, {}, { method: 'POST', body: JSON.stringify({ shows: showBatch }) })
        written.library += showBatch.length
      }
    }
    logTo(log, `Saved ${written.library} Trakt watchlist or collection entries.`)
  }

  return {
    written,
    issues,
    skipped,
    confirmedScopes
  }
}

async function pullNuvio(options: PullOptions): Promise<PullResult> {
  const { connection, scopes, log } = options
  const profileId = Number(connection.profileId)
  if (!Number.isInteger(profileId) || profileId < 1) throw new Error('Choose a Nuvio profile.')
  const bundle = createEmptyBundle()
  const issues: BridgeIssue[] = []
  const provenance = sourceOf(connection)

  const historyRequest = scopes.history ? (async () => {
    logTo(log, 'Reading Nuvio watched items...')
    let rejected = 0
    for (let page = 1; ; page++) {
      const rows = await nuvioRpc(connection, 'sync_pull_watched_items', {
        p_profile_id: profileId,
        p_page: page,
        p_page_size: NUVIO_WATCHED_PAGE_SIZE
      })
      const batch = Array.isArray(rows) ? rows : []
      for (const item of batch) {
        const contentId = String(item.content_id ?? '').trim()
          || nuvioVideoContentId(item.video_id)
          || ''
        const season = item.season === null || item.season === undefined || item.season === ''
          ? undefined
          : Number(item.season)
        const episode = item.episode === null || item.episode === undefined || item.episode === ''
          ? undefined
          : Number(item.episode)
        const watchedAt = nuvioWatchedAt(item.watched_at)
        const media: MediaRef = {
          kind: item.content_type === 'movie' ? 'movie' : 'series',
          ids: parseNuvioContentId(contentId),
          title: item.title,
          season,
          episode,
          videoId: item.video_id || undefined
        }
        const explicitZeroMarker = watchedAt === 0
          && item.watched_at !== null
          && item.watched_at !== undefined
          && String(item.watched_at).trim() !== ''
          && Number(item.watched_at) === 0
          && (media.kind === 'movie' || (season === undefined && episode === undefined))
        const invalidReason = !contentId
          ? 'Nuvio returned a watched record without a content ID.'
          : watchedAt <= 0 && !explicitZeroMarker
            ? 'Nuvio returned a watched record without a valid watched timestamp.'
            : ''
        if (invalidReason) {
          rejected++
          issues.push({
            scope: 'history',
            status: 'unresolved',
            media,
            code: 'source_record_invalid',
            reason: invalidReason,
            evidence: {
              aliases: [
                ...(contentId ? [`nuvio:content_id:${contentId}`] : []),
                ...(item.watched_at !== null && item.watched_at !== undefined
                  ? [`nuvio:watched_at:${String(item.watched_at)}`]
                  : [])
              ]
            }
          })
          continue
        }
        bundle.history.push({ media, watchedAt, source: provenance })
      }
      if (batch.length < NUVIO_WATCHED_PAGE_SIZE) break
    }
    if (rejected) logTo(log, `Ignored ${rejected} invalid Nuvio watched ${rejected === 1 ? 'record' : 'records'}.`)
  })() : Promise.resolve()

  const progressRequest = scopes.progress ? (async () => {
    logTo(log, 'Reading Nuvio resume points...')
    const rows = await nuvioRpc(connection, 'sync_pull_watch_progress', {
      p_profile_id: profileId
    })
    const progressRows = Array.isArray(rows) ? rows : []
    for (const item of progressRows) {
      const durationMs = positiveNumber(item.duration)
      const positionMs = positiveNumber(item.position)
      if (!durationMs || !positionMs) continue
      const contentId = String(item.content_id ?? '').trim()
        || nuvioVideoContentId(item.video_id)
        || ''
      if (!contentId) {
        issues.push({
          scope: 'progress',
          status: 'unresolved',
          code: 'source_record_invalid',
          reason: 'Nuvio returned a resume point without a content ID.',
          evidence: {
            aliases: item.video_id ? [`nuvio:video_id:${String(item.video_id)}`] : []
          }
        })
        continue
      }
      bundle.progress.push({
        media: {
          kind: item.content_type === 'movie' ? 'movie' : 'series',
          ids: parseNuvioContentId(contentId),
          title: item.title,
          season: item.season === null || item.season === undefined || item.season === ''
            ? undefined
            : Number(item.season),
          episode: item.episode === null || item.episode === undefined || item.episode === ''
            ? undefined
            : Number(item.episode),
          videoId: item.video_id || undefined
        },
        positionMs,
        durationMs,
        updatedAt: asEpochMs(item.last_watched),
        source: provenance
      })
    }
  })() : Promise.resolve()

  const libraryRequest = scopes.library ? (async () => {
    logTo(log, 'Reading Nuvio library...')
    for (let offset = 0; ; offset += NUVIO_LIBRARY_PAGE_SIZE) {
      const rows = await nuvioRpc(connection, 'sync_pull_library', {
        p_profile_id: profileId,
        p_limit: NUVIO_LIBRARY_PAGE_SIZE,
        p_offset: offset
      })
      const batch = Array.isArray(rows) ? rows : []
      for (const item of batch) {
        const media: MediaRef = {
          kind: item.content_type === 'movie' ? 'movie' : 'series',
          ids: parseNuvioContentId(item.content_id),
          title: item.name,
          year: Number(String(item.release_info || '').slice(0, 4)) || undefined
        }
        const posterUrl = publicPosterUrl(item.poster)
        bundle.library.push({
          media,
          addedAt: asEpochMs(item.added_at),
          lists: [{ ...provenance, kind: 'library' }],
          source: provenance,
          ...(posterUrl ? { posterUrl } : {})
        })
      }
      if (batch.length < NUVIO_LIBRARY_PAGE_SIZE) break
    }
  })() : Promise.resolve()

  await Promise.all([historyRequest, progressRequest, libraryRequest])

  const duplicateAliases = new Set<string>()
  const aliasCounts = new Map<string, number>()
  for (const record of bundle.library) {
    for (const alias of mediaAliasKeys(record.media)) {
      aliasCounts.set(alias, (aliasCounts.get(alias) || 0) + 1)
    }
  }
  for (const [alias, count] of aliasCounts) {
    if (count > 1) duplicateAliases.add(alias)
  }
  const duplicates = duplicateAliases.size
    ? bundle.library
        .filter(record => mediaAliasKeys(record.media).some(alias => duplicateAliases.has(alias)))
        .map(record => ({
          scope: 'library' as const,
          aliases: mediaAliasKeys(record.media).filter(alias => duplicateAliases.has(alias)),
          media: record.media
        }))
    : undefined

  return { bundle: dedupeBundle(bundle), issues, duplicates }
}

interface NuvioLibraryImport {
  item: Record<string, any>
  media: MediaRef
}

interface BridgeMetadataResult {
  content_id: string | number
  tmdbId?: string | number | null
  imdbId?: string | null
  runtimeMs?: number | null
  retryable?: boolean
}

function isLikelyAnimeMedia(media: MediaRef): boolean {
  if (kitsuContentId(media)) return true
  const externalNamespaces = Object.keys(media.ids.external || {})
  if (externalNamespaces.some(namespace => (
    ['kitsu', 'mal', 'anilist', 'anidb'].includes(namespace.toLowerCase())
  ))) return true
  return (media.genres || []).some(genre => {
    const normalized = normalizeTitle(genre)
    return normalized === 'animation' || normalized === 'anime'
  })
}

function withResolvedExternalIds(
  media: MediaRef,
  metadata?: BridgeMetadataResult
): MediaRef {
  const ids = { ...media.ids }
  const imdbId = String(metadata?.imdbId || '').trim().toLowerCase()
  const existingImdbId = String(ids.imdb || '').trim().toLowerCase()
  if (!/^tt\d+$/.test(existingImdbId) && /^tt\d+$/.test(imdbId)) ids.imdb = imdbId
  const tmdbId = String(metadata?.tmdbId || '').trim()
  const existingTmdbId = String(ids.tmdb || '').trim()
  if (!/^[1-9]\d*$/.test(existingTmdbId) && /^[1-9]\d*$/.test(tmdbId)) {
    const numeric = Number(tmdbId)
    ids.tmdb = Number.isSafeInteger(numeric) ? numeric : tmdbId
  }
  return { ...media, ids }
}

function alternateNuvioContentIds(
  media: MediaRef,
  preferredId: string
): string[] {
  return nuvioContentIds(media)
    .filter(contentId => contentId !== preferredId)
}

async function fetchBridgeMetadataChunk(
  items: readonly Record<string, any>[],
  attempt = 0
): Promise<BridgeMetadataResult[]> {
  try {
    const { data } = await requestBridgeJson<{ results?: BridgeMetadataResult[] }>(
      '/api/trakt/enrich-metadata',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
        timeoutMs: BRIDGE_METADATA_REQUEST_TIMEOUT_MS,
        timeoutMessage: 'Bridge TMDB metadata lookup did not finish before its deadline.'
      }
    )
    const results = Array.isArray(data?.results) ? data.results : []
    const retryItems = items.filter((_, index) => results[index]?.retryable)
    if (retryItems.length && attempt < 1) {
      await sleep(500)
      return [...results, ...await fetchBridgeMetadataChunk(retryItems, attempt + 1)]
    }
    return results
  } catch (error: any) {
    if (attempt < 1 && (error?.status === 429 || error?.status >= 500)) {
      await sleep(1_000)
      return fetchBridgeMetadataChunk(items, attempt + 1)
    }
    throw error
  }
}

async function loadBridgeMetadata(
  mediaRefs: readonly MediaRef[],
  log?: BridgeLog
): Promise<Map<MediaRef, BridgeMetadataResult>> {
  const metadataByMedia = new Map<MediaRef, BridgeMetadataResult>()
  const groups = new Map<string, { media: MediaRef; refs: MediaRef[]; lookupId: string }>()
  for (const media of mediaRefs) {
    const imdb = String(media.ids.imdb || '').trim().toLowerCase()
    const tmdb = String(media.ids.tmdb ?? '').trim()
    if (!/^tt\d+$/.test(imdb) && !/^[1-9]\d*$/.test(tmdb)) continue
    const key = `${media.kind}:imdb:${imdb}:tmdb:${tmdb}`
    const current = groups.get(key)
    if (current) {
      current.refs.push(media)
    } else {
      groups.set(key, {
        media,
        refs: [media],
        lookupId: `bridge:${groups.size + 1}`
      })
    }
  }
  if (!groups.size) return metadataByMedia

  logTo(log, `Resolving ${groups.size} selected title IDs and TMDB metadata...`)
  const metadataItems = [...groups.values()].map(({ media, lookupId }) => ({
    content_id: lookupId,
    content_type: media.kind === 'movie' ? 'movie' : 'series',
    name: String(media.title || 'Untitled').slice(0, 256),
    _ids: { tmdb: media.ids.tmdb, imdb: media.ids.imdb }
  }))
  const metadataChunks = chunk(metadataItems, BRIDGE_METADATA_BATCH_SIZE)
  const results: BridgeMetadataResult[] = []

  for (let offset = 0; offset < metadataChunks.length; offset += BRIDGE_METADATA_BATCH_CONCURRENCY) {
    const wave = metadataChunks.slice(offset, offset + BRIDGE_METADATA_BATCH_CONCURRENCY)
    const settled = await Promise.allSettled(wave.map(items => fetchBridgeMetadataChunk(items)))
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.push(...result.value)
      } else {
        const reason = result.reason instanceof Error
          ? result.reason.message
          : errorDetail(result.reason, 'metadata request failed')
        logTo(log, `Warning: A bridge metadata batch failed (${reason}).`)
      }
    }
    logTo(
      log,
      `Bridge TMDB metadata batches complete: ${Math.min(offset + wave.length, metadataChunks.length)}/${metadataChunks.length}.`
    )
  }

  const byContentId = new Map<string | number, BridgeMetadataResult>()
  for (const result of results) byContentId.set(result.content_id, result)
  for (const group of groups.values()) {
    const metadata = byContentId.get(group.lookupId)
    if (!metadata) continue
    for (const media of group.refs) metadataByMedia.set(media, metadata)
  }
  return metadataByMedia
}

/**
 * Resolves likely anime against the selected profile's enabled Kitsu catalog
 * before planning. Source IDs and metadata otherwise pass through unchanged.
 */
export async function resolveNuvioMediaBridgeBundle(
  input: CanonicalBundle,
  log?: BridgeLog,
  nuvioConnection?: BridgeConnection
): Promise<CanonicalBundle> {
  const bundle: CanonicalBundle = {
    history: input.history.map(record => ({
      ...record,
      media: {
        ...record.media,
        ids: {
          ...record.media.ids,
          ...(record.media.ids.external
            ? { external: { ...record.media.ids.external } }
            : {})
        }
      },
      source: record.source ? { ...record.source } : undefined
    })),
    progress: input.progress.map(record => ({
      ...record,
      media: {
        ...record.media,
        ids: {
          ...record.media.ids,
          ...(record.media.ids.external
            ? { external: { ...record.media.ids.external } }
            : {})
        }
      },
      source: record.source ? { ...record.source } : undefined
    })),
    library: input.library.map(record => ({
      ...record,
      media: {
        ...record.media,
        ids: {
          ...record.media.ids,
          ...(record.media.ids.external
            ? { external: { ...record.media.ids.external } }
            : {})
        }
      },
      source: record.source ? { ...record.source } : undefined,
      lists: record.lists.map(list => ({ ...list }))
    }))
  }
  if (nuvioConnection?.service === 'nuvio') {
    // Keep one add-on snapshot for planning, but start every preview/run with a
    // fresh attempt so a previous authorization or network failure cannot
    // poison later syncs until the page is reloaded.
    invalidateNuvioMetadataCaches(nuvioConnection)
    const likelyAnime = [
      ...bundle.progress,
      ...bundle.history,
      ...bundle.library
    ].map(record => record.media).filter(media => (
      isLikelyAnimeMedia(media)
    ))
    if (likelyAnime.length) {
      logTo(
        log,
        `Prioritizing ${likelyAnime.length} animation/anime records for native Nuvio identity lookup.`
      )
    }
    await resolveNuvioKitsuAliases(
      nuvioConnection,
      likelyAnime,
      log
    )
  }
  return dedupeBundle(bundle)
}

async function pushNuvio(options: PushOptions): Promise<PushResult> {
  const { connection, bundle, scopes, log } = options
  const profileId = Number(connection.profileId)
  if (!Number.isInteger(profileId) || profileId < 1) throw new Error('Choose a Nuvio profile.')
  const issues: BridgeIssue[] = []
  const written: PushCounts = { history: 0, progress: 0, library: 0 }
  const skipped: Partial<PushCounts> = {}
  const skip = (issue: BridgeIssue) => {
    issues.push(issue)
    skipped[issue.scope] = (skipped[issue.scope] || 0) + 1
  }
  const watchedRecords = scopes.history
    ? collapseHistoryToWatchedState(bundle.history)
    : []

  const historyWrite = scopes.history && watchedRecords.length ? (async () => {
    const rows: any[] = []
    const legacyKeys = new Map<string, Record<string, any>>()
    for (const record of watchedRecords) {
      const contentId = nuvioContentId(record.media)
      if (!contentId) {
        skip({ scope: 'history', status: 'unresolved', media: record.media, reason: 'Nuvio needs a supported content ID.' })
        continue
      }
      const season = Number.isInteger(record.media.season) ? Number(record.media.season) : undefined
      const episode = Number.isInteger(record.media.episode) ? Number(record.media.episode) : undefined
      rows.push({
        content_id: contentId,
        content_type: record.media.kind === 'movie' ? 'movie' : 'series',
        title: mediaTitle(record.media),
        ...(record.media.kind === 'series' && season !== undefined ? { season } : {}),
        ...(record.media.kind === 'series' && episode !== undefined ? { episode } : {}),
        watched_at: record.watchedAt
      })
      // A remap can move Trakt S2E1 to another owner's (or numbering scheme's)
      // S1E1. Deleting every source alias at the *target* coordinates could
      // erase a legitimate destination episode. Without the original source
      // coordinates in the write record, retaining aliases is lossless.
      if (record.media.kind !== 'series' || !record.media.destinationEpisodeRemapped) {
        for (const legacyId of alternateNuvioContentIds(record.media, contentId)) {
          const key = {
            content_id: legacyId,
            ...(record.media.kind === 'series' && season !== undefined ? { season } : {}),
            ...(record.media.kind === 'series' && episode !== undefined ? { episode } : {})
          }
          legacyKeys.set(JSON.stringify(key), key)
        }
      }
    }
    if (legacyKeys.size) {
      await nuvioRpc(connection, 'sync_delete_watched_items', {
        p_profile_id: profileId,
        p_keys: [...legacyKeys.values()]
      })
    }
    await Promise.all(chunk(rows, 500).map(async rowsBatch => {
      await nuvioRpc(connection, 'sync_push_watched_items', {
        p_profile_id: profileId,
        p_items: rowsBatch
      })
    }))
    written.history += rows.length
    logTo(log, `Added ${written.history} Nuvio watched items.`)
  })() : Promise.resolve()

  const progressWrite = scopes.progress && bundle.progress.length ? (async () => {
    const rows: any[] = []
    const legacyKeys = new Set<string>()
    for (const record of bundle.progress) {
      const contentId = nuvioContentId(record.media)
      const absolute = absoluteProgress(record)
      if (!contentId || !absolute) {
        skip({ scope: 'progress', status: 'unresolved', media: record.media, reason: 'Nuvio progress needs a supported ID and a reliable runtime to convert this percentage.' })
        continue
      }
      if (record.media.kind === 'series' && (!Number.isInteger(record.media.season) || !Number.isInteger(record.media.episode))) {
        skip({ scope: 'progress', status: 'unresolved', media: record.media, reason: 'The Nuvio episode progress has no deterministic season and episode number.' })
        continue
      }
      const progressKey = record.media.kind === 'series'
        ? `${contentId}_s${record.media.season}e${record.media.episode}`
        : contentId
      rows.push({
        content_id: contentId,
        content_type: record.media.kind === 'movie' ? 'movie' : 'series',
        video_id: record.media.videoId || (
          record.media.kind === 'series'
            ? `${contentId}:${record.media.season}:${record.media.episode}`
            : contentId
        ),
        ...(record.media.kind === 'series' ? { season: record.media.season, episode: record.media.episode } : {}),
        position: Math.round(absolute.positionMs),
        duration: Math.round(absolute.durationMs),
        last_watched: record.updatedAt,
        progress_key: progressKey
      })
      if (record.media.kind !== 'series' || !record.media.destinationEpisodeRemapped) {
        for (const legacyId of alternateNuvioContentIds(record.media, contentId)) {
          legacyKeys.add(record.media.kind === 'series'
            ? `${legacyId}_s${record.media.season}e${record.media.episode}`
            : legacyId)
        }
      }
    }
    if (legacyKeys.size) {
      await nuvioRpc(connection, 'sync_delete_watch_progress', {
        p_profile_id: profileId,
        p_keys: [...legacyKeys]
      })
    }
    await Promise.all(chunk(rows, 300).map(async rowsBatch => {
      await nuvioRpc(connection, 'sync_push_watch_progress', {
        p_profile_id: profileId,
        p_entries: rowsBatch
      })
    }))
    written.progress += rows.length
    logTo(log, `Updated ${written.progress} Nuvio resume points.`)
  })() : Promise.resolve()

  const libraryWrite = scopes.library && bundle.library.length ? (async () => {
    logTo(log, 'Adding items to the Nuvio library...')
    const imports: NuvioLibraryImport[] = []
    for (const record of bundle.library) {
      const contentId = nuvioContentId(record.media)
      if (!contentId) {
        skip({ scope: 'library', status: 'unresolved', media: record.media, reason: 'Nuvio needs a supported content ID for this library item.' })
        continue
      }
      const posterUrl = publicPosterUrl(record.posterUrl)
      imports.push({
        media: record.media,
        item: {
          content_id: contentId,
          content_type: record.media.kind === 'movie' ? 'movie' : 'series',
          name: record.media.title || 'Untitled',
          ...(posterUrl ? { poster: posterUrl, poster_shape: 'POSTER' } : {}),
          ...(record.media.year ? { release_info: String(record.media.year) } : {}),
          added_at: record.addedAt || Date.now()
        }
      })
    }
    if (imports.length) {
      const preferredKeys = new Set(imports.map(({ item }) => (
        `${item.content_type}:${item.content_id}`
      )))
      const aliasKeys = new Map<string, { content_id: string; content_type: string }>()
      for (const { item, media } of imports) {
        for (const contentId of alternateNuvioContentIds(media, item.content_id)) {
          const key = `${item.content_type}:${contentId}`
          if (preferredKeys.has(key)) continue
          aliasKeys.set(key, { content_id: contentId, content_type: item.content_type })
        }
      }
      await Promise.all(chunk(imports, NUVIO_LIBRARY_MUTATION_BATCH_SIZE).map(async batch => {
        await nuvioRpc(connection, 'sync_push_library_items', {
          p_profile_id: profileId,
          p_items: batch.map(({ item }) => item)
        })
      }))
      if (aliasKeys.size) {
        await Promise.all(chunk([...aliasKeys.values()], NUVIO_LIBRARY_MUTATION_BATCH_SIZE).map(async keys => {
          await nuvioRpc(connection, 'sync_delete_library_items', {
            p_profile_id: profileId,
            p_keys: keys
          })
        }))
      }
      written.library += imports.length
    }
    logTo(log, `Added ${written.library} titles to the Nuvio library without removing unrelated items.`)
  })() : Promise.resolve()

  await Promise.all([historyWrite, progressWrite, libraryWrite])

  return {
    written,
    skipped,
    issues,
    // Each Nuvio sync RPC completes the submitted transaction before its 2xx
    // response. Treat that response as authoritative; immediately re-reading
    // the full profile is both expensive and vulnerable to stale replicas.
    confirmedScopes: (['history', 'progress', 'library'] as const)
      .filter(scope => scopes[scope])
  }
}

function simklRows(data: any, bucket: 'movies' | 'shows' | 'anime'): any[] {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.[bucket])) return data[bucket]
  if (bucket === 'anime' && Array.isArray(data?.shows)) return data.shows
  return []
}

function mediaFromSimkl(value: any, kind: 'movie' | 'series', anime = false): MediaRef {
  return {
    kind,
    ids: normalizeIds(value?.ids, 'simkl'),
    title: value?.title,
    year: Number(value?.year) || undefined,
    genres: sourceGenres(value, anime ? ['anime'] : [])
  }
}

function simklPosterUrl(value: unknown): string | undefined {
  const directUrl = publicPosterUrl(value)
  if (directUrl) return directUrl
  const path = String(value || '').trim().replace(/^\/+|\/+$/g, '')
  if (!path || !/^[a-z0-9/_-]+$/i.test(path)) return undefined
  return `https://wsrv.nl/?url=https://simkl.in/posters/${path}_m.webp&q=90`
}

function simklInteger(value: unknown, minimum = 1): number | undefined {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : undefined
}

function simklProjectedEpisode(
  media: MediaRef,
  season: any,
  episode: any,
  animeBucket = false
): EpisodeRef | null {
  const nativeEpisode = simklInteger(episode?.number ?? episode?.episode)
  const nativeSeason = simklInteger(season?.number ?? episode?.season, 0)
  const tvdbSeason = simklInteger(episode?.tvdb?.season ?? episode?.tvdb_season, 0)
  const tvdbEpisode = simklInteger(
    episode?.tvdb?.episode ?? episode?.tvdb?.number ?? episode?.tvdb_number
  )
  const episodeNumber = tvdbEpisode ?? nativeEpisode
  const seasonNumber = tvdbSeason ?? nativeSeason ?? (animeBucket ? 0 : undefined)
  if (episodeNumber === undefined || seasonNumber === undefined) return null

  const animeContentId = animeBucket ? simklAnimeContentId(media) : null
  const owner = animeContentId || stremioContentId(media) || undefined
  const nativeVideoId = animeContentId && nativeEpisode
    ? `${animeContentId}:${nativeEpisode}`
    : owner
      ? `${owner}:${seasonNumber}:${episodeNumber}`
      : undefined
  return {
    season: seasonNumber,
    episode: episodeNumber,
    absoluteEpisode: nativeEpisode,
    title: episode?.title,
    videoId: nativeVideoId,
    contentId: owner
  }
}

const SIMKL_LIST_STATUS_LABELS: Record<string, string> = {
  watching: 'Watching',
  plantowatch: 'Plan to Watch',
  'plan-to-watch': 'Plan to Watch',
  watchlist: 'Plan to Watch',
  hold: 'On Hold',
  completed: 'Completed',
  dropped: 'Dropped'
}

function appendSimklItems(
  connection: BridgeConnection,
  data: any,
  bucket: 'movies' | 'shows' | 'anime',
  scopes: SyncScopes,
  bundle: CanonicalBundle,
  provenance: ReturnType<typeof sourceOf>
) {
  for (const item of simklRows(data, bucket)) {
    const subject = item.movie || item.show || item.anime || item
    if (!subject || typeof subject !== 'object') continue
    const animeMovie = bucket === 'anime'
      && String(item.anime_type || subject.anime_type || '').toLowerCase() === 'movie'
    const media = mediaFromSimkl(
      subject,
      bucket === 'movies' || animeMovie ? 'movie' : 'series',
      bucket === 'anime'
    )
    rememberSimklMediaSnapshot(connection, media)
    const status = String(item.status || subject.status || '').toLowerCase()

    if (scopes.library && SIMKL_LIST_STATUS_LABELS[status]) {
      const posterUrl = simklPosterUrl(subject.poster ?? item.poster)
      bundle.library.push({
        media: { ...media, ids: mergeSimklMediaIds(media.ids, {}) },
        addedAt: asEpochMs(item.added_to_watchlist_at || item.last_watched_at || item.updated_at),
        lists: [{ ...provenance, kind: 'watchlist', name: SIMKL_LIST_STATUS_LABELS[status] }],
        source: provenance,
        ...(posterUrl ? { posterUrl } : {})
      })
    }

    const episodeCatalog: EpisodeRef[] = []
    if (media.kind === 'series') {
      for (const season of item.seasons || subject.seasons || []) {
        for (const episode of season.episodes || []) {
          const projected = simklProjectedEpisode(media, season, episode, bucket === 'anime')
          if (projected) episodeCatalog.push(projected)
        }
      }
      rememberSimklEpisodeCatalog(connection, media, episodeCatalog)
    }

    if (!scopes.history) continue
    if (media.kind === 'movie') {
      const watchedAt = item.last_watched_at || item.watched_at
      if (watchedAt || status === 'completed') {
        const timestamp = asEpochMs(
          watchedAt || item.added_to_watchlist_at || item.updated_at
        )
        bundle.history.push({
          media,
          watchedAt: timestamp,
          playCount: positiveNumber(item.watched, 1),
          source: provenance
        })
      }
      continue
    }

    let exactEpisodeRows = 0
    for (const season of item.seasons || subject.seasons || []) {
      for (const episode of season.episodes || []) {
        const watchedAt = episode.watched_at || episode.last_watched_at
        const timestamp = asEpochMs(watchedAt)
        if (!timestamp) continue
        const projected = simklProjectedEpisode(media, season, episode, bucket === 'anime')
        if (!projected) continue
        exactEpisodeRows++
        bundle.history.push({
          media: {
            ...media,
            season: projected.season,
            episode: projected.episode,
            absoluteEpisode: projected.absoluteEpisode,
            episodeTitle: projected.title,
            videoId: projected.videoId,
            destinationContentId: projected.contentId
          },
          watchedAt: timestamp,
          playCount: positiveNumber(episode.watched, 1),
          source: provenance
        })
      }
    }
    if (status === 'completed' && exactEpisodeRows === 0) {
      bundle.history.push({
        media,
        watchedAt: asEpochMs(
          item.last_watched_at || item.added_to_watchlist_at || item.updated_at
        ),
        playCount: 1,
        source: provenance
      })
    }
  }
}

function appendSimklPlayback(
  connection: BridgeConnection,
  data: any,
  bundle: CanonicalBundle,
  issues: BridgeIssue[],
  provenance: ReturnType<typeof sourceOf>
) {
  const rows = Array.isArray(data) ? data : Array.isArray(data?.playback) ? data.playback : []
  for (const item of rows) {
    const subject = item.movie || item.show || item.anime
    if (!subject || typeof subject !== 'object') continue
    const isMovie = Boolean(item.movie) || item.type === 'movie'
    const baseMedia = mediaFromSimkl(subject, isMovie ? 'movie' : 'series', Boolean(item.anime))
    rememberSimklMediaSnapshot(connection, baseMedia)
    let media = baseMedia
    if (!isMovie) {
      const projected = simklProjectedEpisode(
        baseMedia,
        { number: item.episode?.season },
        item.episode,
        Boolean(item.anime)
      )
      if (projected) {
        media = {
          ...baseMedia,
          season: projected.season,
          episode: projected.episode,
          absoluteEpisode: projected.absoluteEpisode,
          episodeTitle: projected.title,
          videoId: projected.videoId,
          destinationContentId: projected.contentId
        }
        rememberSimklEpisodeCatalog(connection, baseMedia, [projected])
      }
    }
    const runtimeSeconds = positiveNumber(item.runtime) * (
      positiveNumber(item.runtime) < 1_000 ? 60 : 1
    )
    const durationMs = positiveNumber(item.duration_ms)
      || positiveNumber(item.runtime_seconds) * 1000
      || runtimeSeconds * 1000
    const percentage = positiveNumber(item.progress ?? item.percentage)
    const positionMs = positiveNumber(item.current_position) * 1000
      || (durationMs && percentage ? Math.round(durationMs * percentage / 100) : 0)
    if (durationMs && positionMs) {
      bundle.progress.push({
        media,
        positionMs,
        durationMs,
        percentage: Math.min(100, percentage || positionMs / durationMs * 100),
        updatedAt: asEpochMs(item.paused_at || item.watched_at || item.updated_at),
        source: provenance
      })
    } else if (percentage) {
      bundle.progress.push({
        media,
        percentage: Math.min(100, percentage),
        updatedAt: asEpochMs(item.paused_at || item.watched_at || item.updated_at),
        source: provenance
      })
    } else {
      issues.push({
        scope: 'progress',
        status: 'unresolved',
        media,
        reason: `${mediaLabel(media)} has no usable Simkl playback percentage or absolute position.`
      })
    }
  }
}

function simklItemParams(scopes: SyncScopes, dateFrom?: string) {
  void scopes
  return {
    extended: 'full_anime_seasons',
    episode_watched_at: 'yes',
    episode_tvdb_id: 'yes',
    include_all_episodes: 'yes',
    language: 'en',
    ...(dateFrom ? { date_from: dateFrom } : {})
  }
}

async function pullSimkl(options: PullOptions): Promise<PullResult> {
  const { connection, scopes, log } = options
  const bundle = createEmptyBundle()
  const issues: BridgeIssue[] = []
  const provenance = sourceOf(connection)
  resetSimklSnapshotCaches(connection)

  const itemBuckets = Object.values(scopes).some(Boolean)
    ? (['movies', 'shows', 'anime'] as const)
    : []
  if (itemBuckets.length) logTo(log, 'Reading complete Simkl movie, show, and anime snapshots...')
  if (scopes.progress) logTo(log, 'Reading Simkl playback sessions...')

  const itemResponses: Array<{ bucket: (typeof itemBuckets)[number]; data: any }> = []
  for (const bucket of itemBuckets) {
    itemResponses.push({
      bucket,
      data: (await simklRequest(
        connection,
        `/sync/all-items/${bucket}`,
        simklItemParams(scopes)
      )).data
    })
  }
  const playbackResponse = scopes.progress
    ? await simklRequest(connection, '/sync/playback')
    : null

  for (const { bucket, data } of itemResponses) {
    appendSimklItems(connection, data, bucket, scopes, bundle, provenance)
  }
  if (playbackResponse) {
    appendSimklPlayback(connection, playbackResponse.data, bundle, issues, provenance)
  }

  return { bundle: dedupeBundle(bundle), issues }
}

async function pullSimklDelta(options: PullOptions, dateFrom: string): Promise<PullResult> {
  const { connection, scopes, log } = options
  const bundle = createEmptyBundle()
  const issues: BridgeIssue[] = []
  const provenance = sourceOf(connection)

  if (scopes.history || scopes.library) {
    logTo(log, 'Simkl activity changed; reading the destination delta...')
  }
  if (scopes.history || scopes.library) {
    for (const bucket of ['movies', 'shows', 'anime'] as const) {
      const response = await simklRequest(
        connection,
        `/sync/all-items/${bucket}`,
        simklItemParams(scopes, dateFrom)
      )
      appendSimklItems(connection, response.data, bucket, scopes, bundle, provenance)
    }
  }
  const playbackResponse = scopes.progress
    ? await simklRequest(connection, '/sync/playback')
    : null
  if (playbackResponse) {
    appendSimklPlayback(connection, playbackResponse.data, bundle, issues, provenance)
  }

  return { bundle: dedupeBundle(bundle), issues }
}

function simklWriteGroupKey(media: MediaRef, subject: Record<string, any>): string {
  const ids = subject.ids
    ? Object.fromEntries(Object.entries(subject.ids).sort(([left], [right]) => left.localeCompare(right)))
    : null
  return ids
    ? `${media.kind}:ids:${JSON.stringify(ids)}`
    : `${media.kind}:title:${normalizeTitle(String(subject.title || ''))}:${Number(subject.year) || ''}`
}

function simklWatchedAtIso(value: unknown): string | undefined {
  const timestamp = Number(value)
  return Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp).toISOString()
    : undefined
}

function groupSimklHistory(connection: BridgeConnection, records: readonly HistoryRecord[]) {
  const movies: any[] = []
  const shows = new Map<string, {
    subject: Record<string, any>
    parent?: Record<string, any>
    episodes: Map<number, any>
    seasons: Map<number, Map<number, any>>
    useTvdbAnimeSeasons: boolean
  }>()
  const issues: BridgeIssue[] = []
  for (const record of records) {
    const media = enrichMediaFromSimklSnapshot(connection, record.media)
    const resolution = resolveSimklEpisodeWrite(media)
    const subject = simklSubject(media, resolution.ids)
    if (!subject) {
      issues.push({
        scope: 'history',
        status: 'unresolved',
        media: record.media,
        reason: 'Simkl needs a supported external ID or a title for this history record.'
      })
      continue
    }
    const watchedAt = simklWatchedAtIso(record.watchedAt)
    if (media.kind === 'movie') {
      movies.push({ ...subject, ...(watchedAt ? { watched_at: watchedAt } : {}) })
      continue
    }

    const key = simklWriteGroupKey(media, subject)
    if (!shows.has(key)) {
      shows.set(key, {
        subject,
        episodes: new Map(),
        seasons: new Map(),
        useTvdbAnimeSeasons: false
      })
    }
    const show = shows.get(key)!

    const isParentMarker = !Number.isInteger(resolution.season)
      && !Number.isInteger(resolution.episode)
    if (isParentMarker) {
      show.parent = {
        ...subject,
        ...(watchedAt ? { watched_at: watchedAt } : {}),
        status: 'completed'
      }
      continue
    }

    if (!Number.isInteger(resolution.episode)) {
      issues.push({
        scope: 'history',
        status: 'unresolved',
        media: record.media,
        reason: 'The Simkl episode has no deterministic episode number.'
      })
      continue
    }
    const episode = {
      number: Number(resolution.episode),
      ...(watchedAt ? { watched_at: watchedAt } : {})
    }
    if (resolution.nativeAnime) {
      show.episodes.set(episode.number, episode)
      continue
    }
    if (!Number.isInteger(resolution.season)) {
      issues.push({
        scope: 'history',
        status: 'unresolved',
        media: record.media,
        reason: 'The Simkl episode has no deterministic season number.'
      })
      continue
    }
    const seasonNumber = Number(resolution.season)
    if (!show.seasons.has(seasonNumber)) show.seasons.set(seasonNumber, new Map())
    show.seasons.get(seasonNumber)!.set(episode.number, episode)
    if (resolution.isAnime) show.useTvdbAnimeSeasons = true
  }
  return {
    movies,
    shows: [...shows.values()].map(show => {
      if (show.parent) return show.parent
      return {
        ...show.subject,
        ...(show.episodes.size ? { episodes: [...show.episodes.values()] } : {}),
        ...(show.seasons.size ? {
          seasons: [...show.seasons.entries()]
            .sort(([left], [right]) => left - right)
            .map(([number, episodes]) => ({ number, episodes: [...episodes.values()] }))
        } : {}),
        ...(show.useTvdbAnimeSeasons ? { use_tvdb_anime_seasons: true } : {})
      }
    }),
    issues
  }
}

function simklHistoryEntryCount(item: any): number {
  const episodes = (Array.isArray(item?.episodes) ? item.episodes.length : 0)
    + (item?.seasons || []).reduce((total: number, season: any) => (
    total + (Array.isArray(season?.episodes) ? season.episodes.length : 0)
  ), 0)
  return Math.max(1, episodes)
}

function simklHistoryPayloadCount(payload: any): number {
  return (payload?.movies || []).length
    + (payload?.shows || []).reduce((total: number, show: any) => total + simklHistoryEntryCount(show), 0)
}

function simklHistoryNotFoundIssues(data: any): BridgeIssue[] {
  const result: BridgeIssue[] = []
  const reason = 'Simkl could not match this history record.'
  for (const movie of data?.not_found?.movies || []) {
    result.push({ scope: 'history', status: 'unresolved', media: mediaFromSimkl(movie.movie || movie, 'movie'), reason })
  }
  for (const show of [
    ...(data?.not_found?.shows || []),
    ...(data?.not_found?.anime || [])
  ]) {
    const subject = show.show || show.anime || show
    const media = mediaFromSimkl(subject, 'series')
    let foundEpisode = false
    for (const season of show.seasons || subject.seasons || []) {
      for (const episode of season.episodes || []) {
        const seasonNumber = simklInteger(season.number, 0)
        const episodeNumber = simklInteger(episode.number)
        if (seasonNumber === undefined || episodeNumber === undefined) continue
        foundEpisode = true
        result.push({
          scope: 'history',
          status: 'unresolved',
          media: { ...media, season: seasonNumber, episode: episodeNumber },
          reason
        })
      }
    }
    for (const episode of show.episodes || subject.episodes || []) {
      const episodeNumber = simklInteger(episode.number)
      if (episodeNumber === undefined) continue
      foundEpisode = true
      const animeContentId = simklAnimeContentId(media)
      result.push({
        scope: 'history',
        status: 'unresolved',
        media: {
          ...media,
          episode: episodeNumber,
          absoluteEpisode: episodeNumber,
          ...(animeContentId ? { videoId: `${animeContentId}:${episodeNumber}` } : {})
        },
        reason
      })
    }
    if (!foundEpisode) result.push({ scope: 'history', status: 'unresolved', media, reason })
  }
  for (const episode of data?.not_found?.episodes || []) {
    const subject = episode.show || episode.anime || episode
    const season = simklInteger(episode.season ?? episode.episode?.season, 0)
    const number = simklInteger(
      episode.number ?? episode.episode?.number ?? episode.episode?.episode
    )
    result.push({
      scope: 'history',
      status: 'unresolved',
      media: {
        ...mediaFromSimkl(subject, 'series'),
        ...(season !== undefined ? { season } : {}),
        ...(number !== undefined ? { episode: number } : {})
      },
      reason
    })
  }
  return result
}

function simklListNotFoundIssues(data: any): BridgeIssue[] {
  const reason = 'Simkl could not match this saved title.'
  return [
    ...(data?.not_found?.movies || []).map((item: any) => ({
      scope: 'library' as const,
      status: 'unresolved' as const,
      media: mediaFromSimkl(item.movie || item, 'movie'),
      reason
    })),
    ...(data?.not_found?.shows || []).map((item: any) => ({
      scope: 'library' as const,
      status: 'unresolved' as const,
      media: mediaFromSimkl(item.show || item.anime || item, 'series'),
      reason
    })),
    ...(data?.not_found?.anime || []).map((item: any) => ({
      scope: 'library' as const,
      status: 'unresolved' as const,
      media: mediaFromSimkl(item.anime || item, 'series'),
      reason
    }))
  ]
}

function hasSimklWriteEnvelope(data: any): boolean {
  return Boolean(data && typeof data === 'object' && data.added && data.not_found)
}

async function pushSimkl(options: PushOptions): Promise<PushResult> {
  const { connection, sourceConnection, bundle, scopes, log } = options
  if (connection.slot !== 'destination') {
    throw new Error('Simkl can only be used as an import destination in the Sync Bridge.')
  }
  if (
    sourceConnection?.service !== 'nuvio'
    && connection.simklAccountType !== 'pro'
    && connection.simklAccountType !== 'vip'
  ) {
    throw new Error('Importing to Simkl is only available for Simkl Pro or VIP accounts.')
  }
  const written: PushCounts = { history: 0, progress: 0, library: 0 }
  const skipped: Partial<PushCounts> = {}
  const issues: BridgeIssue[] = []
  const confirmedScopes: BridgeScope[] = []
  let historyResponsesComplete = !scopes.history || bundle.history.length === 0

  if (scopes.history && bundle.history.length) {
    const grouped = groupSimklHistory(connection, collapseHistoryToWatchedState(bundle.history))
    issues.push(...grouped.issues)
    if (grouped.issues.length) skipped.history = grouped.issues.length
    const payloads = [
      ...chunk(grouped.movies, 50).map(movies => ({ movies })),
      ...chunk(grouped.shows, 50).map(shows => ({ shows }))
    ]
    let responsesComplete = true
    for (const payload of payloads) {
      const { data } = await simklRequest(connection, '/sync/history', { skip_auto_watching: 'yes' }, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      const submitted = simklHistoryPayloadCount(payload)
      if (hasSimklWriteEnvelope(data)) {
        const notFound = simklHistoryNotFoundIssues(data)
        issues.push(...notFound)
        if (notFound.length) skipped.history = (skipped.history || 0) + notFound.length
        written.history += Math.max(0, submitted - notFound.length)
      } else {
        responsesComplete = false
        written.history += submitted
      }
      logTo(log, `Added ${written.history} Simkl history records.`)
    }
    historyResponsesComplete = responsesComplete
    if (responsesComplete) confirmedScopes.push('history')
  }

  if (scopes.library && bundle.library.length) {
    const movies: any[] = []
    const shows: any[] = []
    const historyKeys = new Set<string>()
    const failedHistoryKeys = new Set(
      issues
        .filter(issue => issue.scope === 'history' && issue.media)
        .flatMap(issue => simklSnapshotLookupKeys(
          enrichMediaFromSimklSnapshot(connection, issue.media!)
        ))
    )
    if (scopes.history) {
      for (const record of bundle.history) {
        const media = enrichMediaFromSimklSnapshot(connection, record.media)
        const resolution = resolveSimklEpisodeWrite(media)
        if (!simklSubject(media, resolution.ids)) continue
        const keys = simklSnapshotLookupKeys(media)
        if (keys.some(key => failedHistoryKeys.has(key))) continue
        for (const key of keys) historyKeys.add(key)
      }
    }
    let membershipsFulfilledByHistory = 0
    for (const record of bundle.library) {
      const media = enrichMediaFromSimklSnapshot(connection, record.media)
      const subject = simklSubject(media, simklWriteIds(media))
      if (!subject) {
        skipped.library = (skipped.library || 0) + 1
        issues.push({
          scope: 'library',
          status: 'unresolved',
          media: record.media,
          reason: 'Simkl needs a supported external ID or a title for this saved item.'
        })
        continue
      }
      // Simkl uses one status per title. Writing Plan to Watch after history
      // would overwrite the completed/watching status that history just set.
      // History already keeps the title in Simkl's list, so count the library
      // membership as fulfilled without issuing the destructive second write.
      if (simklSnapshotLookupKeys(media).some(key => historyKeys.has(key))) {
        written.library++
        membershipsFulfilledByHistory++
        continue
      }
      ;(media.kind === 'movie' ? movies : shows).push({ ...subject, to: 'plantowatch' })
    }
    const payloads = [
      ...chunk(movies, 50).map(batch => ({ movies: batch })),
      ...chunk(shows, 50).map(batch => ({ shows: batch }))
    ]
    let responsesComplete = true
    for (const payload of payloads) {
      const { data } = await simklRequest(connection, '/sync/add-to-list', {}, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      const submitted = (payload as any).movies?.length || (payload as any).shows?.length || 0
      if (hasSimklWriteEnvelope(data)) {
        const notFound = simklListNotFoundIssues(data)
        issues.push(...notFound)
        if (notFound.length) skipped.library = (skipped.library || 0) + notFound.length
        written.library += Math.max(0, submitted - notFound.length)
      } else {
        responsesComplete = false
        written.library += submitted
      }
    }
    if (responsesComplete && (!membershipsFulfilledByHistory || historyResponsesComplete)) {
      confirmedScopes.push('library')
    }
    logTo(log, `Saved ${written.library} titles to Simkl Plan to Watch.`)
  }

  if (scopes.progress && bundle.progress.length) {
    // Simkl has no bulk playback write. Submit every pause with its own bounded
    // request and keep going after an individual rejection. Oldest-first order
    // ensures Simkl's one-session-per-title model retains the newest pause.
    const records = [...bundle.progress].sort((left, right) => left.updatedAt - right.updatedAt)
    for (const record of records) {
      const percentage = progressPercentage(record)
      const media = enrichMediaFromSimklSnapshot(connection, record.media)
      const resolution = resolveSimklEpisodeWrite(media)
      const subject = simklSubject(media, resolution.ids)

      if (!percentage) {
        skipped.progress = (skipped.progress || 0) + 1
        issues.push({
          scope: 'progress',
          status: 'unresolved',
          media: record.media,
          reason: 'Simkl progress needs a valid percentage or absolute position.'
        })
        continue
      }
      if (!subject) {
        skipped.progress = (skipped.progress || 0) + 1
        issues.push({
          scope: 'progress',
          status: 'unresolved',
          media: record.media,
          reason: 'Simkl progress needs a supported external ID or a title.'
        })
        continue
      }

      const payload: any = {
        progress: Math.round(Math.min(100, percentage) * 100) / 100
      }
      if (media.kind === 'movie') {
        payload.movie = subject
      } else if (resolution.nativeAnime && Number.isInteger(resolution.episode)) {
        payload.anime = subject
        payload.episode = { number: Number(resolution.episode) }
      } else if (Number.isInteger(resolution.season) && Number.isInteger(resolution.episode)) {
        payload.show = subject
        payload.episode = {
          season: Number(resolution.season),
          number: Number(resolution.episode)
        }
      } else {
        skipped.progress = (skipped.progress || 0) + 1
        issues.push({
          scope: 'progress',
          status: 'unresolved',
          media: record.media,
          reason: 'The Simkl episode progress record has no deterministic season and episode number.'
        })
        continue
      }

      try {
        await simklRequest(connection, '/scrobble/pause', {}, {
          method: 'POST',
          body: JSON.stringify(payload)
        })
        written.progress++
      } catch (error: any) {
        if ([401, 403].includes(Number(error?.status))) throw error
        skipped.progress = (skipped.progress || 0) + 1
        issues.push({
          scope: 'progress',
          status: 'unresolved',
          media: record.media,
          reason: error?.name === 'TimeoutError' || error?.name === 'AbortError'
            ? 'This Simkl resume point did not finish before its individual request deadline.'
            : `Simkl rejected this resume point: ${errorDetail(error.body, error.message)}`
        })
      }
    }
    logTo(log, `Updated ${written.progress} Simkl resume points${skipped.progress ? `; skipped ${skipped.progress}` : ''}.`)
    confirmedScopes.push('progress')
  }

  return { written, issues, skipped, confirmedScopes }
}

interface StremioVideo {
  id: string
  season: number
  episode: number
  absoluteEpisode?: number
  title?: string
  released?: string
}

function stremioAbsoluteEpisode(video: any): number | undefined {
  for (const value of [
    video?.absoluteEpisode,
    video?.absolute_episode,
    video?.absoluteNumber,
    video?.absolute_number,
    video?.number_abs,
    video?.episode_abs
  ]) {
    const number = Number(value)
    if (Number.isSafeInteger(number) && number > 0) return number
  }
  return undefined
}

const cinemetaCache = new Map<string, Promise<any | null>>()
const stremioKitsuAddonCache = new Map<string, Promise<Array<{
  baseUrl: string
  types: string[]
}>>>()
const stremioKitsuMetaCache = new Map<string, Promise<any | null>>()

async function stremioKitsuMetadataAddons(
  connection: BridgeConnection
): Promise<Array<{ baseUrl: string; types: string[] }>> {
  const cacheKey = connection.accountId
  if (!stremioKitsuAddonCache.has(cacheKey)) {
    stremioKitsuAddonCache.set(cacheKey, (async () => {
      try {
        const value = await stremioRequest(connection, '/addonCollectionGet', {
          type: 'AddonCollectionGet',
          update: false
        })
        const descriptors = Array.isArray(value)
          ? value
          : Array.isArray(value?.addons)
            ? value.addons
            : []
        const addons: Array<{ baseUrl: string; types: string[] }> = []
        for (const descriptor of descriptors) {
          const manifest = descriptor?.manifest
          const resources = Array.isArray(manifest?.resources) ? manifest.resources : []
          const metaResources = resources.filter((resource: any) => (
            manifestResourceName(resource) === 'meta'
          ))
          if (!metaResources.length) continue

          const manifestId = String(manifest?.id || '').trim().toLowerCase()
          const prefixes = manifestIdPrefixes(manifest)
          if (!prefixes.includes('kitsu') && !manifestId.includes('kitsu')) continue

          const baseUrl = addonBaseUrl(descriptor?.transportUrl)
          if (!baseUrl) continue
          const types = [
            ...(Array.isArray(manifest?.types) ? manifest.types : []),
            ...metaResources.flatMap((resource: any) => (
              Array.isArray(resource?.types) ? resource.types : []
            ))
          ]
            .map(type => String(type || '').trim())
            .filter(Boolean)
          addons.push({ baseUrl, types: [...new Set(types)] })
        }
        return addons
      } catch {
        return []
      }
    })())
  }
  return stremioKitsuAddonCache.get(cacheKey)!
}

async function fetchStremioKitsuMeta(
  connection: BridgeConnection,
  media: MediaRef,
  sourceType: unknown
): Promise<any | null> {
  const contentId = kitsuContentId(media)
  if (!contentId) return null
  const key = `${connection.accountId}:${contentId}`
  if (!stremioKitsuMetaCache.has(key)) {
    stremioKitsuMetaCache.set(key, (async () => {
      const sourceTypeName = String(sourceType || '').trim()
      for (const addon of await stremioKitsuMetadataAddons(connection)) {
        const types = [...new Set([
          'anime',
          sourceTypeName,
          ...addon.types,
          media.kind === 'movie' ? 'movie' : 'series',
          'tv'
        ].filter(Boolean))]
        for (const type of types) {
          try {
            const { data } = await requestBridgeJson(
              addonResourceUrl(
                addon.baseUrl,
                `meta/${encodeURIComponent(type)}/${encodeURIComponent(contentId)}.json`
              ),
              {
                timeoutMs: ADDON_RESOURCE_TIMEOUT_MS,
                timeoutMessage: 'A Stremio Kitsu metadata request did not respond before the deadline.'
              }
            )
            if (data?.meta) return data.meta
          } catch {
            // Try the next advertised type or installed Kitsu addon.
          }
        }
      }
      return null
    })())
  }
  return stremioKitsuMetaCache.get(key)!
}

async function fetchCinemetaMeta(media: MediaRef): Promise<any | null> {
  const contentId = stremioContentId(media)
  if (!contentId || !/^tt\d+$/i.test(contentId)) return null
  const type = media.kind === 'movie' ? 'movie' : 'series'
  const key = `${type}:${contentId}`
  if (!cinemetaCache.has(key)) {
    cinemetaCache.set(key, requestBridgeJson(
      `${CINEMETA_API}/meta/${type}/${encodeURIComponent(contentId)}.json`
    ).then(response => response.data?.meta || null).catch(() => null))
  }
  return cinemetaCache.get(key)!
}

async function fetchStremioSeriesMeta(
  connection: BridgeConnection,
  media: MediaRef,
  sourceType: unknown
): Promise<any | null> {
  // A Stremio watched bitfield is indexed against the episode ordering emitted
  // by the metadata addon that owns the item. Never decode a native Kitsu item
  // against Cinemeta merely because an IMDb alias was enriched later.
  if (kitsuContentId(media)) {
    return fetchStremioKitsuMeta(connection, media, sourceType)
  }
  return fetchCinemetaMeta(media)
}

function orderedStremioVideos(meta: any): StremioVideo[] {
  return (Array.isArray(meta?.videos) ? meta.videos : [])
    .map((video: any) => ({
      id: String(video?.id || ''),
      season: Number(video?.season),
      episode: Number(video?.episode ?? video?.number),
      absoluteEpisode: stremioAbsoluteEpisode(video),
      title: video?.title || video?.name,
      released: video?.released
    }))
    .filter((video: StremioVideo) => (
      video.id
      && Number.isInteger(video.season)
      && video.season >= 0
      && Number.isInteger(video.episode)
      && video.episode > 0
    ))
    .sort((left: StremioVideo, right: StremioVideo) => (
      left.season - right.season
      || left.episode - right.episode
      || String(left.released || '').localeCompare(String(right.released || ''))
      || left.id.localeCompare(right.id)
    ))
}

function mediaFromStremioItem(item: any): MediaRef {
  const id = String(item?._id || '')
  return {
    kind: item?.type === 'movie' ? 'movie' : 'series',
    ids: {
      ...parseNuvioContentId(id),
      stremio: id,
      ...(/^tt\d+$/i.test(id) ? { imdb: id.toLowerCase() } : {})
    },
    title: item?.name
  }
}

async function pullStremio(options: PullOptions): Promise<PullResult> {
  const { connection, scopes, log } = options
  logTo(log, 'Reading Stremio library state...')
  const rows = await stremioRequest(connection, '/datastoreGet', {
    collection: 'libraryItem',
    ids: [],
    all: true
  })
  const items = Array.isArray(rows) ? rows : []
  const bundle = createEmptyBundle()
  const issues: BridgeIssue[] = []
  const provenance = sourceOf(connection)
  const rawMedia = items.map(mediaFromStremioItem)
  const metadataByMedia = await loadBridgeMetadata(
    rawMedia.filter(media => !/^tt\d+$/i.test(String(media.ids.imdb || ''))),
    log
  )
  const resolvedItems = items.map((item, index) => ({
    item,
    media: withResolvedExternalIds(rawMedia[index], metadataByMedia.get(rawMedia[index]))
  }))

  await mapLimit(resolvedItems, 6, async ({ item, media }) => {
    const state = item?.state || {}
    const lastWatched = asEpochMs(state.lastWatched || item._mtime)

    if (scopes.library && item.removed === false && item.temp === false) {
      bundle.library.push({
        media,
        addedAt: asEpochMs(item._ctime || item._mtime),
        lists: [{ ...provenance, kind: 'library' }],
        source: provenance
      })
    }

    let meta: any | null = null
    let videos: StremioVideo[] = []
    if (media.kind === 'series' && (state.watched || state.timeOffset > 0)) {
      meta = await fetchStremioSeriesMeta(connection, media, item?.type)
      videos = orderedStremioVideos(meta)
      if (meta?.name && !media.title) media.title = meta.name
    }

    if (scopes.history && media.kind === 'movie' && (
      positiveNumber(state.timesWatched) > 0 || state.flaggedWatched === 1 || state.flaggedWatched === true
    )) {
      bundle.history.push({
        media,
        watchedAt: lastWatched,
        playCount: positiveNumber(state.timesWatched, 1),
        source: provenance
      })
    }

    if (scopes.history && media.kind === 'series' && state.watched) {
      if (!videos.length) {
        issues.push({
          scope: 'history',
          status: 'unresolved',
          media,
          reason: `${mediaLabel(media)} needs episode metadata to decode its Stremio watched bitfield.`
        })
      } else {
        try {
          const watchedIds = new Set(await readStremioWatchedVideoIds(state.watched, videos.map(video => video.id)))
          for (const video of videos) {
            if (!watchedIds.has(video.id)) continue
            bundle.history.push({
              media: {
                ...media,
                season: video.season,
                episode: video.episode,
                episodeTitle: video.title,
                videoId: video.id
              },
              watchedAt: lastWatched,
              source: provenance
            })
          }
        } catch (error: any) {
          issues.push({
            scope: 'history',
            status: 'unresolved',
            media,
            reason: `Could not decode Stremio watched state: ${error.message}`
          })
        }
      }
    }

    if (scopes.progress && positiveNumber(state.timeOffset) > 0 && positiveNumber(state.duration) > 0) {
      const progressMedia = { ...media, ids: { ...media.ids } }
      if (media.kind === 'series') {
        const video = videos.find(entry => entry.id === state.video_id)
        if (!video) {
          issues.push({
            scope: 'progress',
            status: 'unresolved',
            media,
            reason: `${mediaLabel(media)} has a Stremio video ID that is absent from current episode metadata.`
          })
          return
        }
        progressMedia.season = video.season
        progressMedia.episode = video.episode
        progressMedia.episodeTitle = video.title
        progressMedia.videoId = video.id
      } else {
        progressMedia.videoId = state.video_id || stremioContentId(media) || undefined
      }
      bundle.progress.push({
        media: progressMedia,
        positionMs: positiveNumber(state.timeOffset),
        durationMs: positiveNumber(state.duration),
        updatedAt: lastWatched,
        source: provenance
      })
    }
  })

  return { bundle: dedupeBundle(bundle), issues }
}

function defaultStremioState(existing: any = {}) {
  return {
    ...existing,
    lastWatched: existing.lastWatched,
    timeWatched: Number(existing.timeWatched || 0),
    timeOffset: Number(existing.timeOffset || 0),
    overallTimeWatched: Number(existing.overallTimeWatched || 0),
    timesWatched: Number(existing.timesWatched || 0),
    flaggedWatched: existing.flaggedWatched || 0,
    duration: Number(existing.duration || 0),
    video_id: existing.video_id,
    watched: existing.watched,
    noNotif: Boolean(existing.noNotif)
  }
}

function episodeRefs(videos: readonly StremioVideo[]): EpisodeRef[] {
  const regularVideos = videos.filter(video => video.season > 0)
  const regularSeasons = new Set(regularVideos.map(video => video.season))
  const regularCoordinates = new Set(
    regularVideos.map(video => `${video.season}:${video.episode}`)
  )
  const inferSingleSeasonAbsolute = (
    regularSeasons.size === 1
    && regularCoordinates.size === regularVideos.length
  )
  return videos.map(video => ({
    season: video.season,
    episode: video.episode,
    absoluteEpisode: video.absoluteEpisode
      || (inferSingleSeasonAbsolute && video.season > 0 ? video.episode : undefined),
    title: video.title,
    videoId: video.id
  }))
}

function resolveStremioEpisode(media: MediaRef, videos: readonly StremioVideo[]) {
  if (!Number.isInteger(media.season) || !Number.isInteger(media.episode)) {
    return {
      status: 'unresolved' as const,
      confidence: 'none' as const,
      target: null,
      candidates: [],
      reason: 'The source episode has no deterministic season and episode number.'
    }
  }
  const requested: EpisodeRef = {
    season: Number(media.season),
    episode: Number(media.episode),
    absoluteEpisode: media.absoluteEpisode,
    title: media.episodeTitle,
    videoId: media.videoId
  }
  return remapEpisode(requested, [requested], episodeRefs(videos))
}

async function pushStremio(options: PushOptions): Promise<PushResult> {
  const { connection, bundle, scopes, log } = options
  logTo(log, 'Reading destination Stremio state before merging...')
  const currentRows = await stremioRequest(connection, '/datastoreGet', {
    collection: 'libraryItem',
    ids: [],
    all: true
  })
  const currentItems = Array.isArray(currentRows) ? currentRows : []
  const current = new Map<string, any>(currentItems.map((item: any) => [String(item._id), item]))
  const currentMedia = currentItems.map(mediaFromStremioItem)
  const bridgeMetadata = await loadBridgeMetadata([
    ...currentMedia.filter(media => !/^tt\d+$/i.test(String(media.ids.imdb || ''))),
    ...(scopes.progress
      ? bundle.progress
        .filter(record => !absoluteProgress(record))
        .map(record => record.media)
      : [])
  ], log)
  const currentByAlias = new Map<string, any>()
  currentItems.forEach((item: any, index: number) => {
    const media = withResolvedExternalIds(currentMedia[index], bridgeMetadata.get(currentMedia[index]))
    for (const alias of mediaAliasKeys(media)) {
      if (!currentByAlias.has(alias)) currentByAlias.set(alias, item)
    }
  })
  const written: PushCounts = { history: 0, progress: 0, library: 0 }
  const skipped: PushCounts = { history: 0, progress: 0, library: 0 }
  const issues: BridgeIssue[] = []
  const byId = new Map<string, {
    history: HistoryRecord[]
    progress: ProgressRecord[]
    library: LibraryRecord[]
    media: MediaRef
  }>()

  const addRecord = (
    scope: 'history' | 'progress' | 'library',
    record: HistoryRecord | ProgressRecord | LibraryRecord
  ) => {
    const id = stremioContentId(record.media)
    if (!id) {
      issues.push({ scope, status: 'unresolved', media: record.media, reason: 'Stremio needs an IMDb, Stremio, or TMDB content ID.' })
      return
    }
    if (!byId.has(id)) byId.set(id, { history: [], progress: [], library: [], media: record.media })
    ;(byId.get(id)![scope] as any[]).push(record)
  }
  if (scopes.history) {
    collapseHistoryToWatchedState(bundle.history).forEach(record => addRecord('history', record))
  }
  if (scopes.progress) {
    bundle.progress.forEach(record => addRecord('progress', record))
  }
  if (scopes.library) bundle.library.forEach(record => addRecord('library', record))

  const changes = (await mapLimit([...byId.entries()], 5, async ([id, group]) => {
    const existing = current.get(id) || mediaAliasKeys(group.media)
      .map(alias => currentByAlias.get(alias))
      .find(Boolean)
    const targetId = String(existing?._id || id)
    const meta = await fetchCinemetaMeta(group.media)
    const videos = orderedStremioVideos(meta)
    const isLibrary = group.library.length > 0
    const removed = isLibrary ? false : existing?.removed ?? true
    const temp = isLibrary
      ? false
      : removed && group.progress.length
        ? true
        : existing?.temp ?? true
    const timestamp = nowIso()
    const item: any = {
      ...(existing || {}),
      _id: targetId,
      name: existing?.name || meta?.name || group.media.title || targetId,
      type: group.media.kind === 'movie' ? 'movie' : 'series',
      poster: existing?.poster || meta?.poster,
      posterShape: existing?.posterShape || meta?.posterShape || 'poster',
      removed,
      temp,
      _ctime: existing?._ctime || timestamp,
      _mtime: timestamp,
      state: defaultStremioState(existing?.state),
      behaviorHints: existing?.behaviorHints || meta?.behaviorHints || {}
    }

    if (isLibrary) written.library++

    if (group.media.kind === 'movie') {
      if (group.history.length) {
        const latest = [...group.history].sort((a, b) => b.watchedAt - a.watchedAt)[0]
        const addedPlays = Math.max(1, ...group.history.map(record => Number(record.playCount || 1)))
        item.state.timesWatched = Math.max(Number(item.state.timesWatched || 0), addedPlays)
        item.state.flaggedWatched = 1
        item.state.lastWatched = new Date(latest.watchedAt).toISOString()
        written.history += group.history.length
      }
      if (group.progress.length) {
        const latest = [...group.progress].sort((a, b) => b.updatedAt - a.updatedAt)[0]
        const absolute = absoluteProgress(
          latest,
          positiveNumber(existing?.state?.duration)
            || positiveNumber(bridgeMetadata.get(latest.media)?.runtimeMs)
        )
        if (!absolute) {
          issues.push({ scope: 'progress', status: 'unresolved', media: latest.media, reason: 'Stremio needs a reliable runtime to convert this percentage.' })
        } else {
          item.state.timeOffset = Math.round(absolute.positionMs)
          item.state.duration = Math.round(absolute.durationMs)
          item.state.video_id = targetId
          item.state.lastWatched = new Date(latest.updatedAt).toISOString()
          written.progress++
        }
      }
      return item
    }

    if ((group.history.length || group.progress.length) && !videos.length) {
      const scope = group.history.length ? 'history' : 'progress'
      issues.push({
        scope,
        status: 'unresolved',
        media: group.media,
        reason: `${mediaLabel(group.media)} has no destination episode metadata, so Stremio state cannot be encoded safely.`
      })
      if (!isLibrary) return null
    }

    if (group.history.length && videos.length) {
      const watchedVideoIds: string[] = []
      for (const record of group.history) {
        const mapping = resolveStremioEpisode(record.media, videos)
        if (mapping.status !== 'mapped') {
          issues.push({
            scope: 'history',
            status: mapping.status,
            media: record.media,
            reason: mapping.reason
          })
          continue
        }
        watchedVideoIds.push(String(mapping.target.videoId))
        item.state.lastWatched = new Date(Math.max(
          asEpochMs(item.state.lastWatched, 0),
          record.watchedAt
        )).toISOString()
        written.history++
      }
      if (watchedVideoIds.length) {
        item.state.watched = await mergeStremioWatchedVideoIds(
          item.state.watched,
          videos.map(video => video.id),
          watchedVideoIds
        )
      }
    }

    if (group.progress.length && videos.length) {
      const latest = [...group.progress].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      const superseded = group.progress.length - 1
      if (superseded > 0) {
        skipped.progress += superseded
        issues.push({
          scope: 'progress',
          status: 'note',
          media: latest.media,
          reason: `Stremio stores one continue-watching position per series; ${superseded} older resume point${superseded === 1 ? '' : 's'} for ${mediaLabel(latest.media)} ${superseded === 1 ? 'was' : 'were'} skipped in favor of the newest.`
        })
      }
      const mapping = resolveStremioEpisode(latest.media, videos)
      if (mapping.status !== 'mapped') {
        issues.push({ scope: 'progress', status: mapping.status, media: latest.media, reason: mapping.reason })
      } else {
        const absolute = absoluteProgress(
          latest,
          positiveNumber(existing?.state?.duration)
            || positiveNumber(bridgeMetadata.get(latest.media)?.runtimeMs)
        )
        if (!absolute) {
          issues.push({ scope: 'progress', status: 'unresolved', media: latest.media, reason: 'Stremio needs a reliable runtime to convert this percentage.' })
        } else {
          item.state.timeOffset = Math.round(absolute.positionMs)
          item.state.duration = Math.round(absolute.durationMs)
          item.state.video_id = mapping.target.videoId
          item.state.season = mapping.target.season
          item.state.episode = mapping.target.episode
          item.state.lastWatched = new Date(latest.updatedAt).toISOString()
          written.progress++
        }
      }
    }
    return item
  })).filter(Boolean)

  await mapLimit(chunk(changes, 100), STREMIO_WRITE_CONCURRENCY, changesBatch => (
    stremioRequest(connection, '/datastorePut', {
      collection: 'libraryItem',
      changes: changesBatch
    })
  ))
  logTo(log, `Merged ${changes.length} Stremio library-state records.`)
  return {
    written,
    issues,
    skipped,
    // datastorePut returns one success response for the submitted batch. The
    // official Stremio sync flow treats that response as authoritative instead
    // of immediately reading the same records back. A direct reread can lag and
    // otherwise turn successful writes into false verification warnings.
    confirmedScopes: (['history', 'progress', 'library'] as const)
      .filter(scope => scopes[scope])
  }
}

export interface DestinationMappingIssue {
  scope: 'history' | 'progress'
  sourceMedia: MediaRef
  mapping: MappingOutcome
}

interface NuvioSearchCatalog {
  id: string
  type: string
}

interface NuvioMetaAddon {
  baseUrl: string
  kitsuSearchCatalogs: NuvioSearchCatalog[]
}

const KITSU_MAX_INSTALLMENTS = 24
const KITSU_INSTALLMENT_MAX_CATALOG_DELTA_RATIO = 0.06
const nuvioAddonCache = new Map<string, Promise<NuvioMetaAddon[]>>()
const nuvioEpisodeCache = new Map<string, Promise<EpisodeRef[]>>()
const traktTargetEpisodeCache = new Map<string, Promise<EpisodeRef[]>>()
const nuvioKitsuSearchCache = new Map<string, Promise<string | null>>()
const kitsuSequelCache = new Map<string, Promise<string | null>>()

function nuvioAddonProfileId(connection: BridgeConnection): number {
  const selected = Number(connection.profileId)
  const profile = connection.profiles?.find(item => Number(item.profile_index) === selected)
  return profile?.uses_primary_addons === true ? 1 : selected
}

export function invalidateNuvioMetadataCaches(connection: BridgeConnection): void {
  const profileKey = `${connection.accountId}:${connection.profileId}`
  nuvioAddonCache.delete(`${connection.accountId}:${nuvioAddonProfileId(connection)}`)
  for (const key of nuvioEpisodeCache.keys()) {
    if (key.startsWith(`${profileKey}:`)) nuvioEpisodeCache.delete(key)
  }
  for (const key of nuvioKitsuSearchCache.keys()) {
    if (key.startsWith(`${profileKey}:`)) nuvioKitsuSearchCache.delete(key)
  }
}

function addonBaseUrl(value: unknown): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    url.hash = ''
    url.pathname = url.pathname
      .replace(/\/manifest\.json\/?$/i, '')
      .replace(/\/+$/, '') || '/'
    return url.toString()
  } catch {
    return ''
  }
}

function addonResourceUrl(baseUrl: string, resourcePath: string): string {
  const url = new URL(baseUrl)
  const basePath = url.pathname.replace(/\/+$/, '')
  const suffix = String(resourcePath || '').replace(/^\/+/, '')
  url.pathname = `${basePath}/${suffix}`
  return url.toString()
}

function manifestResourceName(resource: unknown): string {
  return String(typeof resource === 'string' ? resource : (resource as any)?.name || '')
    .trim()
    .toLowerCase()
}

function manifestIdPrefixes(manifest: any): string[] {
  const resources = Array.isArray(manifest?.resources) ? manifest.resources : []
  return [
    ...(Array.isArray(manifest?.idPrefixes) ? manifest.idPrefixes : []),
    ...resources.flatMap((resource: any) => (
      Array.isArray(resource?.idPrefixes) ? resource.idPrefixes : []
    ))
  ].map(value => String(value || '').trim().toLowerCase().replace(/:$/, ''))
}

function kitsuSearchCatalogs(manifest: any): NuvioSearchCatalog[] {
  const prefixes = manifestIdPrefixes(manifest)
  const manifestId = String(manifest?.id || '').trim().toLowerCase()
  const declaresKitsu = prefixes.includes('kitsu') || manifestId.includes('kitsu')
  if (!declaresKitsu) return []

  return (Array.isArray(manifest?.catalogs) ? manifest.catalogs : [])
    .filter((catalog: any) => (
      catalog
      && String(catalog.id || '').trim()
      && String(catalog.type || '').trim()
      && Array.isArray(catalog.extra)
      && catalog.extra.some((extra: any) => (
        String(typeof extra === 'string' ? extra : extra?.name || '').trim().toLowerCase() === 'search'
      ))
    ))
    .map((catalog: any) => ({
      id: String(catalog.id).trim(),
      type: String(catalog.type).trim()
    }))
}

async function nuvioMetadataAddons(
  connection: BridgeConnection,
  log?: BridgeLog,
  signal?: AbortSignal
): Promise<NuvioMetaAddon[]> {
  const addonProfileId = nuvioAddonProfileId(connection)
  const cacheKey = `${connection.accountId}:${addonProfileId}`
  if (!nuvioAddonCache.has(cacheKey)) {
    const request = (async () => {
      let rows: any
      try {
        rows = await nuvioRest(connection, 'addons', {
          select: 'url,name,sort_order,profile_id,enabled',
          profile_id: `eq.${addonProfileId}`,
          order: 'sort_order.asc'
        }, {
          signal,
          timeoutMs: NUVIO_ADDON_QUERY_TIMEOUT_MS,
          timeoutMessage: 'Nuvio did not return the enabled add-ons before the deadline.'
        })
      } catch (error: any) {
        logTo(
          log,
          `Warning: Could not read enabled Nuvio add-ons (${error?.message || 'request failed'}); continuing without optional Kitsu identity resolution.`
        )
        return []
      }
      const baseUrls = (Array.isArray(rows) ? rows : [])
        .filter(row => row?.url && row.enabled !== false)
        .map(row => addonBaseUrl(row.url))
        .filter(Boolean)
      const resolved = await mapLimit(
        baseUrls,
        NUVIO_ADDON_MANIFEST_CONCURRENCY,
        async (baseUrl): Promise<NuvioMetaAddon | null> => {
          if (signal?.aborted) throw signal.reason
          try {
            const manifest = (await requestBridgeJson(
              addonResourceUrl(baseUrl, 'manifest.json'),
              {
                signal,
                timeoutMs: ADDON_RESOURCE_TIMEOUT_MS,
                timeoutMessage: 'A Nuvio add-on manifest did not respond before the deadline.'
              }
            )).data
            const resources = Array.isArray(manifest?.resources) ? manifest.resources : []
            if (resources.some((resource: any) => manifestResourceName(resource) === 'meta')) {
              return {
                baseUrl,
                kitsuSearchCatalogs: kitsuSearchCatalogs(manifest)
              }
            }
          } catch (error) {
            if (signal?.aborted) throw signal.reason || error
            // Try the next enabled addon.
          }
          return null
        }
      )
      return resolved.filter((addon): addon is NuvioMetaAddon => Boolean(addon))
    })()
    nuvioAddonCache.set(cacheKey, request)
  }
  const pending = nuvioAddonCache.get(cacheKey)!
  try {
    return await pending
  } catch (error) {
    if (nuvioAddonCache.get(cacheKey) === pending) nuvioAddonCache.delete(cacheKey)
    throw error
  }
}

function metadataYear(value: any): number | null {
  for (const candidate of [
    value?.year,
    value?.releaseInfo,
    value?.release_info,
    value?.released
  ]) {
    const match = /(?:^|\D)((?:19|20)\d{2})(?:\D|$)/.exec(String(candidate ?? ''))
    const year = Number(match?.[1])
    if (Number.isInteger(year) && year > 0) return year
  }
  return null
}

function metadataTitles(value: any): string[] {
  const titles = [
    value?.name,
    value?.title,
    ...(Array.isArray(value?.aliases) ? value.aliases : []),
    ...Object.values(value?.titles || {}),
    ...Object.values(value?.alternativeTitles || {})
  ]
  return [...new Set(titles.map(title => normalizeTitle(title)).filter(Boolean))]
}

interface KitsuSearchCandidate {
  contentId: string
  year: number | null
  titleMatch: boolean
}

function kitsuSearchCandidates(
  metas: readonly any[],
  media: MediaRef
): KitsuSearchCandidate[] {
  const title = normalizeTitle(media.title)
  const matches = new Map<string, KitsuSearchCandidate>()
  for (const meta of metas) {
    const contentId = normalizedKitsuContentId(meta?.id)
    if (!contentId) continue
    const current = matches.get(contentId)
    const year = metadataYear(meta)
    matches.set(contentId, {
      contentId,
      year: current?.year ?? year,
      titleMatch: Boolean(current?.titleMatch || (title && metadataTitles(meta).includes(title)))
    })
  }
  return [...matches.values()]
}

function normalizedImdbContentId(value: unknown): string | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  return /^tt\d+$/.test(normalized) ? normalized : null
}

function metadataImdbContentId(meta: any): string | null {
  return normalizedImdbContentId(
    meta?.imdb_id
    || meta?.imdbId
    || meta?.ids?.imdb
    || meta?.externalIds?.imdb
  )
}

async function verifyKitsuCandidateImdb(
  addon: NuvioMetaAddon,
  catalog: NuvioSearchCatalog,
  candidate: KitsuSearchCandidate,
  media: MediaRef,
  signal?: AbortSignal
): Promise<boolean | null> {
  const sourceImdb = normalizedImdbContentId(media.ids.imdb)
  if (!sourceImdb) return null
  try {
    const { data } = await requestBridgeJson(
      addonResourceUrl(
        addon.baseUrl,
        `meta/${encodeURIComponent(catalog.type)}/${encodeURIComponent(candidate.contentId)}.json`
      ),
      {
        signal,
        timeoutMs: ADDON_RESOURCE_TIMEOUT_MS,
        timeoutMessage: 'A Kitsu candidate metadata request did not respond before the deadline.'
      }
    )
    const candidateImdb = metadataImdbContentId(data?.meta)
    return candidateImdb ? candidateImdb === sourceImdb : null
  } catch (error) {
    if (signal?.aborted) throw signal.reason || error
    return null
  }
}

async function resolveNuvioKitsuContentId(
  connection: BridgeConnection,
  media: MediaRef,
  addons: readonly NuvioMetaAddon[],
  signal?: AbortSignal
): Promise<string | null> {
  const existing = kitsuContentId(media)
  if (existing) return existing
  const title = normalizeTitle(media.title)
  if (media.kind !== 'series' || !title) return null

  const year = Number.isInteger(media.year) ? Number(media.year) : 0
  const key = `${connection.accountId}:${connection.profileId}:${
    [
      title,
      year,
      mediaAliasKeys(media).join(',')
    ].map(value => encodeURIComponent(String(value ?? ''))).join(':')
  }`
  if (!nuvioKitsuSearchCache.has(key)) {
    const request = (async () => {
      const verified = new Set<string>()
      const exactYearFallback = new Set<string>()
      const unknownYearFallback = new Set<string>()
      const unqualifiedFallback = new Set<string>()
      const sourceYear = Number(media.year)
      let sawCatalogFailure = false
      for (const addon of addons) {
        for (const catalog of addon.kitsuSearchCatalogs) {
          if (signal?.aborted) throw signal.reason
          try {
            const { data } = await requestBridgeJson(
              addonResourceUrl(
                addon.baseUrl,
                `catalog/${encodeURIComponent(catalog.type)}`
                + `/${encodeURIComponent(catalog.id)}`
                + `/search=${encodeURIComponent(String(media.title || '').trim())}.json`
              ),
              {
                signal,
                timeoutMs: ADDON_RESOURCE_TIMEOUT_MS,
                timeoutMessage: 'A Kitsu catalog search did not respond before the deadline.'
              }
            )
            const candidates = kitsuSearchCandidates(
              Array.isArray(data?.metas) ? data.metas : [],
              media
            )
            const verifiedCandidates = await mapLimit(
              candidates,
              NUVIO_KITSU_CANDIDATE_CONCURRENCY,
              async candidate => ({
                candidate,
                imdbMatch: await verifyKitsuCandidateImdb(
                  addon,
                  catalog,
                  candidate,
                  media,
                  signal
                )
              })
            )
            for (const { candidate, imdbMatch } of verifiedCandidates) {
              if (imdbMatch === true) {
                verified.add(candidate.contentId)
                continue
              }
              if (imdbMatch === false) continue
              // Without an IMDb assertion from the addon, require the catalog
              // result itself to match the normalized source title exactly.
              if (!candidate.titleMatch) continue
              if (!Number.isInteger(sourceYear) || sourceYear <= 0) {
                unqualifiedFallback.add(candidate.contentId)
              } else if (candidate.year === sourceYear) {
                exactYearFallback.add(candidate.contentId)
              } else if (candidate.year === null) {
                unknownYearFallback.add(candidate.contentId)
              }
            }
          } catch (error) {
            if (signal?.aborted) throw signal.reason || error
            sawCatalogFailure = true
            // Try every enabled Kitsu search catalog before declaring no match.
          }
        }
      }
      if (verified.size) return verified.size === 1 ? [...verified][0] : null
      if (exactYearFallback.size) {
        return exactYearFallback.size === 1 ? [...exactYearFallback][0] : null
      }
      if (unknownYearFallback.size) {
        return unknownYearFallback.size === 1 ? [...unknownYearFallback][0] : null
      }
      if (unqualifiedFallback.size) {
        return unqualifiedFallback.size === 1 ? [...unqualifiedFallback][0] : null
      }
      if (sawCatalogFailure) {
        throw new Error('One or more enabled Kitsu catalogs were unavailable.')
      }
      return null
    })()
    nuvioKitsuSearchCache.set(key, request)
  }
  const pending = nuvioKitsuSearchCache.get(key)!
  try {
    return await pending
  } catch (error) {
    if (nuvioKitsuSearchCache.get(key) === pending) nuvioKitsuSearchCache.delete(key)
    throw error
  }
}

async function resolveNuvioKitsuAliases(
  connection: BridgeConnection,
  mediaRefs: readonly MediaRef[],
  log?: BridgeLog
): Promise<void> {
  const groups = new Map<string, MediaRef[]>()
  for (const media of mediaRefs) {
    if (media.kind !== 'series') continue
    const title = normalizeTitle(media.title)
    if (!title) continue
    const identity = mediaAliasKeys(media)[0]
      || `series:title:${title}:${Number.isInteger(media.year) ? media.year : ''}`
    const group = groups.get(identity)
    if (group) group.push(media)
    else groups.set(identity, [media])
  }
  if (!groups.size) return

  const deadlineController = new AbortController()
  const deadline = setTimeout(() => {
    const error = new Error('Optional Kitsu identity resolution reached its overall deadline.')
    error.name = 'TimeoutError'
    deadlineController.abort(error)
  }, NUVIO_KITSU_RESOLUTION_TIMEOUT_MS)

  let addons: NuvioMetaAddon[] = []
  try {
    logTo(log, 'Checking enabled Nuvio add-ons for optional Kitsu identity support...')
    addons = await nuvioMetadataAddons(connection, log, deadlineController.signal)
  } catch (error: any) {
    logTo(
      log,
      `Warning: Kitsu identity resolution could not start (${error?.message || 'request failed'}); continuing with IMDb/TMDB identities.`
    )
    clearTimeout(deadline)
    return
  }

  const kitsuAddons = addons.filter(addon => addon.kitsuSearchCatalogs.length)
  if (!kitsuAddons.length) {
    clearTimeout(deadline)
    logTo(log, 'No enabled Kitsu search catalog was found; continuing with IMDb/TMDB identities.')
    return
  }

  let resolvedCount = 0
  const unresolvedGroups: MediaRef[][] = []
  for (const group of groups.values()) {
    const existing = group.map(kitsuContentId).find(Boolean) || null
    if (existing) {
      for (const media of group) applyKitsuContentId(media, existing)
    } else {
      unresolvedGroups.push(group)
    }
  }

  if (!unresolvedGroups.length) {
    clearTimeout(deadline)
    return
  }

  logTo(log, `Checking ${unresolvedGroups.length} series against enabled Kitsu catalogs...`)
  let completedCount = 0
  let failedCount = 0
  await mapLimit(unresolvedGroups, NUVIO_KITSU_SEARCH_CONCURRENCY, async group => {
    if (deadlineController.signal.aborted) return
    try {
      const contentId = await resolveNuvioKitsuContentId(
        connection,
        group[0],
        kitsuAddons,
        deadlineController.signal
      )
      if (contentId) {
        for (const media of group) applyKitsuContentId(media, contentId)
        resolvedCount++
      }
    } catch {
      if (!deadlineController.signal.aborted) failedCount++
    } finally {
      completedCount++
      if (
        completedCount === unresolvedGroups.length
        || completedCount % NUVIO_KITSU_PROGRESS_INTERVAL === 0
      ) {
        logTo(log, `Kitsu identity lookup progress: ${completedCount}/${unresolvedGroups.length}.`)
      }
    }
  })
  clearTimeout(deadline)

  if (deadlineController.signal.aborted) {
    logTo(
      log,
      `Warning: Kitsu identity lookup stopped after ${Math.round(NUVIO_KITSU_RESOLUTION_TIMEOUT_MS / 1_000)} seconds at ${completedCount}/${unresolvedGroups.length}; continuing with IMDb/TMDB identities.`
    )
  } else if (failedCount) {
    logTo(
      log,
      `Warning: ${failedCount} Kitsu identity ${failedCount === 1 ? 'lookup was' : 'lookups were'} unavailable; continuing with IMDb/TMDB identities for those titles.`
    )
  }
  if (resolvedCount) {
    logTo(
      log,
      `Resolved ${resolvedCount} anime title${resolvedCount === 1 ? '' : 's'} through enabled Kitsu catalogs.`
    )
  }
}

async function kitsuSequelContentId(contentId: string): Promise<string | null> {
  const normalized = normalizedKitsuContentId(contentId)
  if (!normalized) return null
  if (!kitsuSequelCache.has(normalized)) {
    kitsuSequelCache.set(normalized, (async () => {
      try {
        const kitsuId = normalized.slice('kitsu:'.length)
        let nextUrl: string | null = `${KITSU_API}/anime/${encodeURIComponent(kitsuId)}`
          + '/media-relationships?include=destination&page%5Blimit%5D=20'
        const sequels = new Set<string>()
        for (let page = 0; nextUrl && page < 5; page++) {
          const { data } = await requestBridgeJson(nextUrl, {
            timeoutMs: ADDON_RESOURCE_TIMEOUT_MS,
            timeoutMessage: 'Kitsu relationship metadata did not respond before the deadline.'
          })
          for (const relationship of Array.isArray(data?.data) ? data.data : []) {
            if (String(relationship?.attributes?.role || '').toLowerCase() !== 'sequel') continue
            const destination = relationship?.relationships?.destination?.data
            if (String(destination?.type || '').toLowerCase() !== 'anime') continue
            const sequel = normalizedKitsuContentId(`kitsu:${destination?.id ?? ''}`)
            if (sequel && sequel !== normalized) sequels.add(sequel)
          }
          const rawNext = String(data?.links?.next || '').trim()
          if (!rawNext) {
            nextUrl = null
            continue
          }
          const parsedNext = new URL(rawNext, KITSU_API)
          nextUrl = parsedNext.origin === new URL(KITSU_API).origin
            ? parsedNext.toString()
            : null
        }
        return sequels.size === 1 ? [...sequels][0] : null
      } catch {
        return null
      }
    })())
  }
  const pending = kitsuSequelCache.get(normalized)!
  const sequel = await pending
  // A missing linkage is not authoritative: Kitsu omits relationship data
  // without `include=destination`, and transient API failures are common.
  // Cache only a positive edge so the next preview can recover by retrying.
  if (!sequel && kitsuSequelCache.get(normalized) === pending) {
    kitsuSequelCache.delete(normalized)
  }
  return sequel
}

async function kitsuInstallmentContentIds(contentId: string): Promise<string[]> {
  const first = normalizedKitsuContentId(contentId)
  if (!first) return []
  const output = [first]
  const seen = new Set(output)
  while (output.length < KITSU_MAX_INSTALLMENTS) {
    const next = await kitsuSequelContentId(output.at(-1)!)
    if (!next || seen.has(next)) break
    seen.add(next)
    output.push(next)
  }
  return output
}

function regularEpisodeCount(episodes: readonly EpisodeRef[]): number {
  const identities = new Set<string>()
  for (const episode of episodes) {
    if (episode.season <= 0 || episode.episode <= 0) continue
    const owner = String(episode.contentId || '')
    identities.add(`${owner}:${episode.season}:${episode.episode}`)
  }
  return identities.size
}

async function nuvioEpisodeRefsForCandidate(
  addons: readonly NuvioMetaAddon[],
  candidate: string
): Promise<EpisodeRef[]> {
  for (const addon of addons) {
    const types = normalizedKitsuContentId(candidate)
      ? ['anime', 'series', 'tv']
      : ['series', 'tv', 'anime']
    for (const type of types) {
      try {
        const { data } = await requestBridgeJson(
          addonResourceUrl(
            addon.baseUrl,
            `meta/${type}/${encodeURIComponent(candidate)}.json`
          ),
          {
            timeoutMs: ADDON_RESOURCE_TIMEOUT_MS,
            timeoutMessage: 'A Nuvio add-on metadata request did not respond before the deadline.'
          }
        )
        const videos = orderedStremioVideos(data?.meta)
        if (!videos.length) continue
        const episodes = episodeRefs(videos).map(episode => ({
          ...episode,
          contentId: candidate
        }))
        return episodes
      } catch {
        // Try the next ID/type/addon combination.
      }
    }
  }
  return []
}

async function nuvioKitsuInstallmentEpisodes(
  addons: readonly NuvioMetaAddon[],
  contentId: string,
  firstEpisodes: readonly EpisodeRef[],
  sourceEpisodes: readonly EpisodeRef[]
): Promise<EpisodeRef[]> {
  const sourceCount = regularEpisodeCount(sourceEpisodes)
  const firstCount = regularEpisodeCount(firstEpisodes)
  if (!sourceCount || sourceCount <= firstCount) return [...firstEpisodes]

  const installmentIds = await kitsuInstallmentContentIds(contentId)
  if (installmentIds.length < 2) return [...firstEpisodes]

  const catalogs: Array<{ contentId: string; episodes: readonly EpisodeRef[] }> = [{
    contentId: installmentIds[0],
    episodes: firstEpisodes
  }]
  let destinationCount = firstCount
  for (const installmentId of installmentIds.slice(1)) {
    const episodes = await nuvioEpisodeRefsForCandidate(addons, installmentId)
    if (!episodes.length) break
    catalogs.push({ contentId: installmentId, episodes })
    destinationCount += regularEpisodeCount(episodes)
    if (destinationCount >= sourceCount) break
  }
  if (catalogs.length < 2) return [...firstEpisodes]
  const catalogDeltaRatio = Math.abs(sourceCount - destinationCount)
    / Math.max(sourceCount, destinationCount)
  if (catalogDeltaRatio > KITSU_INSTALLMENT_MAX_CATALOG_DELTA_RATIO) {
    return [...firstEpisodes]
  }

  let sequenceIndex = 0
  return catalogs.flatMap(catalog => catalog.episodes.map(episode => ({
    ...episode,
    contentId: catalog.contentId,
    sequenceIndex: sequenceIndex++
  })))
}

async function nuvioTargetEpisodes(
  connection: BridgeConnection,
  media: MediaRef,
  sourceEpisodes: readonly EpisodeRef[] = []
): Promise<EpisodeRef[]> {
  const contentIds = nuvioContentIds(media)
  if (!contentIds.length) return []
  const sourceEpisodeCount = sourceEpisodes.filter(episode => (
    episode.season > 0 && episode.episode > 0
  )).length
  const key = `${connection.accountId}:${connection.profileId}:${sourceEpisodeCount}:${contentIds.join('|')}`
  if (!nuvioEpisodeCache.has(key)) {
    nuvioEpisodeCache.set(key, (async () => {
      const addons = await nuvioMetadataAddons(connection)
      if (!addons.length) return []
      const candidates: string[] = []
      const addCandidate = (value: unknown) => {
        const normalized = String(value ?? '').trim()
        if (normalized && !candidates.includes(normalized)) candidates.push(normalized)
      }
      for (const id of contentIds) {
        // Keep the resolved native Kitsu identity (or canonical IMDb fallback)
        // first, then try the bare provider value for addons that do not accept
        // namespaced provider IDs.
        addCandidate(id)
        addCandidate(id.replace(/^(tmdb|tvdb|trakt|simkl|kitsu):/i, ''))
      }
      // Try the preferred ID across every addon before falling back to the next
      // namespace. This keeps the selected native catalog identity stable even
      // when an earlier addon can answer only for a lower-priority alias.
      let best: EpisodeRef[] = []
      for (const candidate of candidates) {
        const episodes = await nuvioEpisodeRefsForCandidate(addons, candidate)
        if (!episodes.length) continue
        const catalog = normalizedKitsuContentId(candidate)
          ? await nuvioKitsuInstallmentEpisodes(addons, candidate, episodes, sourceEpisodes)
          : episodes
        if (!sourceEpisodeCount) return catalog
        const count = regularEpisodeCount(catalog)
        const bestCount = regularEpisodeCount(best)
        if (
          !best.length
          || Math.abs(sourceEpisodeCount - count) < Math.abs(sourceEpisodeCount - bestCount)
        ) {
          best = catalog
        }
        // Preserve provider/add-on priority for an exact complete catalog.
        // Otherwise compare every alias and retain the closest structure;
        // merely being larger can indicate duplicated or unrelated videos.
        if (count === sourceEpisodeCount) return catalog
      }
      return best
    })())
  }
  return nuvioEpisodeCache.get(key)!
}

async function traktTargetEpisodes(
  connection: BridgeConnection,
  media: MediaRef
): Promise<EpisodeRef[]> {
  const showId = media.ids.trakt || media.ids.imdb || media.ids.slug
  if (!showId) return []
  const key = `${connection.accountId}:${showId}`
  if (!traktTargetEpisodeCache.has(key)) {
    const request = traktRequest(
      connection,
      `/shows/${encodeURIComponent(String(showId))}/seasons`,
      { extended: 'episodes,full' }
    ).then(({ data }) => {
      const episodes: EpisodeRef[] = []
      for (const season of Array.isArray(data) ? data : []) {
        for (const episode of season.episodes || []) {
          const seasonNumber = Number(season.number)
          const episodeNumber = Number(episode.number)
          if (!Number.isInteger(seasonNumber) || !Number.isInteger(episodeNumber)) continue
          episodes.push({
            season: seasonNumber,
            episode: episodeNumber,
            absoluteEpisode: Number(episode.number_abs) || undefined,
            title: episode.title,
            videoId: traktEpisodeVideoId(episode)
          })
        }
      }
      return episodes
    })
    traktTargetEpisodeCache.set(key, request)
  }
  const pending = traktTargetEpisodeCache.get(key)!
  try {
    return await pending
  } catch {
    // Network/authorization failures are not authoritative empty catalogs.
    // Let a later preview retry after the connection recovers.
    if (traktTargetEpisodeCache.get(key) === pending) traktTargetEpisodeCache.delete(key)
    return []
  }
}

function simklTargetEpisodes(connection: BridgeConnection, media: MediaRef): EpisodeRef[] {
  const cache = simklEpisodeCatalogCaches.get(simklCacheAccountKey(connection))
  if (!cache) return []
  const enriched = enrichMediaFromSimklSnapshot(connection, media)
  const catalogs = [...new Set(
    simklSnapshotLookupKeys(enriched).map(key => cache.get(key)).filter(Boolean)
  )] as EpisodeRef[][]
  return mergeSimklEpisodeCatalogs(catalogs)
}

async function targetEpisodesFor(
  connection: BridgeConnection,
  media: MediaRef,
  sourceEpisodes: readonly EpisodeRef[] = []
): Promise<EpisodeRef[]> {
  if (connection.service === 'stremio') {
    return episodeRefs(orderedStremioVideos(await fetchCinemetaMeta(media)))
  }
  if (connection.service === 'nuvio') return nuvioTargetEpisodes(connection, media, sourceEpisodes)
  if (connection.service === 'trakt') return traktTargetEpisodes(connection, media)
  if (connection.service === 'simkl') return simklTargetEpisodes(connection, media)
  if (connection.service === 'plex') return plexTargetEpisodes(connection, media)
  if (connection.service === 'jellyfin') return jellyfinTargetEpisodes(connection, media)
  return []
}

async function tryNuvioKitsuFallback(
  connection: BridgeConnection,
  bundle: CanonicalBundle,
  media: MediaRef,
  sourceEpisodes: readonly EpisodeRef[]
): Promise<EpisodeRef[]> {
  if (connection.service !== 'nuvio' || kitsuContentId(media)) return []
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    const error = new Error('On-demand Kitsu mapping reached its deadline.')
    error.name = 'TimeoutError'
    controller.abort(error)
  }, NUVIO_KITSU_FALLBACK_TIMEOUT_MS)
  try {
    const addons = (await nuvioMetadataAddons(connection, undefined, controller.signal))
      .filter(addon => addon.kitsuSearchCatalogs.length)
    if (!addons.length) return []
    const contentId = await resolveNuvioKitsuContentId(
      connection,
      media,
      addons,
      controller.signal
    )
    if (!contentId) return []

    const sharedAliases = new Set(mediaAliasKeys(media))
    for (const record of [...bundle.history, ...bundle.progress, ...bundle.library]) {
      if (mediaAliasKeys(record.media).some(alias => sharedAliases.has(alias))) {
        applyKitsuContentId(record.media, contentId)
      }
    }
    return nuvioTargetEpisodes(connection, media, sourceEpisodes)
  } catch {
    return []
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Preflights episode numbering against the destination's actual catalog. A
 * direct coordinate/title/absolute match is returned to the pure planner;
 * ambiguous matches remain visible and are never written.
 */
export async function inspectDestinationMappings(
  connection: BridgeConnection,
  bundle: CanonicalBundle,
  scopes: SyncScopes,
  log?: BridgeLog,
  sourceConnection?: BridgeConnection
): Promise<DestinationMappingIssue[]> {
  if (!['stremio', 'nuvio', 'trakt', 'simkl', 'plex', 'jellyfin'].includes(connection.service)) return []
  const selectedRecords: Array<{
    scope: 'history' | 'progress'
    media: MediaRef
    progress?: ProgressRecord
  }> = [
    ...(scopes.history ? bundle.history.map(record => ({ scope: 'history' as const, media: record.media })) : []),
    ...(scopes.progress ? bundle.progress.map(record => ({ scope: 'progress' as const, media: record.media, progress: record })) : [])
  ]
  const recordsByKey = new Map<string, typeof selectedRecords[number]>()
  for (const record of selectedRecords) {
    if (record.media.kind !== 'series') continue
    const parsedVideo = parseStremioVideoId(record.media.videoId)
    const parsedAnimeVideo = parseSimklAnimeVideoId(record.media.videoId)
    const hasExplicitCoordinates = Number.isInteger(record.media.season)
      && Number.isInteger(record.media.episode)
    // Completed-series markers are a first-class Nuvio/Simkl state. They have
    // no episode to remap and must pass through unchanged.
    if (!hasExplicitCoordinates && !parsedVideo && !parsedAnimeVideo) continue
    const identity = canonicalEpisodeKey(record.media)
      || mediaAliasKeys(record.media)[0]
      || [
        record.media.kind,
        normalizeTitle(record.media.title),
        Number(record.media.year) || '',
        Number(record.media.season),
        Number(record.media.episode),
        Number(record.media.absoluteEpisode) || '',
        String(record.media.videoId || '')
      ].join(':')
    const key = `${record.scope}:${identity}`
    if (!recordsByKey.has(key)) recordsByKey.set(key, record)
  }
  const records = [...recordsByKey.values()]
  if (!records.length) return []

  // Schedule metadata work by series, not by episode. Trakt history is often
  // ordered in binge-sized blocks; limiting the raw episode list can otherwise
  // fill every worker with episodes that all await the same cached request,
  // reducing effective metadata concurrency from six series to one.
  const seriesGroups = new Map<string, typeof records>()
  for (const record of records) {
    const title = normalizeTitle(record.media.title)
    const identity = mediaAliasKeys(record.media)[0]
      || `series:title:${title}:${Number.isInteger(record.media.year) ? record.media.year : ''}`
    const group = seriesGroups.get(identity)
    if (group) group.push(record)
    else seriesGroups.set(identity, [record])
  }
  const groups = [...seriesGroups.values()]
  const collapsed = selectedRecords.length - records.length
  logTo(
    log,
    `Checking ${records.length} unique selected records against ${connection.service} metadata`
    + ` across ${groups.length} series`
    + `${collapsed ? ` (${collapsed} duplicate or non-episode records skipped)` : ''}...`
  )

  const mappingForRecord = (
    record: typeof records[number],
    sourceEpisodes: readonly EpisodeRef[],
    targets: readonly EpisodeRef[]
  ): DestinationMappingIssue | null => {
    const parsedVideo = parseStremioVideoId(record.media.videoId)
    const parsedAnimeVideo = parseSimklAnimeVideoId(record.media.videoId)
    const requested: EpisodeRef = {
      season: Number.isInteger(record.media.season)
        ? Number(record.media.season)
        : parsedVideo?.season ?? (parsedAnimeVideo ? 0 : Number.NaN),
      episode: Number.isInteger(record.media.episode)
        ? Number(record.media.episode)
        : parsedVideo?.episode ?? parsedAnimeVideo?.episode ?? Number.NaN,
      absoluteEpisode: record.media.absoluteEpisode,
      title: record.media.episodeTitle,
      videoId: record.media.videoId
    }
    const mappingOptions = connection.service === 'nuvio'
      ? { allowUnanchoredSameIndex: true }
      : undefined
    let mapping: MappingOutcome | null = targets.length
      ? remapEpisode(
          requested,
          sourceEpisodes.length ? sourceEpisodes : [requested],
          targets,
          mappingOptions
        )
      : null
    // Simkl's official resolver can still match the write directly by IDs or
    // title/year. Its cached catalog is an enrichment path, not a reason to
    // reject a record when no deterministic episode projection is available.
    if (connection.service === 'simkl' && (!targets.length || mapping?.status !== 'mapped')) {
      return null
    }
    if (
      connection.service === 'simkl'
      && mapping?.status === 'mapped'
      && !parseSimklAnimeVideoId(record.media.videoId)
    ) {
      // Keep Nuvio's original TV-style catalog identity. The destination
      // catalog still supplies corrected S/E coordinates, but replacing a
      // parent IMDb/TVDB video ID with Simkl's native MAL/Kitsu episode ID
      // would incorrectly switch the mutation to flat-anime mode.
      mapping = {
        ...mapping,
        target: {
          ...mapping.target,
          videoId: record.media.videoId,
          contentId: record.media.destinationContentId
        }
      }
    }
    if (!targets.length) {
      const reason = connection.service === 'stremio'
        ? 'Stremio has no episode metadata for this series; its watched bitfield cannot be encoded safely.'
        : connection.service === 'nuvio'
          ? 'Nuvio has no episode metadata for this series; its episode state cannot be mapped safely.'
          : connection.service === 'plex'
            ? 'Plex does not contain a matching episode on the selected server.'
            : connection.service === 'jellyfin'
              ? 'Jellyfin does not contain a matching episode on the connected server.'
              : 'Trakt has no episode metadata for this series; its episode state cannot be mapped safely.'
      return {
        scope: record.scope,
        sourceMedia: record.media,
        mapping: {
          status: 'unresolved',
          confidence: 'none',
          target: null,
          candidates: [],
          reason
        } as MappingOutcome
      }
    }
    return {
      scope: record.scope,
      sourceMedia: record.media,
      mapping: mapping!
    }
  }

  let completedGroups = 0
  let completedRecords = 0
  const logProgress = () => logTo(
    log,
    `${connection.service} metadata mapping progress: ${completedGroups}/${groups.length} series`
    + `; ${completedRecords}/${records.length} records checked.`
  )
  const heartbeat = setInterval(logProgress, DESTINATION_MAPPING_HEARTBEAT_MS)
  try {
    const issuesBySeries = await mapLimit(
      groups,
      DESTINATION_MAPPING_CONCURRENCY,
      async group => {
        const representative = group[0]
        try {
          const sourceEpisodes = sourceConnection
            ? await targetEpisodesFor(sourceConnection, representative.media)
            : []
          let targets = await targetEpisodesFor(
            connection,
            representative.media,
            sourceEpisodes
          )
          let groupIssues = group.map(record => (
            mappingForRecord(record, sourceEpisodes, targets)
          ))
          if (
            connection.service === 'nuvio'
            && groupIssues.some(issue => issue?.mapping.status !== 'mapped')
          ) {
            const fallbackTargets = await tryNuvioKitsuFallback(
              connection,
              bundle,
              representative.media,
              sourceEpisodes
            )
            if (fallbackTargets.length) {
              targets = fallbackTargets
              groupIssues = group.map(record => (
                mappingForRecord(record, sourceEpisodes, targets)
              ))
            }
          }
          return groupIssues
        } finally {
          completedGroups++
          completedRecords += group.length
          if (
            completedGroups === 1
            || completedGroups === groups.length
            || completedGroups % DESTINATION_MAPPING_PROGRESS_INTERVAL === 0
          ) {
            logProgress()
          }
        }
      }
    )
    return issuesBySeries
      .flat()
      .filter((issue): issue is DestinationMappingIssue => Boolean(issue))
  } finally {
    clearInterval(heartbeat)
  }
}

export async function createMediaBridgeVerificationCheckpoint(
  options: Pick<PullOptions, 'connection' | 'log'>
): Promise<MediaBridgeVerificationCheckpoint> {
  if (options.connection.service !== 'simkl') return {}
  try {
    const { data } = await simklRequest(options.connection, '/sync/activities')
    return {
      simklActivity: typeof data?.all === 'string' ? data.all : undefined
    }
  } catch (error: any) {
    logTo(options.log, `Could not capture Simkl activity before writing: ${errorDetail(error?.body, error?.message)}`)
    return {}
  }
}

function mergeVerificationBundle(baseline: CanonicalBundle, delta: CanonicalBundle): CanonicalBundle {
  return dedupeBundle({
    history: [...baseline.history, ...delta.history],
    progress: [...baseline.progress, ...delta.progress],
    library: [...baseline.library, ...delta.library]
  })
}

export async function pullMediaBridgeForVerification(
  options: VerificationPullOptions
): Promise<PullResult> {
  if (options.connection.service !== 'simkl') return pullMediaBridge(options)

  const before = options.checkpoint.simklActivity
  if (!before) {
    logTo(options.log, 'Simkl activity checkpoint was unavailable; using the detailed write response for verification.')
    return { bundle: dedupeBundle(options.baseline), issues: [] }
  }

  try {
    const { data } = await simklRequest(options.connection, '/sync/activities')
    const after = typeof data?.all === 'string' ? data.all : undefined
    if (!after || after === before) {
      logTo(options.log, 'Simkl reports no changed activity after the write; no destination reread is needed.')
      return { bundle: dedupeBundle(options.baseline), issues: [] }
    }
    const delta = await pullSimklDelta(options, before)
    return {
      bundle: mergeVerificationBundle(options.baseline, delta.bundle),
      issues: delta.issues
    }
  } catch (error: any) {
    const reason = `Simkl accepted the write, but its activity delta could not be read: ${errorDetail(error?.body, error?.message)}`
    return {
      bundle: dedupeBundle(options.baseline),
      issues: (['history', 'progress', 'library'] as const)
        .filter(scope => options.scopes[scope])
        .map(scope => ({
          scope,
          status: 'note',
          reason
        }))
    }
  }
}

export async function pullMediaBridge(options: PullOptions): Promise<PullResult> {
  switch (options.connection.service) {
    case 'trakt': return pullTrakt(options)
    case 'nuvio': return pullNuvio(options)
    case 'simkl': return pullSimkl(options)
    case 'stremio': return pullStremio(options)
    case 'plex': return pullPlex(options)
    case 'jellyfin': return pullJellyfin(options)
  }
}

export async function pushMediaBridge(options: PushOptions): Promise<PushResult> {
  switch (options.connection.service) {
    case 'trakt': return pushTrakt(options)
    case 'nuvio': return pushNuvio(options)
    case 'simkl': return pushSimkl(options)
    case 'stremio': return pushStremio(options)
    case 'plex': return pushPlex(options)
    case 'jellyfin': return pushJellyfin(options)
  }
}

export function createNuvioConnection(
  slot: BridgeSlot,
  login: Awaited<ReturnType<typeof signInNuvio>>,
  profileId?: number
): BridgeConnection {
  const selectedProfile = profileId || Number(login.profiles[0]?.profile_index || 1)
  const profile = login.profiles.find(item => Number(item.profile_index) === selectedProfile)
  return {
    slot,
    service: 'nuvio',
    accountId: login.accountId,
    profileId: selectedProfile,
    displayName: profile?.name ? `${login.displayName} · ${profile.name}` : login.displayName,
    profiles: login.profiles,
    credentials: {
      service: 'nuvio',
      session: login.session,
      publicKey: NUVIO_PUBLIC_KEY
    }
  }
}

export function createStremioConnection(
  slot: BridgeSlot,
  login: Awaited<ReturnType<typeof signInStremio>>
): BridgeConnection {
  return {
    slot,
    service: 'stremio',
    accountId: login.accountId,
    displayName: login.displayName,
    credentials: { service: 'stremio', authKey: login.authKey }
  }
}

export function createPlexConnection(
  slot: BridgeSlot,
  login: Awaited<ReturnType<typeof signInPlex>>,
  serverId = login.servers[0]?.id
): BridgeConnection {
  const server = login.servers.find(item => item.id === serverId) || login.servers[0]
  if (!server) throw new Error('Choose a reachable Plex Media Server.')
  return {
    slot,
    service: 'plex',
    accountId: login.accountId,
    serverId: server.id,
    displayName: `${login.displayName} · ${server.name}`,
    servers: login.servers,
    credentials: {
      service: 'plex',
      accountToken: login.accountToken,
      clientIdentifier: login.clientIdentifier,
      server
    }
  }
}

export function createJellyfinConnection(
  slot: BridgeSlot,
  login: Awaited<ReturnType<typeof signInJellyfin>>
): BridgeConnection {
  return {
    slot,
    service: 'jellyfin',
    accountId: login.userId,
    serverId: login.serverId,
    displayName: `${login.displayName} · ${login.serverName}`,
    credentials: {
      service: 'jellyfin',
      baseUrl: login.baseUrl,
      accessToken: login.accessToken,
      userId: login.userId,
      serverId: login.serverId,
      serverName: login.serverName,
      deviceId: login.deviceId
    }
  }
}

export function selectPlexServer(
  connection: BridgeConnection,
  serverId: string
): BridgeConnection {
  if (connection.credentials.service !== 'plex') throw new Error('Expected Plex credentials.')
  const server = connection.servers?.find(item => item.id === serverId)
  if (!server) throw new Error('The selected Plex server is no longer available.')
  const accountName = String(connection.displayName || connection.accountId).split(' · ')[0]
  return {
    ...connection,
    serverId: server.id,
    displayName: `${accountName} · ${server.name}`,
    credentials: { ...connection.credentials, server }
  }
}
