<script setup lang="ts">
import { computed, onActivated, onMounted, reactive, ref } from 'vue'
import {
  addonMergeKey,
  collectionMergeKey,
  deepMergeStaged,
  libraryMergeKey,
  mergeStagedRecords,
  pluginMergeKey
} from './profileTransferMerge'
import {
  ADDON_CATALOG,
  CONFIGURATION_PROFILE_DRAFT_STORAGE_KEY,
  CREDENTIAL_CATALOG,
  PROFILE_TRANSFER_STORAGE_KEY,
  configurationProfileFromTransferBackup,
  normalizeConfigurationProfile,
  serializeConfigurationProfile,
  type ConfigurationProfile
} from './configurationProfiles'

type TransferMode = 'export' | 'import'
type RestoreStrategy = 'merge' | 'replace'
type CategoryKey =
  | 'profile'
  | 'addons'
  | 'plugins'
  | 'library'
  | 'watchProgress'
  | 'watchHistory'
  | 'profileSettings'
  | 'homeCatalogSettings'
  | 'collections'

type ImportBehavior = 'update' | 'replace' | 'merge' | 'blob'

interface CategoryDefinition {
  key: CategoryKey
  label: string
  description: string
  behavior: ImportBehavior
}

interface NuvioProfile {
  profile_index: number
  name: string
  avatar_color_hex?: string | null
  uses_primary_addons?: boolean
  uses_primary_plugins?: boolean
  avatar_id?: string | null
  avatar_url?: string | null
  [key: string]: unknown
}

interface NuvioSession {
  access_token: string
  refresh_token?: string
  expires_at?: number
  expires_in?: number
  [key: string]: unknown
}

interface PlatformSettings {
  platform: string
  settings: Record<string, unknown>
}

interface ProfileBackup {
  format: 'nuvio-profile-export'
  version: 1
  apiVersion?: string
  exportedAt: string
  source: {
    profileIndex: number
    profileName: string
  }
  selectedCategories: CategoryKey[]
  platformNamespaces?: string[]
  warnings?: string[]
  data: Partial<Record<CategoryKey, unknown>>
}

interface ImportResult {
  key: CategoryKey
  label: string
  status: 'success' | 'error'
  detail: string
}

const NUVIO_BASE = 'https://api.nuvio.tv'
const NUVIO_KEY = 'sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN'
const MAX_IMPORT_FILE_SIZE = 50 * 1024 * 1024
const MAX_PAGE_ITERATIONS = 200

const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  {
    key: 'profile',
    label: 'Profile name, picture & sharing',
    description: 'Your profile name, color, picture, and choices for sharing Main profile add-ons or plugins. PINs are not included.',
    behavior: 'update'
  },
  {
    key: 'addons',
    label: 'Add-ons',
    description: 'The add-ons installed directly on this profile, including their order and on/off state.',
    behavior: 'replace'
  },
  {
    key: 'plugins',
    label: 'Plugins',
    description: 'The plugins installed directly on this profile, including their order and on/off state.',
    behavior: 'replace'
  },
  {
    key: 'library',
    label: 'Library',
    description: 'Movies and series saved to this profile.',
    behavior: 'replace'
  },
  {
    key: 'watchProgress',
    label: 'Continue watching',
    description: 'Where you stopped watching movies and episodes.',
    behavior: 'merge'
  },
  {
    key: 'watchHistory',
    label: 'Watch history',
    description: 'Movies and episodes marked as watched.',
    behavior: 'merge'
  },
  {
    key: 'profileSettings',
    label: 'App settings',
    description: 'Preferences saved by Nuvio apps on your desktop, phone, and TV.',
    behavior: 'blob'
  },
  {
    key: 'homeCatalogSettings',
    label: 'Home screen layout',
    description: 'Home rows, hidden catalogs, and layout choices saved for this profile.',
    behavior: 'blob'
  },
  {
    key: 'collections',
    label: 'Collections',
    description: 'Custom collections, folders, covers, and pinned groups.',
    behavior: 'replace'
  }
]

const IMPORT_ORDER: CategoryKey[] = [
  'addons',
  'plugins',
  'library',
  'watchProgress',
  'watchHistory',
  'profileSettings',
  'homeCatalogSettings',
  'collections',
  'profile'
]

const ARRAY_CATEGORIES = new Set<CategoryKey>([
  'addons',
  'plugins',
  'library',
  'watchProgress',
  'watchHistory',
  'profileSettings',
  'homeCatalogSettings',
  'collections'
])

const mode = ref<TransferMode>('export')
const authForm = reactive({ email: '', password: '' })
const session = ref<NuvioSession | null>(null)
const profiles = ref<NuvioProfile[]>([])
const exportProfileId = ref(1)
const importProfileId = ref<number | ''>('')
const authBusy = ref(false)
const authError = ref('')

const exportSelection = ref(new Set<CategoryKey>(CATEGORY_DEFINITIONS.map(({ key }) => key)))
const showExportChoices = ref(false)
const exportBusy = ref(false)
const exportStatus = ref('')
const exportError = ref('')
const exportWarnings = ref<string[]>([])
const exportProgress = reactive({ current: 0, total: 0 })

const fileInput = ref<HTMLInputElement | null>(null)
const importBackup = ref<ProfileBackup | null>(null)
const importFileName = ref('')
const lastCreatedBackup = ref<ProfileBackup | null>(null)
const lastCreatedBackupName = ref('')
const restoreStrategy = ref<RestoreStrategy>('merge')
const importSelection = ref(new Set<CategoryKey>())
const showImportChoices = ref(false)
const importReviewOpen = ref(false)
const importBusy = ref(false)
const importStatus = ref('')
const importError = ref('')
const importResults = ref<ImportResult[]>([])
const importProgress = reactive({ current: 0, total: 0 })
const receivedConfigurationProfile = ref<ConfigurationProfile | null>(null)
const configurationProfileError = ref('')

const isConnected = computed(() => Boolean(session.value?.access_token))
const exportProfile = computed(() => profiles.value.find(
  profile => Number(profile.profile_index) === Number(exportProfileId.value)
))
const importProfile = computed(() => profiles.value.find(
  profile => Number(profile.profile_index) === Number(importProfileId.value)
))
const importProfileLabel = computed(() => (
  importProfile.value ? profileOptionLabel(importProfile.value) : ''
))
const includedImportDefinitions = computed(() => CATEGORY_DEFINITIONS.filter(
  definition => importBackup.value
    && Object.prototype.hasOwnProperty.call(importBackup.value.data, definition.key)
))
const selectedImportDefinitions = computed(() => includedImportDefinitions.value.filter(
  definition => importSelection.value.has(definition.key)
))
const progressMayAffectHistory = computed(() => (
  importSelection.value.has('watchProgress') && !importSelection.value.has('watchHistory')
))
const replaceImportLabels = computed(() => restoreStrategy.value === 'replace'
  ? selectedImportDefinitions.value
    .filter(definition => definition.behavior === 'replace' || definition.behavior === 'blob')
    .map(definition => definition.label)
  : [])
const combineImportLabels = computed(() => selectedImportDefinitions.value
  .filter(definition => definition.behavior === 'merge' || (
    restoreStrategy.value === 'merge'
    && (definition.behavior === 'replace' || definition.behavior === 'blob')
  ))
  .map(definition => definition.label))
const updateImportLabels = computed(() => selectedImportDefinitions.value
  .filter(definition => definition.behavior === 'update')
  .map(definition => definition.label))
const emptyReplaceDefinitions = computed(() => selectedImportDefinitions.value.filter(definition => {
  const value = importBackup.value?.data[definition.key]
  return restoreStrategy.value === 'replace'
    && definition.behavior === 'replace'
    && Array.isArray(value)
    && value.length === 0
}))
const receivedAddonLabels = computed(() => (
  receivedConfigurationProfile.value?.addons.map(addon => catalogLabel(ADDON_CATALOG, addon.id)) ?? []
))
const receivedCredentialLabels = computed(() => (
  receivedConfigurationProfile.value?.credentials.map(id => catalogLabel(CREDENTIAL_CATALOG, id)) ?? []
))

function loadReceivedConfigurationProfile() {
  try {
    const serialized = window.sessionStorage.getItem(PROFILE_TRANSFER_STORAGE_KEY)
    if (!serialized) return
    receivedConfigurationProfile.value = normalizeConfigurationProfile(JSON.parse(serialized))
    configurationProfileError.value = ''
    window.sessionStorage.removeItem(PROFILE_TRANSFER_STORAGE_KEY)
  } catch {
    configurationProfileError.value = 'The shared setup plan could not be opened. No profile data was imported.'
  }
}

onMounted(loadReceivedConfigurationProfile)
onActivated(loadReceivedConfigurationProfile)

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function catalogLabel(catalog: unknown, id: string) {
  const entries = Array.isArray(catalog)
    ? catalog
    : Object.values(isRecord(catalog) ? catalog : {})
  const entry = entries.find(candidate => isRecord(candidate)
    && (candidate.id === id || candidate.serviceId === id))
  if (isRecord(entry)) {
    const label = entry.label ?? entry.name
    if (typeof label === 'string') return label
  }
  return id.replace(/-/g, ' ').replace(/\b\w/g, character => character.toUpperCase())
}

function targetDeviceLabel(target: string) {
  return target.replace(/-/g, ' ').replace(/\b\w/g, character => character.toUpperCase())
}

function storeConfigurationDraft(profile: ConfigurationProfile) {
  window.sessionStorage.setItem(
    CONFIGURATION_PROFILE_DRAFT_STORAGE_KEY,
    serializeConfigurationProfile(profile)
  )
}

function editReceivedConfigurationProfile() {
  if (!receivedConfigurationProfile.value) return
  storeConfigurationDraft(receivedConfigurationProfile.value)
  window.location.hash = 'configuration-profiles'
}

