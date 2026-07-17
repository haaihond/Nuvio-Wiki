<script setup lang="ts">
import { computed, onActivated, onMounted, ref, watch } from 'vue'
import { withBase } from 'vitepress'
import {
  type ConfigurationProfile,
  ADDON_CATALOG,
  CONFIGURATION_PRESETS,
  CREDENTIAL_CATALOG,
  createDefaultConfigurationProfile,
  normalizeConfigurationProfile,
  serializeConfigurationProfile,
  PROFILE_TRANSFER_STORAGE_KEY,
  CONFIGURATION_PROFILE_DRAFT_STORAGE_KEY
} from './configurationProfiles'

const props = withDefaults(defineProps<{
  standalone?: boolean
}>(), {
  standalone: false
})

type ViewMode = 'builder' | 'receiver'
type FilterOption<T extends string = string> = { value: T; label: string }

type AddonCatalogEntry = {
  id: string
  label: string
  description: string
  kind?: string
  configureUrl?: string
  publicManifestUrl?: string
  credentialServices?: readonly string[]
}

type CredentialField = {
  id: string
  label: string
  placeholder: string
  inputType?: string
}

type CredentialCatalogEntry = {
  serviceId: string
  label: string
  description: string
  fields: readonly CredentialField[]
}

type PresetEntry = {
  id: string
  label: string
  description: string
  profile: ConfigurationProfile
}

const TARGET_OPTIONS: FilterOption[] = [
  { value: 'universal', label: 'Multiple devices' },
  { value: 'android-tv', label: 'Android TV' },
  { value: 'android-mobile', label: 'Android Mobile' },
  { value: 'ios', label: 'iPhone / iPad' },
  { value: 'desktop', label: 'Desktop' },
  { value: 'webos', label: 'webOS TV' },
]

const SOURCE_OPTIONS: FilterOption[] = [
  { value: 'usenet', label: 'Usenet' },
  { value: 'debrid', label: 'Debrid' },
  { value: 'p2p', label: 'P2P' },
  { value: 'direct', label: 'Direct links' }
]

const RESOLUTION_OPTIONS: FilterOption[] = [
  { value: '2160p', label: '4K / 2160p' },
  { value: '1080p', label: '1080p' },
  { value: '720p', label: '720p' },
  { value: '480p', label: '480p' }
]

const LANGUAGE_OPTIONS: FilterOption[] = [
  { value: 'original', label: 'Original language' },
  { value: 'en', label: 'English' },
  { value: 'nl', label: 'Dutch' },
  { value: 'ja', label: 'Japanese' },
  { value: 'de', label: 'German' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'none', label: 'None' }
]

const SUBTITLE_VISIBILITY_OPTIONS: FilterOption[] = [
  { value: 'automatic', label: 'Automatic' },
  { value: 'always', label: 'Always show' },
  { value: 'forced-only', label: 'Forced only' },
  { value: 'off', label: 'Off by default' }
]

const PLAYER_ENGINE_OPTIONS: FilterOption[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'exoplayer', label: 'ExoPlayer' },
  { value: 'mpv', label: 'libmpv' },
  { value: 'external', label: 'External player' }
]

const SELECTION_MODE_OPTIONS: FilterOption[] = [
  { value: 'automatic', label: 'Automatic' },
  { value: 'ask', label: 'Ask every time' },
  { value: 'first-match', label: 'First matching source' }
]

const ADDON_SUBTITLE_STARTUP_OPTIONS: FilterOption[] = [
  { value: 'fast', label: 'Fast startup' },
  { value: 'preferred', label: 'Preferred languages only' },
  { value: 'all', label: 'All addon subtitles' }
]

const BUFFER_OPTIONS: FilterOption[] = [
  { value: 'low-memory', label: 'Low memory' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'high-bitrate', label: 'High bitrate' },
  { value: 'remux', label: 'High-bitrate remux' }
]

const HARDWARE_DECODING_OPTIONS: FilterOption[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'hardware', label: 'Hardware (direct)' },
  { value: 'hardware-copy', label: 'Hardware (copy)' },
  { value: 'software', label: 'Software decoding' }
]

const THEME_OPTIONS: FilterOption[] = [
  { value: 'system', label: 'Follow device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
]

const HOME_LAYOUT_OPTIONS: FilterOption[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'family', label: 'Family' }
]

const EXCLUDED_TAG_OPTIONS: FilterOption[] = [
  { value: 'cam', label: 'CAM' },
  { value: 'telesync', label: 'Telesync' },
  { value: 'screener', label: 'Screener' },
  { value: '3d', label: '3D' },
  { value: 'hdr', label: 'HDR' },
  { value: 'dolby-vision', label: 'Dolby Vision' },
  { value: 'remux', label: 'Remux' },
  { value: 'dubbed', label: 'Dubbed' },
  { value: 'x264', label: 'H.264 / x264' },
  { value: 'x265', label: 'HEVC / x265' },
  { value: 'av1', label: 'AV1' },
  { value: 'low-seeders', label: 'Low seeders' }
]

const addonCatalog = ADDON_CATALOG as readonly AddonCatalogEntry[]
const credentialCatalog = CREDENTIAL_CATALOG as readonly CredentialCatalogEntry[]
const presets = CONFIGURATION_PRESETS as readonly PresetEntry[]

const viewMode = ref<ViewMode>('builder')
const profile = ref<ConfigurationProfile>(createDefaultConfigurationProfile())
const initialized = ref(false)
const selectedAddonId = ref('')
const loadingCode = ref('')
const loadBusy = ref(false)
const loadError = ref('')
const shareBusy = ref(false)
const shareError = ref('')
const shareStatus = ref('')
const sharedCode = ref('')
const sharedUrl = ref('')
const expiresAt = ref('')
const copyStatus = ref('')
const checkedCredentials = ref(new Set<string>())

const selectedAddonIds = computed(() => new Set(profile.value.addons.map(addon => addon.id)))
const availableAddons = computed(() => addonCatalog.filter(addon => !selectedAddonIds.value.has(addon.id)))
const selectedCredentialIds = computed(() => new Set(profile.value.credentials))
const selectedCredentials = computed(() => credentialCatalog.filter(
  credential => selectedCredentialIds.value.has(credential.serviceId)
))
const enabledAddons = computed(() => profile.value.addons.filter(addon => addon.enabled))
const selectedPresetId = computed(() => profile.value.presetId || '')
const canCreateShare = computed(() => profile.value.name.trim().length >= 2 && profile.value.addons.length > 0)

const targetLabel = computed(() => optionLabel(TARGET_OPTIONS, profile.value.targetDevice))
const sourcePriorityLabel = computed(() => profile.value.sourcePriority
  .map(source => optionLabel(SOURCE_OPTIONS, source))
  .join(' -> '))

const qualitySummary = computed(() => {
  const items = [
    `Up to ${optionLabel(RESOLUTION_OPTIONS, profile.value.quality.maxResolution)}`,
    profile.value.quality.maxSizeGb > 0
      ? `Maximum ${formatNumber(profile.value.quality.maxSizeGb)} GB`
      : 'Any file size',
    profile.value.quality.preferHdr ? 'Prefer HDR' : 'HDR not prioritized',
    profile.value.quality.allowDolbyVision ? 'Dolby Vision allowed' : 'Dolby Vision excluded',
    profile.value.quality.allowRemux ? 'Remux allowed' : 'Remux excluded'
  ]
  if (profile.value.quality.excludedTags.length) {
    items.push(`Exclude ${profile.value.quality.excludedTags.map(tag => optionLabel(EXCLUDED_TAG_OPTIONS, tag)).join(', ')}`)
  }
  return items
})

