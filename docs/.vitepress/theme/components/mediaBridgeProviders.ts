import {
  createEmptyBundle,
  dedupeBundle,
  mediaAliasKeys,
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
} from './mediaBridgeCore.ts'
import {
  mergeStremioWatchedVideoIds,
  readStremioWatchedVideoIds
} from './stremioWatched.ts'

const TRAKT_API = 'https://api.trakt.tv'
const SIMKL_API = 'https://api.simkl.com'
const STREMIO_API = 'https://api.strem.io/api'
const PLEX_TV_API = 'https://plex.tv/api/v2'
const PLEX_CLIENTS_API = 'https://clients.plex.tv/api/v2'
const PLEX_PRODUCT = 'Nuvio Wiki Sync Bridge'
const JELLYFIN_CLIENT = 'Nuvio Wiki Sync Bridge'
const JELLYFIN_VERSION = '1.0.0'
const CINEMETA_API = 'https://v3-cinemeta.strem.io'
const NUVIO_API = 'https://api.nuvio.tv'
const TRAKT_MAX_RESUME_PROGRESS = 79
const SIMKL_PROGRESS_IMPORT_TIMEOUT_MS = 30_000

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
}

export interface SimklCredentials {
  service: 'simkl'
  clientId: string
  accessToken: string
}

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
}

export interface PullResult {
  bundle: CanonicalBundle
  issues: BridgeIssue[]
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
}

interface JsonResponse<T = any> {
  data: T
  headers: Headers
}

const lastServiceWrite = new WeakMap<object, number>()

async function waitForWriteSlot(credentials: object, minimumGapMs: number) {
  const waitMs = Math.max(0, (lastServiceWrite.get(credentials) || 0) + minimumGapMs - Date.now())
  if (waitMs) await sleep(waitMs)
  lastServiceWrite.set(credentials, Date.now())
}

function logTo(log: BridgeLog | undefined, message: string) {
  log?.(message)
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new DOMException('The operation was aborted.', 'AbortError'))
      return
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timeout)
      reject(signal?.reason || new DOMException('The operation was aborted.', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

async function mapLimit<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await mapper(items[index], index)
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    () => worker()
  ))
  return results
}

function errorDetail(data: any, statusText: string): string {
  if (data && typeof data === 'object') {
    return String(
      data.error_description
      || data.message
      || data.msg
      || data.error?.message
      || data.error
      || JSON.stringify(data)
    )
  }
  return String(data || statusText || 'Request failed')
}

export async function requestBridgeJson<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<JsonResponse<T>> {
  const response = await fetch(url, options)
  const text = await response.text()
  let data: any = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  if (!response.ok) {
    const error = new Error(`${response.status} ${errorDetail(data, response.statusText)}`) as Error & {
      status?: number
      body?: any
      headers?: Headers
    }
    error.status = response.status
    error.body = data
    error.headers = response.headers
    throw error
  }
  return { data: data as T, headers: response.headers }
}

function asEpochMs(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000
  }
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : fallback
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

function absoluteProgress(record: ProgressRecord): { positionMs: number; durationMs: number } | null {
  const positionMs = Number(record.positionMs)
  const durationMs = Number(record.durationMs)
  if (!Number.isFinite(positionMs) || !Number.isFinite(durationMs) || positionMs <= 0 || durationMs <= 0) return null
  return { positionMs, durationMs }
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

function nuvioContentId(media: MediaRef): string | null {
  if (media.ids.imdb && /^tt\d+$/i.test(String(media.ids.imdb))) return String(media.ids.imdb)
  for (const namespace of ['tmdb', 'tvdb', 'trakt', 'simkl'] as const) {
    const value = media.ids[namespace]
    if (value !== undefined && value !== null && String(value).trim()) {
      return `${namespace}:${value}`
    }
  }
  return media.ids.stremio ? String(media.ids.stremio) : firstExternalContentId(media)
}

function stremioContentId(media: MediaRef): string | null {
  if (media.ids.stremio) {
    const raw = String(media.ids.stremio)
    const match = /^(.*):\d+:\d+$/.exec(raw)
    return match?.[1] || raw
  }
  if (media.ids.imdb) return String(media.ids.imdb)
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
  const title = media.title || media.ids.imdb || media.ids.stremio || media.ids.tmdb || 'Untitled'
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

function simklWriteIds(media: MediaRef): Record<string, string | number> | null {
  const ids: Record<string, string | number> = {}
  for (const key of ['simkl', 'imdb', 'tmdb', 'tvdb'] as const) {
    const value = media.ids[key]
    if (value !== undefined && value !== null && String(value).trim()) ids[key] = value
  }
  if (media.ids.slug) ids.traktslug = media.ids.slug
  for (const namespace of SIMKL_EXTERNAL_ID_NAMESPACES) {
    const value = media.ids.external?.[namespace]
    if (value !== undefined && value !== null && String(value).trim()) ids[namespace] = value
  }
  return Object.keys(ids).length ? ids : null
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
  const { data } = await requestBridgeJson(credentials.refreshUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: token.refresh_token })
  })
  credentials.tokens = normalizeTraktTokens(data)
  return credentials.tokens.access_token
}

