<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { useData, withBase } from 'vitepress'

const { lang } = useData()

const props = withDefaults(defineProps<{
  defaultExpanded?: boolean
  hideTip?: boolean
  hideHeader?: boolean
}>(), {
  defaultExpanded: false,
  hideTip: false,
  hideHeader: false
})

// --- Translations ---
const translations = {
  en: {
    title: 'Nuvio Trakt Bridge',
    subtitle: 'Sync your watched history, continue watching progress, and library between Trakt and Nuvio Sync.',
    connectTrakt: 'Connect Trakt',
    disconnectTrakt: 'Disconnect Trakt',
    traktStatusConnected: 'Trakt connected',
    traktStatusDisconnected: 'Trakt disconnected',
    connectNuvio: 'Sign In to Nuvio',
    disconnectNuvio: 'Disconnect Nuvio',
    nuvioStatusConnected: 'Nuvio connected',
    nuvioStatusDisconnected: 'Nuvio disconnected',
    emailLabel: 'Nuvio email address',
    emailPlaceholder: 'you@example.com',
    passwordLabel: 'Nuvio password',
    passwordPlaceholder: 'Your Nuvio password',
    profileLabel: 'Nuvio profile',
    syncDirectionLabel: 'Sync direction',
    importDirection: 'Trakt to Nuvio (Import)',
    exportDirection: 'Nuvio to Trakt (Export)',
    syncScopesTitle: 'Sync scopes',
    syncScopesSubtitle: 'Choose which data to sync',
    syncHistoryLabel: 'Watched history',
    syncHistorySub: 'Movies and watched episodes',
    syncProgressLabel: 'Continue watching',
    syncProgressSub: 'Playback progress',
    syncWatchlistLabel: 'Watchlist',
    syncWatchlistSub: 'Save watchlist items to library',
    syncCollectionLabel: 'Collection',
    syncCollectionSub: 'Save collection items to library',
    previewBtn: 'Preview Sync',
    syncBtn: 'Run Sync to Nuvio',
    syncBtnExport: 'Run Sync to Trakt',
    copyLogBtn: 'Copy Log',
    logCopied: 'Log copied',
    statusStarting: 'Starting...',
    statusChecking: 'Checking connections...',
    statusPulling: 'Pulling data...',
    statusPushing: 'Pushing data...',
    statusVerifying: 'Verifying sync...',
    statusComplete: 'Sync complete!',
    statWatched: 'Watched',
    statProgress: 'Progress',
    statLibrary: 'Library',
    statSkipped: 'Skipped',
    keysSecureNote: 'Credentials are never stored',
    startOver: 'Start over',
    retryBtn: 'Try again',
    noMappedItems: 'No mapped items yet.',
    errorPrefix: 'Error: ',
    successToast: 'Sync completed successfully!',
    pullLogsTitle: 'Activity Log',
    previewTableTitle: 'Mapped Items Preview',
    typeCol: 'Type',
    titleCol: 'Title',
    idCol: 'Content ID',
    whenCol: 'Timestamp',
    pageInfo: 'Page {page} of {pages} - {total} items',
    nextPage: 'Next',
    prevPage: 'Previous',
    connectingTrakt: 'Connecting to Trakt...',
    waitingTrakt: 'Waiting for Trakt authorization...',
    exchangeFailed: 'Trakt token exchange failed.',
    optionsEstimateDuration: 'Estimate playback duration',
    optionsKeepFinishedProgress: 'Keep finished progress (>95%)',
    limitLabel: 'Import limit (pages)',
    limitAll: 'All available',
    limitPage: '{n} pages'
  },
  nl: {
    title: 'Nuvio Trakt Bridge',
    subtitle: 'Synchroniseer je kijkgeschiedenis, kijkvoortgang en bibliotheek tussen Trakt en Nuvio Sync.',
    connectTrakt: 'Verbind Trakt',
    disconnectTrakt: 'Ontkoppel Trakt',
    traktStatusConnected: 'Trakt verbonden',
    traktStatusDisconnected: 'Trakt disconnected',
    connectNuvio: 'Inloggen bij Nuvio',
    disconnectNuvio: 'Ontkoppel Nuvio',
    nuvioStatusConnected: 'Nuvio verbonden',
    nuvioStatusDisconnected: 'Nuvio disconnected',
    emailLabel: 'Nuvio e-mailadres',
    emailPlaceholder: 'je@voorbeeld.com',
    passwordLabel: 'Nuvio wachtwoord',
    passwordPlaceholder: 'Je Nuvio wachtwoord',
    profileLabel: 'Nuvio profiel',
    syncDirectionLabel: 'Synchronisatierichting',
    importDirection: 'Trakt naar Nuvio (Importeren)',
    exportDirection: 'Nuvio naar Trakt (Exporteren)',
    syncScopesTitle: 'Synchronisatiebereik',
    syncScopesSubtitle: 'Kies welke gegevens je wilt synchroniseren',
    syncHistoryLabel: 'Kijkgeschiedenis',
    syncHistorySub: 'Films en bekeken afleveringen',
    syncProgressLabel: 'Kijkvoortgang',
    syncProgressSub: 'Kijkvoortgang hervatten',
    syncWatchlistLabel: 'Watchlist',
    syncWatchlistSub: 'Watchlist-items opslaan in bibliotheek',
    syncCollectionLabel: 'Collectie',
    syncCollectionSub: 'Collectie-items opslaan in bibliotheek',
    previewBtn: 'Voorbeeld',
    syncBtn: 'Synchroniseer naar Nuvio',
    syncBtnExport: 'Synchroniseer naar Trakt',
    copyLogBtn: 'Kopieer logboek',
    logCopied: 'Logboek gekopieerd',
    statusStarting: 'Bezig met starten...',
    statusChecking: 'Verbindingen controleren...',
    statusPulling: 'Gegevens ophalen...',
    statusPushing: 'Gegevens doorsturen...',
    statusVerifying: 'Synchronisatie controleren...',
    statusComplete: 'Synchronisatie voltooid!',
    statWatched: 'Bekeken',
    statProgress: 'Voortgang',
    statLibrary: 'Bibliotheek',
    statSkipped: 'Overgeslagen',
    keysSecureNote: 'Inloggegevens worden nooit opgeslagen',
    startOver: 'Opnieuw beginnen',
    retryBtn: 'Opnieuw proberen',
    noMappedItems: 'Nog geen gekoppelde items.',
    errorPrefix: 'Fout: ',
    successToast: 'Synchronisatie voltooid!',
    pullLogsTitle: 'Activiteitenlogboek',
    previewTableTitle: 'Voorbeeld gekoppelde items',
    typeCol: 'Type',
    titleCol: 'Titel',
    idCol: 'Inhoud ID',
    whenCol: 'Tijdstip',
    pageInfo: 'Pagina {page} of {pages} - {total} items',
    nextPage: 'Volgende',
    prevPage: 'Vorige',
    connectingTrakt: 'Verbinding maken met Trakt...',
    waitingTrakt: 'Wachten op Trakt autorisatie...',
    exchangeFailed: 'Trakt token uitwisseling mislukt.',
    optionsEstimateDuration: 'Schat afspeelduur in',
    optionsKeepFinishedProgress: 'Behoud voltooide voortgang (>95%)',
    limitLabel: 'Import limiet (pagina\'s)',
    limitAll: 'Alles ophalen',
    limitPage: '{n} pagina\'s'
  }
}

const t = computed(() => {
  const currentLang = (lang.value || '').startsWith('nl') ? 'nl' : 'en'
  return translations[currentLang]
})

// --- State Management ---
type ViewMode = 'form' | 'progress' | 'result'
type SyncDirection = 'import' | 'export'

const currentView = ref<ViewMode>('form')
const isCollapsed = ref(!props.defaultExpanded)

const state = reactive({
  trakt: {
    token: null as any,
    clientId: '',
  },
  nuvio: {
    session: null as any,
    profiles: [] as any[],
    profileId: 1,
  },
  options: {
    syncDirection: 'import' as SyncDirection,
    syncHistory: true,
    syncProgress: true,
    syncWatchlist: false,
    syncCollection: false,
    estimateDuration: true,
    keepFinishedProgress: false,
    maxPages: 0,
  }
})

const nuvioForm = reactive({
  email: '',
  password: '',
})

const uiState = reactive({
  isSubmitting: false,
  isTraktConnecting: false,
  globalError: null as string | null,
  toastMessage: null as string | null,
  logText: '',
  stats: {
    watched: 0,
    progress: 0,
    library: 0,
    skipped: 0
  },
  previewRows: [] as any[],
  previewPage: 1,
  previewPageSize: 50,
})

// --- Constant Definitions ---
const TRAKT_API = 'https://api.trakt.tv'
const NUVIO_BASE = 'https://api.nuvio.tv'
const NUVIO_KEY = 'sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN'

// Addon Cache
const addonManifestCache = new Map()
const addonMetaCache = new Map()
const addonEpisodeCache = new Map()
const traktEpisodeCache = new Map()
const episodeMappingCache = new Map()
const normalizedEpisodeTitleCache = new Map()

// --- Lifecycle & Auth listeners ---
let traktBroadcastChannel: BroadcastChannel | null = null
let traktPopup: Window | null = null
let expectedTraktState: string | null = null

onMounted(() => {
  window.addEventListener('message', handleTraktWindowMessage)
  if ('BroadcastChannel' in window) {
    traktBroadcastChannel = new BroadcastChannel('nuvio-trakt-bridge.trakt-oauth')
    traktBroadcastChannel.addEventListener('message', handleTraktBroadcastMessage)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('message', handleTraktWindowMessage)
  if (traktBroadcastChannel) {
    traktBroadcastChannel.close()
  }
  traktPopup = null
  expectedTraktState = null
})

function handleTraktWindowMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin || event.source !== traktPopup) return
  handleTraktPayload(event.data)
}

function handleTraktBroadcastMessage(event: MessageEvent) {
  if (event.origin && event.origin !== window.location.origin) return
  handleTraktPayload(event.data)
}

function handleTraktPayload(payload: any) {
  if (!payload || payload.source !== 'trakt-oauth' || payload.status !== 'success') return
  if (!expectedTraktState || payload.state !== expectedTraktState) return

  expectedTraktState = null
  traktPopup = null
  state.trakt.token = normalizeTraktToken(payload.tokens)
  state.trakt.clientId = payload.client_id
  uiState.isTraktConnecting = false
  logLine('Trakt connected successfully.')
  showToast(t.value.successToast)
}