const languageSummary = computed(() => [
  `Audio: ${optionLabel(LANGUAGE_OPTIONS, profile.value.languages.primaryAudio)}`,
  `Audio fallback: ${optionLabel(LANGUAGE_OPTIONS, profile.value.languages.secondaryAudio)}`,
  `Subtitles: ${optionLabel(LANGUAGE_OPTIONS, profile.value.languages.primarySubtitle)}`,
  `Subtitle fallback: ${optionLabel(LANGUAGE_OPTIONS, profile.value.languages.secondarySubtitle)}`,
  `Visibility: ${optionLabel(SUBTITLE_VISIBILITY_OPTIONS, profile.value.languages.subtitleVisibility)}`,
  profile.value.languages.preferForced ? 'Prefer forced subtitles' : 'Forced subtitles not prioritized',
  profile.value.languages.onlyPreferred ? 'Show only preferred languages' : 'Show other languages too'
])

const playerSummary = computed(() => [
  optionLabel(PLAYER_ENGINE_OPTIONS, profile.value.player.engine),
  optionLabel(SELECTION_MODE_OPTIONS, profile.value.player.selectionMode),
  `Buffer: ${optionLabel(BUFFER_OPTIONS, profile.value.player.bufferProfile)}`,
  optionLabel(HARDWARE_DECODING_OPTIONS, profile.value.player.hardwareDecoding),
  profile.value.player.autoPlayNext ? 'Auto-play next episode' : 'Manual next episode',
  profile.value.player.reuseLastLink ? 'Reuse last link' : 'Choose a fresh link',
  `Addon subtitles: ${optionLabel(ADDON_SUBTITLE_STARTUP_OPTIONS, profile.value.player.addonSubtitleStartup)}`,
  profile.value.player.useLibass ? 'libass enabled' : 'Standard subtitle renderer'
])

const deviceSummary = computed(() => [
  targetLabel.value,
  `Sources: ${sourcePriorityLabel.value || 'None selected'}`,
  `Theme: ${optionLabel(THEME_OPTIONS, profile.value.interface.theme)}`,
  `Home: ${optionLabel(HOME_LAYOUT_OPTIONS, profile.value.interface.homeLayout)}`,
  profile.value.interface.contentWarnings ? 'Content warnings enabled' : 'Content warnings disabled',
  profile.value.interface.hideSpoilers ? 'Spoilers hidden' : 'Standard artwork',
  profile.value.interface.autoplayTrailers ? 'Auto-play trailers' : 'Manual trailers'
])

function optionLabel(options: readonly FilterOption[], value: unknown) {
  const normalized = String(value ?? '')
  return options.find(option => option.value === normalized)?.label || normalized || 'Not set'
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function addonDetails(id: string) {
  return addonCatalog.find(addon => addon.id === id) || {
    id,
    label: id,
    description: 'Curated Nuvio addon.'
  }
}

function credentialDetails(serviceId: string) {
  return credentialCatalog.find(credential => credential.serviceId === serviceId)
}

function sanitizeProfileName() {
  profile.value.name = profile.value.name
    .replace(/[^\p{L}\p{N} .,'\u2019()+&_\-]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, 60)
}

function resetShareResult() {
  sharedCode.value = ''
  sharedUrl.value = ''
  expiresAt.value = ''
  shareStatus.value = ''
  shareError.value = ''
  copyStatus.value = ''
}

function applyPreset(preset: PresetEntry) {
  profile.value = normalizeConfigurationProfile(preset.profile)
  selectedAddonId.value = ''
  resetShareResult()
  saveDraft()
}

function resetBuilder() {
  profile.value = createDefaultConfigurationProfile()
  selectedAddonId.value = ''
  resetShareResult()
  saveDraft()
}

function addAddon() {
  const id = selectedAddonId.value
  if (!id || selectedAddonIds.value.has(id)) return
  profile.value.addons.push({ id: id as ConfigurationProfile['addons'][number]['id'], enabled: true })
  selectedAddonId.value = ''
  resetShareResult()
}

function checkedValue(event: Event) {
  return (event.target as HTMLInputElement).checked
}

function hasSource(source: string) {
  return profile.value.sourcePriority.includes(source as ConfigurationProfile['sourcePriority'][number])
}

function hasExcludedTag(tag: string) {
  return profile.value.quality.excludedTags.includes(tag as ConfigurationProfile['quality']['excludedTags'][number])
}

function hasCredential(serviceId: string) {
  return profile.value.credentials.includes(serviceId as ConfigurationProfile['credentials'][number])
}

function removeAddon(index: number) {
  profile.value.addons.splice(index, 1)
  resetShareResult()
}

function moveAddon(index: number, direction: -1 | 1) {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= profile.value.addons.length) return
  const next = [...profile.value.addons]
  const [moved] = next.splice(index, 1)
  next.splice(nextIndex, 0, moved)
  profile.value.addons = next
  resetShareResult()
}

function moveSource(index: number, direction: -1 | 1) {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= profile.value.sourcePriority.length) return
  const next = [...profile.value.sourcePriority]
  const [moved] = next.splice(index, 1)
  next.splice(nextIndex, 0, moved)
  profile.value.sourcePriority = next
  resetShareResult()
}

function toggleSource(source: string, enabled: boolean) {
  const typedSource = source as ConfigurationProfile['sourcePriority'][number]
  if (enabled && !profile.value.sourcePriority.includes(typedSource)) {
    profile.value.sourcePriority.push(typedSource)
  } else if (!enabled) {
    profile.value.sourcePriority = profile.value.sourcePriority.filter(item => item !== typedSource)
  }
  resetShareResult()
}

function toggleExcludedTag(tag: string, enabled: boolean) {
  const typedTag = tag as ConfigurationProfile['quality']['excludedTags'][number]
  if (enabled && !profile.value.quality.excludedTags.includes(typedTag)) {
    profile.value.quality.excludedTags.push(typedTag)
  } else if (!enabled) {
    profile.value.quality.excludedTags = profile.value.quality.excludedTags.filter(item => item !== typedTag)
  }
  resetShareResult()
}

function toggleCredential(serviceId: string, enabled: boolean) {
  const typedId = serviceId as ConfigurationProfile['credentials'][number]
  if (enabled && !profile.value.credentials.includes(typedId)) {
    profile.value.credentials.push(typedId)
  } else if (!enabled) {
    profile.value.credentials = profile.value.credentials.filter(item => item !== typedId)
  }
  resetShareResult()
}

function serializedProfile(value = profile.value) {
  const serialized = serializeConfigurationProfile(normalizeConfigurationProfile(value))
  return typeof serialized === 'string' ? serialized : JSON.stringify(serialized, null, 2)
}

function serializedPayload(value = profile.value) {
  const serialized = serializeConfigurationProfile(normalizeConfigurationProfile(value))
  return typeof serialized === 'string' ? JSON.parse(serialized) : serialized
}

function saveDraft() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CONFIGURATION_PROFILE_DRAFT_STORAGE_KEY, serializedProfile())
  } catch {
    // A draft is a convenience only; private browsing may disable storage.
  }
}

function restoreDraft() {
  if (typeof window === 'undefined') return false
  try {
    const sessionDraft = window.sessionStorage.getItem(CONFIGURATION_PROFILE_DRAFT_STORAGE_KEY)
    const raw = sessionDraft || window.localStorage.getItem(CONFIGURATION_PROFILE_DRAFT_STORAGE_KEY)
    if (!raw) return false
    profile.value = normalizeConfigurationProfile(JSON.parse(raw))
    if (sessionDraft) {
      window.sessionStorage.removeItem(CONFIGURATION_PROFILE_DRAFT_STORAGE_KEY)
      saveDraft()
    }
    return true
  } catch {
    return false
  }
}

function codeFromLocation() {
  if (typeof window === 'undefined') return ''
  const queryCode = new URL(window.location.href).searchParams.get('code') || ''
  const pathMatch = window.location.pathname.match(/\/setup\/([A-Za-z0-9_-]+)\/?$/)
  return (queryCode || pathMatch?.[1] || '').trim().toUpperCase()
}