async function traktRequest(
  connection: BridgeConnection,
  path: string,
  params: Record<string, any> = {},
  options: RequestInit = {}
): Promise<JsonResponse> {
  if (connection.credentials.service !== 'trakt') throw new Error('Expected Trakt credentials.')
  const token = await ensureTraktToken(connection)
  const url = new URL(`${TRAKT_API}${path}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }
  const requestOptions = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'trakt-api-key': connection.credentials.clientId,
      'trakt-api-version': '2',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  }
  const isWrite = String(options.method || 'GET').toUpperCase() !== 'GET'
  if (isWrite) await waitForWriteSlot(connection.credentials, 1_050)
  try {
    return await requestBridgeJson(url.toString(), requestOptions)
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
  for (let page = 1; page <= 200; page++) {
    const response = await traktRequest(connection, path, { ...params, page, limit: 250 })
    const rows = Array.isArray(response.data) ? response.data : []
    output.push(...rows)
    const pages = Number(
      response.headers.get('x-pagination-page-count')
      || response.headers.get('X-Pagination-Page-Count')
      || 0
    )
    if (!rows.length || (pages && page >= pages) || (!pages && rows.length < 250)) break
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
  const { data } = await requestBridgeJson<NuvioSession>(
    `${NUVIO_API}/auth/v1/token?grant_type=refresh_token`,
    {
      method: 'POST',
      headers: { apikey: credentials.publicKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    }
  )
  credentials.session = {
    ...data,
    expires_at: data.expires_at || (data.expires_in ? now + Number(data.expires_in) : 0)
  }
  return credentials.session.access_token
}

async function nuvioRpc(
  connection: BridgeConnection,
  name: string,
  body: Record<string, any> = {}
): Promise<any> {
  if (connection.credentials.service !== 'nuvio') throw new Error('Expected Nuvio credentials.')
  const token = await ensureNuvioToken(connection)
  const { data } = await requestBridgeJson(`${NUVIO_API}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: connection.credentials.publicKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  return data
}

async function nuvioRest(
  connection: BridgeConnection,
  path: string,
  params: Record<string, any> = {}
): Promise<any> {
  if (connection.credentials.service !== 'nuvio') throw new Error('Expected Nuvio credentials.')
  const token = await ensureNuvioToken(connection)
  const url = new URL(`${NUVIO_API}/rest/v1/${path}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
  }
  const { data } = await requestBridgeJson(url.toString(), {
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
  options: RequestInit = {}
): Promise<JsonResponse> {
  if (connection.credentials.service !== 'simkl') throw new Error('Expected Simkl credentials.')
  const url = new URL(`${SIMKL_API}${path}`)
  const query = {
    client_id: connection.credentials.clientId,
    'app-name': 'Nuvio Wiki Sync Bridge',
    'app-version': '2.0',
    ...params
  }
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }
  const requestOptions = {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${connection.credentials.accessToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  }
  const isWrite = String(options.method || 'GET').toUpperCase() !== 'GET'
  // Simkl permits one scrobble operation per user at a time. Callers await each
  // scrobble sequentially, so an additional fixed 20-second delay only makes a
  // migration slower without reducing overlap.
  const minimumWriteGapMs = path.startsWith('/scrobble/') ? 0 : 1_050
  if (isWrite) await waitForWriteSlot(connection.credentials, minimumWriteGapMs)
  try {
    return await requestBridgeJson(url.toString(), requestOptions)
  } catch (error: any) {
    const rateLimitCode = String(error?.body?.error || error?.body?.code || '').toUpperCase()
    const rateLimited = error?.status === 429
      || (error?.status === 400 && rateLimitCode === 'RATE_LIMIT')
      || rateLimitCode === 'RATE_LIMIT'
    if (!isWrite || !rateLimited) throw error
    const retrySeconds = Math.max(
      20,
      Number(error.headers?.get?.('retry-after') || 0)
    )
    await sleep(retrySeconds * 1000, options.signal)
    await waitForWriteSlot(connection.credentials, minimumWriteGapMs)
    return requestBridgeJson(url.toString(), requestOptions)
  }
}

async function stremioRequest(
  connection: BridgeConnection,
  path: string,
  body: Record<string, any>
): Promise<any> {
  if (connection.credentials.service !== 'stremio') throw new Error('Expected Stremio credentials.')
  const { data } = await requestBridgeJson(`${STREMIO_API}/${path.replace(/^\//, '')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authKey: connection.credentials.authKey, ...body })
  })
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
  return requestBridgeJson(url.toString(), {
    ...options,
    headers: {
      ...plexHeaders(
        connection.credentials.clientIdentifier,
        connection.credentials.server.accessToken
      ),
      'X-Plex-Pms-Api-Version': '1.0',
      ...(options.headers || {})
    }
  })
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
  return requestBridgeJson(url.toString(), {
    ...options,
    headers: {
      ...jellyfinHeaders(connection.credentials.deviceId, connection.credentials.accessToken),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  })
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
  credentials: TraktCredentials | SimklCredentials
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
  const { data } = await simklRequest(temporary, '/users/settings')
  const user = data?.user || data
  const account = data?.account || {}
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
    for (const record of bundle.history) {
      const resolved = resolvePlexEntry(record.media, catalog, 'history')
      if (!resolved.entry) {
        skipped.history++
        if (resolved.issue) issues.push(resolved.issue)
        continue
      }
      try {
        await plexRequest(connection, '/:/scrobble', {
          identifier: 'com.plexapp.plugins.library',
          key: resolved.entry.ratingKey
        }, { method: 'PUT' })
        written.history++
      } catch (error: any) {
        skipped.history++
        issues.push({
          scope: 'history',
          status: 'warning',
          media: record.media,
          reason: `Plex could not mark this item watched: ${errorDetail(error?.body, error?.message)}`
        })
      }
    }
    confirmedScopes.push('history')
    logTo(log, `Marked ${written.history} Plex items watched.`)
  }

  if (scopes.progress) {
    for (const record of bundle.progress) {
      const resolved = resolvePlexEntry(record.media, catalog, 'progress')
      if (!resolved.entry) {
        skipped.progress++
        if (resolved.issue) issues.push(resolved.issue)
        continue
      }
      const absolute = absoluteProgress(record)
      const durationMs = absolute?.durationMs || resolved.entry.duration
      const percentage = progressPercentage(record)
      const positionMs = absolute?.positionMs || (durationMs && percentage
        ? Math.round(durationMs * percentage / 100)
        : 0)
      if (!durationMs || !positionMs) {
        skipped.progress++
        issues.push({
          scope: 'progress',
          status: 'unresolved',
          media: record.media,
          reason: 'Plex progress needs a valid position and duration.'
        })
        continue
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
        written.progress++
      } catch (error: any) {
        skipped.progress++
        issues.push({
          scope: 'progress',
          status: 'warning',
          media: record.media,
          reason: `Plex could not update this resume point: ${errorDetail(error?.body, error?.message)}`
        })
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
    for (const record of bundle.history) {
      const resolved = resolveJellyfinEntry(record.media, catalog, 'history')
      if (!resolved.entry) {
        skipped.history++
        if (resolved.issue) issues.push(resolved.issue)
        continue
      }
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
        written.history++
      } catch (error: any) {
        skipped.history++
        issues.push({
          scope: 'history',
          status: 'warning',
          media: record.media,
          reason: `Jellyfin could not mark this item watched: ${errorDetail(error?.body, error?.message)}`
        })
      }
    }
    confirmedScopes.push('history')
    logTo(log, `Marked ${written.history} Jellyfin items watched.`)
  }

  if (scopes.progress) {
    for (const record of bundle.progress) {
      const resolved = resolveJellyfinEntry(record.media, catalog, 'progress')
      if (!resolved.entry) {
        skipped.progress++
        if (resolved.issue) issues.push(resolved.issue)
        continue
      }
      const absolute = absoluteProgress(record)
      const durationMs = absolute?.durationMs || resolved.entry.runTimeTicks / 10_000
      const percentage = progressPercentage(record)
      const positionMs = absolute?.positionMs || (durationMs && percentage
        ? Math.round(durationMs * percentage / 100)
        : 0)
      if (!durationMs || !positionMs) {
        skipped.progress++
        issues.push({
          scope: 'progress',
          status: 'unresolved',
          media: record.media,
          reason: 'Jellyfin progress needs a valid position and duration.'
        })
        continue
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
        written.progress++
      } catch (error: any) {
        skipped.progress++
        issues.push({
          scope: 'progress',
          status: 'warning',
          media: record.media,
          reason: `Jellyfin could not update this resume point: ${errorDetail(error?.body, error?.message)}`
        })
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

function mediaFromTrakt(value: any, kind: 'movie' | 'series'): MediaRef {
  return {
    kind,
    ids: normalizeIds(value?.ids, 'trakt'),
    title: value?.title,
    year: Number(value?.year) || undefined
  }
}

async function pullTrakt(options: PullOptions): Promise<PullResult> {
  const { connection, scopes, log } = options
  const bundle = createEmptyBundle()
  const issues: BridgeIssue[] = []
  const provenance = sourceOf(connection)

  if (scopes.history) {
    logTo(log, 'Reading Trakt watched movies and episodes...')
    let omittedPlayEvents = 0
    const [movieResponse, showResponse] = await Promise.all([
      traktRequest(connection, '/sync/watched/movies', { extended: 'full' }),
      traktRequest(connection, '/sync/watched/shows', { extended: 'full' })
    ])
    const movies = Array.isArray(movieResponse.data) ? movieResponse.data : []
    const shows = Array.isArray(showResponse.data) ? showResponse.data : []
    for (const item of movies) {
      const media = mediaFromTrakt(item.movie, 'movie')
      const playCount = positiveNumber(item.plays, 1)
      omittedPlayEvents += Math.max(0, Math.floor(playCount) - 1)
      bundle.history.push({
        media,
        watchedAt: asEpochMs(item.last_watched_at || item.watched_at),
        playCount,
        source: provenance
      })
    }
    for (const item of shows) {
      const show = mediaFromTrakt(item.show, 'series')
      for (const season of item.seasons || []) {
        for (const episode of season.episodes || []) {
          const playCount = positiveNumber(episode.plays, 1)
          omittedPlayEvents += Math.max(0, Math.floor(playCount) - 1)
          bundle.history.push({
            media: {
              ...show,
              season: Number(season.number),
              episode: Number(episode.number),
              episodeTitle: episode.title
            },
            watchedAt: asEpochMs(episode.last_watched_at || item.last_watched_at),
            playCount,
            source: provenance
          })
        }
      }
    }
    // This is a source-fidelity warning. A destination/verification read only
    // needs the latest watched state, so surfacing it there creates duplicate
    // and misleading warnings before and after a Trakt write.
    if (omittedPlayEvents && connection.slot === 'source') {
      issues.push({
        scope: 'history',
        status: 'warning',
        reason: `Trakt exposes only the latest timestamp for each watched title or episode; ${omittedPlayEvents} earlier play event${omittedPlayEvents === 1 ? '' : 's'} cannot be transferred.`
      })
    }
  }

  if (scopes.progress) {
    logTo(log, 'Reading Trakt playback progress...')
    const rows = await traktGetAll(connection, '/sync/playback', { extended: 'full' })
    for (const item of rows) {
      const percentage = positiveNumber(item.progress)
      if (!percentage) continue
      const isMovie = item.type === 'movie' || Boolean(item.movie)
      const media = mediaFromTrakt(isMovie ? item.movie : item.show, isMovie ? 'movie' : 'series')
      if (!isMovie) {
        media.season = Number(item.episode?.season)
        media.episode = Number(item.episode?.number)
        media.episodeTitle = item.episode?.title
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

  if (scopes.library) {
    logTo(log, 'Reading Trakt watchlist and collection...')
    const [watchlistMovies, watchlistShows, collectionMovies, collectionShows] = await Promise.all([
      traktGetAll(connection, '/sync/watchlist/movies', { extended: 'full' }),
      traktGetAll(connection, '/sync/watchlist/shows', { extended: 'full' }),
      traktGetAll(connection, '/sync/collection/movies', { extended: 'full' }),
      traktGetAll(connection, '/sync/collection/shows', { extended: 'full' })
    ])
    const addRows = (rows: any[], kind: 'movie' | 'series', listKind: 'watchlist' | 'collection') => {
      for (const item of rows) {
        const media = mediaFromTrakt(kind === 'movie' ? item.movie : item.show, kind)
        bundle.library.push({
          media,
          addedAt: asEpochMs(item.listed_at || item.collected_at || item.updated_at),
          lists: [{ ...provenance, kind: listKind }],
          source: provenance
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

  if (scopes.history) {
    logTo(log, 'Reading Nuvio watched items...')
    for (let page = 1; page <= 200; page++) {
      const rows = await nuvioRpc(connection, 'sync_pull_watched_items', {
        p_profile_id: profileId,
        p_page: page,
        p_page_size: 500
      })
      const batch = Array.isArray(rows) ? rows : []
      for (const item of batch) {
        const media: MediaRef = {
          kind: item.content_type === 'movie' ? 'movie' : 'series',
          ids: parseNuvioContentId(item.content_id),
          title: item.title,
          season: item.season === null ? undefined : Number(item.season),
          episode: item.episode === null ? undefined : Number(item.episode),
          videoId: item.video_id || undefined
        }
        bundle.history.push({ media, watchedAt: asEpochMs(item.watched_at), source: provenance })
      }
      if (batch.length < 500) break
    }
  }

  if (scopes.progress) {
    logTo(log, 'Reading Nuvio resume points...')
    const rows = await nuvioRpc(connection, 'sync_pull_watch_progress', {
      p_profile_id: profileId,
      p_since_last_watched: 0,
      p_limit: 100_000
    })
    const progressRows = Array.isArray(rows) ? rows : []
    for (const item of progressRows) {
      const durationMs = positiveNumber(item.duration)
      const positionMs = positiveNumber(item.position)
      if (!durationMs || !positionMs) continue
      bundle.progress.push({
        media: {
          kind: item.content_type === 'movie' ? 'movie' : 'series',
          ids: parseNuvioContentId(item.content_id),
          title: item.title,
          season: item.season === null ? undefined : Number(item.season),
          episode: item.episode === null ? undefined : Number(item.episode),
          videoId: item.video_id || undefined
        },
        positionMs,
        durationMs,
        updatedAt: asEpochMs(item.last_watched),
        source: provenance
      })
    }
    if (progressRows.length >= 100_000) {
      issues.push({
        scope: 'progress',
        status: 'warning',
        reason: 'Nuvio returned the 100,000-item resume-point limit; additional older progress records may not be transferable.'
      })
    }
  }

  if (scopes.library) {
    logTo(log, 'Reading Nuvio library...')
    for (let offset = 0; offset < 100_000; offset += 500) {
      const rows = await nuvioRpc(connection, 'sync_pull_library', {
        p_profile_id: profileId,
        p_limit: 500,
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
        bundle.library.push({
          media,
          addedAt: asEpochMs(item.added_at),
          lists: [{ ...provenance, kind: 'library' }],
          source: provenance
        })
      }
      if (batch.length < 500) break
    }
  }

  return { bundle: dedupeBundle(bundle), issues }
}

function cleanNuvioLibraryItem(item: any) {
  const cleaned: Record<string, any> = {
    content_id: item.content_id,
    content_type: item.content_type,
    name: item.name,
    added_at: Number(item.added_at || Date.now())
  }
  for (const key of [
    'poster',
    'poster_shape',
    'background',
    'description',
    'release_info',
    'imdb_rating',
    'genres',
    'addon_base_url'
  ]) {
    if (item[key] !== undefined && item[key] !== null && item[key] !== '') cleaned[key] = item[key]
  }
  return cleaned
}

async function pullEntireNuvioLibrary(connection: BridgeConnection, profileId: number): Promise<any[]> {
  const output: any[] = []
  for (let offset = 0; offset < 100_000; offset += 500) {
    const rows = await nuvioRpc(connection, 'sync_pull_library', {
      p_profile_id: profileId,
      p_limit: 500,
      p_offset: offset
    })
    const batch = Array.isArray(rows) ? rows : []
    output.push(...batch)
    if (batch.length < 500) break
  }
  return output
}

async function pushNuvio(options: PushOptions): Promise<PushResult> {
  const { connection, bundle, scopes, log } = options
  const profileId = Number(connection.profileId)
  if (!Number.isInteger(profileId) || profileId < 1) throw new Error('Choose a Nuvio profile.')
  const issues: BridgeIssue[] = []
  const written: PushCounts = { history: 0, progress: 0, library: 0 }

  if (scopes.history && bundle.history.length) {
    const rows: any[] = []
    for (const record of bundle.history) {
      const contentId = nuvioContentId(record.media)
      if (!contentId) {
        issues.push({ scope: 'history', status: 'unresolved', media: record.media, reason: 'Nuvio needs a supported content ID.' })
        continue
      }
      if (record.media.kind === 'series' && (!Number.isInteger(record.media.season) || !Number.isInteger(record.media.episode))) {
        issues.push({ scope: 'history', status: 'unresolved', media: record.media, reason: 'The Nuvio episode has no deterministic season and episode number.' })
        continue
      }
      rows.push({
        content_id: contentId,
        content_type: record.media.kind === 'movie' ? 'movie' : 'series',
        title: record.media.title || mediaLabel(record.media),
        ...(record.media.kind === 'series' ? { season: record.media.season, episode: record.media.episode } : {}),
        watched_at: record.watchedAt
      })
    }
    for (const rowsBatch of chunk(rows, 500)) {
      await nuvioRpc(connection, 'sync_push_watched_items', { p_profile_id: profileId, p_items: rowsBatch })
      written.history += rowsBatch.length
    }
    logTo(log, `Added ${written.history} Nuvio watched items.`)
  }

  if (scopes.progress && bundle.progress.length) {
    const rows: any[] = []
    for (const record of bundle.progress) {
      const contentId = nuvioContentId(record.media)
      const absolute = absoluteProgress(record)
      if (!contentId || !absolute) {
        issues.push({ scope: 'progress', status: 'unresolved', media: record.media, reason: 'Nuvio progress needs a supported ID plus an absolute position and duration; percentage-only progress was skipped.' })
        continue
      }
      if (record.media.kind === 'series' && (!Number.isInteger(record.media.season) || !Number.isInteger(record.media.episode))) {
        issues.push({ scope: 'progress', status: 'unresolved', media: record.media, reason: 'The Nuvio episode progress has no deterministic season and episode number.' })
        continue
      }
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
        last_watched: record.updatedAt
      })
    }
    for (const rowsBatch of chunk(rows, 300)) {
      await nuvioRpc(connection, 'sync_push_watch_progress', { p_profile_id: profileId, p_entries: rowsBatch })
      written.progress += rowsBatch.length
    }
    logTo(log, `Updated ${written.progress} Nuvio resume points.`)
  }

  if (scopes.library && bundle.library.length) {
    logTo(log, 'Merging with the full destination Nuvio library...')
    const existing = await pullEntireNuvioLibrary(connection, profileId)
    const merged = new Map<string, any>()
    for (const item of existing) merged.set(`${item.content_type}:${item.content_id}`, cleanNuvioLibraryItem(item))
    for (const record of bundle.library) {
      const contentId = nuvioContentId(record.media)
      if (!contentId) {
        issues.push({ scope: 'library', status: 'unresolved', media: record.media, reason: 'Nuvio needs a supported content ID for this library item.' })
        continue
      }
      const key = `${record.media.kind}:${contentId}`
      const current = merged.get(key) || {}
      merged.set(key, {
        ...current,
        content_id: contentId,
        content_type: record.media.kind === 'movie' ? 'movie' : 'series',
        name: record.media.title || current.name || 'Untitled',
        added_at: Math.max(Number(current.added_at || 0), record.addedAt || Date.now())
      })
      written.library++
    }
    await nuvioRpc(connection, 'sync_push_library', {
      p_profile_id: profileId,
      p_items: [...merged.values()]
    })
    logTo(log, `Merged ${written.library} titles into the Nuvio library without removing existing items.`)
  }

  return { written, issues }
}

function simklRows(data: any, bucket: 'movies' | 'shows' | 'anime'): any[] {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.[bucket])) return data[bucket]
  if (bucket === 'anime' && Array.isArray(data?.shows)) return data.shows
  return []
}

function mediaFromSimkl(value: any, kind: 'movie' | 'series'): MediaRef {
  return {
    kind,
    ids: normalizeIds(value?.ids, 'simkl'),
    title: value?.title,
    year: Number(value?.year) || undefined
  }
}

function appendSimklItems(
  data: any,
  bucket: 'movies' | 'shows' | 'anime',
  scopes: SyncScopes,
  bundle: CanonicalBundle,
  provenance: ReturnType<typeof sourceOf>
) {
  for (const item of simklRows(data, bucket)) {
    const subject = item.movie || item.show || item.anime || item
    const media = mediaFromSimkl(subject, bucket === 'movies' ? 'movie' : 'series')
    const status = String(item.status || subject.status || '').toLowerCase()

    if (scopes.library && ['plantowatch', 'plan-to-watch', 'watchlist'].includes(status)) {
      bundle.library.push({
        media,
        addedAt: asEpochMs(item.added_to_watchlist_at || item.last_watched_at || item.updated_at),
        lists: [{ ...provenance, kind: 'watchlist', name: 'Plan to Watch' }],
        source: provenance
      })
    }

    if (!scopes.history) continue
    if (media.kind === 'movie') {
      const watchedAt = item.last_watched_at || item.watched_at
      if (watchedAt || status === 'completed') {
        bundle.history.push({
          media,
          watchedAt: asEpochMs(watchedAt),
          playCount: positiveNumber(item.watched, 1),
          source: provenance
        })
      }
      continue
    }

    for (const season of item.seasons || subject.seasons || []) {
      for (const episode of season.episodes || []) {
        const watchedAt = episode.watched_at || episode.last_watched_at
        if (!watchedAt && episode.watched !== true && Number(episode.watched) < 1) continue
        bundle.history.push({
          media: {
            ...media,
            season: Number(season.number),
            episode: Number(episode.number),
            absoluteEpisode: Number(episode.episode) || undefined,
            episodeTitle: episode.title
          },
          watchedAt: asEpochMs(watchedAt || item.last_watched_at),
          playCount: positiveNumber(episode.watched, 1),
          source: provenance
        })
      }
    }
  }
}

function appendSimklPlayback(
  data: any,
  bundle: CanonicalBundle,
  issues: BridgeIssue[],
  provenance: ReturnType<typeof sourceOf>
) {
  const rows = Array.isArray(data) ? data : Array.isArray(data?.playback) ? data.playback : []
  for (const item of rows) {
    const subject = item.movie || item.show || item.anime
    const isMovie = Boolean(item.movie) || item.type === 'movie'
    const media = mediaFromSimkl(subject, isMovie ? 'movie' : 'series')
    if (!isMovie) {
      media.season = Number(item.episode?.season)
      media.episode = Number(item.episode?.number)
      media.absoluteEpisode = Number(item.episode?.episode) || undefined
      media.episodeTitle = item.episode?.title
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
        updatedAt: asEpochMs(item.paused_at || item.updated_at),
        source: provenance
      })
    } else if (percentage) {
      bundle.progress.push({
        media,
        percentage: Math.min(100, percentage),
        updatedAt: asEpochMs(item.paused_at || item.updated_at),
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
  return scopes.history
    ? {
        extended: 'full',
        episode_watched_at: 'yes',
        include_all_episodes: 'yes',
        ...(dateFrom ? { date_from: dateFrom } : {})
      }
    : {
        extended: 'simkl_ids_only',
        ...(dateFrom ? { date_from: dateFrom } : {})
      }
}

async function pullSimkl(options: PullOptions): Promise<PullResult> {
  const { connection, scopes, log } = options
  const bundle = createEmptyBundle()
  const issues: BridgeIssue[] = []
  const provenance = sourceOf(connection)

  if (scopes.history || scopes.library) {
    logTo(log, 'Reading Simkl movies, shows, and anime sequentially...')
    for (const bucket of ['movies', 'shows', 'anime'] as const) {
      const { data } = await simklRequest(connection, `/sync/all-items/${bucket}`, simklItemParams(scopes))
      appendSimklItems(data, bucket, scopes, bundle, provenance)
    }
  }

  if (scopes.progress) {
    logTo(log, 'Reading Simkl playback sessions...')
    const { data } = await simklRequest(connection, '/sync/playback')
    appendSimklPlayback(data, bundle, issues, provenance)
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
    const { data } = await simklRequest(connection, '/sync/all-items', simklItemParams(scopes, dateFrom))
    for (const bucket of ['movies', 'shows', 'anime'] as const) {
      appendSimklItems(data, bucket, scopes, bundle, provenance)
    }
  }
  if (scopes.progress) {
    const { data } = await simklRequest(connection, '/sync/playback')
    appendSimklPlayback(data, bundle, issues, provenance)
  }

  return { bundle: dedupeBundle(bundle), issues }
}

function groupSimklHistory(records: readonly HistoryRecord[]) {
  const movies: any[] = []
  const shows = new Map<string, { ids: Record<string, any>; title?: string; year?: number; seasons: Map<number, any> }>()
  const issues: BridgeIssue[] = []
  for (const record of records) {
    const ids = simklWriteIds(record.media)
    if (!ids) {
      issues.push({ scope: 'history', status: 'unresolved', media: record.media, reason: 'Simkl needs a supported external ID.' })
      continue
    }
    if (record.media.kind === 'movie') {
      movies.push({ title: record.media.title, year: record.media.year, ids, watched_at: new Date(record.watchedAt).toISOString() })
      continue
    }
    if (!Number.isInteger(record.media.season) || !Number.isInteger(record.media.episode)) {
      issues.push({ scope: 'history', status: 'unresolved', media: record.media, reason: 'The Simkl episode has no deterministic season and episode number.' })
      continue
    }
    const key = JSON.stringify(ids)
    if (!shows.has(key)) {
      shows.set(key, { ids, title: record.media.title, year: record.media.year, seasons: new Map() })
    }
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
    shows: [...shows.values()].map(show => ({
      ids: show.ids,
      title: show.title,
      year: show.year,
      seasons: [...show.seasons.values()]
    })),
    issues
  }
}

function simklHistoryEntryCount(item: any): number {
  const episodes = (item?.seasons || []).reduce((total: number, season: any) => (
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
  for (const show of data?.not_found?.shows || []) {
    const subject = show.show || show.anime || show
    const media = mediaFromSimkl(subject, 'series')
    let foundEpisode = false
    for (const season of show.seasons || subject.seasons || []) {
      for (const episode of season.episodes || []) {
        foundEpisode = true
        result.push({
          scope: 'history',
          status: 'unresolved',
          media: { ...media, season: Number(season.number), episode: Number(episode.number) },
          reason
        })
      }
    }
    if (!foundEpisode) result.push({ scope: 'history', status: 'unresolved', media, reason })
  }
  for (const episode of data?.not_found?.episodes || []) {
    const subject = episode.show || episode.anime || episode
    result.push({
      scope: 'history',
      status: 'unresolved',
      media: {
        ...mediaFromSimkl(subject, 'series'),
        season: Number(episode.season ?? episode.episode?.season),
        episode: Number(episode.number ?? episode.episode?.number)
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
  const { connection, bundle, scopes, log } = options
  const written: PushCounts = { history: 0, progress: 0, library: 0 }
  const skipped: Partial<PushCounts> = {}
  const issues: BridgeIssue[] = []
  const confirmedScopes: BridgeScope[] = []

  if (scopes.history && bundle.history.length) {
    const grouped = groupSimklHistory(bundle.history)
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
    if (responsesComplete) confirmedScopes.push('history')
  }

  if (scopes.library && bundle.library.length) {
    const movies: any[] = []
    const shows: any[] = []
    for (const record of bundle.library) {
      const ids = simklWriteIds(record.media)
      if (!ids) {
        skipped.library = (skipped.library || 0) + 1
        issues.push({ scope: 'library', status: 'unresolved', media: record.media, reason: 'Simkl needs a supported external ID for this saved title.' })
        continue
      }
      ;(record.media.kind === 'movie' ? movies : shows).push({
        title: record.media.title,
        year: record.media.year,
        ids,
        to: 'plantowatch'
      })
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
    if (responsesComplete) confirmedScopes.push('library')
    logTo(log, `Saved ${written.library} titles to Simkl Plan to Watch.`)
  }

  if (scopes.progress && bundle.progress.length) {
    // Simkl has no bulk playback write, so import resume points as sequential
    // pause events. A single shared timeout bounds the whole optional phase; this
    // prevents a rate-limit retry or stalled request from holding the sync open.
    const signal = AbortSignal.timeout(SIMKL_PROGRESS_IMPORT_TIMEOUT_MS)
    for (let index = 0; index < bundle.progress.length; index++) {
      const record = bundle.progress[index]
      const percentage = progressPercentage(record)
      const ids = simklWriteIds(record.media)
      const parsedVideoId = parseStremioVideoId(record.media.videoId)
      const season = Number.isInteger(record.media.season)
        ? Number(record.media.season)
        : parsedVideoId?.season
      const episode = Number.isInteger(record.media.episode)
        ? Number(record.media.episode)
        : parsedVideoId?.episode

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
      if (!ids) {
        skipped.progress = (skipped.progress || 0) + 1
        issues.push({
          scope: 'progress',
          status: 'unresolved',
          media: record.media,
          reason: 'Simkl progress needs a supported external ID.'
        })
        continue
      }

      const subject = {
        title: record.media.title,
        year: record.media.year,
        ids
      }
      const payload: any = {
        progress: Math.round(Math.min(100, percentage) * 10) / 10
      }
      if (record.media.kind === 'movie') {
        payload.movie = subject
      } else if (Number.isInteger(season) && Number.isInteger(episode)) {
        payload.show = subject
        payload.episode = { season, number: episode }
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
          body: JSON.stringify(payload),
          signal
        })
        written.progress++
      } catch (error: any) {
        if (signal.aborted || error?.name === 'TimeoutError' || error?.name === 'AbortError') {
          const remaining = bundle.progress.length - index
          skipped.progress = (skipped.progress || 0) + remaining
          issues.push({
            scope: 'progress',
            status: 'note',
            reason: `Simkl Continue Watching import stopped after 30 seconds; ${remaining} resume point${remaining === 1 ? '' : 's'} were skipped.`
          })
          break
        }
        if (![400, 404, 409, 422, 429].includes(Number(error?.status))) throw error
        skipped.progress = (skipped.progress || 0) + 1
        issues.push({
          scope: 'progress',
          status: 'unresolved',
          media: record.media,
          reason: `Simkl rejected this resume point: ${errorDetail(error.body, error.message)}`
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
  title?: string
  released?: string
}

const cinemetaCache = new Map<string, Promise<any | null>>()

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

function orderedStremioVideos(meta: any): StremioVideo[] {
  return (Array.isArray(meta?.videos) ? meta.videos : [])
    .map((video: any) => ({
      id: String(video?.id || ''),
      season: Number(video?.season),
      episode: Number(video?.episode ?? video?.number),
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

  await mapLimit(items, 6, async item => {
    const media = mediaFromStremioItem(item)
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
      meta = await fetchCinemetaMeta(media)
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
  return videos.map(video => ({
    season: video.season,
    episode: video.episode,
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
  const current = new Map<string, any>(
    (Array.isArray(currentRows) ? currentRows : []).map((item: any) => [String(item._id), item])
  )
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
  if (scopes.history) bundle.history.forEach(record => addRecord('history', record))
  if (scopes.progress) {
    bundle.progress.forEach(record => {
      if (!absoluteProgress(record)) {
        issues.push({
          scope: 'progress',
          status: 'unresolved',
          media: record.media,
          reason: 'Stremio progress needs an absolute position and duration; percentage-only progress was skipped.'
        })
        return
      }
      addRecord('progress', record)
    })
  }
  if (scopes.library) bundle.library.forEach(record => addRecord('library', record))

  const changes = (await mapLimit([...byId.entries()], 5, async ([id, group]) => {
    const existing = current.get(id)
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
      _id: id,
      name: existing?.name || meta?.name || group.media.title || id,
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
        const absolute = absoluteProgress(latest)
        if (!absolute) {
          issues.push({ scope: 'progress', status: 'unresolved', media: latest.media, reason: 'Stremio requires an absolute position and duration.' })
        } else {
          item.state.timeOffset = Math.round(absolute.positionMs)
          item.state.duration = Math.round(absolute.durationMs)
          item.state.video_id = id
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
        const absolute = absoluteProgress(latest)
        if (!absolute) {
          issues.push({ scope: 'progress', status: 'unresolved', media: latest.media, reason: 'Stremio requires an absolute position and duration.' })
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

  for (const changesBatch of chunk(changes, 100)) {
    await stremioRequest(connection, '/datastorePut', {
      collection: 'libraryItem',
      changes: changesBatch
    })
  }
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

interface NuvioMetaAddon {
  baseUrl: string
}

const nuvioAddonCache = new Map<string, Promise<NuvioMetaAddon | null>>()
const nuvioEpisodeCache = new Map<string, Promise<EpisodeRef[]>>()
const traktTargetEpisodeCache = new Map<string, Promise<EpisodeRef[]>>()

function addonBaseUrl(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/\/manifest\.json\/?$/i, '')
    .replace(/\/+$/, '')
}

async function nuvioMetadataAddon(connection: BridgeConnection): Promise<NuvioMetaAddon | null> {
  const cacheKey = `${connection.accountId}:${connection.profileId}`
  if (!nuvioAddonCache.has(cacheKey)) {
    nuvioAddonCache.set(cacheKey, (async () => {
      const rows = await nuvioRest(connection, 'addons', {
        select: 'url,name,sort_order,profile_id,enabled',
        profile_id: `eq.${Number(connection.profileId)}`,
        order: 'sort_order.asc'
      })
      for (const row of Array.isArray(rows) ? rows : []) {
        if (!row?.url || row.enabled === false) continue
        const baseUrl = addonBaseUrl(row.url)
        try {
          const manifest = (await requestBridgeJson(`${baseUrl}/manifest.json`)).data
          const resources = Array.isArray(manifest?.resources) ? manifest.resources : []
          if (resources.some((resource: any) => (
            (typeof resource === 'string' ? resource : resource?.name) === 'meta'
          ))) return { baseUrl }
        } catch {
          // Try the next enabled addon.
        }
      }
      return null
    })())
  }
  return nuvioAddonCache.get(cacheKey)!
}

async function nuvioTargetEpisodes(
  connection: BridgeConnection,
  media: MediaRef
): Promise<EpisodeRef[]> {
  const contentId = nuvioContentId(media)
  if (!contentId) return []
  const key = `${connection.accountId}:${connection.profileId}:${contentId}`
  if (!nuvioEpisodeCache.has(key)) {
    nuvioEpisodeCache.set(key, (async () => {
      const addon = await nuvioMetadataAddon(connection)
      if (!addon) return []
      const candidates = [
        contentId,
        media.ids.imdb,
        contentId.replace(/^(tmdb|tvdb|trakt|simkl):/i, '')
      ].filter(Boolean).map(String)
      for (const candidate of [...new Set(candidates)]) {
        for (const type of ['series', 'tv']) {
          try {
            const { data } = await requestBridgeJson(
              `${addon.baseUrl}/meta/${type}/${encodeURIComponent(candidate)}.json`
            )
            const videos = orderedStremioVideos(data?.meta)
            if (videos.length) return episodeRefs(videos)
          } catch {
            // Try the next ID/type combination.
          }
        }
      }
      return []
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
    traktTargetEpisodeCache.set(key, traktRequest(
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
          const traktId = Number(episode.ids?.trakt)
          const tvdbId = Number(episode.ids?.tvdb)
          const videoId = Number.isSafeInteger(traktId) && traktId > 0
            ? `trakt:${traktId}`
            : Number.isSafeInteger(tvdbId) && tvdbId > 0
              ? `tvdb:${tvdbId}`
              : undefined
          episodes.push({
            season: seasonNumber,
            episode: episodeNumber,
            absoluteEpisode: Number(episode.number_abs) || undefined,
            title: episode.title,
            videoId
          })
        }
      }
      return episodes
    }).catch(() => []))
  }
  return traktTargetEpisodeCache.get(key)!
}

async function targetEpisodesFor(
  connection: BridgeConnection,
  media: MediaRef
): Promise<EpisodeRef[]> {
  if (connection.service === 'stremio') {
    return episodeRefs(orderedStremioVideos(await fetchCinemetaMeta(media)))
  }
  if (connection.service === 'nuvio') return nuvioTargetEpisodes(connection, media)
  if (connection.service === 'trakt') return traktTargetEpisodes(connection, media)
  if (connection.service === 'plex') return plexTargetEpisodes(connection, media)
  if (connection.service === 'jellyfin') return jellyfinTargetEpisodes(connection, media)
  return []
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
  if (!['stremio', 'nuvio', 'trakt', 'plex', 'jellyfin'].includes(connection.service)) return []
  const records: Array<{
    scope: 'history' | 'progress'
    media: MediaRef
    progress?: ProgressRecord
  }> = [
    ...(scopes.history ? bundle.history.map(record => ({ scope: 'history' as const, media: record.media })) : []),
    ...(scopes.progress ? bundle.progress.map(record => ({ scope: 'progress' as const, media: record.media, progress: record })) : [])
  ]
  if (!records.length) return []

  logTo(log, `Checking ${records.length} selected records against ${connection.service} metadata...`)
  const issues = await mapLimit(records, 6, async record => {
    if (
      record.scope === 'progress'
      && record.progress
      && (connection.service === 'nuvio' || connection.service === 'stremio')
      && !absoluteProgress(record.progress)
    ) {
      return {
        scope: record.scope,
        sourceMedia: record.media,
        mapping: {
          status: 'unresolved',
          confidence: 'none',
          target: null,
          candidates: [],
          reason: `${connection.service === 'nuvio' ? 'Nuvio' : 'Stremio'} needs an absolute position and duration; percentage-only progress cannot be stored safely.`
        } as MappingOutcome
      }
    }
    if (record.media.kind !== 'series') return null
    const targets = await targetEpisodesFor(connection, record.media)
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
    const requested: EpisodeRef = {
      season: Number(record.media.season),
      episode: Number(record.media.episode),
      absoluteEpisode: record.media.absoluteEpisode,
      title: record.media.episodeTitle,
      videoId: record.media.videoId
    }
    const sourceEpisodes = sourceConnection
      ? await targetEpisodesFor(sourceConnection, record.media)
      : []
    return {
      scope: record.scope,
      sourceMedia: record.media,
      mapping: remapEpisode(
        requested,
        sourceEpisodes.length ? sourceEpisodes : [requested],
        targets
      )
    }
  })
  return issues.filter((issue): issue is DestinationMappingIssue => Boolean(issue))
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