function createSafeShareDraft() {
  if (!lastCreatedBackup.value) return
  try {
    const draft = configurationProfileFromTransferBackup(lastCreatedBackup.value)
    storeConfigurationDraft(draft)
    window.location.hash = 'configuration-profiles'
  } catch (error) {
    exportError.value = `A safe setup draft could not be created. ${errorMessage(error)}`
  }
}

function behaviorLabel(behavior: ImportBehavior) {
  switch (behavior) {
    case 'replace': return restoreStrategy.value === 'merge' ? 'Adds and updates' : 'Replaces what is there'
    case 'merge': return 'Adds and updates'
    case 'blob': return restoreStrategy.value === 'merge' ? 'Merges staged settings' : 'Replaces staged settings'
    default: return 'Updates the profile'
  }
}

function categoryDefinition(key: CategoryKey) {
  return CATEGORY_DEFINITIONS.find(definition => definition.key === key)!
}

function categoryCount(key: CategoryKey, value: unknown) {
  if (key === 'profile') return '1 profile'
  if (!Array.isArray(value)) return 'Invalid section'
  if (key === 'profileSettings' || key === 'homeCatalogSettings') {
    return `${value.length} saved ${value.length === 1 ? 'setting' : 'settings'}`
  }
  return `${value.length} ${value.length === 1 ? 'item' : 'items'}`
}

function profileOptionLabel(profile: NuvioProfile) {
  const name = String(profile.name || `Profile ${profile.profile_index}`)
  if (Number(profile.profile_index) !== 1) return name
  return name.toLowerCase() === 'main' ? 'Main profile' : `${name} (Main profile)`
}

function resetImportReview() {
  importReviewOpen.value = false
}

function setRestoreStrategy(nextStrategy: RestoreStrategy) {
  if (restoreStrategy.value === nextStrategy) return
  restoreStrategy.value = nextStrategy
  importError.value = ''
  importStatus.value = ''
  importResults.value = []
  resetImportReview()
}

function openImportReview() {
  if (!isConnected.value) {
    importError.value = 'Sign in before importing.'
    return
  }
  if (!importProfile.value) {
    importError.value = 'Choose the profile you want to import into.'
    return
  }
  if (!importSelection.value.size) {
    importError.value = 'Choose at least one type of data to import.'
    return
  }
  importError.value = ''
  importReviewOpen.value = true
}

function toggleExportCategory(key: CategoryKey) {
  const next = new Set(exportSelection.value)
  next.has(key) ? next.delete(key) : next.add(key)
  exportSelection.value = next
}

function toggleImportCategory(key: CategoryKey) {
  const next = new Set(importSelection.value)
  next.has(key) ? next.delete(key) : next.add(key)
  importSelection.value = next
  resetImportReview()
}

function selectAllExport() {
  exportSelection.value = new Set(CATEGORY_DEFINITIONS.map(({ key }) => key))
}

function clearExportSelection() {
  exportSelection.value = new Set()
}

function selectAllImport() {
  importSelection.value = new Set(includedImportDefinitions.value.map(({ key }) => key))
  resetImportReview()
}

function clearImportSelection() {
  importSelection.value = new Set()
  resetImportReview()
}

function setMode(nextMode: TransferMode) {
  mode.value = nextMode
  exportError.value = ''
  importError.value = ''
}

async function requestJson(url: string, options: RequestInit = {}) {
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
    const detail = isRecord(data)
      ? data.error_description || data.msg || data.message || data.error || JSON.stringify(data)
      : data || response.statusText
    throw new Error(`${response.status} ${detail}`)
  }

  return data
}

async function ensureToken() {
  if (!session.value?.access_token) {
    throw new Error('Sign in to Nuvio first.')
  }

  const now = Math.floor(Date.now() / 1000)
  const expiresAt = Number(session.value.expires_at || 0)
  if (!expiresAt || now < expiresAt - 90) {
    return session.value.access_token
  }

  if (!session.value.refresh_token) {
    throw new Error('Your Nuvio session expired. Sign in again.')
  }

  const data = await requestJson(`${NUVIO_BASE}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      apikey: NUVIO_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ refresh_token: session.value.refresh_token })
  })

  session.value = normalizeSession(data)
  return session.value.access_token
}

function normalizeSession(data: any): NuvioSession {
  const now = Math.floor(Date.now() / 1000)
  return {
    ...data,
    expires_at: Number(data?.expires_at || (data?.expires_in ? now + Number(data.expires_in) : 0))
  }
}

async function nuvioRpc(name: string, body: Record<string, unknown> = {}) {
  const token = await ensureToken()
  return requestJson(`${NUVIO_BASE}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: NUVIO_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
}

async function nuvioRest(path: string, params: Record<string, string | number>) {
  const token = await ensureToken()
  const url = new URL(`${NUVIO_BASE}/rest/v1/${path}`)
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)))

  return requestJson(url.toString(), {
    headers: {
      apikey: NUVIO_KEY,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  })
}