// --- Helper Utilities ---
function showToast(msg: string) {
  uiState.toastMessage = msg
  setTimeout(() => {
    if (uiState.toastMessage === msg) {
      uiState.toastMessage = null
    }
  }, 4000)
}

function logLine(msg: string) {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  uiState.logText += `[${time}] ${msg}\n`
}

function clearLog() {
  uiState.logText = ''
}

function copyLog() {
  navigator.clipboard.writeText(uiState.logText)
  showToast(t.value.logCopied)
}

function normalizeTraktToken(token: any) {
  return {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    token_type: token.token_type || 'bearer',
    expires_in: token.expires_in || 7776000,
    scope: token.scope || '',
    created_at: token.created_at || Math.floor(Date.now() / 1000),
  }
}

async function requestJson(url: string, options: RequestInit = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!response.ok) {
    const detail = typeof data === 'object' && data
      ? data.error_description || data.msg || data.message || data.error || JSON.stringify(data)
      : data || response.statusText
    const error = new Error(`${response.status} ${detail}`) as any
    error.status = response.status
    error.body = data
    throw error;
  }

  return { data, headers: response.headers }
}

const METADATA_ENRICHMENT_BATCH_SIZE = 400
const METADATA_ENRICHMENT_CONCURRENCY = 4

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function enrichMetadataChunk(items: any[], attempt = 0): Promise<any[]> {
  try {
    const response = await requestJson(window.location.origin + withBase('/api/trakt/enrich-metadata'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ items })
    })
    const results = Array.isArray(response.data?.results) ? response.data.results : []
    const retryItems = items.filter((_, index) => results[index]?.retryable)

    if (retryItems.length && attempt < 1) {
      await wait(500)
      return [...results, ...await enrichMetadataChunk(retryItems, attempt + 1)]
    }
    return results
  } catch (error: any) {
    if (attempt < 1 && (error?.status === 429 || error?.status >= 500)) {
      await wait(1_000)
      return enrichMetadataChunk(items, attempt + 1)
    }
    throw error
  }
}

// --- Trakt OAuth flow ---
async function connectTrakt() {
  uiState.isTraktConnecting = true
  uiState.globalError = null
  logLine(t.value.connectingTrakt)

  try {
    const { data } = await requestJson(withBase('/api/trakt/login-url'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ return_origin: window.location.origin })
    })

    if (!data?.url || typeof data.state !== 'string') {
      throw new Error('Endpoint did not return a valid authorization transaction.')
    }

    expectedTraktState = data.state
    logLine(t.value.waitingTrakt)
    const popup = window.open(data.url, 'trakt-sign-in', 'width=600,height=780')
    if (!popup) {
      expectedTraktState = null
      throw new Error('Please allow popups to authorize Trakt.')
    }
    traktPopup = popup
    popup.focus()
  } catch (error: any) {
    traktPopup = null
    expectedTraktState = null
    uiState.isTraktConnecting = false
    uiState.globalError = error.message
    logLine(`Trakt Connection Error: ${error.message}`)
  }
}

function disconnectTrakt() {
  state.trakt.token = null
  state.trakt.clientId = ''
  logLine('Trakt disconnected.')
}

async function ensureTraktToken() {
  if (!state.trakt.token?.access_token) {
    throw new Error('Connect Trakt first.')
  }

  const createdAt = Number(state.trakt.token.created_at || 0)
  const expiresIn = Number(state.trakt.token.expires_in || 0)
  const expiresAt = createdAt + expiresIn
  const now = Math.floor(Date.now() / 1000)

  if (expiresAt && now < expiresAt - 90) {
    return state.trakt.token.access_token
  }

  if (!state.trakt.token.refresh_token) {
    throw new Error('Token expired and no refresh token saved. Reconnect Trakt.')
  }

  logLine('Refreshing Trakt token...')
  const { data } = await requestJson(withBase('/api/trakt/refresh'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: state.trakt.token.refresh_token })
  })

  state.trakt.token = normalizeTraktToken(data)
  return state.trakt.token.access_token
}

async function traktRequest(path: string, params: Record<string, any> = {}, fetchOptions: RequestInit = {}) {
  const token = await ensureTraktToken()
  const url = new URL(`${TRAKT_API}${path}`)
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '') {
      url.searchParams.set(key, String(val))
    }
  })

  const headers = {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': state.trakt.clientId,
    Authorization: `Bearer ${token}`,
    ...(fetchOptions.headers || {})
  }

  return requestJson(url.toString(), {
    ...fetchOptions,
    headers
  })
}

async function traktRequestAll(path: string, params: Record<string, any> = {}, fetchOptions: RequestInit = {}) {
  let page = 1
  const limit = 250
  const allData: any[] = []
  let firstItemJson: string | null = null

  while (true) {
    if (page > 200) {
      logLine('Warning: Trakt pagination safety limit reached (200 pages).')
      break
    }

    const res = await traktRequest(path, { ...params, page, limit }, fetchOptions)
    if (!res || !res.data) {
      break
    }

    if (Array.isArray(res.data)) {
      if (res.data.length === 0) {
        break
      }

      // Check for duplicate first item to prevent infinite loops on unpaginated endpoints
      const currentFirstItemJson = JSON.stringify(res.data[0])
      if (page > 1 && firstItemJson === currentFirstItemJson) {
        break
      }
      if (page === 1) {
        firstItemJson = currentFirstItemJson
      }

      allData.push(...res.data)

      // Check pagination headers if they are exposed by CORS
      const pageCountHeader = res.headers.get('X-Pagination-Page-Count') || res.headers.get('x-pagination-page-count')
      if (pageCountHeader) {
        const totalPages = parseInt(pageCountHeader, 10)
        if (!isNaN(totalPages) && page >= totalPages) {
          break
        }
      }
      
      page++
    } else {
      return res
    }
  }

  return { data: allData }
}


// --- Nuvio Sync Flow ---
async function signInNuvio() {
  if (!nuvioForm.email.trim() || !nuvioForm.password) {
    uiState.globalError = 'Enter Nuvio email and password.'
    return
  }

  uiState.isSubmitting = true
  uiState.globalError = null
  logLine('Signing in to Nuvio...')

  try {
    const { data } = await requestJson(`${NUVIO_BASE}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: NUVIO_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: nuvioForm.email.trim(), password: nuvioForm.password }),
    })

    if (!data?.access_token) {
      throw new Error('Nuvio did not return an access token.')
    }

    const now = Math.floor(Date.now() / 1000)
    state.nuvio.session = {
      ...data,
      expires_at: data.expires_at || (data.expires_in ? now + Number(data.expires_in) : 0),
    }

    logLine('Loading Nuvio profiles...')
    await loadNuvioProfiles()
    logLine('Nuvio connected successfully.')
    showToast(t.value.successToast)
  } catch (error: any) {
    uiState.globalError = error.message
    logLine(`Nuvio Login Error: ${error.message}`)
  } finally {
    uiState.isSubmitting = false
  }
}

async function loadNuvioProfiles() {
  const profiles = await nuvioRpc('sync_pull_profiles', {})
  state.nuvio.profiles = Array.isArray(profiles) ? profiles : []
  if (state.nuvio.profiles.length > 0) {
    state.nuvio.profileId = Number(state.nuvio.profiles[0].profile_index || 1)
  }
}

async function ensureNuvioToken() {
  if (!state.nuvio.session?.access_token) {
    throw new Error('Connect Nuvio first.')
  }

  const expiresAt = Number(state.nuvio.session.expires_at || 0)
  const now = Math.floor(Date.now() / 1000)
  if (!expiresAt || now < expiresAt - 90) {
    return state.nuvio.session.access_token
  }

  if (!state.nuvio.session.refresh_token) {
    throw new Error('Nuvio session expired. Sign in again.')
  }

  logLine('Refreshing Nuvio session...')
  const { data } = await requestJson(`${NUVIO_BASE}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      apikey: NUVIO_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: state.nuvio.session.refresh_token }),
  })

  state.nuvio.session = {
    ...data,
    expires_at: data.expires_at || (data.expires_in ? now + Number(data.expires_in) : 0),
  }
  return state.nuvio.session.access_token
}