async function loadSharedProfile(code: string) {
  if (!code) return
  loadBusy.value = true
  loadError.value = ''
  loadingCode.value = code
  checkedCredentials.value = new Set()
  try {
    const response = await fetch(withBase(`/api/setup-profiles/${encodeURIComponent(code)}`), {
      headers: { Accept: 'application/json' }
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(body?.error || 'This configuration profile was not found or has expired.')
    }
    profile.value = normalizeConfigurationProfile(body?.profile ?? body?.data ?? body)
    sharedCode.value = String(body?.code || code).toUpperCase()
    sharedUrl.value = typeof window === 'undefined'
      ? ''
      : `${window.location.origin}${withBase(`/setup/${sharedCode.value}`)}`
    expiresAt.value = String(body?.expiresAt || body?.expires_at || '')
    viewMode.value = 'receiver'
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Could not load this configuration profile.'
  } finally {
    loadBusy.value = false
  }
}

async function createShareCode() {
  if (!canCreateShare.value || shareBusy.value) return
  shareBusy.value = true
  shareError.value = ''
  shareStatus.value = 'Creating a safe share code...'
  copyStatus.value = ''
  try {
    profile.value = normalizeConfigurationProfile(profile.value)
    const response = await fetch(withBase('/api/setup-profiles'), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ profile: serializedPayload() })
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(body?.error || 'The share code could not be created.')
    }
    sharedCode.value = String(body?.code || '').toUpperCase()
    if (!sharedCode.value) throw new Error('The server did not return a share code.')
    sharedUrl.value = typeof body?.url === 'string' && body.url
      ? body.url
      : `${window.location.origin}${withBase(`/setup/${sharedCode.value}`)}`
    expiresAt.value = String(body?.expiresAt || body?.expires_at || '')
    shareStatus.value = 'Share code ready. It contains only this guided, non-secret plan.'
  } catch (error) {
    sharedCode.value = ''
    sharedUrl.value = ''
    expiresAt.value = ''
    shareStatus.value = ''
    shareError.value = error instanceof Error ? error.message : 'The share code could not be created.'
  } finally {
    shareBusy.value = false
  }
}

async function copyText(value: string, label: string) {
  if (!value || typeof window === 'undefined') return
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    const field = document.createElement('textarea')
    field.value = value
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.opacity = '0'
    document.body.appendChild(field)
    field.select()
    document.execCommand('copy')
    field.remove()
  }
  copyStatus.value = `${label} copied.`
}

async function shareNative() {
  if (!sharedUrl.value) return
  if (!navigator.share) {
    await copyText(sharedUrl.value, 'Share link')
    return
  }
  try {
    await navigator.share({
      title: `${profile.value.name} - Nuvio setup`,
      text: 'Open this non-secret Nuvio configuration plan.',
      url: sharedUrl.value
    })
    copyStatus.value = 'Share sheet opened.'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    copyStatus.value = 'Could not open the share sheet. Copy the link instead.'
  }
}