async function signIn() {
  if (!authForm.email.trim() || !authForm.password) {
    authError.value = 'Enter your Nuvio email and password.'
    return
  }

  authBusy.value = true
  authError.value = ''

  try {
    const data = await requestJson(`${NUVIO_BASE}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: NUVIO_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: authForm.email.trim(),
        password: authForm.password
      })
    })

    if (!data?.access_token) {
      throw new Error('Nuvio did not return an access token.')
    }

    session.value = normalizeSession(data)
    await loadProfiles()
    authForm.password = ''
  } catch (error) {
    session.value = null
    profiles.value = []
    authError.value = errorMessage(error)
  } finally {
    authBusy.value = false
  }
}

async function loadProfiles() {
  const data = await nuvioRpc('sync_pull_profiles')
  profiles.value = Array.isArray(data)
    ? data.slice().sort((a, b) => Number(a.profile_index) - Number(b.profile_index))
    : []

  if (!profiles.value.length) {
    throw new Error('No Nuvio profiles were found for this account.')
  }

  if (!profiles.value.some(profile => Number(profile.profile_index) === Number(exportProfileId.value))) {
    exportProfileId.value = Number(profiles.value[0].profile_index)
  }
  if (importProfileId.value !== ''
    && !profiles.value.some(profile => Number(profile.profile_index) === Number(importProfileId.value))) {
    importProfileId.value = ''
  }
}

function disconnect() {
  session.value = null
  profiles.value = []
  authForm.email = ''
  authForm.password = ''
  authError.value = ''
  exportStatus.value = ''
  exportError.value = ''
  exportWarnings.value = []
  importStatus.value = ''
  importError.value = ''
  importResults.value = []
  importBackup.value = null
  importFileName.value = ''
  lastCreatedBackup.value = null
  lastCreatedBackupName.value = ''
  restoreStrategy.value = 'merge'
  importSelection.value = new Set()
  importProfileId.value = ''
  showImportChoices.value = false
  resetImportReview()
}

function addExportWarning(message: string) {
  if (!exportWarnings.value.includes(message)) {
    exportWarnings.value.push(message)
  }
}

function pickFields(source: Record<string, any>, fields: string[]) {
  const result: Record<string, unknown> = {}
  fields.forEach(field => {
    if (Object.prototype.hasOwnProperty.call(source, field) && source[field] !== undefined) {
      result[field] = source[field]
    }
  })
  return result
}

function cleanProfile(profile: Record<string, any>, profileIndex = Number(profile.profile_index)) {
  return {
    profile_index: profileIndex,
    ...pickFields(profile, [
      'name',
      'avatar_color_hex',
      'uses_primary_addons',
      'uses_primary_plugins',
      'avatar_id',
      'avatar_url'
    ])
  }
}

function cleanAddon(item: Record<string, any>) {
  return pickFields(item, ['url', 'name', 'enabled', 'sort_order'])
}

function cleanPlugin(item: Record<string, any>) {
  return pickFields(item, ['url', 'name', 'enabled', 'sort_order', 'repo_type'])
}

function cleanLibraryItem(item: Record<string, any>) {
  return pickFields(item, [
    'content_id',
    'content_type',
    'name',
    'poster',
    'poster_shape',
    'background',
    'description',
    'release_info',
    'imdb_rating',
    'genres',
    'addon_base_url',
    'added_at'
  ])
}

function cleanProgressItem(item: Record<string, any>) {
  return pickFields(item, [
    'content_id',
    'content_type',
    'video_id',
    'season',
    'episode',
    'position',
    'duration',
    'last_watched'
  ])
}

function cleanHistoryItem(item: Record<string, any>) {
  return pickFields(item, [
    'content_id',
    'content_type',
    'title',
    'season',
    'episode',
    'watched_at'
  ])
}

async function pullLibrary(profileId: number, requireArray = false) {
  const items: Record<string, any>[] = []
  const limit = 500

  for (let page = 0; page < MAX_PAGE_ITERATIONS; page++) {
    const batch = await nuvioRpc('sync_pull_library', {
      p_profile_id: profileId,
      p_limit: limit,
      p_offset: page * limit
    })
    if (!Array.isArray(batch) && requireArray) {
      throw new Error('Nuvio returned an unexpected library response; nothing was merged.')
    }
    const rows = Array.isArray(batch) ? batch : []
    items.push(...rows)
    if (rows.length < limit) return items
  }

  throw new Error('Library export exceeded the 100,000-item safety limit.')
}

async function pullRestRows(path: 'addons' | 'plugins', profileId: number, requireArray = false) {
  const items: Record<string, any>[] = []
  const limit = 1000

  for (let page = 0; page < MAX_PAGE_ITERATIONS; page++) {
    const response = await nuvioRest(path, {
      select: '*',
      profile_id: `eq.${profileId}`,
      order: 'sort_order.asc',
      limit,
      offset: page * limit
    })
    if (!Array.isArray(response) && requireArray) {
      throw new Error(`Nuvio returned an unexpected ${path} response; nothing was merged.`)
    }
    const rows = Array.isArray(response) ? response : []
    items.push(...rows)
    if (rows.length < limit) return items
  }

  throw new Error(`${path === 'addons' ? 'Add-on' : 'Plugin'} export exceeded the 200,000-item safety limit.`)
}

async function pullWatchHistory(profileId: number) {
  const items: Record<string, any>[] = []
  const pageSize = 1000

  for (let page = 1; page <= MAX_PAGE_ITERATIONS; page++) {
    const batch = await nuvioRpc('sync_pull_watched_items', {
      p_profile_id: profileId,
      p_page: page,
      p_page_size: pageSize
    })
    const rows = Array.isArray(batch) ? batch : []
    items.push(...rows)
    if (rows.length < pageSize) return items
  }

  throw new Error('Watch history export exceeded the 200,000-item safety limit.')
}

async function discoverPlatformKeys(
  table: 'profile_settings_blobs' | 'home_catalog_settings',
  profileId: number,
  knownPlatforms: string[]
) {
  try {
    const response = await nuvioRest(table, {
      select: 'platform',
      profile_id: `eq.${profileId}`,
      order: 'platform.asc'
    })
    const discovered = (Array.isArray(response) ? response : [])
      .map(row => String(row?.platform || '').trim())
      .filter(Boolean)
    const sharedKey = knownPlatforms.includes('home_catalog_shared') ? 'home_catalog_shared' : null
    const basePlatforms = knownPlatforms.filter(platform => platform !== sharedKey)
    const extras = discovered
      .filter(platform => !knownPlatforms.includes(platform))
      .sort((left, right) => left.localeCompare(right))
    return Array.from(new Set([
      ...basePlatforms,
      ...extras,
      ...(sharedKey ? [sharedKey] : [])
    ]))
  } catch {
    addExportWarning('Nuvio could not list every saved app setting, so the standard TV, mobile, and desktop settings were checked instead.')
    return knownPlatforms
  }
}

async function pullPlatformSettings(
  rpcName: 'sync_pull_profile_settings_blob' | 'sync_pull_home_catalog_settings',
  profileId: number,
  platforms: string[]
) {
  const results: PlatformSettings[] = []

  for (const platform of platforms) {
    const response = await nuvioRpc(rpcName, {
      p_profile_id: profileId,
      p_platform: platform
    })
    const row = Array.isArray(response) ? response[0] : response
    if (isRecord(row) && isRecord(row.settings_json)) {
      results.push({ platform, settings: row.settings_json })
    }
  }

  return results
}

async function pullCurrentPlatformSettings(
  rpcName: 'sync_pull_profile_settings_blob' | 'sync_pull_home_catalog_settings',
  profileId: number,
  platform: string
) {
  const response = await nuvioRpc(rpcName, {
    p_profile_id: profileId,
    p_platform: platform
  })
  if (response == null || (Array.isArray(response) && response.length === 0)) return {}

  const row = Array.isArray(response) ? response[0] : response
  if (!isRecord(row)) {
    throw new Error(`Nuvio returned unexpected ${platform} settings; nothing was merged.`)
  }
  if (row.settings_json == null) return {}
  if (!isRecord(row.settings_json)) {
    throw new Error(`Nuvio returned unreadable ${platform} settings; nothing was merged.`)
  }
  return row.settings_json
}

function consolidatePlatformSettings(blobs: PlatformSettings[]) {
  const consolidated: PlatformSettings[] = []
  const indexes = new Map<string, number>()

  for (const blob of blobs) {
    const platform = blob.platform.trim()
    const existingIndex = indexes.get(platform)
    if (existingIndex === undefined) {
      indexes.set(platform, consolidated.length)
      consolidated.push({ platform, settings: deepMergeStaged({}, blob.settings) })
      continue
    }
    consolidated[existingIndex] = {
      platform,
      settings: deepMergeStaged(consolidated[existingIndex].settings, blob.settings)
    }
  }

  return consolidated
}

async function pullCollections(profileId: number, requireValid = false) {
  const response = await nuvioRpc('sync_pull_collections', { p_profile_id: profileId })
  const row = Array.isArray(response) ? response[0] : response
  if (isRecord(row) && Array.isArray(row.collections_json)) return row.collections_json
  if (requireValid) {
    throw new Error('Nuvio returned an unexpected collections response; nothing was merged.')
  }
  return []
}

async function exportCategory(key: CategoryKey, profile: NuvioProfile) {
  const profileId = Number(profile.profile_index)

  switch (key) {
    case 'profile':
      return cleanProfile(profile)
    case 'addons':
      return (await pullRestRows('addons', profileId)).map(cleanAddon)
    case 'plugins':
      return (await pullRestRows('plugins', profileId)).map(cleanPlugin)
    case 'library':
      return (await pullLibrary(profileId)).map(cleanLibraryItem)
    case 'watchProgress': {
      const rows = await nuvioRpc('sync_pull_watch_progress', {
        p_profile_id: profileId,
        p_since_last_watched: 0,
        p_limit: 100000
      })
      const progress = Array.isArray(rows) ? rows : []
      if (progress.length >= 100000) {
        throw new Error('Watch progress export reached the 100,000-item safety limit.')
      }
      return progress.map(cleanProgressItem)
    }
    case 'watchHistory':
      return (await pullWatchHistory(profileId)).map(cleanHistoryItem)
    case 'profileSettings': {
      const platforms = await discoverPlatformKeys(
        'profile_settings_blobs',
        profileId,
        ['tv', 'mobile', 'desktop']
      )
      return pullPlatformSettings('sync_pull_profile_settings_blob', profileId, platforms)
    }
    case 'homeCatalogSettings': {
      const platforms = await discoverPlatformKeys(
        'home_catalog_settings',
        profileId,
        ['tv', 'mobile', 'home_catalog_shared']
      )
      return pullPlatformSettings('sync_pull_home_catalog_settings', profileId, platforms)
    }
    case 'collections': {
      return pullCollections(profileId)
    }
  }
}

function safeFilename(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'profile'
}

async function runExport() {
  const profile = exportProfile.value
  if (!profile) {
    exportError.value = 'Select a Nuvio profile.'
    return
  }
  if (!exportSelection.value.size) {
    exportError.value = 'Choose at least one type of data to include.'
    return
  }

  exportBusy.value = true
  exportError.value = ''
  exportStatus.value = ''
  exportWarnings.value = []
  exportProgress.current = 0
  exportProgress.total = 0

  try {
    const selectedCategories = CATEGORY_DEFINITIONS
      .map(({ key }) => key)
      .filter(key => exportSelection.value.has(key))
    const data: Partial<Record<CategoryKey, unknown>> = {}
    exportProgress.total = selectedCategories.length

    if (profile.uses_primary_addons && exportSelection.value.has('addons')) {
      addExportWarning(
        'This profile uses add-ons from Main profile. Back up Main profile if you also want a copy of those shared add-ons.'
      )
    }
    if (profile.uses_primary_plugins && exportSelection.value.has('plugins')) {
      addExportWarning(
        'This profile uses plugins from Main profile. Back up Main profile if you also want a copy of those shared plugins.'
      )
    }

    for (let index = 0; index < selectedCategories.length; index++) {
      const key = selectedCategories[index]
      exportProgress.current = index + 1
      exportStatus.value = `Saving ${index + 1} of ${selectedCategories.length}: ${categoryDefinition(key).label}…`
      data[key] = await exportCategory(key, profile)
    }

    const platforms = Array.from(new Set(
      [data.profileSettings, data.homeCatalogSettings]
        .flatMap(value => Array.isArray(value) ? value : [])
        .map(entry => isRecord(entry) ? String(entry.platform || '') : '')
        .filter(Boolean)
    ))

    const backup: ProfileBackup = {
      format: 'nuvio-profile-export',
      version: 1,
      apiVersion: '1.1',
      exportedAt: new Date().toISOString(),
      source: {
        profileIndex: Number(profile.profile_index),
        profileName: String(profile.name || `Profile ${profile.profile_index}`)
      },
      selectedCategories,
      ...(platforms.length ? { platformNamespaces: platforms } : {}),
      ...(exportWarnings.value.length ? { warnings: exportWarnings.value } : {}),
      data
    }

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const date = new Date().toISOString().slice(0, 10)
    const filename = `nuvio-${safeFilename(backup.source.profileName)}-${date}.json`
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    lastCreatedBackup.value = backup
    lastCreatedBackupName.value = filename

    exportStatus.value = `Export downloaded for ${backup.source.profileName}.`
  } catch (error) {
    exportStatus.value = ''
    exportError.value = `No file was downloaded. ${errorMessage(error)}`
  } finally {
    exportBusy.value = false
  }
}

function validateBackup(value: unknown): ProfileBackup {
  if (!isRecord(value) || value.format !== 'nuvio-profile-export') {
    throw new Error('This is not a Nuvio profile file.')
  }
  if (value.version !== 1) {
    throw new Error('This file was created by a newer version of the tool and cannot be opened yet.')
  }
  if (!isRecord(value.source)
    || !Number.isInteger(Number(value.source.profileIndex))
    || typeof value.source.profileName !== 'string') {
    throw new Error('The file has incomplete profile information.')
  }
  if (!isRecord(value.data)) {
    throw new Error('The data in this file could not be read.')
  }

  const data: Partial<Record<CategoryKey, unknown>> = {}
  for (const { key } of CATEGORY_DEFINITIONS) {
    if (!Object.prototype.hasOwnProperty.call(value.data, key)) continue
    const section = value.data[key]
    if (key === 'profile' && !isRecord(section)) {
      throw new Error('The saved profile information could not be read.')
    }
    if (ARRAY_CATEGORIES.has(key) && !Array.isArray(section)) {
      throw new Error(`${categoryDefinition(key).label} could not be read from this file.`)
    }
    if (ARRAY_CATEGORIES.has(key)
      && Array.isArray(section)
      && section.some(entry => !isRecord(entry))) {
      throw new Error(`${categoryDefinition(key).label} contains an item that could not be read.`)
    }
    if ((key === 'profileSettings' || key === 'homeCatalogSettings') && Array.isArray(section)) {
      const invalidPlatform = section.some(entry => (
        !isRecord(entry)
        || typeof entry.platform !== 'string'
        || !isRecord(entry.settings)
      ))
      if (invalidPlatform) {
        throw new Error(`${categoryDefinition(key).label} contains saved settings that could not be read.`)
      }
    }
    data[key] = section
  }

  const selectedCategories = CATEGORY_DEFINITIONS
    .map(({ key }) => key)
    .filter(key => Object.prototype.hasOwnProperty.call(data, key))
  if (!selectedCategories.length) {
    throw new Error('This file does not contain any data this tool can import.')
  }

  return {
    format: 'nuvio-profile-export',
    version: 1,
    apiVersion: typeof value.apiVersion === 'string' ? value.apiVersion : undefined,
    exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : '',
    source: {
      profileIndex: Number(value.source.profileIndex),
      profileName: value.source.profileName
    },
    selectedCategories,
    platformNamespaces: Array.isArray(value.platformNamespaces)
      ? value.platformNamespaces.filter((entry: unknown): entry is string => typeof entry === 'string')
      : undefined,
    warnings: Array.isArray(value.warnings)
      ? value.warnings.filter((entry: unknown): entry is string => typeof entry === 'string')
      : undefined,
    data
  }
}

async function loadImportFile(file?: File) {
  if (!file) return

  importError.value = ''
  importResults.value = []
  importStatus.value = ''
  importProfileId.value = ''
  showImportChoices.value = false
  resetImportReview()

  if (file.size > MAX_IMPORT_FILE_SIZE) {
    importBackup.value = null
    importSelection.value = new Set()
    importError.value = 'The selected file is larger than the 50 MB safety limit.'
    return
  }

  try {
    const parsed = JSON.parse(await file.text())
    const backup = validateBackup(parsed)
    setLoadedBackup(backup, file.name)
  } catch (error) {
    importBackup.value = null
    importFileName.value = ''
    importSelection.value = new Set()
    importError.value = error instanceof SyntaxError
      ? 'This file is damaged or is not a Nuvio profile file.'
      : errorMessage(error)
  } finally {
    if (fileInput.value) fileInput.value.value = ''
  }
}

function setLoadedBackup(backup: ProfileBackup, filename: string) {
  importBackup.value = backup
  importFileName.value = filename
  restoreStrategy.value = 'merge'
  importSelection.value = new Set(backup.selectedCategories)
  importProfileId.value = ''
  importError.value = ''
  importResults.value = []
  importStatus.value = ''
  showImportChoices.value = false
  resetImportReview()
}

function useLastCreatedBackup() {
  if (!lastCreatedBackup.value) return
  setLoadedBackup(lastCreatedBackup.value, lastCreatedBackupName.value)
}

function handleFileInput(event: Event) {
  const input = event.target as HTMLInputElement
  void loadImportFile(input.files?.[0])
}

function handleDrop(event: DragEvent) {
  void loadImportFile(event.dataTransfer?.files?.[0])
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

async function importCategory(
  key: CategoryKey,
  value: unknown,
  destinationProfileId: number,
  strategy: RestoreStrategy
) {
  switch (key) {
    case 'profile': {
      if (!isRecord(value)) throw new Error('Invalid profile details.')
      const currentProfiles = await nuvioRpc('sync_pull_profiles')
      if (!Array.isArray(currentProfiles)) throw new Error('Could not load the current profile list.')
      const replacement = currentProfiles.map(profile => (
        Number(profile.profile_index) === destinationProfileId
          ? cleanProfile({ ...profile, ...value }, destinationProfileId)
          : cleanProfile(profile)
      ))
      if (!replacement.some(profile => Number(profile.profile_index) === destinationProfileId)) {
        throw new Error('The destination profile no longer exists.')
      }
      await nuvioRpc('sync_push_profiles', {
        p_client_max_profiles: 6,
        p_profiles: replacement
      })
      return 'Profile name, picture, and sharing choices imported.'
    }
    case 'addons': {
      const stagedItems = (value as Record<string, any>[]).map(cleanAddon)
      if (strategy === 'merge' && !stagedItems.length) {
        return 'No staged add-ons; existing add-ons were kept unchanged.'
      }
      const items = strategy === 'merge'
        ? mergeStagedRecords(
          (await pullRestRows('addons', destinationProfileId, true)).map(cleanAddon),
          stagedItems,
          addonMergeKey
        ).map((item, index) => ({ ...cleanAddon(item), sort_order: index }))
        : stagedItems
      await nuvioRpc('sync_push_addons', { p_profile_id: destinationProfileId, p_addons: items })
      if (strategy === 'merge') {
        return `Merged ${stagedItems.length} staged ${stagedItems.length === 1 ? 'add-on' : 'add-ons'} and kept the rest.`
      }
      return items.length ? `Imported ${items.length} add-ons.` : 'Removed existing add-ons because this file had none.'
    }
    case 'plugins': {
      const stagedItems = (value as Record<string, any>[]).map(cleanPlugin)
      if (strategy === 'merge' && !stagedItems.length) {
        return 'No staged plugins; existing plugins were kept unchanged.'
      }
      const items = strategy === 'merge'
        ? mergeStagedRecords(
          (await pullRestRows('plugins', destinationProfileId, true)).map(cleanPlugin),
          stagedItems,
          pluginMergeKey
        ).map((item, index) => ({ ...cleanPlugin(item), sort_order: index }))
        : stagedItems
      await nuvioRpc('sync_push_plugins', { p_profile_id: destinationProfileId, p_plugins: items })
      if (strategy === 'merge') {
        return `Merged ${stagedItems.length} staged ${stagedItems.length === 1 ? 'plugin' : 'plugins'} and kept the rest.`
      }
      return items.length ? `Imported ${items.length} plugins.` : 'Removed existing plugins because this file had none.'
    }
    case 'library': {
      const stagedItems = (value as Record<string, any>[]).map(cleanLibraryItem)
      if (strategy === 'merge' && !stagedItems.length) {
        return 'No staged library items; the existing library was kept unchanged.'
      }
      const items = strategy === 'merge'
        ? mergeStagedRecords(
          (await pullLibrary(destinationProfileId, true)).map(cleanLibraryItem),
          stagedItems,
          libraryMergeKey
        )
        : stagedItems
      await nuvioRpc('sync_push_library', { p_profile_id: destinationProfileId, p_items: items })
      if (strategy === 'merge') {
        return `Merged ${stagedItems.length} staged library ${stagedItems.length === 1 ? 'item' : 'items'} and kept the rest.`
      }
      return items.length ? `Imported ${items.length} library items.` : 'Cleared the library because this file had no saved items.'
    }
    case 'watchProgress': {
      const entries = (value as Record<string, any>[]).map(cleanProgressItem)
      const chunks = chunkArray(entries, 300)
      for (const chunk of chunks) {
        await nuvioRpc('sync_push_watch_progress', {
          p_profile_id: destinationProfileId,
          p_entries: chunk
        })
      }
      return entries.length ? `Added or updated ${entries.length} Continue Watching items.` : 'No Continue Watching items were in this file.'
    }
    case 'watchHistory': {
      const items = (value as Record<string, any>[]).map(cleanHistoryItem)
      const chunks = chunkArray(items, 500)
      for (const chunk of chunks) {
        await nuvioRpc('sync_push_watched_items', {
          p_profile_id: destinationProfileId,
          p_items: chunk
        })
      }
      return items.length ? `Added or updated ${items.length} watched items.` : 'No watched items were in this file.'
    }
    case 'profileSettings': {
      const stagedBlobs = value as PlatformSettings[]
      const blobs = strategy === 'merge'
        ? consolidatePlatformSettings(stagedBlobs).filter(blob => Object.keys(blob.settings).length > 0)
        : stagedBlobs
      if (strategy === 'merge' && !blobs.length) {
        return 'No staged app settings; existing app settings were kept unchanged.'
      }
      for (const blob of blobs) {
        const settings = strategy === 'merge'
          ? deepMergeStaged(
            await pullCurrentPlatformSettings(
              'sync_pull_profile_settings_blob',
              destinationProfileId,
              blob.platform
            ),
            blob.settings
          )
          : blob.settings
        await nuvioRpc('sync_push_profile_settings_blob', {
          p_profile_id: destinationProfileId,
          p_platform: blob.platform,
          p_settings_json: settings
        })
      }
      if (strategy === 'merge') {
        return `Merged staged app settings for ${blobs.length} ${blobs.length === 1 ? 'platform' : 'platforms'} and kept other settings.`
      }
      return blobs.length ? `Imported ${blobs.length} saved app settings.` : 'No app settings were in this file.'
    }
    case 'homeCatalogSettings': {
      const stagedBlobs = value as PlatformSettings[]
      const preparedBlobs = strategy === 'merge'
        ? consolidatePlatformSettings(stagedBlobs).filter(blob => Object.keys(blob.settings).length > 0)
        : [...stagedBlobs]
      if (strategy === 'merge' && !preparedBlobs.length) {
        return 'No staged home screen settings; existing layouts were kept unchanged.'
      }
      const blobs = preparedBlobs.sort((left, right) => (
        Number(left.platform === 'home_catalog_shared') - Number(right.platform === 'home_catalog_shared')
      ))
      for (const blob of blobs) {
        const settings = strategy === 'merge'
          ? deepMergeStaged(
            await pullCurrentPlatformSettings(
              'sync_pull_home_catalog_settings',
              destinationProfileId,
              blob.platform
            ),
            blob.settings
          )
          : blob.settings
        await nuvioRpc('sync_push_home_catalog_settings', {
          p_profile_id: destinationProfileId,
          p_platform: blob.platform,
          p_settings_json: settings
        })
      }
      if (strategy === 'merge') {
        return `Merged staged home screen settings for ${blobs.length} ${blobs.length === 1 ? 'platform' : 'platforms'} and kept other settings.`
      }
      return blobs.length ? `Imported ${blobs.length} saved home screen layouts.` : 'No home screen layouts were in this file.'
    }
    case 'collections': {
      const stagedCollections = value as Record<string, any>[]
      if (strategy === 'merge' && !stagedCollections.length) {
        return 'No staged collections; existing collections were kept unchanged.'
      }
      let collections = stagedCollections
      if (strategy === 'merge') {
        const currentCollections = await pullCollections(destinationProfileId, true)
        if (currentCollections.some(collection => !isRecord(collection))) {
          throw new Error('Nuvio returned unreadable collections; nothing was merged.')
        }
        collections = mergeStagedRecords(
          currentCollections as Record<string, any>[],
          stagedCollections,
          collectionMergeKey
        )
      }
      await nuvioRpc('sync_push_collections', {
        p_profile_id: destinationProfileId,
        p_collections_json: collections
      })
      if (strategy === 'merge') {
        return `Merged ${stagedCollections.length} staged ${stagedCollections.length === 1 ? 'collection' : 'collections'} and kept the rest.`
      }
      return collections.length ? `Imported ${collections.length} collections.` : 'Removed existing collections because this file had none.'
    }
  }
}

async function runImport() {
  const backup = importBackup.value
  if (!backup) {
    importError.value = 'Choose a Nuvio profile file first.'
    return
  }
  if (!selectedImportDefinitions.value.length) {
    importError.value = 'Choose at least one type of data to import.'
    return
  }
  if (!importReviewOpen.value) {
    importError.value = 'Review the import summary before continuing.'
    return
  }
  if (!importProfile.value) {
    importError.value = 'Choose the profile you want to import into.'
    return
  }

  importBusy.value = true
  importError.value = ''
  importResults.value = []
  importProgress.current = 0
  const destinationProfileId = Number(importProfileId.value)
  const strategy = restoreStrategy.value
  const keysToImport = IMPORT_ORDER.filter(key => importSelection.value.has(key) && backup.data[key] !== undefined)
  importProgress.total = keysToImport.length

  for (let index = 0; index < keysToImport.length; index++) {
    const key = keysToImport[index]
    const value = backup.data[key]
    const definition = categoryDefinition(key)
    importProgress.current = index + 1
    importStatus.value = `Importing ${index + 1} of ${keysToImport.length}: ${definition.label}…`

    try {
      const detail = await importCategory(key, value, destinationProfileId, strategy)
      importResults.value.push({ key, label: definition.label, status: 'success', detail })
    } catch (error) {
      importResults.value.push({
        key,
        label: definition.label,
        status: 'error',
        detail: errorMessage(error)
      })
    }
  }

  const failures = importResults.value.filter(result => result.status === 'error').length
  const successes = importResults.value.length - failures
  importStatus.value = failures
    ? `${successes} imported · ${failures} could not be imported. Successful changes were kept.`
    : `Import complete: ${successes} ${successes === 1 ? 'type of data' : 'types of data'} imported.`

  if (importResults.value.some(result => result.key === 'profile' && result.status === 'success')) {
    try {
      await loadProfiles()
    } catch {
      // The result list already records the completed profile update.
    }
  }

  resetImportReview()
  importBusy.value = false
}
</script>

<template>
  <div class="profile-transfer">
    <p v-if="configurationProfileError" class="error-panel" role="alert">
      {{ configurationProfileError }}
    </p>

    <section
      v-if="receivedConfigurationProfile"
      class="shared-configuration-card"
      aria-labelledby="shared-configuration-heading"
    >
      <div class="shared-configuration-copy">
        <span class="eyebrow">Shared setup plan</span>
        <h3 id="shared-configuration-heading">{{ receivedConfigurationProfile.name }}</h3>
        <p>
          This safe plan is for {{ targetDeviceLabel(receivedConfigurationProfile.targetDevice) }}.
          It contains preferences and placeholders only; Profile Transfer will not invent or push undocumented app-setting keys.
        </p>
      </div>

      <div class="shared-configuration-summary">
        <div>
          <strong>Add-on order</strong>
          <ol v-if="receivedAddonLabels.length">
            <li v-for="label in receivedAddonLabels" :key="label">{{ label }}</li>
          </ol>
          <span v-else>No add-ons selected</span>
        </div>
        <div>
          <strong>Preferences</strong>
          <span>{{ receivedConfigurationProfile.quality.maxResolution }} maximum</span>
          <span>{{ receivedConfigurationProfile.languages.primarySubtitle }} subtitles</span>
          <span>{{ targetDeviceLabel(receivedConfigurationProfile.player.engine) }} player</span>
        </div>
        <div v-if="receivedCredentialLabels.length">
          <strong>Enter on your device</strong>
          <ul>
            <li v-for="label in receivedCredentialLabels" :key="label">Your own {{ label }}</li>
          </ul>
        </div>
      </div>

      <div class="shared-configuration-actions">
        <button class="secondary-button" type="button" @click="editReceivedConfigurationProfile">
          Customize this plan
        </button>
        <button class="text-button" type="button" @click="receivedConfigurationProfile = null">
          Dismiss
        </button>
      </div>
    </section>

    <div class="transfer-workspace">
      <div class="account-rail">
        <section class="connection-card" aria-labelledby="nuvio-connection-heading">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Step 1</span>
              <h3 id="nuvio-connection-heading">Connect your account</h3>
            </div>
            <span v-if="isConnected" class="connection-badge">Connected</span>
          </div>

          <p class="section-description">Sign in to load your profiles. Credentials are never stored in the export.</p>

          <form v-if="!isConnected" class="auth-form" @submit.prevent="signIn">
            <label>
              <span>Email</span>
              <input
                v-model="authForm.email"
                type="email"
                autocomplete="email"
                placeholder="you@example.com"
                :disabled="authBusy"
              >
            </label>
            <label>
              <span>Password</span>
              <input
                v-model="authForm.password"
                type="password"
                autocomplete="current-password"
                placeholder="Nuvio password"
                :disabled="authBusy"
              >
            </label>
            <button class="primary-button auth-button" type="submit" :disabled="authBusy">
              <span v-if="authBusy" class="spinner" aria-hidden="true"></span>
              {{ authBusy ? 'Signing in…' : 'Sign in securely' }}
            </button>
          </form>

          <div v-else class="connected-row">
            <div class="signed-in-copy">
              <strong>Ready to transfer</strong>
              <span>Choose a profile in the workspace.</span>
            </div>
            <button class="secondary-button" type="button" :disabled="exportBusy || importBusy" @click="disconnect">
              Disconnect
            </button>
          </div>

          <p v-if="authError" class="error-panel" role="alert">{{ authError }}</p>
        </section>

        <div class="privacy-note">
          <div>
            <strong>What stays out of the file</strong>
            <span>Passwords, sessions, and profile PINs are excluded. Exports can still contain third-party keys, so store the file like a password.</span>
          </div>
        </div>
      </div>

      <section class="transfer-card" aria-labelledby="transfer-heading">
        <div class="transfer-card-header">
          <div class="section-heading transfer-title-row">
            <div>
              <span class="eyebrow">Step 2</span>
              <h3 id="transfer-heading">Export or import a profile</h3>
            </div>
          </div>

          <div class="mode-switch" role="tablist" aria-label="Profile transfer mode">
            <button
              type="button"
              role="tab"
              :aria-selected="mode === 'export'"
              :class="{ active: mode === 'export' }"
              :disabled="exportBusy || importBusy"
              @click="setMode('export')"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" /></svg>
              <span><strong>Export</strong><small>Create a backup file</small></span>
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="mode === 'import'"
              :class="{ active: mode === 'import' }"
              :disabled="exportBusy || importBusy"
              @click="setMode('import')"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m0 0 4 4m-4-4L8 7M5 21h14" /></svg>
              <span><strong>Import</strong><small>Restore from a file</small></span>
            </button>
          </div>
        </div>

      <div v-if="mode === 'export'" class="mode-panel" role="tabpanel">
        <div class="profile-choice-box">
          <label>
            <span>Profile to export</span>
            <select v-model.number="exportProfileId" :disabled="!isConnected || exportBusy">
              <option
                v-for="profile in profiles"
                :key="profile.profile_index"
                :value="Number(profile.profile_index)"
              >
                {{ profileOptionLabel(profile) }}
              </option>
            </select>
          </label>
          <p v-if="!isConnected">Sign in first, then choose a profile.</p>
          <p v-else>The exported file is downloaded to this device. Nothing in Nuvio is changed.</p>
        </div>

        <div class="choice-summary">
          <div>
            <h4>{{ exportSelection.size === CATEGORY_DEFINITIONS.length ? 'Everything is included' : `${exportSelection.size} types of data included` }}</h4>
            <p>App settings for desktop, mobile, TV, and your home layout are found automatically.</p>
          </div>
          <button class="choice-toggle" type="button" :aria-expanded="showExportChoices" @click="showExportChoices = !showExportChoices">
            {{ showExportChoices ? 'Hide choices' : 'Choose what to include' }}
          </button>
        </div>

        <div v-if="showExportChoices" class="choice-details">
          <div class="selection-actions">
            <button type="button" @click="selectAllExport">Include everything</button>
            <button type="button" @click="clearExportSelection">Clear all</button>
          </div>
          <div class="category-grid">
            <label
              v-for="definition in CATEGORY_DEFINITIONS"
              :key="definition.key"
              class="category-option"
              :class="{ selected: exportSelection.has(definition.key) }"
            >
              <input
                type="checkbox"
                :checked="exportSelection.has(definition.key)"
                :disabled="exportBusy"
                @change="toggleExportCategory(definition.key)"
              >
              <span class="checkmark" aria-hidden="true">✓</span>
              <span class="category-copy">
                <strong>{{ definition.label }}</strong>
                <small>{{ definition.description }}</small>
              </span>
            </label>
          </div>
        </div>

        <div
          v-if="(exportSelection.has('addons') && exportProfile?.uses_primary_addons) || (exportSelection.has('plugins') && exportProfile?.uses_primary_plugins)"
          class="warning-panel"
        >
          <strong>Some items come from Main profile</strong>
          <span>
            This profile uses
            <template v-if="exportSelection.has('addons') && exportProfile?.uses_primary_addons">add-ons</template><template v-if="exportSelection.has('addons') && exportProfile?.uses_primary_addons && exportSelection.has('plugins') && exportProfile?.uses_primary_plugins"> and </template><template v-if="exportSelection.has('plugins') && exportProfile?.uses_primary_plugins">plugins</template>
            from Main profile. Export the Main profile if you also want a copy of those shared items.
          </span>
        </div>

        <p v-if="exportError" class="error-panel" role="alert">{{ exportError }}</p>
        <div v-if="exportWarnings.length" class="warning-panel export-warning" role="status">
          <strong>Export notes</strong>
          <span v-for="warning in exportWarnings" :key="warning">{{ warning }}</span>
        </div>
        <div v-if="exportBusy" class="progress-panel" aria-live="polite">
          <progress :value="exportProgress.current" :max="exportProgress.total"></progress>
          <span>{{ exportStatus }}</span>
        </div>
        <p v-else-if="exportStatus" class="status-panel" aria-live="polite">{{ exportStatus }}</p>

        <div v-if="lastCreatedBackup" class="recent-backup-box safe-share-box">
          <div>
            <strong>Share the setup, not this private backup</strong>
            <span>Start a public-safe draft from recognized add-on names and order. URLs, settings blobs, account data, and credentials stay out.</span>
          </div>
          <button class="secondary-button" type="button" :disabled="exportBusy" @click="createSafeShareDraft">
            Create safe share profile
          </button>
        </div>

        <div class="panel-footer">
          <span>{{ exportSelection.size === CATEGORY_DEFINITIONS.length ? 'Everything selected' : `${exportSelection.size} of ${CATEGORY_DEFINITIONS.length} selected` }}</span>
          <button
            class="primary-button"
            type="button"
            :disabled="!isConnected || exportBusy || !exportSelection.size"
            @click="runExport"
          >
            <span v-if="exportBusy" class="spinner" aria-hidden="true"></span>
            {{ exportBusy ? 'Exporting profile…' : 'Download export' }}
          </button>
        </div>
      </div>

      <div v-else class="mode-panel" role="tabpanel">
        <div class="panel-intro">
          <div>
            <h4>Choose your exported file</h4>
            <p>The file is opened on this device. Everything found in it is selected by default, and you can choose what to skip.</p>
          </div>
        </div>

        <div v-if="lastCreatedBackup" class="recent-backup-box">
          <div>
            <strong>Export just created for {{ lastCreatedBackup.source.profileName }}</strong>
            <span>You can import it now without finding the downloaded file.</span>
          </div>
          <button class="secondary-button" type="button" :disabled="importBusy" @click="useLastCreatedBackup">
            Use this export
          </button>
        </div>

        <div v-if="lastCreatedBackup" class="or-divider"><span>or choose a saved file</span></div>

        <input
          ref="fileInput"
          class="visually-hidden"
          type="file"
          accept=".json,application/json"
          @change="handleFileInput"
        >
        <button
          class="file-dropzone"
          type="button"
          :disabled="importBusy"
          @click="fileInput?.click()"
          @dragover.prevent
          @drop.prevent="handleDrop"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0 4 4m-4-4L8 8M4 15v5h16v-5" /></svg>
          <strong>{{ importFileName || 'Choose or drop a Nuvio profile file' }}</strong>
          <span>{{ importFileName ? 'Choose a different file' : 'Nuvio profile file · maximum 50 MB' }}</span>
        </button>

        <p v-if="importError" class="error-panel" role="alert">{{ importError }}</p>

        <template v-if="importBackup">
          <div class="backup-summary">
            <div>
              <span>Export from</span>
              <strong>{{ importBackup.source.profileName }}</strong>
            </div>
            <div>
              <span>Created</span>
              <strong>{{ importBackup.exportedAt ? new Date(importBackup.exportedAt).toLocaleString() : 'Unknown date' }}</strong>
            </div>
          </div>

          <div v-if="importBackup.warnings?.length" class="warning-panel">
            <strong>Notes from this export</strong>
            <span v-for="warning in importBackup.warnings" :key="warning">{{ warning }}</span>
          </div>

          <fieldset class="restore-strategy" :disabled="importBusy">
            <legend>How should this import be applied?</legend>
            <div class="strategy-options">
              <label class="strategy-option" :class="{ selected: restoreStrategy === 'merge' }">
                <input
                  type="radio"
                  name="restore-strategy"
                  value="merge"
                  :checked="restoreStrategy === 'merge'"
                  @change="setRestoreStrategy('merge')"
                >
                <span class="strategy-copy">
                  <span class="strategy-title">
                    <strong>Clean merge</strong>
                    <em>Recommended</em>
                  </span>
                  <small>Add or update only staged data from the file. Everything else stays in place, and empty staged sections do nothing.</small>
                </span>
              </label>
              <label class="strategy-option" :class="{ selected: restoreStrategy === 'replace' }">
                <input
                  type="radio"
                  name="restore-strategy"
                  value="replace"
                  :checked="restoreStrategy === 'replace'"
                  @change="setRestoreStrategy('replace')"
                >
                <span class="strategy-copy">
                  <span class="strategy-title">
                    <strong>Complete rewrite</strong>
                    <em class="destructive-label">Destructive</em>
                  </span>
                  <small>Replace staged add-ons, plugins, library, collections, and settings blocks. Empty staged lists clear what is there.</small>
                </span>
              </label>
            </div>
            <p>Continue Watching and Watch history always add or update records; profile details update only the fields stored in the file.</p>
          </fieldset>

          <div class="choice-summary import-selection-heading">
            <div>
              <h4>{{ importSelection.size === includedImportDefinitions.length ? 'Everything in this file will be imported' : `${importSelection.size} types of data will be imported` }}</h4>
              <p>Nothing is imported until you review the final summary and press Import.</p>
            </div>
            <button class="choice-toggle" type="button" :aria-expanded="showImportChoices" @click="showImportChoices = !showImportChoices">
              {{ showImportChoices ? 'Hide choices' : 'Choose what to skip' }}
            </button>
          </div>

          <div v-if="showImportChoices" class="choice-details">
            <div class="selection-actions">
              <button type="button" @click="selectAllImport">Import everything</button>
              <button type="button" @click="clearImportSelection">Clear all</button>
            </div>
            <div class="category-grid import-grid">
              <label
                v-for="definition in includedImportDefinitions"
                :key="definition.key"
                class="category-option import-option"
                :class="{ selected: importSelection.has(definition.key) }"
              >
                <input
                  type="checkbox"
                  :checked="importSelection.has(definition.key)"
                  :disabled="importBusy"
                  @change="toggleImportCategory(definition.key)"
                >
                <span class="checkmark" aria-hidden="true">✓</span>
                <span class="category-copy">
                  <span class="category-title-line">
                    <strong>{{ definition.label }}</strong>
                    <em :class="restoreStrategy === 'merge' && (definition.behavior === 'replace' || definition.behavior === 'blob') ? 'behavior-merge' : `behavior-${definition.behavior}`">{{ behaviorLabel(definition.behavior) }}</em>
                  </span>
                  <small>{{ categoryCount(definition.key, importBackup.data[definition.key]) }}</small>
                </span>
              </label>
            </div>
          </div>

          <div v-if="progressMayAffectHistory" class="warning-panel">
            <strong>Continue Watching may also update history</strong>
            <span>Nearly finished items may be marked as watched by Nuvio, even when Watch history is skipped.</span>
          </div>

          <div class="destination-box">
            <label>
              <span>Import into</span>
              <select v-model="importProfileId" :disabled="!isConnected || importBusy" @change="resetImportReview">
                <option value="" disabled>Choose a profile…</option>
                <option
                  v-for="profile in profiles"
                  :key="profile.profile_index"
                  :value="Number(profile.profile_index)"
                >
                  {{ profileOptionLabel(profile) }}
                </option>
              </select>
            </label>
            <p v-if="!isConnected">Sign in before choosing where to import the file.</p>
            <p v-else>No profile is selected automatically, so Main profile cannot be overwritten by accident.</p>
          </div>

          <div v-if="importResults.length" class="result-list" aria-live="polite">
            <div
              v-for="result in importResults"
              :key="result.key"
              :class="['result-row', result.status]"
            >
              <span class="result-icon" aria-hidden="true">{{ result.status === 'success' ? '✓' : '!' }}</span>
              <span><strong>{{ result.label }}</strong><small>{{ result.detail }}</small></span>
            </div>
          </div>

          <div v-if="importBusy" class="progress-panel" aria-live="polite">
            <progress :value="importProgress.current" :max="importProgress.total"></progress>
            <span>{{ importStatus }}</span>
          </div>
          <p v-else-if="importStatus" class="status-panel" aria-live="polite">{{ importStatus }}</p>

          <div v-if="!importReviewOpen" class="panel-footer">
            <span>{{ importSelection.size === includedImportDefinitions.length ? 'Everything selected' : `${importSelection.size} of ${includedImportDefinitions.length} selected` }}</span>
            <button
              :class="['primary-button', { 'danger-button': restoreStrategy === 'replace' }]"
              type="button"
              :disabled="!isConnected || importBusy || !importSelection.size || !importProfile"
              @click="openImportReview"
            >
              {{ restoreStrategy === 'merge' ? 'Review clean merge' : 'Review complete rewrite' }}
            </button>
          </div>

          <div class="restore-review" v-else aria-live="polite">
            <span class="eyebrow">Final check</span>
            <h4>{{ restoreStrategy === 'merge' ? 'Clean-merge' : 'Rewrite' }} this profile data on {{ importProfileLabel }}?</h4>
            <p class="restore-route"><strong>{{ importBackup.source.profileName }}</strong> <span aria-hidden="true">→</span> <strong>{{ importProfileLabel }}</strong></p>

            <div class="review-effects">
              <div v-if="replaceImportLabels.length" class="review-effect">
                <strong>Will completely replace staged data</strong>
                <span>{{ replaceImportLabels.join(', ') }}</span>
              </div>
              <div v-if="combineImportLabels.length" class="review-effect">
                <strong>{{ restoreStrategy === 'merge' ? 'Will merge and keep other data' : 'Will add and update' }}</strong>
                <span>{{ combineImportLabels.join(', ') }}</span>
              </div>
              <div v-if="updateImportLabels.length" class="review-effect">
                <strong>Will update profile details</strong>
                <span>{{ updateImportLabels.join(', ') }}</span>
              </div>
            </div>

            <div v-if="emptyReplaceDefinitions.length" class="warning-panel review-warning">
              <strong>This file has empty sections</strong>
              <span>{{ emptyReplaceDefinitions.map(definition => definition.label).join(', ') }} will be cleared on {{ importProfileLabel }} because the file contains none.</span>
            </div>

            <div class="review-actions">
              <button class="secondary-button" type="button" :disabled="importBusy" @click="resetImportReview">Go back</button>
              <button :class="['primary-button', { 'danger-button': restoreStrategy === 'replace' }]" type="button" :disabled="importBusy" @click="runImport">
                <span v-if="importBusy" class="spinner" aria-hidden="true"></span>
                {{ importBusy ? 'Importing…' : `Import to ${importProfileLabel}` }}
              </button>
            </div>
          </div>
        </template>
      </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.profile-transfer {
  overflow: hidden;
  container-type: inline-size;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}

.shared-configuration-card {
  display: grid;
  gap: 18px;
  padding: 22px 26px;
  border-bottom: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 32%, var(--vp-c-divider));
  background: color-mix(in srgb, var(--vp-c-brand-soft) 52%, var(--vp-c-bg));
}

.shared-configuration-copy h3 {
  margin: 4px 0 6px !important;
  border: 0 !important;
  font-size: 20px;
}

.shared-configuration-copy p {
  max-width: 780px;
  margin: 0 !important;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.55;
}

.shared-configuration-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.shared-configuration-summary > div {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg);
  font-size: 12px;
}

.shared-configuration-summary strong {
  font-size: 12px;
}

.shared-configuration-summary span,
.shared-configuration-summary li {
  color: var(--vp-c-text-2);
  line-height: 1.45;
}

.shared-configuration-summary ol,
.shared-configuration-summary ul {
  margin: 0;
  padding-left: 18px;
}

.shared-configuration-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.text-button {
  min-height: 42px;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  color: var(--vp-c-text-2);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.text-button:hover {
  color: var(--vp-c-text-1);
}

.text-button:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
  border-radius: 6px;
}

.transfer-workspace {
  display: flex;
  flex-direction: column;
  background: var(--vp-c-bg);
}

.account-rail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  padding: 26px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.privacy-note,
.connection-card,
.transfer-card {
  min-width: 0;
}

.privacy-note {
  max-width: 620px;
  padding-top: 16px;
  border-top: 1px solid var(--vp-c-divider);
}

.privacy-note div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.privacy-note strong {
  font-size: 12px;
}

.privacy-note span {
  color: var(--vp-c-text-2);
  font-size: 11px;
  line-height: 1.5;
}

.connection-card {
  max-width: 620px;
}

.transfer-card {
  background: var(--vp-c-bg);
}

.transfer-card-header {
  padding: 24px 26px 18px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.section-description {
  margin: 14px 0 0 !important;
  color: var(--vp-c-text-2);
  font-size: 12px;
  line-height: 1.55;
}

.section-heading,
.panel-intro,
.choice-summary,
.panel-footer,
.connected-row,
.category-title-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.section-heading h3,
.panel-intro h4 {
  margin: 0 !important;
  border: 0 !important;
}

.section-heading h3 {
  font-size: 18px;
  line-height: 1.25;
}

.panel-intro h4 {
  font-size: 15px;
}

.eyebrow {
  display: block;
  margin-bottom: 4px;
  color: var(--vp-c-text-3);
  font-size: 11px;
  font-weight: 700;
}

.connection-badge {
  padding: 5px 9px;
  border: 1px solid color-mix(in srgb, var(--vp-c-green-1) 40%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--vp-c-green-soft) 70%, transparent);
  color: var(--vp-c-green-1);
  font-size: 11px;
  font-weight: 700;
}

.auth-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 11px;
  margin-top: 18px;
}

.auth-form label,
.profile-choice-box label,
.destination-box label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.auth-form label > span,
.profile-choice-box label > span,
.destination-box label > span {
  color: var(--vp-c-text-2);
  font-size: 12px;
  font-weight: 700;
}

input[type='email'],
input[type='password'],
input[type='text'],
select {
  width: 100%;
  min-height: 40px;
  padding: 9px 11px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  outline: none;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font: inherit;
  font-size: 13px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

input:focus,
select:focus,
button:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

input[type='email']:focus,
input[type='password']:focus,
input[type='text']:focus,
select:focus {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 3px var(--vp-c-brand-soft);
  outline: none;
}

button {
  font: inherit;
}

.primary-button,
.secondary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  padding: 9px 15px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 750;
  transition: transform 0.18s, background 0.18s, border-color 0.18s;
}

.primary-button {
  border: 1px solid var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
}

.primary-button:hover:not(:disabled) {
  background: var(--vp-c-brand-2);
}

.secondary-button {
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
}

.secondary-button:hover:not(:disabled) {
  border-color: var(--vp-c-text-3);
  color: var(--vp-c-text-1);
}

button:disabled,
input:disabled,
select:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.auth-button {
  width: 100%;
  margin-top: 2px;
  white-space: nowrap;
}

.connected-row {
  align-items: stretch;
  flex-direction: column;
  margin-top: 16px;
}

.connected-row .secondary-button {
  width: 100%;
}

.signed-in-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.signed-in-copy strong {
  font-size: 13px;
}

.signed-in-copy span {
  color: var(--vp-c-text-2);
  font-size: 12px;
}

.mode-switch {
  display: grid;
  grid-template-columns: 1fr;
  gap: 4px;
  margin-top: 18px;
  padding: 4px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 9px;
  background: var(--vp-c-bg-alt);
}

.mode-switch button {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  min-height: 52px;
  padding: 9px 12px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
  text-align: left;
}

.mode-switch button.active {
  border-color: var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-brand-1);
}

.mode-switch button > span {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.mode-switch button strong {
  color: var(--vp-c-text-1);
  font-size: 12px;
  line-height: 1.25;
}

.mode-switch button small {
  color: var(--vp-c-text-3);
  font-size: 10px;
  line-height: 1.25;
}

.mode-switch svg,
.file-dropzone svg {
  width: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.mode-panel {
  padding: 24px 26px 26px;
}

.panel-intro {
  align-items: flex-start;
}

.panel-intro p {
  max-width: 620px;
  margin: 4px 0 0 !important;
  color: var(--vp-c-text-2);
  font-size: 12px;
  line-height: 1.5;
}

.profile-choice-box,
.destination-box,
.backup-summary,
.restore-review {
  margin-top: 0;
  padding: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 9px;
  background: var(--vp-c-bg-alt);
}

.profile-choice-box label,
.destination-box label {
  max-width: none;
}

.profile-choice-box p,
.destination-box p {
  margin: 7px 0 0 !important;
  color: var(--vp-c-text-3);
  font-size: 12px;
  line-height: 1.5;
}

.choice-summary {
  align-items: stretch;
  flex-direction: column;
  margin-top: 12px;
  padding: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 9px;
  background: var(--vp-c-bg-alt);
}

.choice-summary h4,
.restore-review h4 {
  margin: 0 !important;
  border: 0 !important;
  font-size: 15px;
}

.choice-summary p {
  margin: 4px 0 0 !important;
  color: var(--vp-c-text-2);
  font-size: 12px;
  line-height: 1.5;
}

.choice-toggle {
  align-self: flex-start;
  min-height: 36px;
  margin-top: 4px;
  padding: 7px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 7px;
  background: var(--vp-c-bg);
  color: var(--vp-c-brand-1);
  cursor: pointer;
  font-size: 12px;
  font-weight: 750;
  white-space: nowrap;
}

.choice-details {
  margin-top: 12px;
  padding: 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 9px;
  background: var(--vp-c-bg-alt);
}

.selection-actions {
  display: flex;
  gap: 5px;
  white-space: nowrap;
}

.selection-actions button {
  padding: 4px 7px;
  border: 0;
  background: transparent;
  color: var(--vp-c-brand-1);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}

.category-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 9px;
  margin-top: 12px;
}

.category-option {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-height: 70px;
  padding: 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  cursor: pointer;
  transition: border-color 0.18s, background 0.18s;
}

.category-option:hover {
  border-color: var(--vp-c-text-3);
}

.category-option.selected {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 65%, var(--vp-c-divider));
  background: color-mix(in srgb, var(--vp-c-brand-soft) 38%, var(--vp-c-bg));
}

.category-option input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.category-option:focus-within {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.checkmark {
  display: grid;
  place-items: center;
  width: 19px;
  min-width: 19px;
  height: 19px;
  margin-top: 1px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 5px;
  background: var(--vp-c-bg-soft);
  color: transparent;
  font-size: 12px;
  font-weight: 900;
}

.category-option.selected .checkmark {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
}

.category-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  gap: 3px;
}

.category-copy strong {
  font-size: 13px;
  line-height: 1.35;
}

.category-copy small {
  color: var(--vp-c-text-3);
  font-size: 12px;
  line-height: 1.45;
}

.warning-panel,
.error-panel,
.status-panel {
  margin: 14px 0 0 !important;
  padding: 11px 13px;
  border-radius: 9px;
  font-size: 12px;
  line-height: 1.5;
}

.warning-panel {
  display: flex;
  flex-direction: column;
  gap: 3px;
  border: 1px solid color-mix(in srgb, var(--vp-c-warning-1) 45%, var(--vp-c-divider));
  background: color-mix(in srgb, var(--vp-c-warning-soft) 70%, var(--vp-c-bg));
  color: var(--vp-c-text-2);
}

.warning-panel strong {
  color: var(--vp-c-warning-1);
}

.error-panel {
  border: 1px solid color-mix(in srgb, var(--vp-c-danger-1) 45%, var(--vp-c-divider));
  background: color-mix(in srgb, var(--vp-c-danger-soft) 72%, var(--vp-c-bg));
  color: var(--vp-c-danger-1);
}

.status-panel {
  border: 1px solid color-mix(in srgb, var(--vp-c-green-1) 40%, var(--vp-c-divider));
  background: color-mix(in srgb, var(--vp-c-green-soft) 68%, var(--vp-c-bg));
  color: var(--vp-c-green-1);
}

.export-warning {
  margin-top: 8px !important;
}

.panel-footer {
  align-items: stretch;
  flex-direction: column;
  margin-top: 16px;
  padding-top: 15px;
  border-top: 1px solid var(--vp-c-divider);
}

.panel-footer > span {
  color: var(--vp-c-text-3);
  font-size: 12px;
}

.panel-footer .primary-button {
  align-self: flex-start;
}

.progress-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
  padding: 12px 13px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 9px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  font-size: 12px;
}

.progress-panel progress {
  width: 100%;
  height: 7px;
  accent-color: var(--vp-c-brand-1);
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.recent-backup-box {
  display: flex;
  align-items: stretch;
  flex-direction: column;
  gap: 14px;
  margin-top: 14px;
  padding: 13px 14px;
  border: 1px solid color-mix(in srgb, var(--vp-c-green-1) 38%, var(--vp-c-divider));
  border-radius: 10px;
  background: color-mix(in srgb, var(--vp-c-green-soft) 48%, var(--vp-c-bg));
}

.recent-backup-box > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.recent-backup-box strong {
  font-size: 13px;
}

.recent-backup-box span {
  color: var(--vp-c-text-2);
  font-size: 12px;
}

.or-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 13px 0 -2px;
  color: var(--vp-c-text-3);
  font-size: 11px;
}

.or-divider::before,
.or-divider::after {
  flex: 1;
  height: 1px;
  background: var(--vp-c-divider);
  content: '';
}

.file-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 132px;
  margin-top: 14px;
  padding: 20px;
  border: 1px dashed var(--vp-c-divider);
  border-radius: 9px;
  background: var(--vp-c-bg-alt);
  color: var(--vp-c-text-2);
  cursor: pointer;
  text-align: center;
  transition: border-color 0.18s, background 0.18s;
}

.file-dropzone:hover:not(:disabled) {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-bg-soft);
}

.file-dropzone svg {
  width: 26px;
  margin-bottom: 7px;
  color: var(--vp-c-brand-1);
}

.file-dropzone strong {
  max-width: 100%;
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-dropzone span {
  margin-top: 3px;
  color: var(--vp-c-text-3);
  font-size: 12px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.backup-summary {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin-top: 14px;
}

.backup-summary div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.backup-summary span {
  color: var(--vp-c-text-3);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.backup-summary strong {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.restore-strategy {
  min-width: 0;
  margin: 18px 0 0;
  padding: 0;
  border: 0;
}

.restore-strategy legend {
  padding: 0;
  color: var(--vp-c-text-1);
  font-size: 13px;
  font-weight: 800;
}

.strategy-options {
  display: grid;
  grid-template-columns: 1fr;
  gap: 9px;
  margin-top: 9px;
}

.strategy-option {
  position: relative;
  display: flex;
  min-width: 0;
  padding: 13px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  cursor: pointer;
  transition: border-color 0.18s, background 0.18s;
}

.strategy-option:hover {
  border-color: var(--vp-c-text-3);
}

.strategy-option.selected {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 65%, var(--vp-c-divider));
  background: color-mix(in srgb, var(--vp-c-brand-soft) 38%, var(--vp-c-bg));
}

.strategy-option input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.strategy-option:focus-within {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.strategy-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  gap: 5px;
}

.strategy-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.strategy-title strong {
  font-size: 13px;
}

.strategy-title em {
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--vp-c-green-soft);
  color: var(--vp-c-green-1);
  font-size: 9px;
  font-style: normal;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.strategy-title .destructive-label {
  background: var(--vp-c-danger-soft);
  color: var(--vp-c-danger-1);
}

.strategy-copy small,
.restore-strategy > p {
  color: var(--vp-c-text-3);
  font-size: 11px;
  line-height: 1.5;
}

.restore-strategy > p {
  margin: 7px 1px 0 !important;
}

.restore-strategy:disabled .strategy-option {
  cursor: not-allowed;
  opacity: 0.6;
  transform: none;
}

.import-selection-heading {
  margin-top: 18px;
}

.import-option {
  min-height: 67px;
}

.category-title-line {
  align-items: flex-start;
}

.category-title-line em {
  padding: 2px 5px;
  border-radius: 999px;
  font-size: 10px;
  font-style: normal;
  font-weight: 800;
  white-space: nowrap;
}

.behavior-replace,
.behavior-blob {
  background: var(--vp-c-warning-soft);
  color: var(--vp-c-warning-1);
}

.behavior-merge {
  background: var(--vp-c-green-soft);
  color: var(--vp-c-green-1);
}

.behavior-update {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

.restore-review {
  margin-top: 16px;
  border-color: var(--vp-c-divider);
  background: var(--vp-c-bg-alt);
}

.restore-route {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0 0 !important;
  color: var(--vp-c-text-2);
  font-size: 13px;
}

.review-effects {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}

.review-effect {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 11px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
}

.review-effect strong {
  font-size: 12px;
}

.review-effect span {
  color: var(--vp-c-text-2);
  font-size: 12px;
  line-height: 1.45;
}

.review-warning {
  margin-top: 10px !important;
}

.review-actions {
  display: flex;
  align-items: stretch;
  flex-direction: column;
  gap: 8px;
  margin-top: 15px;
  padding-top: 14px;
  border-top: 1px solid var(--vp-c-divider);
}

.result-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 14px;
}

.result-row {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 9px 11px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
}

.result-row > span:last-child {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.result-row strong {
  font-size: 12px;
}

.result-row small {
  color: var(--vp-c-text-3);
  font-size: 12px;
  line-height: 1.4;
}

.result-icon {
  display: grid;
  place-items: center;
  width: 17px;
  min-width: 17px;
  height: 17px;
  border-radius: 50%;
  color: var(--vp-c-white);
  font-size: 9px;
  font-weight: 900;
}

.result-row.success .result-icon {
  background: var(--vp-c-green-1);
}

.result-row.error .result-icon {
  background: var(--vp-c-danger-1);
}

.danger-button {
  background: var(--vp-c-brand-1);
}

.destination-box {
  margin-top: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@container (min-width: 860px) {
  .transfer-workspace {
    display: grid;
    grid-template-columns: minmax(300px, 0.85fr) minmax(0, 1.65fr);
    align-items: stretch;
  }

  .account-rail {
    border-right: 1px solid var(--vp-c-divider);
    border-bottom: 0;
  }

  .connection-card,
  .privacy-note {
    max-width: none;
  }

  .mode-switch {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container (max-width: 620px) {
  .profile-transfer {
    border-radius: 10px;
  }

  .shared-configuration-card {
    padding: 18px;
  }

  .shared-configuration-summary {
    grid-template-columns: 1fr;
  }

  .shared-configuration-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .shared-configuration-actions button {
    width: 100%;
    min-height: 44px;
  }

  .account-rail {
    padding: 18px;
  }

  .auth-form,
  .category-grid,
  .backup-summary,
  .strategy-options {
    grid-template-columns: 1fr;
  }

  .transfer-card-header,
  .mode-panel {
    padding: 20px 18px;
  }

  .mode-switch button {
    justify-content: flex-start;
    padding: 8px;
  }

  .panel-intro,
  .choice-summary,
  .panel-footer,
  .review-actions,
  .recent-backup-box {
    align-items: stretch;
    flex-direction: column;
  }

  .choice-toggle,
  .panel-footer .primary-button,
  .review-actions button,
  .recent-backup-box .secondary-button {
    width: 100%;
  }

  .selection-actions {
    align-self: flex-end;
  }

  .file-dropzone {
    min-height: 118px;
  }

  .transfer-title-row {
    align-items: flex-start;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition: none !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
</style>