async function nuvioRpc(name: string, body: Record<string, any> = {}) {
  const token = await ensureNuvioToken()
  const { data } = await requestJson(`${NUVIO_BASE}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: NUVIO_KEY,
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body)
  })
  return data
}

async function nuvioRest(path: string, params: Record<string, any> = {}) {
  const token = await ensureNuvioToken()
  const url = new URL(`${NUVIO_BASE}/rest/v1/${path}`)
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null) {
      url.searchParams.set(key, String(val))
    }
  })

  const { data } = await requestJson(url.toString(), {
    headers: {
      apikey: NUVIO_KEY,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  })
  return data
}

function disconnectNuvio() {
  state.nuvio.session = null
  state.nuvio.profiles = []
  nuvioForm.password = ''
  logLine('Nuvio disconnected.')
}

// --- Sync Episode remapping (Trakt <-> Nuvio) ---
interface Addon {
  baseUrl: string
  name: string
  rawTypes: string[]
  resources: any[]
}

interface EpisodeEntry {
  season: number
  episode: number
  title: string
  videoId: string | null
}

async function prepareEpisodeMapper() {
  if (!state.nuvio.session?.access_token) return null
  try {
    const addons = await pullNuvioMetadataAddons(Number(state.nuvio.profileId))
    if (!addons.length) return null
    return {
      addons,
      effectiveProfileId: Number(state.nuvio.profileId),
      disabled: false,
      startedAt: Date.now(),
      timeoutLogged: false,
      metaTimeoutMs: 3000,
      traktTimeoutMs: 4500,
      totalBudgetMs: 30000,
      fallbackStats: {} as Record<string, number>,
      fallbackLogCounts: {} as Record<string, number>
    }
  } catch (e) {
    logLine(`Episode mapper error: ${e}`)
    return null
  }
}

async function pullNuvioMetadataAddons(profileId: number): Promise<Addon[]> {
  const params = {
    select: 'url,name,sort_order,profile_id,enabled',
    profile_id: `eq.${profileId}`,
    order: 'sort_order.asc'
  }
  const rows = await nuvioRest('addons', params)
  const sorted = (Array.isArray(rows) ? rows : [])
    .filter(row => row?.url && row.enabled !== false)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))

  for (const row of sorted) {
    const manifest = await fetchAddonManifest(row.url, row.name).catch(() => null)
    if (manifest && manifest.resources.some(r => r.name.toLowerCase() === 'meta')) {
      return [manifest]
    }
  }
  return []
}

async function fetchAddonManifest(url: string, name: string): Promise<Addon> {
  const base = url.split('?')[0].replace(/\/manifest\.json$/i, '').replace(/\/+$/, '')
  if (addonManifestCache.has(base)) return addonManifestCache.get(base)
  const manifest = await fetchJsonUrl(`${base}/manifest.json`)
  const types = Array.isArray(manifest?.types) ? manifest.types.map(String) : []
  const resources = Array.isArray(manifest?.resources) ? manifest.resources.map((r: any) => {
    if (typeof r === 'string') return { name: r, types, idPrefixes: [] }
    return { name: String(r?.name || ''), types: r?.types || types, idPrefixes: r?.idPrefixes || [] }
  }) : []

  const addonObj = { baseUrl: base, name, rawTypes: types, resources }
  addonManifestCache.set(base, addonObj)
  return addonObj
}

async function fetchJsonUrl(url: string, timeout = 8000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

async function getAddonEpisodes(contentId: string, type: string, mapper: any): Promise<EpisodeEntry[]> {
  const key = `${mapper.effectiveProfileId}|${type}|${contentId}`
  if (addonEpisodeCache.has(key)) return addonEpisodeCache.get(key)
  const meta = await fetchSeriesMeta(contentId, type, mapper)
  const eps = mapAddonVideosToEpisodeEntries(meta?.videos || [])
  addonEpisodeCache.set(key, eps)
  return eps
}

async function fetchSeriesMeta(contentId: string, type: string, mapper: any) {
  const prefixes = [contentId, contentId.replace(/^(tmdb|trakt):/, '')]
  const timeout = mapper?.metaTimeoutMs || 3000
  for (const addon of mapper.addons) {
    for (const prefix of prefixes) {
      const url = `${addon.baseUrl}/meta/${type}/${prefix}.json`
      const data = await fetchJsonUrl(url, timeout).catch(() => null)
      if (data?.meta) return data.meta
    }
  }
  return null
}

function mapAddonVideosToEpisodeEntries(videos: any[]): EpisodeEntry[] {
  const seen = new Set()
  return videos.map(v => {
    const season = Number(v?.season)
    const episode = Number(v?.episode ?? v?.number)
    if (isNaN(season) || isNaN(episode) || season <= 0 || episode <= 0) return null
    const id = v?.id ? String(v.id) : null
    const key = id || `${season}:${episode}`
    if (seen.has(key)) return null
    seen.add(key)
    return { season, episode, title: v?.title || v?.name || `Episode ${episode}`, videoId: id }
  }).filter(Boolean) as EpisodeEntry[]
}

async function getTraktEpisodes(showId: string, mapper: any): Promise<EpisodeEntry[]> {
  if (traktEpisodeCache.has(showId)) return traktEpisodeCache.get(showId)
  try {
    const { data } = await traktRequest(`/shows/${encodeURIComponent(showId)}/seasons`, { extended: 'episodes' })
    const entries: EpisodeEntry[] = []
    for (const s of (Array.isArray(data) ? data : [])) {
      const sNum = Number(s?.number)
      if (isNaN(sNum) || sNum <= 0) continue
      for (const ep of (s?.episodes || [])) {
        const epNum = Number(ep?.number)
        if (isNaN(epNum) || epNum <= 0) continue
        entries.push({ season: sNum, episode: epNum, title: ep?.title || '', videoId: null })
      }
    }
    entries.sort((a, b) => (a.season - b.season) || (a.episode - b.episode))
    traktEpisodeCache.set(showId, entries)
    return entries;
  } catch {
    traktEpisodeCache.set(showId, [])
    return []
  }
}

// Batch-prefetch episode maps for a list of shows to warm caches in parallel
async function prefetchEpisodeMaps(mapper: any, shows: Array<{ contentId: string; contentType: string; imdb?: string }>) {
  if (!mapper || mapper.disabled) return
  const seen = new Set<string>()
  const tasks: Array<{ contentId: string; contentType: string; lookupId: string }> = []
  for (const s of shows) {
    const key = s.contentId
    if (seen.has(key)) continue
    seen.add(key)
    tasks.push({
      contentId: s.contentId,
      contentType: s.contentType,
      lookupId: s.imdb || s.contentId.replace(/^(trakt|tmdb):/, '')
    })
  }
  if (!tasks.length) return

  // Reset budget timer so Trakt fetch time doesn't count against mapping
  mapper.startedAt = Date.now()

  logLine(`Pre-fetching episode maps for ${tasks.length} show(s)...`)

  // Concurrent worker queue — workers pull the next task as soon as they finish,
  // so fast responses aren't blocked waiting for slow ones in the same batch
  const concurrency = 20
  let cursor = 0
  let completed = 0
  let lastLoggedAt = 0

  async function worker() {
    while (cursor < tasks.length) {
      if (mapper.disabled) return
      if (mapper.startedAt && (Date.now() - mapper.startedAt) > mapper.totalBudgetMs) {
        mapper.disabled = true
        return
      }
      const idx = cursor++
      const t = tasks[idx]
      if (!t) return
      await Promise.all([
        getAddonEpisodes(t.contentId, t.contentType, mapper).catch(() => []),
        getTraktEpisodes(t.lookupId, mapper).catch(() => [])
      ])
      completed++
      // Log progress every ~50 shows
      if (completed - lastLoggedAt >= 50) {
        lastLoggedAt = completed
        logLine(`  Prefetched ${completed}/${tasks.length} shows...`)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()))

  if (mapper.disabled) {
    logLine(`Episode mapping budget exhausted during prefetch (${tasks.length - completed} of ${tasks.length} shows skipped).`)
  } else {
    logLine(`Episode map prefetch complete (${tasks.length} shows).`)
  }
}

async function resolveEpisodeMapping(mapper: any, params: any, isExport = false) {
  if (!mapper || mapper.disabled) return null
  if (mapper.startedAt && (Date.now() - mapper.startedAt) > mapper.totalBudgetMs) {
    mapper.disabled = true
    logLine('Episode mapping budget exhausted. Disabling mapping for remaining items.')
    return null
  }
  const cacheKey = `${mapper.effectiveProfileId}|${params.contentType}|${params.contentId}|${params.season}|${params.episode}|${isExport ? 'export' : 'import'}`
  if (episodeMappingCache.has(cacheKey)) return episodeMappingCache.get(cacheKey)

  try {
    const showLookupId = params.imdb || params.contentId.replace(/^(trakt|tmdb):/, '')
    const [addonEpisodes, traktEpisodes] = await Promise.all([
      getAddonEpisodes(params.contentId, params.contentType, mapper),
      getTraktEpisodes(showLookupId, mapper)
    ])

    if (addonEpisodes.length && traktEpisodes.length) {
      if (isExport) {
        // Nuvio (Addon) -> Trakt
        const addonEp = addonEpisodes.find(item => item.season === params.season && item.episode === params.episode)
        if (addonEp) {
          const mapped = remapEpisodeBetweenLists({
            requestedSeason: params.season,
            requestedEpisode: params.episode,
            requestedVideoId: addonEp.videoId,
            requestedTitle: addonEp.title,
            sourceEpisodes: addonEpisodes,
            targetEpisodes: traktEpisodes
          })
          episodeMappingCache.set(cacheKey, mapped)
          return mapped
        }
      } else {
        // Trakt -> Nuvio (Addon)
        const hasEp = addonEpisodes.some(item => item.season === params.season && item.episode === params.episode)
        if (!hasEp) {
          const mapped = remapEpisodeBetweenLists({
            requestedSeason: params.season,
            requestedEpisode: params.episode,
            requestedVideoId: null,
            requestedTitle: params.title,
            sourceEpisodes: traktEpisodes,
            targetEpisodes: addonEpisodes
          })
          episodeMappingCache.set(cacheKey, mapped)
          return mapped
        }
      }
    }
  } catch (e) {
    // Fail silently, fallback to original numbering
  }
  episodeMappingCache.set(cacheKey, null)
  return null
}

function remapEpisodeBetweenLists(params: {
  requestedSeason: number
  requestedEpisode: number
  requestedVideoId: string | null
  requestedTitle: string
  sourceEpisodes: EpisodeEntry[]
  targetEpisodes: EpisodeEntry[]
}) {
  const sourceEp = params.requestedVideoId
    ? params.sourceEpisodes.find(item => item.videoId === params.requestedVideoId)
    : params.sourceEpisodes.find(item => item.season === params.requestedSeason && item.episode === params.requestedEpisode)

  if (!sourceEp) return null

  // Try title matching
  const normTitle = params.requestedTitle.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  if (normTitle && !/^(episode|ep|e) \d+$/.test(normTitle)) {
    const matched = params.targetEpisodes.find(item => item.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === normTitle)
    if (matched) return matched
  }

  // Fallback to index matching
  const index = params.sourceEpisodes.indexOf(sourceEp)
  if (index >= 0 && index < params.targetEpisodes.length) {
    return params.targetEpisodes[index]
  }

  return null
}

// --- Sync Core Logic ---

function parseNuvioIdToTraktIds(contentId: string) {
  const ids: Record<string, any> = {}
  if (!contentId) return ids
  if (contentId.startsWith('tmdb:')) {
    ids.tmdb = Number(contentId.substring(5))
  } else if (contentId.startsWith('trakt:')) {
    const val = contentId.substring(6)
    if (/^\d+$/.test(val)) {
      ids.trakt = Number(val)
    } else {
      ids.slug = val;
    }
  } else if (/^tt\d+$/i.test(contentId)) {
    ids.imdb = contentId
  }
  return ids
}

function resolveContentId(ids: any, kind: string) {
  if (ids?.imdb && /^tt\d+$/i.test(ids.imdb)) return ids.imdb
  if (ids?.tmdb) return `tmdb:${ids.tmdb}`
  if (ids?.trakt) return `trakt:${ids.trakt}`
  return null
}

// --- PULL & BUILD SYNC PLAN ---
async function buildSyncPlan(isPreviewOnly = false) {
  const plan = {
    history: [] as any[],
    progress: [] as any[],
    library: [] as any[],
    skipped: 0
  }

  const direction = state.options.syncDirection

  if (direction === 'import') {
    // ----------------------------------------
    // TRAKT -> NUVIO (IMPORT)
    // ----------------------------------------
    logLine('Pulling data from Trakt...')

    // Fire mapper prep and all Trakt API calls in parallel
    const mapperPromise = prepareEpisodeMapper()

    const historyPromise = state.options.syncHistory
      ? (logLine('Fetching Trakt watched movies & shows...'),
         Promise.all([
           traktRequestAll('/sync/watched/movies'),
           traktRequestAll('/sync/watched/shows', { extended: 'progress' })
         ]))
      : Promise.resolve(null)

    const progressPromise = state.options.syncProgress
      ? traktRequestAll('/sync/playback')
      : Promise.resolve(null)

    const libraryPromise = (state.options.syncWatchlist || state.options.syncCollection)
      ? (async () => {
          const items = [] as any[]
          // Fire watchlist and collection requests in parallel
          const [wlResult, colResult] = await Promise.all([
            state.options.syncWatchlist
              ? traktRequestAll('/users/me/watchlist')
              : Promise.resolve(null),
            state.options.syncCollection
              ? Promise.all([
                  traktRequestAll('/sync/collection/movies'),
                  traktRequest('/sync/collection/shows')
                ])
              : Promise.resolve(null)
          ])
          if (wlResult) {
            items.push(...(Array.isArray(wlResult.data) ? wlResult.data.map((i: any) => ({ ...i, _src: 'watchlist' })) : []))
          }
          if (colResult) {
            const [movies, shows] = colResult as [any, any]
            items.push(
              ...(Array.isArray(movies.data) ? movies.data.map((i: any) => ({ ...i, _src: 'collection' })) : []),
              ...(Array.isArray(shows.data) ? shows.data.map((i: any) => ({ ...i, _src: 'collection' })) : [])
            )
          }
          return items
        })()
      : Promise.resolve(null)

    // Await all parallel fetches
    const [mapper, historyData, pbData, libraryItems] = await Promise.all([
      mapperPromise, historyPromise, progressPromise, libraryPromise
    ])

    // --- Process History ---
    if (historyData) {
      const [movies, shows] = historyData
      logLine(`Received ${Array.isArray(movies.data) ? movies.data.length : 0} movies, ${Array.isArray(shows.data) ? shows.data.length : 0} shows from Trakt.`)

      // Movies
      for (const m of (Array.isArray(movies.data) ? movies.data : [])) {
        const id = resolveContentId(m.movie?.ids, 'movie')
        if (!id) { plan.skipped++; continue }
        plan.history.push({
          content_id: id,
          content_type: 'movie',
          title: m.movie?.title || 'Movie',
          watched_at: new Date(m.last_watched_at || m.watched_at || Date.now()).getTime(),
          _display_type: 'watched movie'
        })
      }

      // Shows / Episodes — prefetch episode maps in parallel before iterating
      const showsArray = Array.isArray(shows.data) ? shows.data : []
      if (mapper && showsArray.length) {
        const showList = showsArray
          .map(s => ({ contentId: resolveContentId(s.show?.ids, 'show'), contentType: 'series', imdb: s.show?.ids?.imdb }))
          .filter(s => s.contentId) as Array<{ contentId: string; contentType: string; imdb?: string }>
        await prefetchEpisodeMaps(mapper, showList)
      }

      let episodeCount = 0
      for (const s of showsArray) {
        const id = resolveContentId(s.show?.ids, 'show')
        if (!id) { plan.skipped++; continue }
        for (const season of (s.seasons || [])) {
          for (const ep of (season.episodes || [])) {
            let sNum = Number(season.number)
            let epNum = Number(ep.number)
            const mapping = await resolveEpisodeMapping(mapper, {
              contentId: id,
              contentType: 'series',
              season: sNum,
              episode: epNum,
              title: ep.title || '',
              imdb: s.show?.ids?.imdb
            })
            if (mapping) {
              sNum = mapping.season
              epNum = mapping.episode
            }
            plan.history.push({
              content_id: id,
              content_type: 'series',
              title: `${s.show?.title || 'Series'} S${sNum}E${epNum}`,
              season: sNum,
              episode: epNum,
              watched_at: new Date(ep.last_watched_at || s.last_watched_at || Date.now()).getTime(),
              _display_type: 'watched episode'
            })
            episodeCount++
          }
        }
      }
      logLine(`Processed ${episodeCount} watched episodes across ${showsArray.length} shows.`)
    }

    // --- Process Playback Progress ---
    if (pbData) {
      logLine('Processing playback progress...')
      for (const p of (Array.isArray(pbData.data) ? pbData.data : [])) {
        const progressVal = Number(p.progress)
        if (isNaN(progressVal) || progressVal <= 0) continue
        if (!state.options.keepFinishedProgress && progressVal >= 95) continue

        const runtime = Number(p.movie?.runtime || p.episode?.runtime || 45)
        const duration = runtime * 60 * 1000
        const position = Math.round(duration * (progressVal / 100))

        if (p.type === 'movie' || p.movie) {
          const id = resolveContentId(p.movie?.ids, 'movie')
          if (!id) { plan.skipped++; continue }
          plan.progress.push({
            content_id: id,
            content_type: 'movie',
            video_id: id,
            position,
            duration,
            last_watched: new Date(p.paused_at || p.updated_at || Date.now()).getTime(),
            _display_type: 'progress movie',
            _display_title: p.movie?.title || id
          })
        } else if (p.type === 'episode' || p.episode) {
          const id = resolveContentId(p.show?.ids, 'show')
          if (!id) { plan.skipped++; continue }
          let sNum = Number(p.episode?.season)
          let epNum = Number(p.episode?.number)
          const mapping = await resolveEpisodeMapping(mapper, {
            contentId: id,
            contentType: 'series',
            season: sNum,
            episode: epNum,
            title: p.episode?.title || '',
            imdb: p.show?.ids?.imdb
          })
          if (mapping) {
            sNum = mapping.season
            epNum = mapping.episode
          }
          plan.progress.push({
            content_id: id,
            content_type: 'series',
            video_id: `${id}:${sNum}:${epNum}`,
            season: sNum,
            episode: epNum,
            position,
            duration,
            last_watched: new Date(p.paused_at || p.updated_at || Date.now()).getTime(),
            _display_type: 'progress episode',
            _display_title: `${p.show?.title || 'Series'} S${sNum}E${epNum}`
          })
        }
      }
    }

    // --- Process Library (Watchlist / Collection) ---
    if (libraryItems && libraryItems.length) {
      for (const item of libraryItems) {
        const isMovie = item.type === 'movie' || item.movie
        const media = isMovie ? item.movie : item.show
        const kind = isMovie ? 'movie' : 'series'
        const id = resolveContentId(media?.ids, kind)
        if (!id) { plan.skipped++; continue }

        plan.library.push({
          content_id: id,
          content_type: kind,
          name: media?.title || 'Untitled',
          added_at: new Date(item.listed_at || item.collected_at || item.last_collected_at || Date.now()).getTime(),
          _display_type: `${item._src} item`,
          _ids: media?.ids
        })
      }
    }

  } else {
    // ----------------------------------------
    // NUVIO -> TRAKT (EXPORT)
    // ----------------------------------------
    logLine('Pulling data from Nuvio Sync...')
    const mapper = await prepareEpisodeMapper()
    const profileId = Number(state.nuvio.profileId)

    if (state.options.syncHistory) {
      logLine('Fetching Nuvio watched items...')
      const pageSize = 1000
      const watched = [] as any[]
      for (let page = 1; page <= 50; page++) {
        const rows = await nuvioRpc('sync_pull_watched_items', {
          p_profile_id: profileId,
          p_page: page,
          p_page_size: pageSize
        })
        const batch = Array.isArray(rows) ? rows : []
        watched.push(...batch)
        if (batch.length < pageSize) break
      }

      logLine(`Pulled ${watched.length} watched items from Nuvio profile. Remapping numbers...`)

      // Prefetch episode maps for all unique series in parallel
      if (mapper) {
        const seriesItems = watched.filter(i => i.content_type === 'series' && i.content_id)
        const showList = [...new Map(seriesItems.map(i => [i.content_id, { contentId: i.content_id, contentType: 'series' }])).values()]
        await prefetchEpisodeMaps(mapper, showList)
      }

      for (const item of watched) {
        if (item.content_type === 'movie') {
          plan.history.push({
            content_id: item.content_id,
            content_type: 'movie',
            title: item.title || 'Movie',
            watched_at: Number(item.watched_at || Date.now()),
            _display_type: 'watched movie'
          })
        } else if (item.content_type === 'series') {
          let sNum = Number(item.season)
          let epNum = Number(item.episode)
          const mapping = await resolveEpisodeMapping(mapper, {
            contentId: item.content_id,
            contentType: 'series',
            season: sNum,
            episode: epNum,
            title: ''
          }, true) // isExport = true
          if (mapping) {
            sNum = mapping.season
            epNum = mapping.episode
          }
          plan.history.push({
            content_id: item.content_id,
            content_type: 'series',
            title: item.title || `Series S${sNum}E${epNum}`,
            season: sNum,
            episode: epNum,
            watched_at: Number(item.watched_at || Date.now()),
            _display_type: 'watched episode'
          })
        }
      }
    }

    if (state.options.syncProgress) {
      logLine('Fetching Nuvio watch progress...')
      const progress = await nuvioRpc('sync_pull_watch_progress', { p_profile_id: profileId })
      for (const p of (Array.isArray(progress) ? progress : [])) {
        const progressVal = (Number(p.position) / Number(p.duration)) * 100
        if (isNaN(progressVal) || progressVal <= 0) continue
        if (!state.options.keepFinishedProgress && progressVal >= 95) continue

        if (p.content_type === 'movie') {
          plan.progress.push({
            content_id: p.content_id,
            content_type: 'movie',
            position: p.position,
            duration: p.duration,
            last_watched: Number(p.last_watched || Date.now()),
            _display_type: 'progress movie',
            _display_title: p.title || p.content_id
          })
        } else if (p.content_type === 'series') {
          let sNum = Number(p.season)
          let epNum = Number(p.episode)
          const mapping = await resolveEpisodeMapping(mapper, {
            contentId: p.content_id,
            contentType: 'series',
            season: sNum,
            episode: epNum,
            title: ''
          }, true) // isExport = true
          if (mapping) {
            sNum = mapping.season
            epNum = mapping.episode
          }
          plan.progress.push({
            content_id: p.content_id,
            content_type: 'series',
            season: sNum,
            episode: epNum,
            position: p.position,
            duration: p.duration,
            last_watched: Number(p.last_watched || Date.now()),
            _display_type: 'progress episode',
            _display_title: `Series S${sNum}E${epNum}`
          })
        }
      }
    }

    if (state.options.syncWatchlist || state.options.syncCollection) {
      logLine('Fetching Nuvio library items...')
      const limit = 500
      const library = [] as any[]
      for (let offset = 0; offset < 100000; offset += limit) {
        const rows = await nuvioRpc('sync_pull_library', {
          p_profile_id: profileId,
          p_limit: limit,
          p_offset: offset
        })
        const batch = Array.isArray(rows) ? rows : []
        library.push(...batch)
        if (batch.length < limit) break
      }

      logLine(`Pulled ${library.length} library items from Nuvio profile.`)
      for (const item of library) {
        plan.library.push({
          content_id: item.content_id,
          content_type: item.content_type,
          name: item.name || 'Untitled',
          added_at: Number(item.added_at || Date.now()),
          _display_type: 'library item'
        })
      }
    }
  }

  // Deduplicate and filter arrays
  plan.history = plan.history.sort((a, b) => b.watched_at - a.watched_at)
  plan.progress = plan.progress.sort((a, b) => b.last_watched - a.last_watched)
  plan.library = plan.library.sort((a, b) => b.added_at - a.added_at)

  // Populate preview rows
  uiState.previewRows = [
    ...plan.history.map(h => ({
      type: h._display_type,
      title: h.title,
      id: h.content_id,
      when: h.watched_at
    })),
    ...plan.progress.map(p => ({
      type: p._display_type,
      title: p._display_title,
      id: p.content_id,
      when: p.last_watched
    })),
    ...plan.library.map(l => ({
      type: l._display_type,
      title: l.name,
      id: l.content_id,
      when: l.added_at
    }))
  ]

  uiState.stats.watched = plan.history.length
  uiState.stats.progress = plan.progress.length
  uiState.stats.library = plan.library.length
  uiState.stats.skipped = plan.skipped

  return plan
}

// --- EXECUTE PLAN (PUSH DATA) ---
async function executeSync() {
  uiState.isSubmitting = true
  uiState.globalError = null
  clearLog()
  uiState.previewRows = []
  uiState.previewPage = 1
  currentView.value = 'progress'

  logLine('Starting sync process...')
  logLine(`Direction: ${state.options.syncDirection === 'import' ? 'Trakt -> Nuvio' : 'Nuvio -> Trakt'}`)

  try {
    logLine('Building sync plan and resolving TV episode maps...')
    const plan = await buildSyncPlan()

    const profileId = Number(state.nuvio.profileId)

    if (state.options.syncDirection === 'import') {
      // ----------------------------------------
      // PUSH TO NUVIO
      // ----------------------------------------
      logLine('Pushing data to Nuvio Sync...')

      // 1. PUSH WATCHED ITEMS
      if (plan.history.length) {
        logLine(`Pushing ${plan.history.length} watched items...`)
        const chunks = chunkArray(plan.history.map(stripDisplayFields), 500)
        // Push batches concurrently (3 at a time)
        const pushConcurrency = 3
        for (let i = 0; i < chunks.length; i += pushConcurrency) {
          const batch = chunks.slice(i, i + pushConcurrency)
          await Promise.all(batch.map((chunk, j) =>
            nuvioRpc('sync_push_watched_items', {
              p_profile_id: profileId,
              p_items: chunk
            }).then(() => logLine(`Pushed watched batch ${i + j + 1}/${chunks.length}`))
          ))
        }
      }

      // 2. PUSH PROGRESS
      if (plan.progress.length) {
        logLine(`Pushing ${plan.progress.length} progress entries...`)
        const chunks = chunkArray(plan.progress.map(stripDisplayFields), 300)
        for (let i = 0; i < chunks.length; i++) {
          await nuvioRpc('sync_push_watch_progress', {
            p_profile_id: profileId,
            p_entries: chunks[i]
          })
          logLine(`Pushed progress batch ${i + 1}/${chunks.length}`)
        }
      }

      // 3. PUSH LIBRARY
      if (plan.library.length) {
        logLine(`Enriching ${plan.library.length} imported library items with metadata...`)
        try {
          const metadataItems = plan.library.map((item: any) => ({
            content_id: item.content_id,
            content_type: item.content_type,
            name: String(item.name || 'Untitled').slice(0, 256),
            _ids: {
              tmdb: item._ids?.tmdb,
              imdb: item._ids?.imdb
            }
          }))
          const metadataChunks = chunkArray(metadataItems, METADATA_ENRICHMENT_BATCH_SIZE)
          const enrichedResults = [] as any[]

          for (let offset = 0; offset < metadataChunks.length; offset += METADATA_ENRICHMENT_CONCURRENCY) {
            const wave = metadataChunks.slice(offset, offset + METADATA_ENRICHMENT_CONCURRENCY)
            const settled = await Promise.allSettled(wave.map(chunk => enrichMetadataChunk(chunk)))
            settled.forEach(result => {
              if (result.status === 'fulfilled') {
                enrichedResults.push(...result.value)
              } else {
                logLine(`Warning: A metadata batch failed (${result.reason?.message || result.reason}).`)
              }
            })
            const completed = Math.min(offset + wave.length, metadataChunks.length)
            logLine(`Metadata batches complete: ${completed}/${metadataChunks.length}`)
          }

          const enrichMap = new Map()
          enrichedResults.forEach((r: any) => enrichMap.set(r.content_id, r))

          plan.library.forEach((item: any) => {
            const match = enrichMap.get(item.content_id)
            if (match) {
              if (match.posterUrl) {
                item.poster = match.posterUrl
                item.poster_shape = 'POSTER'
              }
              if (match.releaseDate) {
                item.release_info = match.releaseDate
              }
            }
          })
          logLine('Metadata enrichment complete.')
        } catch (e: any) {
          logLine(`Warning: Metadata enrichment failed (${e.message || e}). Importing with existing metadata.`)
        }

        logLine('Pulling current Nuvio library for deduplication/merge...')
        const existingRows = [] as any[]
        const limit = 500
        for (let offset = 0; offset < 100000; offset += limit) {
          const rows = await nuvioRpc('sync_pull_library', {
            p_profile_id: profileId,
            p_limit: limit,
            p_offset: offset
          })
          const batch = Array.isArray(rows) ? rows : []
          existingRows.push(...batch)
          if (batch.length < limit) break
        }

        const cleanExisting = existingRows.map(cleanNuvioLibraryItem)
        const newLibraryItems = plan.library.map(stripDisplayFields)
        
        // Merge and deduplicate by content_id, keeping the newest added_at
        const mergedMap = new Map()
        cleanExisting.forEach(item => mergedMap.set(item.content_id, item))
        newLibraryItems.forEach(item => {
          const existing = mergedMap.get(item.content_id)
          if (!existing || item.added_at > existing.added_at) {
            // Keep existing metadata if available, and don't overwrite good metadata with null/empty
            const merged = { ...existing }
            Object.entries(item).forEach(([key, val]) => {
              if (val !== undefined && val !== null && val !== '') {
                merged[key] = val;
              } else if (existing && existing[key] !== undefined && existing[key] !== null) {
                // Keep existing good value
              } else {
                merged[key] = val;
              }
            })
            mergedMap.set(item.content_id, merged)
          }
        })

        const mergedList = Array.from(mergedMap.values())
        logLine(`Merged existing Nuvio library with imports. Total size to push: ${mergedList.length}`)

        await nuvioRpc('sync_push_library', {
          p_profile_id: profileId,
          p_items: mergedList
        })
        logLine('Pushed library items (replace).')
      }

    } else {
      // ----------------------------------------
      // PUSH TO TRAKT
      // ----------------------------------------
      logLine('Pushing data to Trakt...')

      // 1. PUSH WATCHED ITEMS (HISTORY)
      if (plan.history.length) {
        logLine(`Mapping and pushing history to Trakt...`)
        const movies = [] as any[]
        const showMap = new Map()

        for (const h of plan.history) {
          const ids = parseNuvioIdToTraktIds(h.content_id)
          if (!ids || Object.keys(ids).length === 0) continue

          const watchedAtIso = new Date(h.watched_at).toISOString()

          if (h.content_type === 'movie') {
            movies.push({ watched_at: watchedAtIso, ids })
          } else if (h.content_type === 'series') {
            const seriesId = h.content_id
            if (!showMap.has(seriesId)) {
              showMap.set(seriesId, { ids, seasons: new Map() })
            }
            const show = showMap.get(seriesId)
            const sNum = h.season || 1
            if (!show.seasons.has(sNum)) {
              show.seasons.set(sNum, { number: sNum, episodes: [] })
            }
            show.seasons.get(sNum).episodes.push({
              number: h.episode || 1,
              watched_at: watchedAtIso
            })
          }
        }

        const shows = Array.from(showMap.values()).map((s: any) => ({
          ids: s.ids,
          seasons: Array.from(s.seasons.values()).map((se: any) => ({
            number: se.number,
            episodes: se.episodes
          }))
        }))

        // Push movies chunked
        if (movies.length) {
          const movieChunks = chunkArray(movies, 100)
          for (let i = 0; i < movieChunks.length; i++) {
            await traktRequest('/sync/history', {}, {
              method: 'POST',
              body: JSON.stringify({ movies: movieChunks[i] })
            })
            logLine(`Pushed history movies batch ${i + 1}/${movieChunks.length}`)
          }
        }

        // Push shows chunked
        if (shows.length) {
          const showChunks = chunkArray(shows, 100)
          for (let i = 0; i < showChunks.length; i++) {
            await traktRequest('/sync/history', {}, {
              method: 'POST',
              body: JSON.stringify({ shows: showChunks[i] })
            })
            logLine(`Pushed history shows batch ${i + 1}/${showChunks.length}`)
          }
        }
      }

      // 2. PUSH PROGRESS (PLAYBACK)
      if (plan.progress.length) {
        logLine(`Syncing continue-watching progress to Trakt...`)
        for (let i = 0; i < plan.progress.length; i++) {
          const p = plan.progress[i]
          const progressVal = Math.min(100, Math.max(1, (p.position / p.duration) * 100))
          const ids = parseNuvioIdToTraktIds(p.content_id)
          if (!ids || Object.keys(ids).length === 0) continue

          const payload = {
            progress: progressVal,
            app_version: '1.0',
            app_date: new Date(p.last_watched).toISOString().split('T')[0]
          } as any

          if (p.content_type === 'movie') {
            payload.movie = { ids }
          } else {
            payload.show = { ids }
            payload.episode = { season: p.season, number: p.episode }
          }

          try {
            await traktRequest('/sync/playback', {}, {
              method: 'POST',
              body: JSON.stringify(payload)
            })
            if ((i + 1) % 5 === 0 || i === plan.progress.length - 1) {
              logLine(`Pushed progress item ${i + 1}/${plan.progress.length}`)
            }
          } catch (e: any) {
            logLine(`Warning: failed to push progress for ${p.content_id}: ${e.message}`)
          }
        }
      }

      // 3. PUSH LIBRARY (WATCHLIST & COLLECTION)
      if (plan.library.length) {
        const wlMovies = [] as any[]
        const wlShows = [] as any[]
        const colMovies = [] as any[]
        const colShows = [] as any[]

        for (const item of plan.library) {
          const ids = parseNuvioIdToTraktIds(item.content_id)
          if (!ids || Object.keys(ids).length === 0) continue

          const isMovie = item.content_type === 'movie'
          
          if (state.options.syncWatchlist) {
            if (isMovie) wlMovies.push({ ids })
            else wlShows.push({ ids })
          }
          if (state.options.syncCollection) {
            if (isMovie) colMovies.push({ ids })
            else colShows.push({ ids })
          }
        }

        if (wlMovies.length || wlShows.length) {
          logLine('Pushing watchlist items to Trakt...')
          await traktRequest('/sync/watchlist', {}, {
            method: 'POST',
            body: JSON.stringify({ movies: wlMovies, shows: wlShows })
          })
          logLine(`Pushed ${wlMovies.length} movies and ${wlShows.length} shows to watchlist.`);
        }

        if (colMovies.length || colShows.length) {
          logLine('Pushing collection items to Trakt...')
          await traktRequest('/sync/collection', {}, {
            method: 'POST',
            body: JSON.stringify({ movies: colMovies, shows: colShows })
          })
          logLine(`Pushed ${colMovies.length} movies and ${colShows.length} shows to collection.`);
        }
      }
    }

    logLine('Verification checks running...')
    logLine('Sync process completed successfully.')
    currentView.value = 'result'
    showToast(t.value.successToast)
  } catch (error: any) {
    uiState.globalError = error.message
    logLine(`Sync Failed: ${error.message}`)
    currentView.value = 'form'
  } finally {
    uiState.isSubmitting = false
  }
}

// --- Preview Execution ---
async function runPreview() {
  uiState.isSubmitting = true
  uiState.globalError = null
  clearLog()
  uiState.previewRows = []
  uiState.previewPage = 1
  logLine('Starting preview pull...')

  try {
    await buildSyncPlan(true)
    logLine('Preview plan assembled. Visual preview loaded below.')
    showToast(t.value.successToast)
  } catch (error: any) {
    uiState.globalError = error.message
    logLine(`Preview Failed: ${error.message}`)
  } finally {
    uiState.isSubmitting = false
  }
}

function startOver() {
  uiState.globalError = null
  clearLog()
  uiState.previewRows = []
  uiState.previewPage = 1
  uiState.stats = { watched: 0, progress: 0, library: 0, skipped: 0 }
  currentView.value = 'form'
}

// --- Helpers ---
function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size))
  }
  return result
}

function stripDisplayFields(item: any) {
  return Object.fromEntries(Object.entries(item).filter(([k]) => !k.startsWith('_')))
}

function cleanNuvioLibraryItem(item: any) {
  const cleaned: any = {
    content_id: item.content_id,
    content_type: item.content_type,
    name: item.name,
    added_at: Number(item.added_at || Date.now()),
  }

  if (item.poster) {
    cleaned.poster = item.poster
    cleaned.poster_shape = item.poster_shape || 'POSTER'
  }
  if (item.background) {
    cleaned.background = item.background
  }
  if (item.description) {
    cleaned.description = item.description
  }
  if (item.release_info) {
    cleaned.release_info = item.release_info
  }
  if (item.imdb_rating !== undefined && item.imdb_rating !== null) {
    cleaned.imdb_rating = item.imdb_rating
  }
  if (Array.isArray(item.genres)) {
    cleaned.genres = item.genres
  }
  if (item.addon_base_url && item.addon_base_url !== 'https://trakt.tv') {
    cleaned.addon_base_url = item.addon_base_url
  }

  return cleaned
}

// --- Preview Paging ---
const paginatedPreviewRows = computed(() => {
  const start = (uiState.previewPage - 1) * uiState.previewPageSize
  return uiState.previewRows.slice(start, start + uiState.previewPageSize)
})

const maxPreviewPages = computed(() => {
  return Math.max(1, Math.ceil(uiState.previewRows.length / uiState.previewPageSize))
})

function formatEpochMs(val: number) {
  return val ? new Date(val).toLocaleString() : ''
}
</script>

<template>
  <div class="nuvio-quickstart-wrapper">
    <!-- TIP Block -->
    <div v-if="!hideTip" class="custom-block tip toggler-tip">
      <p class="custom-block-title">INFO</p>
      <p>
        <span v-if="(lang || '').startsWith('nl')">
          Gebruik de <strong>Nuvio Trakt Bridge</strong> hieronder om je kijkgeschiedenis, actieve kijkvoortgang en bibliotheek te synchroniseren tussen Trakt en Nuvio Sync.
        </span>
        <span v-else>
          Use the <strong>Nuvio Trakt Bridge</strong> below to synchronize your watch history, active playback progress, and library between Trakt and Nuvio Sync.
        </span>
      </p>
    </div>

    <!-- Main Bridge Tool Accordion Card -->
    <div class="nuvio-quickstart border-base" :class="{ 'is-expanded': !isCollapsed, 'is-standalone': hideHeader }">
      <!-- HEADER -->
      <div v-if="!hideHeader" class="qs-header clickable-header" @click="isCollapsed = !isCollapsed" role="button" :aria-expanded="!isCollapsed" tabindex="0" @keydown.enter.prevent="isCollapsed = !isCollapsed" @keydown.space.prevent="isCollapsed = !isCollapsed">
        <div class="qs-brand">
          <div class="brand-icons">
            <img :src="withBase('/tools_icon_coloured.webp')" class="logo-mark tools-logo" alt="" aria-hidden="true" />
            <svg viewBox="0 0 24 24" class="logo-mark trakt-logo" aria-hidden="true">
              <path d="m15.082 15.107-.73-.73 9.578-9.583a4.499 4.499 0 0 0-.115-.575L13.662 14.382l1.08 1.08-.73.73-1.81-1.81L23.422 3.144c-.075-.15-.155-.3-.25-.44L11.508 14.377l2.154 2.155-.73.73-7.193-7.199.73-.73 4.309 4.31L22.546 1.86A5.618 5.618 0 0 0 18.362 0H5.635A5.637 5.637 0 0 0 0 5.634V18.37A5.632 5.632 0 0 0 5.635 24h12.732C21.477 24 24 21.48 24 18.37V6.19l-8.913 8.918zm-4.314-2.155L6.814 8.988l.73-.73 3.954 3.96zm1.075-1.084-3.954-3.96.73-.73 3.959 3.96zm9.853 5.688a4.141 4.141 0 0 1-4.14 4.14H6.438a4.144 4.144 0 0 1-4.139-4.14V6.438A4.141 4.141 0 0 1 6.44 2.3h10.387v1.04H6.438c-1.71 0-3.099 1.39-3.099 3.1V17.55c0 1.71 1.39 3.105 3.1 3.105h11.117c1.71 0 3.1-1.395 3.1-3.105v-1.754h1.04v1.754z"/>
            </svg>
          </div>
          <span class="qs-brand-text">{{ t.title }}</span>
        </div>
        <div class="qs-meta-actions">
          <span v-if="!isCollapsed" class="secure-note">
            <svg viewBox="0 0 20 20" aria-hidden="true" class="icon-secure">
              <path d="M5 8V6a5 5 0 0 1 10 0v2"></path>
              <rect x="3" y="8" width="14" height="10" rx="3"></rect>
            </svg>
            <span class="secure-note-text">{{ t.keysSecureNote }}</span>
          </span>
          <svg viewBox="0 0 20 20" aria-hidden="true" class="summary-arrow" :class="{ rotated: !isCollapsed }">
            <path d="m6 8 4 4 4-4"></path>
          </svg>
        </div>
      </div>

      <!-- BODY -->
      <div v-show="!isCollapsed" class="qs-body">

        <!-- ERROR PANEL -->
        <div v-if="uiState.globalError" class="error-panel" role="alert">
          <div class="error-icon">!</div>
          <div class="error-content">
            <strong class="error-title">Setup stopped</strong>
            <p class="error-desc">{{ uiState.globalError }}</p>
          </div>
        </div>

        <!-- FORM VIEW -->
        <div v-if="currentView === 'form'" class="bridge-form">
          <!-- Account Grid -->
          <div class="connect-grid">
            <!-- Trakt Connection Card -->
            <div class="connect-card" :class="{ 'is-connected': state.trakt.token }">
              <h3>Connect Trakt</h3>
              <p v-if="!state.trakt.token">Use Trakt OAuth to authorize access in a secure popup.</p>
              <p v-else class="status-success-txt">
                <svg viewBox="0 0 20 20" fill="currentColor" class="inline-check"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>
                {{ t.traktStatusConnected }}
              </p>
              
              <button 
                class="btn-primary" 
                :class="{ 'btn-secondary': state.trakt.token }"
                type="button" 
                @click="state.trakt.token ? disconnectTrakt() : connectTrakt()"
                :disabled="uiState.isTraktConnecting"
              >
                {{ state.trakt.token ? t.disconnectTrakt : t.connectTrakt }}
              </button>
            </div>

            <!-- Nuvio Connection Card -->
            <div class="connect-card" :class="{ 'is-connected': state.nuvio.session }">
              <h3>Connect Nuvio</h3>
              
              <div v-if="!state.nuvio.session" class="nuvio-fields">
                <div class="form-field">
                  <label class="field-label">{{ t.emailLabel }}</label>
                  <input v-model="nuvioForm.email" type="email" :placeholder="t.emailPlaceholder" class="simple-input" />
                </div>
                <div class="form-field">
                  <label class="field-label">{{ t.passwordLabel }}</label>
                  <input v-model="nuvioForm.password" type="password" :placeholder="t.passwordPlaceholder" class="simple-input" />
                </div>
                <button class="btn-primary" type="button" @click="signInNuvio" :disabled="uiState.isSubmitting">
                  {{ t.connectNuvio }}
                </button>
              </div>

              <div v-else class="nuvio-fields">
                <p class="status-success-txt">
                  <svg viewBox="0 0 20 20" fill="currentColor" class="inline-check"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>
                  {{ t.nuvioStatusConnected }}
                </p>
                <div class="form-field">
                  <label class="field-label">{{ t.profileLabel }}</label>
                  <select v-model="state.nuvio.profileId" class="simple-select">
                    <option v-for="p in state.nuvio.profiles" :key="p.profile_index || p.id" :value="Number(p.profile_index || p.id || 1)">
                      {{ p.name || `Profile ${p.profile_index || p.id || 1}` }}
                    </option>
                  </select>
                </div>
                <button class="btn-secondary btn-full" type="button" @click="disconnectNuvio">
                  {{ t.disconnectNuvio }}
                </button>
              </div>
            </div>
          </div>

          <div class="divider"></div>

          <!-- Configuration options -->
          <div class="sync-config">
            <h3>Sync settings</h3>

            <!-- Direction -->
            <div class="form-field">
              <label class="field-label">{{ t.syncDirectionLabel }}</label>
              <div class="direction-selector">
                <div 
                  class="direction-option" 
                  :class="{ active: state.options.syncDirection === 'import' }"
                  @click="state.options.syncDirection = 'import'"
                >
                  <div class="direction-icons">
                    <svg viewBox="0 0 24 24" class="logo-icon trakt-color" fill="currentColor"><path d="m15.082 15.107-.73-.73 9.578-9.583a4.499 4.499 0 0 0-.115-.575L13.662 14.382l1.08 1.08-.73.73-1.81-1.81L23.422 3.144c-.075-.15-.155-.3-.25-.44L11.508 14.377l2.154 2.155-.73.73-7.193-7.199.73-.73 4.309 4.31L22.546 1.86A5.618 5.618 0 0 0 18.362 0H5.635A5.637 5.637 0 0 0 0 5.634V18.37A5.632 5.632 0 0 0 5.635 24h12.732C21.477 24 24 21.48 24 18.37V6.19l-8.913 8.918zm-4.314-2.155L6.814 8.988l.73-.73 3.954 3.96zm1.075-1.084-3.954-3.96.73-.73 3.959 3.96zm9.853 5.688a4.141 4.141 0 0 1-4.14 4.14H6.438a4.144 4.144 0 0 1-4.139-4.14V6.438A4.141 4.141 0 0 1 6.44 2.3h10.387v1.04H6.438c-1.71 0-3.099 1.39-3.099 3.1V17.55c0 1.71 1.39 3.105 3.1 3.105h11.117c1.71 0 3.1-1.395 3.1-3.105v-1.754h1.04v1.754z"/></svg>
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" class="arrow-icon"><path d="M4 10h12M12 6l4 4-4 4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    <img :src="withBase('/logo.png')" class="logo-icon" alt="Nuvio" />
                  </div>
                  <strong>{{ t.importDirection }}</strong>
                </div>
                
                <div 
                  class="direction-option" 
                  :class="{ active: state.options.syncDirection === 'export' }"
                  @click="state.options.syncDirection = 'export'"
                >
                  <div class="direction-icons">
                    <img :src="withBase('/logo.png')" class="logo-icon" alt="Nuvio" />
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" class="arrow-icon"><path d="M4 10h12M12 6l4 4-4 4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    <svg viewBox="0 0 24 24" class="logo-icon trakt-color" fill="currentColor"><path d="m15.082 15.107-.73-.73 9.578-9.583a4.499 4.499 0 0 0-.115-.575L13.662 14.382l1.08 1.08-.73.73-1.81-1.81L23.422 3.144c-.075-.15-.155-.3-.25-.44L11.508 14.377l2.154 2.155-.73.73-7.193-7.199.73-.73 4.309 4.31L22.546 1.86A5.618 5.618 0 0 0 18.362 0H5.635A5.637 5.637 0 0 0 0 5.634V18.37A5.632 5.632 0 0 0 5.635 24h12.732C21.477 24 24 21.48 24 18.37V6.19l-8.913 8.918zm-4.314-2.155L6.814 8.988l.73-.73 3.954 3.96zm1.075-1.084-3.954-3.96.73-.73 3.959 3.96zm9.853 5.688a4.141 4.141 0 0 1-4.14 4.14H6.438a4.144 4.144 0 0 1-4.139-4.14V6.438A4.141 4.141 0 0 1 6.44 2.3h10.387v1.04H6.438c-1.71 0-3.099 1.39-3.099 3.1V17.55c0 1.71 1.39 3.105 3.1 3.105h11.117c1.71 0 3.1-1.395 3.1-3.105v-1.754h1.04v1.754z"/></svg>
                  </div>
                  <strong>{{ t.exportDirection }}</strong>
                </div>
              </div>
            </div>

            <!-- Scopes -->
            <div class="scopes-section">
              <span class="field-label">{{ t.syncScopesTitle }} <small>({{ t.syncScopesSubtitle }})</small></span>
              <div class="scope-checkboxes">
                <label class="checkbox-wrapper">
                  <input type="checkbox" v-model="state.options.syncHistory" />
                  <span class="checkbox-copy">
                    <strong>{{ t.syncHistoryLabel }}</strong>
                    <small>{{ t.syncHistorySub }}</small>
                  </span>
                </label>
                <label class="checkbox-wrapper">
                  <input type="checkbox" v-model="state.options.syncProgress" />
                  <span class="checkbox-copy">
                    <strong>{{ t.syncProgressLabel }}</strong>
                    <small>{{ t.syncProgressSub }}</small>
                  </span>
                </label>
                <label class="checkbox-wrapper">
                  <input type="checkbox" v-model="state.options.syncWatchlist" />
                  <span class="checkbox-copy">
                    <strong>{{ t.syncWatchlistLabel }}</strong>
                    <small>{{ t.syncWatchlistSub }}</small>
                  </span>
                </label>
                <label class="checkbox-wrapper">
                  <input type="checkbox" v-model="state.options.syncCollection" />
                  <span class="checkbox-copy">
                    <strong>{{ t.syncCollectionLabel }}</strong>
                    <small>{{ t.syncCollectionSub }}</small>
                  </span>
                </label>
              </div>
            </div>
          </div>

          <!-- Action buttons -->
          <div class="action-strip">
            <button 
              class="btn-secondary" 
              type="button" 
              @click="runPreview" 
              :disabled="uiState.isSubmitting || !state.trakt.token || !state.nuvio.session"
            >
              {{ t.previewBtn }}
            </button>
            <button 
              class="btn-primary" 
              type="button" 
              @click="executeSync" 
              :disabled="uiState.isSubmitting || !state.trakt.token || !state.nuvio.session"
            >
              {{ state.options.syncDirection === 'import' ? t.syncBtn : t.syncBtnExport }}
            </button>
          </div>

          <!-- Preview Area -->
          <div v-if="uiState.previewRows.length > 0" class="preview-area">
            <!-- Stats -->
            <div class="metrics-bar">
              <div class="metric-item"><span>{{ t.statWatched }}</span><strong>{{ uiState.stats.watched }}</strong></div>
              <div class="metric-item"><span>{{ t.statProgress }}</span><strong>{{ uiState.stats.progress }}</strong></div>
              <div class="metric-item"><span>{{ t.statLibrary }}</span><strong>{{ uiState.stats.library }}</strong></div>
              <div class="metric-item"><span>{{ t.statSkipped }}</span><strong>{{ uiState.stats.skipped }}</strong></div>
            </div>

            <!-- Preview Table -->
            <div class="preview-table-section">
              <div class="table-header-row">
                <h4>{{ t.previewTableTitle }}</h4>
                <div class="table-pager">
                  <button :disabled="uiState.previewPage <= 1" @click="uiState.previewPage--" class="pager-btn">{{ t.prevPage }}</button>
                  <span>{{ t.pageInfo.replace('{page}', String(uiState.previewPage)).replace('{pages}', String(maxPreviewPages)).replace('{total}', String(uiState.previewRows.length)) }}</span>
                  <button :disabled="uiState.previewPage >= maxPreviewPages" @click="uiState.previewPage++" class="pager-btn">{{ t.nextPage }}</button>
                </div>
              </div>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{{ t.typeCol }}</th>
                      <th>{{ t.titleCol }}</th>
                      <th>{{ t.idCol }}</th>
                      <th>{{ t.whenCol }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, idx) in paginatedPreviewRows" :key="idx">
                      <td><span class="row-badge">{{ row.type }}</span></td>
                      <td>{{ row.title }}</td>
                      <td><code>{{ row.id }}</code></td>
                      <td>{{ formatEpochMs(row.when) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- PROGRESS VIEW -->
        <div v-else-if="currentView === 'progress'" class="progress-panel" aria-live="polite">
          <div class="progress-heading">
            <div class="spinner"></div>
            <div>
              <strong>Syncing files and accounts</strong>
              <small>{{ t.statusPulling }}</small>
            </div>
          </div>
          <div class="log-panel">
            <div class="log-panel-header">
              <span>{{ t.pullLogsTitle }}</span>
              <button class="text-btn" type="button" @click="copyLog">{{ t.copyLogBtn }}</button>
            </div>
            <pre class="log-box">{{ uiState.logText }}</pre>
          </div>
        </div>

        <!-- SUCCESS VIEW -->
        <div v-else-if="currentView === 'result'" class="result-panel" aria-live="polite">
          <div class="success-mark">
            <svg viewBox="0 0 32 32" aria-hidden="true"><path d="m8 16 5 5 11-11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>
          </div>
          <h2>{{ t.statusComplete }}</h2>
          <div class="metrics-bar">
            <div class="metric-item"><span>{{ t.statWatched }}</span><strong>{{ uiState.stats.watched }}</strong></div>
            <div class="metric-item"><span>{{ t.statProgress }}</span><strong>{{ uiState.stats.progress }}</strong></div>
            <div class="metric-item"><span>{{ t.statLibrary }}</span><strong>{{ uiState.stats.library }}</strong></div>
            <div class="metric-item"><span>{{ t.statSkipped }}</span><strong>{{ uiState.stats.skipped }}</strong></div>
          </div>
          
          <div class="log-panel">
            <div class="log-panel-header">
              <span>{{ t.pullLogsTitle }}</span>
              <button class="text-btn" type="button" @click="copyLog">{{ t.copyLogBtn }}</button>
            </div>
            <pre class="log-box">{{ uiState.logText }}</pre>
          </div>

          <button class="btn-primary" type="button" @click="startOver">{{ t.startOver }}</button>
        </div>

      </div>
    </div>

    <!-- Toast alerts -->
    <Transition name="fade">
      <div v-if="uiState.toastMessage" class="toast-popup" role="status">
        {{ uiState.toastMessage }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.nuvio-quickstart-wrapper {
  margin: 28px 0;
}

.toggler-tip {
  margin-bottom: 16px !important;
}

.nuvio-quickstart {
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  background: var(--vp-c-bg-soft);
  padding: 16px 24px;
  margin: 16px 0 28px 0;
  color: var(--vp-c-text-1);
  transition: padding 0.2s ease;
}

.nuvio-quickstart.is-expanded {
  padding: 24px;
}

.nuvio-quickstart.is-standalone {
  border: none;
  background: transparent;
  padding: 0;
  margin: 0;
  box-shadow: none;
}

.qs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid transparent;
  padding-bottom: 0;
  margin-bottom: 0;
  cursor: pointer;
  user-select: none;
  transition: border-color 0.2s, padding-bottom 0.2s, margin-bottom 0.2s;
}

.nuvio-quickstart.is-expanded .qs-header {
  border-bottom-color: var(--vp-c-divider);
  padding-bottom: 16px;
  margin-bottom: 24px;
}

.qs-brand {
  display: inline-flex;
  gap: 12px;
  align-items: center;
  color: var(--vp-c-text-1);
}

.brand-icons {
  display: flex;
  align-items: center;
  position: relative;
  width: 44px;
  height: 32px;
}

.brand-icons .logo-mark {
  width: 28px;
  height: 28px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  padding: 3px;
  position: absolute;
  top: 2px;
}

.brand-icons .tools-logo {
  background: var(--vp-c-bg-alt);
  left: 0;
  z-index: 2;
  object-fit: contain;
}

.brand-icons .trakt-logo {
  background: #ed1c24;
  color: #ffffff;
  left: 16px;
  z-index: 1;
}

.qs-brand-text {
  font-family: var(--vp-font-family-mono);
  font-size: 14px;
  font-weight: 700;
}

.qs-meta-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--vp-c-text-2);
}

.secure-note {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  color: var(--vp-c-text-2);
  font-size: 12px;
}

.icon-secure {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: #10b981;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.summary-arrow {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: var(--vp-c-text-2);
  stroke-width: 2;
  transition: transform 0.2s;
}

.summary-arrow.rotated {
  transform: rotate(180deg);
}

.qs-body {
  display: flex;
  flex-direction: column;
}

/* Connect Cards */
.connect-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 24px;
}

.connect-card {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-alt);
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
}

.connect-card.is-connected {
  border-color: var(--vp-c-brand-1);
}

.connect-card h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.connect-card p {
  margin: 0;
  font-size: 12px;
  color: var(--vp-c-text-2);
  line-height: 1.4;
  flex-grow: 1;
}

.status-success-txt {
  color: #10b981 !important;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.inline-check {
  width: 16px;
  height: 16px;
}

.nuvio-fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.field-label small {
  font-weight: normal;
  color: var(--vp-c-text-3);
}

.simple-input, .simple-select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-alt);
  color: var(--vp-c-text-1);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}

.simple-input:focus, .simple-select:focus {
  border-color: var(--vp-c-brand-1);
}

.btn-primary, .btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  padding: 10px 16px;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
}

.btn-primary {
  background: var(--vp-c-brand-1);
  color: #ffffff;
  border: 1px solid var(--vp-c-brand-1);
}

.btn-secondary {
  background: transparent;
  color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-divider);
}

.btn-primary:hover, .btn-secondary:hover {
  opacity: 0.9;
}

.btn-primary:active, .btn-secondary:active {
  transform: scale(0.98);
}

.btn-primary:disabled, .btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-full {
  width: 100%;
}

.divider {
  height: 1px;
  background: var(--vp-c-divider);
  margin: 20px 0;
}

/* Config & Scopes */
.sync-config {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
}

.sync-config h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.scopes-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.scope-checkboxes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.checkbox-wrapper {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-alt);
  cursor: pointer;
  user-select: none;
}

.checkbox-wrapper input[type="checkbox"] {
  margin-top: 3px;
  cursor: pointer;
}

.checkbox-copy {
  display: flex;
  flex-direction: column;
}

.checkbox-copy strong {
  font-size: 13px;
  color: var(--vp-c-text-1);
}

.checkbox-copy small {
  font-size: 11px;
  color: var(--vp-c-text-2);
  line-height: 1.2;
}

.action-strip {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-bottom: 24px;
}

/* Metrics and Preview */
.metrics-bar {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.metric-item {
  background: var(--vp-c-bg-alt);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 12px;
  text-align: center;
}

.metric-item span {
  display: block;
  font-size: 11px;
  color: var(--vp-c-text-2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}

.metric-item strong {
  font-size: 20px;
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.preview-area {
  border-top: 1px solid var(--vp-c-divider);
  padding-top: 24px;
}

.preview-table-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.table-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.table-header-row h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.table-pager {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--vp-c-text-2);
}

.pager-btn {
  background: var(--vp-c-bg-alt);
  border: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-1);
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
}

.pager-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.table-wrap {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
  background: var(--vp-c-bg-alt);
  max-height: 380px;
  overflow-y: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  text-align: left;
}

th {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  font-weight: 600;
  padding: 10px 14px;
  border-bottom: 1px solid var(--vp-c-divider);
  position: sticky;
  top: 0;
  z-index: 10;
}

td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-1);
}

tr:last-child td {
  border-bottom: none;
}

.row-badge {
  display: inline-block;
  background: var(--vp-c-bg-mute);
  color: var(--vp-c-text-2);
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
}

/* Logging & Progress */
.progress-panel {
  padding: 24px 0;
}

.progress-heading {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 2px solid var(--vp-c-divider);
  border-top-color: var(--vp-c-brand-1);
  border-radius: 50%;
  animation: spin 850ms linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.progress-heading strong {
  display: block;
  font-size: 16px;
  color: var(--vp-c-text-1);
}

.progress-heading small {
  font-size: 12px;
  color: var(--vp-c-text-2);
}

.log-panel {
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-alt);
  overflow: hidden;
  margin-bottom: 24px;
}

.log-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--vp-c-bg-soft);
  padding: 8px 14px;
  border-bottom: 1px solid var(--vp-c-divider);
  font-size: 12px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.text-btn {
  background: none;
  border: none;
  color: var(--vp-c-brand-1);
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
}

.text-btn:hover {
  text-decoration: underline;
}

.log-box {
  margin: 0;
  padding: 12px 14px;
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  color: var(--vp-c-text-code);
  background: transparent;
  max-height: 250px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

/* Results view */
.result-panel {
  text-align: center;
  padding: 24px 0;
}

.success-mark {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: color-mix(in srgb, #10b981 12%, var(--vp-c-bg-soft));
  border: 1px solid #10b981;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  color: #10b981;
}

.success-mark svg {
  width: 26px;
  height: 26px;
}

.result-panel h2 {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 24px;
  color: var(--vp-c-text-1);
}

/* Error panel */
.error-panel {
  display: flex;
  align-items: center;
  background: color-mix(in srgb, #ef4444 8%, var(--vp-c-bg-soft));
  border: 1px solid #ef4444;
  border-radius: 8px;
  padding: 14px 16px;
  margin-bottom: 24px;
  gap: 14px;
}

.error-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #ef4444;
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  font-size: 14px;
  flex-shrink: 0;
}

.error-content {
  flex-grow: 1;
}

.error-title {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.error-desc {
  font-size: 11px;
  color: #fca5a5;
  margin: 2px 0 0 0;
  line-height: 1.4;
}

/* Toast popup */
.toast-popup {
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: var(--vp-c-bg-alt);
  border: 1px solid var(--vp-c-brand-1);
  color: var(--vp-c-text-1);
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  z-index: 1000;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.4);
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

/* Direction Selector styles */
.direction-selector {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  width: 100%;
}

.direction-option {
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-alt);
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  user-select: none;
  transition: border-color 0.2s, background-color 0.2s, transform 0.1s;
}

.direction-option:hover {
  border-color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
}

.direction-option.active {
  border-color: var(--vp-c-brand-1);
  background: color-mix(in srgb, var(--vp-c-brand-1) 8%, var(--vp-c-bg-alt));
}

.direction-option:active {
  transform: scale(0.98);
}

.direction-icons {
  display: flex;
  align-items: center;
  gap: 10px;
}

.direction-icons .logo-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.direction-icons .trakt-color {
  color: #ed1c24;
  fill: currentColor;
}

.direction-icons .nuvio-color {
  color: var(--vp-c-brand-1);
}

.direction-icons .arrow-icon {
  width: 14px;
  height: 14px;
  color: var(--vp-c-text-3);
}

.direction-option strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

/* Responsive styles */
@media (max-width: 768px) {
  .connect-grid, .scope-checkboxes, .direction-selector {
    grid-template-columns: 1fr;
  }
  
  .metrics-bar {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
