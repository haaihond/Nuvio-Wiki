import {
  createEmptyBundle,
  dedupeBundle,
  remapEpisode,
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
const CINEMETA_API = 'https://v3-cinemeta.strem.io'
const NUVIO_API = 'https://api.nuvio.tv'
const TRAKT_MAX_RESUME_PROGRESS = 79

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
  'stremio', 'slug', 'external'
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

export type BridgeCredentials =
  | TraktCredentials
  | SimklCredentials
  | StremioCredentials
  | NuvioCredentials

export interface BridgeConnection extends ConnectedEndpoint {
  credentials: BridgeCredentials
  profiles?: NuvioProfile[]
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
  status: 'ambiguous' | 'unresolved' | 'warning'
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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
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
  const minimumWriteGapMs = path.startsWith('/scrobble/') ? 20_050 : 1_050
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
    await sleep(retrySeconds * 1000)
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
    if (omittedPlayEvents) {
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

async function pushTrakt(options: PushOptions): Promise<PushResult> {
  const { connection, bundle, scopes, log } = options
  const issues: BridgeIssue[] = []
  const written: PushCounts = { history: 0, progress: 0, library: 0 }

  if (scopes.history && bundle.history.length) {
    const grouped = groupTraktHistory(bundle.history)
    issues.push(...grouped.issues)
    for (const movies of chunk(grouped.movies, 100)) {
      await traktRequest(connection, '/sync/history', {}, { method: 'POST', body: JSON.stringify({ movies }) })
      written.history += movies.length
      logTo(log, `Added ${written.history} Trakt history records.`)
    }
    for (const shows of chunk(grouped.shows, 50)) {
      await traktRequest(connection, '/sync/history', {}, { method: 'POST', body: JSON.stringify({ shows }) })
      written.history += shows.reduce((count: number, show: any) => (
        count + show.seasons.reduce((sum: number, season: any) => sum + season.episodes.length, 0)
      ), 0)
      logTo(log, `Added ${written.history} Trakt history records.`)
    }
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
        issues.push({
          scope: 'progress',
          status: 'unresolved',
          media: record.media,
          reason: 'Trakt cannot store resume points at 80% or higher; it treats them as watched. Transfer watch history to preserve the completed state.'
        })
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

  return { written, issues }
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

async function pullSimkl(options: PullOptions): Promise<PullResult> {
  const { connection, scopes, log } = options
  const bundle = createEmptyBundle()
  const issues: BridgeIssue[] = []
  const provenance = sourceOf(connection)

  if (scopes.history || scopes.library) {
    logTo(log, 'Reading Simkl movies, shows, and anime sequentially...')
    for (const bucket of ['movies', 'shows', 'anime'] as const) {
      const params = scopes.history
        ? { extended: 'full', episode_watched_at: 'yes', include_all_episodes: 'yes' }
        : { extended: 'simkl_ids_only' }
      const { data } = await simklRequest(connection, `/sync/all-items/${bucket}`, params)
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
  }

  if (scopes.progress) {
    logTo(log, 'Reading Simkl playback sessions...')
    const { data } = await simklRequest(connection, '/sync/playback')
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

async function pushSimkl(options: PushOptions): Promise<PushResult> {
  const { connection, bundle, scopes, log } = options
  const written: PushCounts = { history: 0, progress: 0, library: 0 }
  const issues: BridgeIssue[] = []

  if (scopes.history && bundle.history.length) {
    const grouped = groupSimklHistory(bundle.history)
    issues.push(...grouped.issues)
    const payloads = [
      ...chunk(grouped.movies, 50).map(movies => ({ movies })),
      ...chunk(grouped.shows, 50).map(shows => ({ shows }))
    ]
    for (const payload of payloads) {
      await simklRequest(connection, '/sync/history', { skip_auto_watching: 'yes' }, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      const count = (payload as any).movies?.length || (payload as any).shows?.reduce(
        (total: number, show: any) => total + show.seasons.reduce(
          (seasonTotal: number, season: any) => seasonTotal + season.episodes.length,
          0
        ),
        0
      ) || 0
      written.history += count
      logTo(log, `Added ${written.history} Simkl history records.`)
    }
  }

  if (scopes.library && bundle.library.length) {
    const movies: any[] = []
    const shows: any[] = []
    for (const record of bundle.library) {
      const ids = simklWriteIds(record.media)
      if (!ids) {
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
    for (const payload of payloads) {
      await simklRequest(connection, '/sync/add-to-list', {}, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      written.library += (payload as any).movies?.length || (payload as any).shows?.length || 0
    }
    logTo(log, `Saved ${written.library} titles to Simkl Plan to Watch.`)
  }

  if (scopes.progress && bundle.progress.length) {
    for (const record of bundle.progress) {
      const ids = simklWriteIds(record.media)
      const percentage = progressPercentage(record)
      if (!ids || !percentage) {
        issues.push({ scope: 'progress', status: 'unresolved', media: record.media, reason: 'Simkl progress needs a supported ID and valid percentage or absolute position.' })
        continue
      }
      const payload: any = {
        progress: Math.max(0.1, Math.min(99.9, percentage))
      }
      if (record.media.kind === 'movie') {
        payload.movie = { title: record.media.title, year: record.media.year, ids }
      } else if (Number.isInteger(record.media.season) && Number.isInteger(record.media.episode)) {
        payload.show = { title: record.media.title, year: record.media.year, ids }
        payload.episode = { season: record.media.season, number: record.media.episode }
      } else {
        issues.push({ scope: 'progress', status: 'unresolved', media: record.media, reason: 'The Simkl episode progress has no deterministic season and episode number.' })
        continue
      }
      await simklRequest(connection, '/scrobble/pause', {}, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      written.progress++
    }
    logTo(log, `Updated ${written.progress} Simkl resume points.`)
  }

  return { written, issues }
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
  return { written, issues }
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
  if (!['stremio', 'nuvio', 'trakt'].includes(connection.service)) return []
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

export async function pullMediaBridge(options: PullOptions): Promise<PullResult> {
  switch (options.connection.service) {
    case 'trakt': return pullTrakt(options)
    case 'nuvio': return pullNuvio(options)
    case 'simkl': return pullSimkl(options)
    case 'stremio': return pullStremio(options)
  }
}

export async function pushMediaBridge(options: PushOptions): Promise<PushResult> {
  switch (options.connection.service) {
    case 'trakt': return pushTrakt(options)
    case 'nuvio': return pushNuvio(options)
    case 'simkl': return pushSimkl(options)
    case 'stremio': return pushStremio(options)
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