function downloadProfile() {
  const content = serializedProfile()
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const filename = profile.value.name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'configuration-profile'
  link.href = url
  link.download = `nuvio-${filename}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function customizeCopy() {
  profile.value = normalizeConfigurationProfile({
    ...profile.value,
    name: `${profile.value.name} copy`.slice(0, 48)
  })
  viewMode.value = 'builder'
  resetShareResult()
  saveDraft()
  requestAnimationFrame(() => document.querySelector<HTMLElement>('#configuration-profile-name')?.focus())
}

function openInProfileTransfer() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(PROFILE_TRANSFER_STORAGE_KEY, serializedProfile())
  } catch {
    loadError.value = 'This browser blocked temporary storage. Download the profile and open Profile Transfer manually.'
    return
  }
  window.location.assign(withBase('/tools#profile-transfer'))
}

function toggleCredentialChecklist(serviceId: string, checked: boolean) {
  const next = new Set(checkedCredentials.value)
  checked ? next.add(serviceId) : next.delete(serviceId)
  checkedCredentials.value = next
}

function formatExpiry(value: string) {
  if (!value) return ''
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString(undefined, { dateStyle: 'medium' })
}

watch(profile, () => {
  if (!initialized.value || viewMode.value !== 'builder') return
  resetShareResult()
  saveDraft()
}, { deep: true })

onMounted(() => {
  const code = codeFromLocation()
  if (code) {
    viewMode.value = 'receiver'
    void loadSharedProfile(code)
  } else {
    restoreDraft()
  }
  initialized.value = true
})

onActivated(() => {
  if (initialized.value && viewMode.value === 'builder') restoreDraft()
})
</script>

<template>
  <div :class="['configuration-profiles', { 'configuration-profiles--standalone': standalone }]">
    <div v-if="loadBusy" class="state-card" role="status" aria-live="polite">
      <span class="spinner" aria-hidden="true"></span>
      <div>
        <strong>Loading setup {{ loadingCode }}</strong>
        <span>Checking the shared configuration profile.</span>
      </div>
    </div>

    <div v-else-if="loadError && viewMode === 'receiver'" class="state-card state-card--error" role="alert">
      <span class="state-mark" aria-hidden="true">!</span>
      <div>
        <strong>Could not open this setup</strong>
        <span>{{ loadError }}</span>
        <button type="button" class="secondary-button" @click="viewMode = 'builder'; loadError = ''">
          Build a new profile
        </button>
      </div>
    </div>

    <template v-else-if="viewMode === 'receiver'">
      <header class="profile-hero profile-hero--receiver">
        <div class="hero-copy">
          <span class="eyebrow">Shared Nuvio setup</span>
          <h2>{{ profile.name }}</h2>
          <p>
            Review this guided configuration plan, add your own credentials in the relevant apps,
            and choose what to carry into Profile Transfer.
          </p>
        </div>
        <div class="hero-meta">
          <span class="device-badge">{{ targetLabel }}</span>
          <span v-if="sharedCode" class="code-badge">{{ sharedCode }}</span>
        </div>
      </header>

      <section class="security-banner" aria-labelledby="receiver-security-title">
        <span class="security-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.7 2.9 8.1 7 10 4.1-1.9 7-5.3 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>
        </span>
        <div>
          <strong id="receiver-security-title">No keys, tokens, passwords, or private addon links are in this code</strong>
          <span>Credential rows below are fixed reminders. Enter your own details only when the destination service asks for them.</span>
        </div>
      </section>

      <div class="receiver-grid">
        <section class="summary-card" aria-labelledby="summary-addons-title">
          <div class="summary-heading">
            <span class="summary-number">1</span>
            <div>
              <h3 id="summary-addons-title">Addons</h3>
              <p>{{ enabledAddons.length }} enabled in priority order</p>
            </div>
          </div>
          <ol v-if="profile.addons.length" class="summary-addon-list">
            <li v-for="(addon, index) in profile.addons" :key="addon.id" :class="{ muted: !addon.enabled }">
              <span>{{ index + 1 }}</span>
              <div>
                <strong>{{ addonDetails(addon.id).label }}</strong>
                <small>{{ addon.enabled ? addonDetails(addon.id).description : 'Disabled in this plan' }}</small>
                <a
                  v-if="addonDetails(addon.id).configureUrl"
                  :href="addonDetails(addon.id).configureUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                >Open configuration page</a>
              </div>
              <em>{{ addon.enabled ? 'On' : 'Off' }}</em>
            </li>
          </ol>
          <p v-else class="empty-copy">No curated addons are included.</p>
        </section>

        <section class="summary-card" aria-labelledby="summary-quality-title">
          <div class="summary-heading">
            <span class="summary-number">2</span>
            <div>
              <h3 id="summary-quality-title">Quality</h3>
              <p>Resolution and source limits</p>
            </div>
          </div>
          <ul class="summary-list">
            <li v-for="item in qualitySummary" :key="item">{{ item }}</li>
          </ul>
        </section>

        <section class="summary-card" aria-labelledby="summary-languages-title">
          <div class="summary-heading">
            <span class="summary-number">3</span>
            <div>
              <h3 id="summary-languages-title">Languages</h3>
              <p>Audio and subtitle preferences</p>
            </div>
          </div>
          <ul class="summary-list">
            <li v-for="item in languageSummary" :key="item">{{ item }}</li>
          </ul>
        </section>

        <section class="summary-card" aria-labelledby="summary-player-title">
          <div class="summary-heading">
            <span class="summary-number">4</span>
            <div>
              <h3 id="summary-player-title">Player</h3>
              <p>Playback behavior</p>
            </div>
          </div>
          <ul class="summary-list">
            <li v-for="item in playerSummary" :key="item">{{ item }}</li>
          </ul>
        </section>

        <section class="summary-card receiver-device" aria-labelledby="summary-device-title">
          <div class="summary-heading">
            <span class="summary-number">5</span>
            <div>
              <h3 id="summary-device-title">Device</h3>
              <p>Target and interface choices</p>
            </div>
          </div>
          <ul class="summary-list">
            <li v-for="item in deviceSummary" :key="item">{{ item }}</li>
          </ul>
        </section>
      </div>

      <section class="credential-review" aria-labelledby="credential-review-title">
        <div class="section-title-row">
          <div>
            <span class="eyebrow">Recipient checklist</span>
            <h3 id="credential-review-title">Enter your own credentials later</h3>
            <p>Checking a row only tracks your progress on this page. No values are collected or stored.</p>
          </div>
          <span class="count-badge">{{ checkedCredentials.size }}/{{ selectedCredentials.length }}</span>
        </div>

        <div v-if="selectedCredentials.length" class="credential-list">
          <label
            v-for="credential in selectedCredentials"
            :key="credential.serviceId"
            class="credential-check"
            :class="{ complete: checkedCredentials.has(credential.serviceId) }"
          >
            <input
              type="checkbox"
              :checked="checkedCredentials.has(credential.serviceId)"
              @change="toggleCredentialChecklist(credential.serviceId, checkedValue($event))"
            >
            <span class="check-box" aria-hidden="true">✓</span>
            <span class="credential-copy">
              <strong>{{ credential.label }}</strong>
              <small>{{ credential.description }}</small>
              <span class="placeholder-list">
                <span v-for="field in credential.fields" :key="field.id">
                  <b>{{ field.label }}</b>
                  <code>{{ field.placeholder }}</code>
                </span>
              </span>
            </span>
          </label>
        </div>
        <p v-else class="empty-copy">This plan does not require a credential reminder.</p>
      </section>

      <aside v-if="selectedPresetId === 'family-friendly'" class="honesty-note">
        <strong>Content warnings are not parental controls</strong>
        <span>This preset reduces surprises and autoplay, but it cannot guarantee that every catalog or result is suitable for children.</span>
      </aside>

      <div class="receiver-actions">
        <div class="receiver-action-copy">
          <strong>Ready to continue?</strong>
          <span>This remains a guided plan; it is not a raw Nuvio app-settings import.</span>
          <small v-if="formatExpiry(expiresAt)">Share code available until {{ formatExpiry(expiresAt) }}.</small>
        </div>
        <div class="action-buttons">
          <button v-if="sharedUrl" type="button" class="secondary-button" @click="copyText(sharedUrl, 'Share link')">Copy link</button>
          <button v-if="sharedUrl" type="button" class="secondary-button" @click="shareNative">Share</button>
          <button type="button" class="secondary-button" @click="downloadProfile">Download JSON</button>
          <button type="button" class="secondary-button" @click="customizeCopy">Customize a copy</button>
          <button type="button" class="primary-button" @click="openInProfileTransfer">Open in Profile Transfer</button>
        </div>
      </div>
      <p class="visually-announced" aria-live="polite">{{ copyStatus }}</p>
    </template>

    <template v-else>
      <header class="profile-hero">
        <div class="hero-copy">
          <span class="eyebrow">Configuration profiles</span>
          <h2>Build a setup that is safe to share</h2>
          <p>
            Choose a preset, tune the plan, and create a short link. Shared profiles contain only
            curated addon IDs and non-secret preferences—not private manifests or raw app settings.
          </p>
        </div>
        <button type="button" class="quiet-button" @click="resetBuilder">Reset builder</button>
      </header>

      <section class="security-banner" aria-labelledby="builder-security-title">
        <span class="security-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.7 2.9 8.1 7 10 4.1-1.9 7-5.3 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>
        </span>
        <div>
          <strong id="builder-security-title">Credentials never belong in a configuration profile</strong>
          <span>This builder has no fields for API keys, passwords, tokens, raw URLs, or free-form notes. Recipients see placeholders for their own details.</span>
        </div>
      </section>

      <section class="preset-section" aria-labelledby="preset-title">
        <div class="section-title-row">
          <div>
            <span class="eyebrow">Step 1</span>
            <h3 id="preset-title">Start with a preset</h3>
            <p>Each preset is a reviewed, editable starting point.</p>
          </div>
          <span class="count-badge">{{ presets.length }} presets</span>
        </div>
        <div class="preset-grid">
          <button
            v-for="preset in presets"
            :key="preset.id"
            type="button"
            class="preset-card"
            :class="{ selected: selectedPresetId === preset.id }"
            :aria-pressed="selectedPresetId === preset.id"
            @click="applyPreset(preset)"
          >
            <span class="preset-copy">
              <strong>{{ preset.label }}</strong>
              <small>{{ preset.description }}</small>
            </span>
            <span class="preset-state">{{ selectedPresetId === preset.id ? 'Selected' : 'Use preset' }}</span>
          </button>
        </div>
      </section>

      <section class="builder-section" aria-labelledby="profile-basics-title">
        <div class="section-title-row">
          <div>
            <span class="eyebrow">Step 2</span>
            <h3 id="profile-basics-title">Name and target</h3>
            <p>Use a short descriptive name; do not paste account information.</p>
          </div>
        </div>
        <div class="field-grid field-grid--three">
          <label class="field field--wide">
            <span>Profile name</span>
            <input
              id="configuration-profile-name"
              v-model="profile.name"
              type="text"
              maxlength="60"
              autocomplete="off"
              placeholder="Living room setup"
              @input="sanitizeProfileName"
            >
            <small>Letters, numbers, spaces, and simple punctuation only.</small>
          </label>
          <label class="field">
            <span>Target device</span>
            <select v-model="profile.targetDevice">
              <option v-for="option in TARGET_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <div class="field source-field">
            <span>Source priority</span>
            <div class="source-priority">
              <div v-for="(source, index) in profile.sourcePriority" :key="source" class="source-row">
                <span><b>{{ index + 1 }}</b>{{ optionLabel(SOURCE_OPTIONS, source) }}</span>
                <span class="compact-actions">
                  <button type="button" :disabled="index === 0" :aria-label="`Move ${optionLabel(SOURCE_OPTIONS, source)} up`" @click="moveSource(index, -1)">↑</button>
                  <button type="button" :disabled="index === profile.sourcePriority.length - 1" :aria-label="`Move ${optionLabel(SOURCE_OPTIONS, source)} down`" @click="moveSource(index, 1)">↓</button>
                  <button type="button" :disabled="profile.sourcePriority.length === 1" :aria-label="`Remove ${optionLabel(SOURCE_OPTIONS, source)}`" @click="toggleSource(source, false)">×</button>
                </span>
              </div>
              <div class="source-add">
                <button
                  v-for="source in SOURCE_OPTIONS.filter(option => !hasSource(option.value))"
                  :key="source.value"
                  type="button"
                  @click="toggleSource(source.value, true)"
                >
                  + {{ source.label }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="builder-section" aria-labelledby="addons-title">
        <div class="section-title-row">
          <div>
            <span class="eyebrow">Step 3</span>
            <h3 id="addons-title">Addon order</h3>
            <p>Only reviewed catalog IDs are shared. Metadata addons should stay above stream addons.</p>
          </div>
          <span class="count-badge">{{ profile.addons.length }}/{{ addonCatalog.length }}</span>
        </div>

        <div v-if="profile.addons.length" class="addon-list">
          <div v-for="(addon, index) in profile.addons" :key="addon.id" class="addon-row">
            <span class="order-number">{{ index + 1 }}</span>
            <span class="addon-copy">
              <strong>{{ addonDetails(addon.id).label }}</strong>
              <small>{{ addonDetails(addon.id).description }}</small>
            </span>
            <label class="mini-toggle">
              <input v-model="addon.enabled" type="checkbox">
              <span aria-hidden="true"></span>
              <em>{{ addon.enabled ? 'Enabled' : 'Disabled' }}</em>
            </label>
            <span class="row-actions">
              <button type="button" :disabled="index === 0" :aria-label="`Move ${addonDetails(addon.id).label} up`" @click="moveAddon(index, -1)">↑</button>
              <button type="button" :disabled="index === profile.addons.length - 1" :aria-label="`Move ${addonDetails(addon.id).label} down`" @click="moveAddon(index, 1)">↓</button>
              <button type="button" class="remove-button" :aria-label="`Remove ${addonDetails(addon.id).label}`" @click="removeAddon(index)">Remove</button>
            </span>
          </div>
        </div>
        <p v-else class="empty-copy empty-copy--bordered">Choose at least one curated addon to create a share code.</p>

        <div class="addon-picker">
          <label class="field">
            <span>Add from curated catalog</span>
            <select v-model="selectedAddonId" :disabled="availableAddons.length === 0">
              <option value="">{{ availableAddons.length ? 'Choose an addon…' : 'All curated addons added' }}</option>
              <option v-for="addon in availableAddons" :key="addon.id" :value="addon.id">
                {{ addon.label }} · {{ addon.kind || 'addon' }}
              </option>
            </select>
          </label>
          <button type="button" class="secondary-button" :disabled="!selectedAddonId" @click="addAddon">Add addon</button>
        </div>
      </section>

      <section class="builder-section settings-section" aria-labelledby="preferences-title">
        <div class="section-title-row">
          <div>
            <span class="eyebrow">Step 4</span>
            <h3 id="preferences-title">Preferences</h3>
            <p>These are portable instructions, not undocumented raw Nuvio setting keys.</p>
          </div>
        </div>

        <div class="settings-groups">
          <details open>
            <summary>
              <span><strong>Quality filters</strong><small>Resolution, size, HDR, and excluded tags</small></span>
              <span class="summary-chevron" aria-hidden="true">⌄</span>
            </summary>
            <div class="details-body">
              <div class="field-grid">
                <label class="field">
                  <span>Maximum resolution</span>
                  <select v-model="profile.quality.maxResolution">
                    <option v-for="option in RESOLUTION_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
                  </select>
                </label>
                <label class="field">
                  <span>Maximum file size (GB)</span>
                  <input v-model.number="profile.quality.maxSizeGb" type="number" min="0.25" max="500" step="0.25" inputmode="decimal">
                </label>
              </div>
              <div class="toggle-grid">
                <label class="toggle-card"><input v-model="profile.quality.preferHdr" type="checkbox"><span aria-hidden="true"></span><b>Prefer HDR</b><small>Sort HDR sources higher.</small></label>
                <label class="toggle-card"><input v-model="profile.quality.allowDolbyVision" type="checkbox"><span aria-hidden="true"></span><b>Allow Dolby Vision</b><small>Keep DV results visible.</small></label>
                <label class="toggle-card"><input v-model="profile.quality.allowRemux" type="checkbox"><span aria-hidden="true"></span><b>Allow remux</b><small>Keep very large remux files.</small></label>
              </div>
              <fieldset class="chip-fieldset">
                <legend>Exclude tags</legend>
                <label v-for="tag in EXCLUDED_TAG_OPTIONS" :key="tag.value" class="choice-chip" :class="{ active: hasExcludedTag(tag.value) }">
                  <input type="checkbox" :checked="hasExcludedTag(tag.value)" @change="toggleExcludedTag(tag.value, checkedValue($event))">
                  <span>{{ tag.label }}</span>
                </label>
              </fieldset>
            </div>
          </details>

          <details>
            <summary>
              <span><strong>Language and subtitles</strong><small>Audio, fallback, visibility, and forced tracks</small></span>
              <span class="summary-chevron" aria-hidden="true">⌄</span>
            </summary>
            <div class="details-body">
              <div class="field-grid">
                <label class="field"><span>Primary audio</span><select v-model="profile.languages.primaryAudio"><option v-for="option in LANGUAGE_OPTIONS.filter(item => item.value !== 'none')" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
                <label class="field"><span>Secondary audio</span><select v-model="profile.languages.secondaryAudio"><option v-for="option in LANGUAGE_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
                <label class="field"><span>Primary subtitles</span><select v-model="profile.languages.primarySubtitle"><option v-for="option in LANGUAGE_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
                <label class="field"><span>Secondary subtitles</span><select v-model="profile.languages.secondarySubtitle"><option v-for="option in LANGUAGE_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
                <label class="field field--wide"><span>Subtitle visibility</span><select v-model="profile.languages.subtitleVisibility"><option v-for="option in SUBTITLE_VISIBILITY_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
              </div>
              <div class="toggle-grid toggle-grid--two">
                <label class="toggle-card"><input v-model="profile.languages.preferForced" type="checkbox"><span aria-hidden="true"></span><b>Prefer forced subtitles</b><small>Prioritize translations for foreign dialogue.</small></label>
                <label class="toggle-card"><input v-model="profile.languages.onlyPreferred" type="checkbox"><span aria-hidden="true"></span><b>Only preferred languages</b><small>Hide other tracks from the suggested list.</small></label>
              </div>
            </div>
          </details>

          <details>
            <summary>
              <span><strong>Player</strong><small>Engine, selection, buffering, and decoding</small></span>
              <span class="summary-chevron" aria-hidden="true">⌄</span>
            </summary>
            <div class="details-body">
              <div class="field-grid">
                <label class="field"><span>Player engine</span><select v-model="profile.player.engine"><option v-for="option in PLAYER_ENGINE_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
                <label class="field"><span>Stream selection</span><select v-model="profile.player.selectionMode"><option v-for="option in SELECTION_MODE_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
                <label class="field"><span>Buffer profile</span><select v-model="profile.player.bufferProfile"><option v-for="option in BUFFER_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
                <label class="field"><span>Hardware decoding</span><select v-model="profile.player.hardwareDecoding"><option v-for="option in HARDWARE_DECODING_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
                <label class="field"><span>Addon subtitle startup</span><select v-model="profile.player.addonSubtitleStartup"><option v-for="option in ADDON_SUBTITLE_STARTUP_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
              </div>
              <div class="toggle-grid">
                <label class="toggle-card"><input v-model="profile.player.autoPlayNext" type="checkbox"><span aria-hidden="true"></span><b>Auto-play next</b><small>Start the next episode automatically.</small></label>
                <label class="toggle-card"><input v-model="profile.player.reuseLastLink" type="checkbox"><span aria-hidden="true"></span><b>Reuse last link</b><small>Try the previous source when resuming.</small></label>
                <label class="toggle-card"><input v-model="profile.player.tunneledPlayback" type="checkbox"><span aria-hidden="true"></span><b>Tunneled playback</b><small>Android TV hardware path; verify device support.</small></label>
                <label class="toggle-card"><input v-model="profile.player.useLibass" type="checkbox"><span aria-hidden="true"></span><b>Use libass</b><small>Render complex ASS/SSA subtitle styles.</small></label>
              </div>
            </div>
          </details>

          <details>
            <summary>
              <span><strong>Interface and device</strong><small>Theme, layout, warnings, and artwork behavior</small></span>
              <span class="summary-chevron" aria-hidden="true">⌄</span>
            </summary>
            <div class="details-body">
              <div class="field-grid">
                <label class="field"><span>Theme</span><select v-model="profile.interface.theme"><option v-for="option in THEME_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
                <label class="field"><span>Home layout</span><select v-model="profile.interface.homeLayout"><option v-for="option in HOME_LAYOUT_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
              </div>
              <div class="toggle-grid">
                <label class="toggle-card"><input v-model="profile.interface.contentWarnings" type="checkbox"><span aria-hidden="true"></span><b>Content warnings</b><small>Show supported guidance before playback.</small></label>
                <label class="toggle-card"><input v-model="profile.interface.hideSpoilers" type="checkbox"><span aria-hidden="true"></span><b>Hide spoilers</b><small>Blur unwatched episode artwork.</small></label>
                <label class="toggle-card"><input v-model="profile.interface.autoplayTrailers" type="checkbox"><span aria-hidden="true"></span><b>Auto-play trailers</b><small>Play available previews while browsing.</small></label>
              </div>
            </div>
          </details>

          <details>
            <summary>
              <span><strong>Credential reminders</strong><small>Fixed placeholders for details each recipient supplies</small></span>
              <span class="summary-chevron" aria-hidden="true">⌄</span>
            </summary>
            <div class="details-body">
              <p class="details-intro">Select services this plan expects. There are intentionally no fields for credential values.</p>
              <div class="credential-builder-grid">
                <label
                  v-for="credential in credentialCatalog"
                  :key="credential.serviceId"
                  class="credential-option"
                  :class="{ selected: hasCredential(credential.serviceId) }"
                >
                  <input
                    type="checkbox"
                    :checked="hasCredential(credential.serviceId)"
                    @change="toggleCredential(credential.serviceId, checkedValue($event))"
                  >
                  <span class="check-box" aria-hidden="true">✓</span>
                  <span>
                    <strong>{{ credential.label }}</strong>
                    <small>{{ credential.description }}</small>
                    <code v-for="field in credential.fields" :key="field.id">{{ field.placeholder }}</code>
                  </span>
                </label>
              </div>
            </div>
          </details>
        </div>
      </section>

      <section class="share-panel" aria-labelledby="share-title">
        <div class="share-copy">
          <span class="eyebrow">Step 5</span>
          <h3 id="share-title">Create the share code</h3>
          <p>The server validates the same strict non-secret schema again before storing this immutable guided plan.</p>
          <span class="share-facts"><b>{{ profile.addons.length }}</b> addons · <b>{{ profile.credentials.length }}</b> credential reminders · <b>{{ targetLabel }}</b></span>
        </div>

        <div class="share-controls">
          <button type="button" class="secondary-button" @click="downloadProfile">Download JSON</button>
          <button type="button" class="primary-button" :disabled="!canCreateShare || shareBusy" @click="createShareCode">
            <span v-if="shareBusy" class="spinner spinner--button" aria-hidden="true"></span>
            {{ shareBusy ? 'Creating…' : 'Create share code' }}
          </button>
        </div>

        <p v-if="shareError" class="inline-message inline-message--error" role="alert">{{ shareError }}</p>
        <p v-else-if="shareStatus" class="inline-message" role="status" aria-live="polite">{{ shareStatus }}</p>

        <div v-if="sharedUrl" class="share-result" aria-live="polite">
          <div class="share-code-box">
            <span>Share code</span>
            <strong>{{ sharedCode }}</strong>
            <small v-if="formatExpiry(expiresAt)">Available until {{ formatExpiry(expiresAt) }}</small>
          </div>
          <div class="share-link-box">
            <label for="configuration-share-url">Short link</label>
            <div>
              <input id="configuration-share-url" :value="sharedUrl" type="text" readonly>
              <button type="button" @click="copyText(sharedUrl, 'Share link')">Copy</button>
            </div>
          </div>
          <button type="button" class="secondary-button" @click="shareNative">Share</button>
        </div>
        <p class="visually-announced" aria-live="polite">{{ copyStatus }}</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.configuration-profiles,
.configuration-profiles * {
  box-sizing: border-box;
}

.configuration-profiles {
  --profile-radius: 12px;
  --profile-radius-sm: 8px;
  --profile-control-height: 44px;
  container-type: inline-size;
  color: var(--vp-c-text-1);
}

.configuration-profiles--standalone {
  width: min(1180px, 100%);
  margin: 0 auto;
  padding: 34px clamp(18px, 4vw, 54px) max(52px, env(safe-area-inset-bottom));
}

button,
input,
select {
  font: inherit;
}

button {
  -webkit-tap-highlight-color: transparent;
}

button:focus-visible,
input:focus-visible,
select:focus-visible,
summary:focus-visible,
label:has(input:focus-visible) {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

button:disabled,
input:disabled,
select:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.profile-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 28px;
  padding: 24px;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--profile-radius);
  background: var(--vp-c-bg);
}

.profile-hero--receiver {
  background: var(--vp-c-bg);
}

.hero-copy {
  max-width: 760px;
}

.eyebrow {
  display: block;
  margin-bottom: 6px;
  color: var(--vp-c-brand-1);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.profile-hero h2,
.section-title-row h3,
.share-copy h3,
.summary-heading h3,
.credential-review h3 {
  margin: 0 !important;
  border: 0 !important;
  color: var(--vp-c-text-1);
}

.profile-hero h2 {
  font-size: clamp(25px, 4vw, 34px);
  letter-spacing: -0.035em;
  line-height: 1.12;
}

.profile-hero p,
.section-title-row p,
.share-copy p,
.summary-heading p,
.credential-review .section-title-row p {
  margin: 8px 0 0 !important;
  color: var(--vp-c-text-2);
  line-height: 1.55;
}

.profile-hero p {
  max-width: 700px;
  font-size: 14px;
}

.hero-meta {
  display: flex;
  align-items: flex-end;
  flex-direction: column;
  gap: 8px;
}

.device-badge,
.code-badge,
.count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.device-badge {
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 35%, var(--vp-c-divider));
  background: color-mix(in srgb, var(--vp-c-brand-soft) 58%, var(--vp-c-bg));
  color: var(--vp-c-brand-1);
}

.code-badge {
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-alt);
  font-family: var(--vp-font-family-mono);
  letter-spacing: 0.12em;
}

.count-badge {
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-alt);
  color: var(--vp-c-text-2);
}

.quiet-button,
.primary-button,
.secondary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--profile-control-height);
  padding: 9px 15px;
  border-radius: var(--profile-radius-sm);
  cursor: pointer;
  font-size: 12px;
  font-weight: 750;
  line-height: 1.2;
  text-decoration: none;
  transition: border-color 160ms ease, background-color 160ms ease, color 160ms ease, transform 160ms ease;
}

.quiet-button,
.secondary-button {
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
}

.quiet-button:hover:not(:disabled),
.secondary-button:hover:not(:disabled) {
  border-color: var(--vp-c-text-3);
  background: var(--vp-c-bg-alt);
  color: var(--vp-c-text-1);
}

.primary-button {
  border: 1px solid var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
}

.primary-button:hover:not(:disabled) {
  background: var(--vp-c-brand-2);
}

.security-banner {
  display: flex;
  align-items: flex-start;
  gap: 13px;
  margin-top: 16px;
  padding: 15px 17px;
  border: 1px solid color-mix(in srgb, var(--vp-c-green-1) 34%, var(--vp-c-divider));
  border-radius: var(--profile-radius);
  background: color-mix(in srgb, var(--vp-c-green-soft) 48%, var(--vp-c-bg));
}

.security-icon {
  display: grid;
  place-items: center;
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--vp-c-green-1);
  color: var(--vp-c-white);
}

.security-icon svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.security-banner div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.security-banner strong {
  font-size: 13px;
}

.security-banner span:last-child {
  color: var(--vp-c-text-2);
  font-size: 12px;
  line-height: 1.5;
}

.preset-section,
.builder-section,
.credential-review,
.share-panel {
  margin-top: 20px;
  padding: 24px;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--profile-radius);
  background: var(--vp-c-bg);
}

.section-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.section-title-row h3,
.share-copy h3,
.credential-review h3 {
  font-size: 19px;
  line-height: 1.25;
}

.section-title-row p,
.share-copy p,
.credential-review .section-title-row p {
  font-size: 12px;
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 18px;
}

.preset-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: 126px;
  padding: 15px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-alt);
  color: var(--vp-c-text-1);
  cursor: pointer;
  text-align: left;
  transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
}

.preset-card:hover {
  border-color: var(--vp-c-text-3);
}

.preset-card.selected {
  border-color: var(--vp-c-brand-1);
  background: color-mix(in srgb, var(--vp-c-brand-soft) 42%, var(--vp-c-bg));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--vp-c-brand-1) 20%, transparent);
}

.preset-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.preset-copy strong {
  font-size: 13px;
}

.preset-copy small {
  color: var(--vp-c-text-2);
  font-size: 11px;
  line-height: 1.45;
}

.preset-state {
  color: var(--vp-c-brand-1);
  font-size: 10px;
  font-weight: 800;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.field-grid--three {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 18px;
}

.field--wide,
.source-field {
  grid-column: 1 / -1;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.field > span,
.source-field > span,
.share-link-box > label {
  color: var(--vp-c-text-2);
  font-size: 11px;
  font-weight: 750;
}

.field small {
  color: var(--vp-c-text-3);
  font-size: 10px;
  line-height: 1.4;
}

.field input,
.field select,
.share-link-box input {
  width: 100%;
  min-height: var(--profile-control-height);
  padding: 9px 11px;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--profile-radius-sm);
  outline: none;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 13px;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.field input:focus,
.field select:focus,
.share-link-box input:focus {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 3px var(--vp-c-brand-soft);
}

.source-priority {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.source-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 48px;
  padding: 6px 7px 6px 11px;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--profile-radius-sm);
  background: var(--vp-c-bg-alt);
}

.source-row > span:first-child {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 12px;
  font-weight: 650;
}

.source-row b {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-size: 10px;
}

.compact-actions,
.row-actions {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.compact-actions button,
.row-actions button {
  display: inline-grid;
  place-items: center;
  min-width: 36px;
  min-height: 36px;
  padding: 5px 9px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 7px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  cursor: pointer;
  font-size: 11px;
  font-weight: 750;
}

.compact-actions button:hover:not(:disabled),
.row-actions button:hover:not(:disabled) {
  border-color: var(--vp-c-text-3);
  color: var(--vp-c-text-1);
}

.source-add {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.source-add button {
  min-height: 36px;
  padding: 6px 10px;
  border: 1px dashed var(--vp-c-divider);
  border-radius: 7px;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
  font-size: 11px;
}

.addon-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 18px;
}

.addon-row {
  display: grid;
  grid-template-columns: 32px minmax(160px, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  min-height: 64px;
  padding: 9px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 9px;
  background: var(--vp-c-bg-alt);
}

.order-number {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  font-size: 11px;
  font-weight: 800;
}

.addon-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.addon-copy strong {
  font-size: 12px;
}

.addon-copy small {
  overflow: hidden;
  color: var(--vp-c-text-3);
  font-size: 10px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mini-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
}

.mini-toggle input,
.toggle-card input,
.choice-chip input,
.credential-option > input,
.credential-check > input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.mini-toggle > span,
.toggle-card > span:first-of-type {
  position: relative;
  display: inline-block;
  width: 34px;
  height: 20px;
  border-radius: 999px;
  background: var(--vp-c-divider);
  transition: background-color 160ms ease;
}

.mini-toggle > span::after,
.toggle-card > span:first-of-type::after {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--vp-c-white);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.22);
  content: '';
  transition: transform 160ms ease;
}

.mini-toggle input:checked + span,
.toggle-card input:checked + span {
  background: var(--vp-c-brand-1);
}

.mini-toggle input:checked + span::after,
.toggle-card input:checked + span::after {
  transform: translateX(14px);
}

.mini-toggle em {
  color: var(--vp-c-text-2);
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
}

.row-actions .remove-button {
  color: var(--vp-c-danger-1);
}

.addon-picker {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 10px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--vp-c-divider);
}

.empty-copy {
  margin: 14px 0 0 !important;
  color: var(--vp-c-text-3);
  font-size: 12px;
}

.empty-copy--bordered {
  padding: 15px;
  border: 1px dashed var(--vp-c-divider);
  border-radius: var(--profile-radius-sm);
  text-align: center;
}

.settings-section {
  padding-bottom: 18px;
}

.settings-groups {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 18px;
}

.settings-groups details {
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: 9px;
  background: var(--vp-c-bg-alt);
}

.settings-groups summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  min-height: 64px;
  padding: 12px 15px;
  cursor: pointer;
  list-style: none;
}

.settings-groups summary::-webkit-details-marker {
  display: none;
}

.settings-groups summary > span:first-child {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.settings-groups summary strong {
  font-size: 13px;
}

.settings-groups summary small {
  color: var(--vp-c-text-3);
  font-size: 10px;
}

.summary-chevron {
  color: var(--vp-c-text-3);
  font-size: 18px;
  transition: transform 160ms ease;
}

details[open] .summary-chevron {
  transform: rotate(180deg);
}

.details-body {
  padding: 16px;
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
}

.details-intro {
  margin: 0 0 13px !important;
  color: var(--vp-c-text-2);
  font-size: 12px;
}

.toggle-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}

.toggle-grid--two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.toggle-card {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1px 9px;
  min-height: 74px;
  padding: 11px;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--profile-radius-sm);
  background: var(--vp-c-bg-alt);
  cursor: pointer;
}

.toggle-card > span:first-of-type {
  grid-row: 1 / 3;
  margin-top: 1px;
}

.toggle-card b {
  font-size: 11px;
}

.toggle-card small {
  color: var(--vp-c-text-3);
  font-size: 9px;
  line-height: 1.4;
}

.chip-fieldset {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: 15px 0 0;
  padding: 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--profile-radius-sm);
}

.chip-fieldset legend {
  padding: 0 5px;
  color: var(--vp-c-text-2);
  font-size: 11px;
  font-weight: 750;
}

.choice-chip {
  position: relative;
  cursor: pointer;
}

.choice-chip span {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 6px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  font-size: 10px;
  font-weight: 700;
}

.choice-chip.active span {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

.credential-builder-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.credential-option {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 9px;
  min-height: 100px;
  padding: 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--profile-radius-sm);
  background: var(--vp-c-bg-alt);
  cursor: pointer;
}

.credential-option.selected {
  border-color: var(--vp-c-brand-1);
  background: color-mix(in srgb, var(--vp-c-brand-soft) 38%, var(--vp-c-bg));
}

.check-box {
  display: grid;
  place-items: center;
  flex: 0 0 20px;
  width: 20px;
  height: 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 5px;
  background: var(--vp-c-bg);
  color: transparent;
  font-size: 11px;
  font-weight: 900;
}

.credential-option.selected .check-box,
.credential-check.complete .check-box {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
}

.credential-option > span:last-child {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.credential-option strong {
  font-size: 11px;
}

.credential-option small {
  color: var(--vp-c-text-3);
  font-size: 9px;
  line-height: 1.35;
}

.credential-option code {
  overflow: hidden;
  padding: 3px 5px;
  border-radius: 4px;
  background: var(--vp-code-bg);
  color: var(--vp-c-text-2);
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px 24px;
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 35%, var(--vp-c-divider));
  background: var(--vp-c-bg);
}

.share-controls,
.action-buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.share-facts {
  display: block;
  margin-top: 10px;
  color: var(--vp-c-text-2);
  font-size: 11px;
}

.inline-message,
.share-result,
.visually-announced {
  grid-column: 1 / -1;
}

.inline-message {
  margin: 0 !important;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--vp-c-green-1) 30%, var(--vp-c-divider));
  border-radius: var(--profile-radius-sm);
  background: var(--vp-c-green-soft);
  color: var(--vp-c-green-1);
  font-size: 11px;
  font-weight: 650;
}

.inline-message--error {
  border-color: color-mix(in srgb, var(--vp-c-danger-1) 32%, var(--vp-c-divider));
  background: var(--vp-c-danger-soft);
  color: var(--vp-c-danger-1);
}

.share-result {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: end;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid var(--vp-c-divider);
}

.share-code-box {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 64px;
  padding: 8px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--profile-radius-sm);
  background: var(--vp-c-bg);
}

.share-code-box span,
.share-code-box small {
  color: var(--vp-c-text-3);
  font-size: 9px;
}

.share-code-box strong {
  font-family: var(--vp-font-family-mono);
  font-size: 18px;
  letter-spacing: 0.12em;
}

.share-link-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.share-link-box > div {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
}

.share-link-box input {
  border-radius: var(--profile-radius-sm) 0 0 var(--profile-radius-sm);
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
}

.share-link-box button {
  min-width: 68px;
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 0 var(--profile-radius-sm) var(--profile-radius-sm) 0;
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
  cursor: pointer;
  font-size: 11px;
  font-weight: 750;
}

.state-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  min-height: 130px;
  padding: 25px;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--profile-radius);
  background: var(--vp-c-bg);
}

.state-card > div {
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  gap: 5px;
}

.state-card strong {
  font-size: 15px;
}

.state-card span {
  color: var(--vp-c-text-2);
  font-size: 12px;
}

.state-card .secondary-button {
  margin-top: 8px;
}

.state-card--error {
  border-color: color-mix(in srgb, var(--vp-c-danger-1) 35%, var(--vp-c-divider));
}

.state-mark {
  display: grid;
  place-items: center;
  flex: 0 0 30px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--vp-c-danger-1);
  color: var(--vp-c-white) !important;
  font-weight: 900;
}

.spinner {
  display: inline-block;
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  border: 2px solid var(--vp-c-divider);
  border-top-color: var(--vp-c-brand-1);
  border-radius: 50%;
  animation: profile-spin 700ms linear infinite;
}

.spinner--button {
  flex-basis: 14px;
  width: 14px;
  height: 14px;
  margin-right: 7px;
  border-color: color-mix(in srgb, var(--vp-c-white) 45%, transparent);
  border-top-color: var(--vp-c-white);
}

@keyframes profile-spin {
  to { transform: rotate(360deg); }
}

.receiver-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 20px;
}

.summary-card {
  min-width: 0;
  padding: 19px;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--profile-radius);
  background: var(--vp-c-bg);
}

.receiver-device {
  grid-column: 1 / -1;
}

.summary-heading {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.summary-number {
  display: grid;
  place-items: center;
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-size: 11px;
  font-weight: 850;
}

.summary-heading h3 {
  font-size: 15px;
}

.summary-heading p {
  margin-top: 2px !important;
  font-size: 10px;
}

.summary-list,
.summary-addon-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 13px 0 0 !important;
  padding: 0 !important;
  list-style: none;
}

.summary-list li {
  position: relative;
  padding-left: 14px;
  color: var(--vp-c-text-2);
  font-size: 11px;
  line-height: 1.4;
}

.summary-list li::before {
  position: absolute;
  top: 0.55em;
  left: 1px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
  content: '';
}

.summary-addon-list li {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 7px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 7px;
  background: var(--vp-c-bg-alt);
}

.summary-addon-list li > span {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-3);
  font-size: 9px;
  font-weight: 800;
}

.summary-addon-list li > div {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.summary-addon-list strong {
  font-size: 11px;
}

.summary-addon-list small {
  overflow: hidden;
  color: var(--vp-c-text-3);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-addon-list a {
  width: fit-content;
  margin-top: 2px;
  color: var(--vp-c-brand-1);
  font-size: 9px;
  font-weight: 700;
  text-decoration: none;
}

.summary-addon-list a:hover {
  text-decoration: underline;
}

.summary-addon-list em {
  color: var(--vp-c-green-1);
  font-size: 9px;
  font-style: normal;
  font-weight: 800;
}

.summary-addon-list li.muted {
  opacity: 0.62;
}

.summary-addon-list li.muted em {
  color: var(--vp-c-text-3);
}

.credential-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 17px;
}

.credential-check {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 11px;
  min-height: 88px;
  padding: 13px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 9px;
  background: var(--vp-c-bg-alt);
  cursor: pointer;
}

.credential-check.complete {
  border-color: color-mix(in srgb, var(--vp-c-green-1) 45%, var(--vp-c-divider));
  background: color-mix(in srgb, var(--vp-c-green-soft) 36%, var(--vp-c-bg));
}

.credential-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.credential-copy strong {
  font-size: 12px;
}

.credential-copy > small {
  color: var(--vp-c-text-2);
  font-size: 10px;
}

.placeholder-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.placeholder-list > span {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 5px 7px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
}

.placeholder-list b {
  color: var(--vp-c-text-2);
  font-size: 9px;
}

.placeholder-list code {
  overflow: hidden;
  color: var(--vp-c-text-3);
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.honesty-note {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 14px;
  padding: 13px 15px;
  border: 1px solid color-mix(in srgb, var(--vp-c-warning-1) 38%, var(--vp-c-divider));
  border-radius: 9px;
  background: var(--vp-c-warning-soft);
}

.honesty-note strong {
  color: var(--vp-c-warning-1);
  font-size: 12px;
}

.honesty-note span {
  color: var(--vp-c-text-2);
  font-size: 11px;
  line-height: 1.45;
}

.receiver-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-top: 20px;
  padding: 19px;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--profile-radius);
  background: var(--vp-c-bg-alt);
}

.receiver-action-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.receiver-action-copy strong {
  font-size: 13px;
}

.receiver-action-copy span,
.receiver-action-copy small {
  color: var(--vp-c-text-2);
  font-size: 10px;
}

.visually-announced {
  position: absolute;
  overflow: hidden;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  clip: rect(0 0 0 0);
  border: 0;
  white-space: nowrap;
}

@container (max-width: 940px) {
  .preset-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .addon-row {
    grid-template-columns: 32px minmax(120px, 1fr) auto;
  }

  .addon-row .row-actions {
    grid-column: 2 / -1;
    justify-content: flex-end;
  }

  .toggle-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container (max-width: 700px) {
  .profile-hero,
  .section-title-row,
  .receiver-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .hero-meta {
    align-items: flex-start;
    flex-direction: row;
  }

  .profile-hero .quiet-button {
    width: 100%;
  }

  .section-title-row .count-badge {
    align-self: flex-start;
  }

  .field-grid,
  .field-grid--three,
  .credential-builder-grid,
  .receiver-grid {
    grid-template-columns: 1fr;
  }

  .receiver-device {
    grid-column: auto;
  }

  .share-panel {
    grid-template-columns: 1fr;
  }

  .share-controls,
  .action-buttons {
    justify-content: stretch;
  }

  .share-controls > *,
  .action-buttons > * {
    flex: 1 1 180px;
  }

  .share-result {
    grid-template-columns: 1fr;
  }

  .toggle-grid,
  .toggle-grid--two {
    grid-template-columns: 1fr;
  }
}

@container (max-width: 520px) {
  .configuration-profiles--standalone {
    padding: 18px 0 max(38px, env(safe-area-inset-bottom));
  }

  .profile-hero,
  .preset-section,
  .builder-section,
  .credential-review,
  .share-panel,
  .summary-card,
  .receiver-actions,
  .state-card {
    border-radius: 0;
    border-inline: 0;
  }

  .profile-hero,
  .preset-section,
  .builder-section,
  .credential-review,
  .share-panel {
    padding: 18px;
  }

  .security-banner,
  .honesty-note {
    margin-inline: 12px;
  }

  .receiver-grid {
    gap: 8px;
  }

  .preset-grid {
    grid-template-columns: 1fr;
  }

  .preset-card {
    min-height: 120px;
  }

  .addon-row {
    grid-template-columns: 30px minmax(0, 1fr);
  }

  .addon-row .mini-toggle {
    grid-column: 2;
  }

  .addon-row .row-actions {
    grid-column: 1 / -1;
    justify-content: stretch;
  }

  .row-actions button {
    flex: 1;
    min-height: var(--profile-control-height);
  }

  .addon-picker {
    grid-template-columns: 1fr;
  }

  .addon-picker .secondary-button,
  .share-controls > *,
  .action-buttons > * {
    width: 100%;
    flex-basis: 100%;
  }

  .source-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .source-row .compact-actions {
    width: 100%;
  }

  .compact-actions button {
    flex: 1;
    min-height: var(--profile-control-height);
  }

  .details-body {
    padding: 13px;
  }

  .credential-check {
    min-height: 100px;
  }

  .placeholder-list {
    flex-direction: column;
  }

  .placeholder-list > span {
    align-items: flex-start;
    flex-direction: column;
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
