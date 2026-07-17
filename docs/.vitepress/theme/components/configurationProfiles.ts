export const CONFIGURATION_PROFILE_FORMAT = 'nuvio-configuration-profile' as const
export const CONFIGURATION_PROFILE_VERSION = 1 as const

export const PROFILE_TRANSFER_STORAGE_KEY = 'nuvio-profile-transfer:configuration-profile:v1'
export const CONFIGURATION_PROFILE_DRAFT_STORAGE_KEY = 'nuvio-configuration-profile:draft:v1'

export const CONFIGURATION_PRESET_IDS = [
  'android-tv',
  'torbox',
  'usenet-first',
  'anime',
  'dutch',
  'low-bandwidth',
  '4k-remux',
  'family-friendly'
] as const

export const TARGET_DEVICE_IDS = [
  'universal',
  'android-tv',
  'android-mobile',
  'ios',
  'desktop',
  'webos'
] as const

export const CURATED_ADDON_IDS = [
  'cinemeta',
  'aiometadata',
  'anime-kitsu',
  'aiostreams',
  'torrentio',
  'comet',
  'mediafusion',
  'stremthru',
  'opensubtitles'
] as const

export const SOURCE_PRIORITY_IDS = ['usenet', 'debrid', 'p2p', 'direct'] as const
export const RESOLUTION_IDS = ['2160p', '1080p', '720p', '480p'] as const
export const QUALITY_EXCLUDED_TAGS = [
  'cam',
  'telesync',
  'screener',
  '3d',
  'hdr',
  'dolby-vision',
  'remux',
  'dubbed',
  'x264',
  'x265',
  'av1',
  'low-seeders'
] as const

export const LANGUAGE_IDS = ['original', 'en', 'nl', 'ja', 'de', 'fr', 'es', 'it', 'pt'] as const
export const SUBTITLE_VISIBILITY_IDS = ['automatic', 'always', 'forced-only', 'off'] as const
export const PLAYER_ENGINE_IDS = ['auto', 'exoplayer', 'mpv', 'external'] as const
export const PLAYER_SELECTION_MODE_IDS = ['automatic', 'ask', 'first-match'] as const
export const ADDON_SUBTITLE_STARTUP_IDS = ['fast', 'preferred', 'all'] as const
export const BUFFER_PROFILE_IDS = ['low-memory', 'balanced', 'high-bitrate', 'remux'] as const
export const HARDWARE_DECODING_IDS = ['auto', 'hardware', 'hardware-copy', 'software'] as const
export const THEME_IDS = ['system', 'dark', 'light'] as const
export const HOME_LAYOUT_IDS = ['compact', 'balanced', 'cinematic', 'family'] as const
export const CREDENTIAL_SERVICE_IDS = [
  'torbox',
  'premiumize',
  'usenet-provider',
  'usenet-indexer',
  'tmdb',
  'tvdb',
  'anime-skip'
] as const

export type ConfigurationPresetId = typeof CONFIGURATION_PRESET_IDS[number]
export type TargetDeviceId = typeof TARGET_DEVICE_IDS[number]
export type CuratedAddonId = typeof CURATED_ADDON_IDS[number]
export type SourcePriorityId = typeof SOURCE_PRIORITY_IDS[number]
export type ResolutionId = typeof RESOLUTION_IDS[number]
export type QualityExcludedTag = typeof QUALITY_EXCLUDED_TAGS[number]
export type LanguageId = typeof LANGUAGE_IDS[number]
export type SubtitleVisibility = typeof SUBTITLE_VISIBILITY_IDS[number]
export type PlayerEngine = typeof PLAYER_ENGINE_IDS[number]
export type PlayerSelectionMode = typeof PLAYER_SELECTION_MODE_IDS[number]
export type AddonSubtitleStartup = typeof ADDON_SUBTITLE_STARTUP_IDS[number]
export type BufferProfile = typeof BUFFER_PROFILE_IDS[number]
export type HardwareDecodingMode = typeof HARDWARE_DECODING_IDS[number]
export type ThemePreference = typeof THEME_IDS[number]
export type HomeLayout = typeof HOME_LAYOUT_IDS[number]
export type CredentialServiceId = typeof CREDENTIAL_SERVICE_IDS[number]

export interface ConfigurationProfile {
  format: typeof CONFIGURATION_PROFILE_FORMAT
  version: typeof CONFIGURATION_PROFILE_VERSION
  name: string
  presetId?: ConfigurationPresetId
  targetDevice: TargetDeviceId
  addons: Array<{
    id: CuratedAddonId
    enabled: boolean
  }>
  sourcePriority: SourcePriorityId[]
  quality: {
    maxResolution: ResolutionId
    maxSizeGb: number
    preferHdr: boolean
    allowDolbyVision: boolean
    allowRemux: boolean
    excludedTags: QualityExcludedTag[]
  }
  languages: {
    primaryAudio: LanguageId
    secondaryAudio: LanguageId | 'none'
    primarySubtitle: LanguageId | 'none'
    secondarySubtitle: LanguageId | 'none'
    subtitleVisibility: SubtitleVisibility
    preferForced: boolean
    onlyPreferred: boolean
  }
  player: {
    engine: PlayerEngine
    selectionMode: PlayerSelectionMode
    autoPlayNext: boolean
    reuseLastLink: boolean
    addonSubtitleStartup: AddonSubtitleStartup
    bufferProfile: BufferProfile
    tunneledPlayback: boolean
    hardwareDecoding: HardwareDecodingMode
    useLibass: boolean
  }
  interface: {
    theme: ThemePreference
    homeLayout: HomeLayout
    contentWarnings: boolean
    hideSpoilers: boolean
    autoplayTrailers: boolean
  }
  credentials: CredentialServiceId[]
}

export type ConfigurationProfileV1 = ConfigurationProfile

export interface CuratedAddonDefinition {
  id: CuratedAddonId
  label: string
  description: string
  kind: 'metadata' | 'stream' | 'utility'
  configureUrl: string
  publicManifestUrl?: string
  credentialServices: readonly CredentialServiceId[]
}

/**
 * URLs live in this local, reviewed catalog and never in shared profile data.
 * A public manifest is present only where the manifest is fixed and keyless.
 */
export const ADDON_CATALOG: readonly CuratedAddonDefinition[] = [
  {
    id: 'cinemeta',
    label: 'Cinemeta',
    description: 'Keyless core movie and series metadata.',
    kind: 'metadata',
    configureUrl: 'https://v3-cinemeta.strem.io/',
    publicManifestUrl: 'https://v3-cinemeta.strem.io/manifest.json',
    credentialServices: []
  },
  {
    id: 'aiometadata',
    label: 'AIOMetadata',
    description: 'Configurable metadata aggregation for movies, series, and anime.',
    kind: 'metadata',
    configureUrl: 'https://aiometadata.elfhosted.com/configure',
    credentialServices: ['tmdb', 'tvdb']
  },
  {
    id: 'anime-kitsu',
    label: 'Anime Kitsu',
    description: 'Keyless anime metadata and catalogs.',
    kind: 'metadata',
    configureUrl: 'https://anime-kitsu.strem.fun/',
    publicManifestUrl: 'https://anime-kitsu.strem.fun/manifest.json',
    credentialServices: []
  },
  {
    id: 'aiostreams',
    label: 'AIOStreams',
    description: 'Configurable stream aggregation and filtering.',
    kind: 'stream',
    configureUrl: 'https://aiostreams.elfhosted.com/configure',
    credentialServices: ['torbox', 'premiumize', 'usenet-provider', 'usenet-indexer']
  },
  {
    id: 'torrentio',
    label: 'Torrentio',
    description: 'Configurable torrent scraper.',
    kind: 'stream',
    configureUrl: 'https://torrentio.strem.fun/',
    credentialServices: ['torbox', 'premiumize']
  },
  {
    id: 'comet',
    label: 'Comet',
    description: 'Configurable torrent and debrid stream addon.',
    kind: 'stream',
    configureUrl: 'https://comet.feels.legal/configure',
    credentialServices: ['torbox', 'premiumize']
  },
  {
    id: 'mediafusion',
    label: 'MediaFusion',
    description: 'Configurable stream and catalog addon.',
    kind: 'stream',
    configureUrl: 'https://mediafusionfortheweebs.midnightignite.me/app/configure',
    credentialServices: ['torbox', 'premiumize']
  },
  {
    id: 'stremthru',
    label: 'StremThru',
    description: 'Configurable stream routing utility.',
    kind: 'utility',
    configureUrl: 'https://stremthru.13377001.xyz/',
    credentialServices: ['torbox', 'premiumize']
  },
  {
    id: 'opensubtitles',
    label: 'OpenSubtitles PRO',
    description: 'Configurable subtitle addon with recipient-managed account setup.',
    kind: 'utility',
    configureUrl: 'https://opensubtitlesv3-pro.dexter21767.com/configure/',
    credentialServices: []
  }
]

export interface CredentialPlaceholderField {
  id: string
  label: string
  placeholder: string
  inputType: 'password' | 'text'
}

export interface CredentialPlaceholderDefinition {
  serviceId: CredentialServiceId
  label: string
  description: string
  fields: readonly CredentialPlaceholderField[]
}

/** Local prompts only. There is intentionally no value/defaultValue property. */
export const CREDENTIAL_CATALOG: readonly CredentialPlaceholderDefinition[] = [
  {
    serviceId: 'torbox',
    label: 'TorBox',
    description: 'Connect the recipient\'s own TorBox account.',
    fields: [
      { id: 'api-token', label: 'API token', placeholder: 'Enter your own TorBox API token', inputType: 'password' }
    ]
  },
  {
    serviceId: 'premiumize',
    label: 'Premiumize',
    description: 'Connect the recipient\'s own Premiumize account.',
    fields: [
      { id: 'api-key', label: 'API key', placeholder: 'Enter your own Premiumize API key', inputType: 'password' }
    ]
  },
  {
    serviceId: 'usenet-provider',
    label: 'Usenet provider',
    description: 'Enter credentials supplied by the recipient\'s provider.',
    fields: [
      { id: 'username', label: 'Username', placeholder: 'Enter your own provider username', inputType: 'text' },
      { id: 'password', label: 'Password', placeholder: 'Enter your own provider password', inputType: 'password' }
    ]
  },
  {
    serviceId: 'usenet-indexer',
    label: 'Usenet indexer',
    description: 'Enter the recipient\'s own indexer details.',
    fields: [
      { id: 'api-key', label: 'API key', placeholder: 'Enter your own indexer API key', inputType: 'password' }
    ]
  },
  {
    serviceId: 'tmdb',
    label: 'TMDB',
    description: 'Use the recipient\'s own TMDB credential.',
    fields: [
      { id: 'api-key', label: 'API key', placeholder: 'Enter your own TMDB API key', inputType: 'password' }
    ]
  },
  {
    serviceId: 'tvdb',
    label: 'TheTVDB',
    description: 'Use the recipient\'s own TheTVDB credential.',
    fields: [
      { id: 'api-key', label: 'API key', placeholder: 'Enter your own TheTVDB API key', inputType: 'password' }
    ]
  },
  {
    serviceId: 'anime-skip',
    label: 'Anime Skip',
    description: 'Use the recipient\'s own Anime Skip client ID.',
    fields: [
      { id: 'client-id', label: 'Client ID', placeholder: 'Enter your own Anime Skip client ID', inputType: 'password' }
    ]
  }
]

export interface ConfigurationPreset {
  id: ConfigurationPresetId
  label: string
  description: string
  profile: ConfigurationProfile
}

export interface ConfigurationProfileValidationSuccess {
  valid: true
  profile: ConfigurationProfile
  errors: readonly []
}

export interface ConfigurationProfileValidationFailure {
  valid: false
  errors: readonly string[]
}

export type ConfigurationProfileValidationResult =
  | ConfigurationProfileValidationSuccess
  | ConfigurationProfileValidationFailure

export interface SecretLikeStringFinding {
  path: string
  reason: string
}

export class ConfigurationProfileValidationError extends Error {
  readonly path: string

  constructor(path: string, message: string) {
    super(`${path}: ${message}`)
    this.name = 'ConfigurationProfileValidationError'
    this.path = path
  }
}

const TOP_LEVEL_KEYS = [
  'format',
  'version',
  'name',
  'presetId',
  'targetDevice',
  'addons',
  'sourcePriority',
  'quality',
  'languages',
  'player',
  'interface',
  'credentials'
] as const

const ADDON_KEYS = ['id', 'enabled'] as const
const QUALITY_KEYS = [
  'maxResolution',
  'maxSizeGb',
  'preferHdr',
  'allowDolbyVision',
  'allowRemux',
  'excludedTags'
] as const
const LANGUAGE_KEYS = [
  'primaryAudio',
  'secondaryAudio',
  'primarySubtitle',
  'secondarySubtitle',
  'subtitleVisibility',
  'preferForced',
  'onlyPreferred'
] as const
const PLAYER_KEYS = [
  'engine',
  'selectionMode',
  'autoPlayNext',
  'reuseLastLink',
  'addonSubtitleStartup',
  'bufferProfile',
  'tunneledPlayback',
  'hardwareDecoding',
  'useLibass'
] as const
const INTERFACE_KEYS = ['theme', 'homeLayout', 'contentWarnings', 'hideSpoilers', 'autoplayTrailers'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ConfigurationProfileValidationError(path, 'must be an object')
  return value
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  path: string
) {
  const allowedSet = new Set(allowed)
  const unknown = Object.keys(value).filter(key => !allowedSet.has(key))
  if (unknown.length) {
    throw new ConfigurationProfileValidationError(path, 'contains an unsupported field')
  }
  const missing = required.find(key => !Object.prototype.hasOwnProperty.call(value, key))
  if (missing) throw new ConfigurationProfileValidationError(path, `is missing ${JSON.stringify(missing)}`)
}

function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new ConfigurationProfileValidationError(path, 'must be a boolean')
  return value
}

function expectEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new ConfigurationProfileValidationError(path, `must be one of ${allowed.join(', ')}`)
  }
  return value as T
}

function expectOptionalLanguage(value: unknown, path: string): LanguageId | 'none' {
  return value === 'none' ? 'none' : expectEnum(value, LANGUAGE_IDS, path)
}

function expectEnumArray<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  options: { min?: number; max?: number } = {}
): T[] {
  if (!Array.isArray(value)) throw new ConfigurationProfileValidationError(path, 'must be an array')
  const min = options.min ?? 0
  const max = options.max ?? allowed.length
  if (value.length < min || value.length > max) {
    throw new ConfigurationProfileValidationError(path, `must contain between ${min} and ${max} items`)
  }

  const result = value.map((entry, index) => expectEnum(entry, allowed, `${path}[${index}]`))
  if (new Set(result).size !== result.length) {
    throw new ConfigurationProfileValidationError(path, 'must not contain duplicates')
  }
  return result
}

function secretReason(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (/(?:https?|stremio|magnet):\/\/|\bwww\./i.test(trimmed)) return 'URLs are not allowed in shared profile data'
  if (/\bbearer\s+[a-z0-9._~+/=-]+/i.test(trimmed)) return 'bearer credentials are not allowed'
  if (/\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b/i.test(trimmed)) return 'token-like values are not allowed'
  if (/\b(?:gh[pousr]_[a-z0-9]{20,}|sk-[a-z0-9_-]{16,}|AKIA[A-Z0-9]{16})\b/i.test(trimmed)) {
    return 'credential-like values are not allowed'
  }
  if (/\b(?:api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|secret|password|credential)\b\s*(?::|=|\bis\b)\s*\S+/i.test(trimmed)) {
    return 'labelled credential values are not allowed'
  }
  if (/[?&](?:api[-_]?key|token|secret|password|auth|signature)=/i.test(trimmed)) {
    return 'credential-bearing query values are not allowed'
  }
  if (/^[a-f0-9]{32,}$/i.test(trimmed)) return 'opaque hexadecimal values are not allowed'
  if (/^[a-z0-9]{24,}$/i.test(trimmed) && /[a-z]/i.test(trimmed) && /\d/.test(trimmed)) {
    return 'opaque mixed alphanumeric values are not allowed'
  }
  if (/^[a-z0-9+/_=-]{28,}$/i.test(trimmed)
    && /[a-z]/i.test(trimmed)
    && /\d/.test(trimmed)
    && /[+/_=-]/.test(trimmed)) {
    return 'opaque token-like values are not allowed'
  }
  return null
}

export function findSecretLikeString(value: unknown, path = '$'): SecretLikeStringFinding | null {
  if (typeof value === 'string') {
    const reason = secretReason(value)
    return reason ? { path, reason } : null
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      const finding = findSecretLikeString(value[index], `${path}[${index}]`)
      if (finding) return finding
    }
    return null
  }
  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      const keyReason = secretReason(key)
      if (keyReason) return { path: `${path}.${key}`, reason: keyReason }
      const finding = findSecretLikeString(entry, `${path}.${key}`)
      if (finding) return finding
    }
  }
  return null
}

export function assertNoSecretLikeStrings(value: unknown): void {
  const finding = findSecretLikeString(value)
  if (finding) throw new ConfigurationProfileValidationError(finding.path, finding.reason)
}

export function normalizeConfigurationProfile(value: unknown): ConfigurationProfile {
  const input = expectRecord(value, '$')
  assertExactKeys(
    input,
    TOP_LEVEL_KEYS,
    TOP_LEVEL_KEYS.filter(key => key !== 'presetId'),
    '$'
  )

  if (input.format !== CONFIGURATION_PROFILE_FORMAT) {
    throw new ConfigurationProfileValidationError('$.format', `must be ${CONFIGURATION_PROFILE_FORMAT}`)
  }
  if (input.version !== CONFIGURATION_PROFILE_VERSION) {
    throw new ConfigurationProfileValidationError('$.version', `must be ${CONFIGURATION_PROFILE_VERSION}`)
  }

  if (typeof input.name !== 'string') {
    throw new ConfigurationProfileValidationError('$.name', 'must be a string')
  }
  const name = input.name.trim()
  if (!name || Array.from(name).length > 60) {
    throw new ConfigurationProfileValidationError('$.name', 'must contain 1 to 60 characters')
  }
  const nameSecretFinding = findSecretLikeString(name, '$.name')
  if (nameSecretFinding) {
    throw new ConfigurationProfileValidationError(nameSecretFinding.path, nameSecretFinding.reason)
  }
  if (!/^[\p{L}\p{N} .,'’()+&_-]+$/u.test(name)) {
    throw new ConfigurationProfileValidationError(
      '$.name',
      'may contain only letters, numbers, spaces, and . , \' ’ ( ) + & _ -'
    )
  }

  const addonsValue = input.addons
  if (!Array.isArray(addonsValue)) throw new ConfigurationProfileValidationError('$.addons', 'must be an array')
  if (addonsValue.length > CURATED_ADDON_IDS.length) {
    throw new ConfigurationProfileValidationError('$.addons', `must contain at most ${CURATED_ADDON_IDS.length} items`)
  }
  const addons = addonsValue.map((entry, index) => {
    const addon = expectRecord(entry, `$.addons[${index}]`)
    assertExactKeys(addon, ADDON_KEYS, ADDON_KEYS, `$.addons[${index}]`)
    return {
      id: expectEnum(addon.id, CURATED_ADDON_IDS, `$.addons[${index}].id`),
      enabled: expectBoolean(addon.enabled, `$.addons[${index}].enabled`)
    }
  })
  if (new Set(addons.map(addon => addon.id)).size !== addons.length) {
    throw new ConfigurationProfileValidationError('$.addons', 'must not contain duplicate addon IDs')
  }

  const quality = expectRecord(input.quality, '$.quality')
  assertExactKeys(quality, QUALITY_KEYS, QUALITY_KEYS, '$.quality')
  if (typeof quality.maxSizeGb !== 'number'
    || !Number.isFinite(quality.maxSizeGb)
    || quality.maxSizeGb < 0.25
    || quality.maxSizeGb > 500) {
    throw new ConfigurationProfileValidationError('$.quality.maxSizeGb', 'must be a finite number from 0.25 to 500')
  }

  const languages = expectRecord(input.languages, '$.languages')
  assertExactKeys(languages, LANGUAGE_KEYS, LANGUAGE_KEYS, '$.languages')

  const player = expectRecord(input.player, '$.player')
  assertExactKeys(player, PLAYER_KEYS, PLAYER_KEYS, '$.player')

  const interfaceSettings = expectRecord(input.interface, '$.interface')
  assertExactKeys(interfaceSettings, INTERFACE_KEYS, INTERFACE_KEYS, '$.interface')

  const profile: ConfigurationProfile = {
    format: CONFIGURATION_PROFILE_FORMAT,
    version: CONFIGURATION_PROFILE_VERSION,
    name,
    ...(input.presetId === undefined
      ? {}
      : { presetId: expectEnum(input.presetId, CONFIGURATION_PRESET_IDS, '$.presetId') }),
    targetDevice: expectEnum(input.targetDevice, TARGET_DEVICE_IDS, '$.targetDevice'),
    addons,
    sourcePriority: expectEnumArray(input.sourcePriority, SOURCE_PRIORITY_IDS, '$.sourcePriority', { min: 1 }),
    quality: {
      maxResolution: expectEnum(quality.maxResolution, RESOLUTION_IDS, '$.quality.maxResolution'),
      maxSizeGb: quality.maxSizeGb,
      preferHdr: expectBoolean(quality.preferHdr, '$.quality.preferHdr'),
      allowDolbyVision: expectBoolean(quality.allowDolbyVision, '$.quality.allowDolbyVision'),
      allowRemux: expectBoolean(quality.allowRemux, '$.quality.allowRemux'),
      excludedTags: expectEnumArray(quality.excludedTags, QUALITY_EXCLUDED_TAGS, '$.quality.excludedTags')
    },
    languages: {
      primaryAudio: expectEnum(languages.primaryAudio, LANGUAGE_IDS, '$.languages.primaryAudio'),
      secondaryAudio: expectOptionalLanguage(languages.secondaryAudio, '$.languages.secondaryAudio'),
      primarySubtitle: expectOptionalLanguage(languages.primarySubtitle, '$.languages.primarySubtitle'),
      secondarySubtitle: expectOptionalLanguage(languages.secondarySubtitle, '$.languages.secondarySubtitle'),
      subtitleVisibility: expectEnum(
        languages.subtitleVisibility,
        SUBTITLE_VISIBILITY_IDS,
        '$.languages.subtitleVisibility'
      ),
      preferForced: expectBoolean(languages.preferForced, '$.languages.preferForced'),
      onlyPreferred: expectBoolean(languages.onlyPreferred, '$.languages.onlyPreferred')
    },
    player: {
      engine: expectEnum(player.engine, PLAYER_ENGINE_IDS, '$.player.engine'),
      selectionMode: expectEnum(player.selectionMode, PLAYER_SELECTION_MODE_IDS, '$.player.selectionMode'),
      autoPlayNext: expectBoolean(player.autoPlayNext, '$.player.autoPlayNext'),
      reuseLastLink: expectBoolean(player.reuseLastLink, '$.player.reuseLastLink'),
      addonSubtitleStartup: expectEnum(
        player.addonSubtitleStartup,
        ADDON_SUBTITLE_STARTUP_IDS,
        '$.player.addonSubtitleStartup'
      ),
      bufferProfile: expectEnum(player.bufferProfile, BUFFER_PROFILE_IDS, '$.player.bufferProfile'),
      tunneledPlayback: expectBoolean(player.tunneledPlayback, '$.player.tunneledPlayback'),
      hardwareDecoding: expectEnum(
        player.hardwareDecoding,
        HARDWARE_DECODING_IDS,
        '$.player.hardwareDecoding'
      ),
      useLibass: expectBoolean(player.useLibass, '$.player.useLibass')
    },
    interface: {
      theme: expectEnum(interfaceSettings.theme, THEME_IDS, '$.interface.theme'),
      homeLayout: expectEnum(interfaceSettings.homeLayout, HOME_LAYOUT_IDS, '$.interface.homeLayout'),
      contentWarnings: expectBoolean(interfaceSettings.contentWarnings, '$.interface.contentWarnings'),
      hideSpoilers: expectBoolean(interfaceSettings.hideSpoilers, '$.interface.hideSpoilers'),
      autoplayTrailers: expectBoolean(interfaceSettings.autoplayTrailers, '$.interface.autoplayTrailers')
    },
    credentials: expectEnumArray(input.credentials, CREDENTIAL_SERVICE_IDS, '$.credentials')
  }

  assertNoSecretLikeStrings(profile)
  return profile
}

export function validateConfigurationProfile(value: unknown): ConfigurationProfileValidationResult {
  try {
    return { valid: true, profile: normalizeConfigurationProfile(value), errors: [] }
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : 'The configuration profile is invalid.']
    }
  }
}

export function createDefaultConfigurationProfile(name = 'Custom setup'): ConfigurationProfile {
  return normalizeConfigurationProfile({
    format: CONFIGURATION_PROFILE_FORMAT,
    version: CONFIGURATION_PROFILE_VERSION,
    name,
    targetDevice: 'universal',
    addons: [],
    sourcePriority: ['debrid', 'p2p', 'direct'],
    quality: {
      maxResolution: '1080p',
      maxSizeGb: 20,
      preferHdr: false,
      allowDolbyVision: false,
      allowRemux: false,
      excludedTags: ['cam', 'telesync', 'screener']
    },
    languages: {
      primaryAudio: 'original',
      secondaryAudio: 'en',
      primarySubtitle: 'en',
      secondarySubtitle: 'none',
      subtitleVisibility: 'automatic',
      preferForced: true,
      onlyPreferred: false
    },
    player: {
      engine: 'auto',
      selectionMode: 'automatic',
      autoPlayNext: true,
      reuseLastLink: true,
      addonSubtitleStartup: 'preferred',
      bufferProfile: 'balanced',
      tunneledPlayback: false,
      hardwareDecoding: 'auto',
      useLibass: false
    },
    interface: {
      theme: 'system',
      homeLayout: 'balanced',
      contentWarnings: false,
      hideSpoilers: true,
      autoplayTrailers: false
    },
    credentials: []
  })
}

function preset(
  id: ConfigurationPresetId,
  label: string,
  description: string,
  profile: Omit<ConfigurationProfile, 'format' | 'version' | 'presetId'>
): ConfigurationPreset {
  return {
    id,
    label,
    description,
    profile: normalizeConfigurationProfile({
      format: CONFIGURATION_PROFILE_FORMAT,
      version: CONFIGURATION_PROFILE_VERSION,
      presetId: id,
      ...profile
    })
  }
}

const base = createDefaultConfigurationProfile()

export const CONFIGURATION_PRESETS: readonly ConfigurationPreset[] = [
  preset('android-tv', 'Android TV', 'Balanced playback and a TV-friendly home layout.', {
    ...base,
    name: 'Android TV',
    targetDevice: 'android-tv',
    addons: [
      { id: 'cinemeta', enabled: true },
      { id: 'aiometadata', enabled: true },
      { id: 'aiostreams', enabled: true }
    ],
    quality: { ...base.quality, maxResolution: '2160p', maxSizeGb: 60, preferHdr: true, allowDolbyVision: true },
    player: { ...base.player, engine: 'exoplayer', bufferProfile: 'high-bitrate', hardwareDecoding: 'hardware' },
    interface: { ...base.interface, homeLayout: 'cinematic' }
  }),
  preset('torbox', 'TorBox', 'Debrid-first sources with a recipient-supplied TorBox credential.', {
    ...base,
    name: 'TorBox',
    targetDevice: 'universal',
    addons: [
      { id: 'cinemeta', enabled: true },
      { id: 'aiostreams', enabled: true },
      { id: 'comet', enabled: true }
    ],
    sourcePriority: ['debrid', 'p2p', 'direct'],
    credentials: ['torbox']
  }),
  preset('usenet-first', 'Usenet-first', 'Prefer Usenet, then debrid and peer-to-peer fallbacks.', {
    ...base,
    name: 'Usenet-first',
    targetDevice: 'universal',
    addons: [
      { id: 'cinemeta', enabled: true },
      { id: 'aiostreams', enabled: true },
      { id: 'stremthru', enabled: true }
    ],
    sourcePriority: ['usenet', 'debrid', 'p2p', 'direct'],
    credentials: ['usenet-provider', 'usenet-indexer']
  }),
  preset('anime', 'Anime', 'Japanese audio, styled subtitles, and anime-focused metadata.', {
    ...base,
    name: 'Anime',
    targetDevice: 'android-tv',
    addons: [
      { id: 'anime-kitsu', enabled: true },
      { id: 'aiometadata', enabled: true },
      { id: 'aiostreams', enabled: true },
      { id: 'opensubtitles', enabled: true }
    ],
    quality: { ...base.quality, maxSizeGb: 30, excludedTags: ['cam', 'telesync', 'screener', 'dubbed'] },
    languages: {
      ...base.languages,
      primaryAudio: 'ja',
      secondaryAudio: 'original',
      primarySubtitle: 'en',
      subtitleVisibility: 'always',
      preferForced: false,
      onlyPreferred: true
    },
    player: {
      ...base.player,
      engine: 'mpv',
      addonSubtitleStartup: 'preferred',
      hardwareDecoding: 'hardware-copy',
      useLibass: true
    },
    credentials: ['anime-skip']
  }),
  preset('dutch', 'Dutch', 'Dutch audio and subtitles with English fallbacks.', {
    ...base,
    name: 'Dutch',
    targetDevice: 'universal',
    addons: [
      { id: 'cinemeta', enabled: true },
      { id: 'aiometadata', enabled: true },
      { id: 'aiostreams', enabled: true },
      { id: 'opensubtitles', enabled: true }
    ],
    languages: {
      ...base.languages,
      primaryAudio: 'nl',
      secondaryAudio: 'en',
      primarySubtitle: 'nl',
      secondarySubtitle: 'en',
      subtitleVisibility: 'automatic',
      onlyPreferred: true
    }
  }),
  preset('low-bandwidth', 'Low-bandwidth', 'Smaller 720p sources and conservative buffering.', {
    ...base,
    name: 'Low-bandwidth',
    targetDevice: 'android-mobile',
    addons: [
      { id: 'cinemeta', enabled: true },
      { id: 'aiostreams', enabled: true }
    ],
    sourcePriority: ['direct', 'debrid', 'p2p'],
    quality: {
      ...base.quality,
      maxResolution: '720p',
      maxSizeGb: 4,
      preferHdr: false,
      allowDolbyVision: false,
      allowRemux: false,
      excludedTags: ['cam', 'telesync', 'screener', '3d', 'hdr', 'dolby-vision', 'remux']
    },
    player: {
      ...base.player,
      addonSubtitleStartup: 'fast',
      bufferProfile: 'low-memory',
      hardwareDecoding: 'hardware'
    },
    interface: { ...base.interface, homeLayout: 'compact', autoplayTrailers: false }
  }),
  preset('4k-remux', '4K remux', 'High-bitrate 4K, HDR, Dolby Vision, and remux playback.', {
    ...base,
    name: '4K remux',
    targetDevice: 'android-tv',
    addons: [
      { id: 'cinemeta', enabled: true },
      { id: 'aiometadata', enabled: true },
      { id: 'aiostreams', enabled: true },
      { id: 'comet', enabled: true }
    ],
    sourcePriority: ['debrid', 'usenet', 'p2p', 'direct'],
    quality: {
      ...base.quality,
      maxResolution: '2160p',
      maxSizeGb: 200,
      preferHdr: true,
      allowDolbyVision: true,
      allowRemux: true,
      excludedTags: ['cam', 'telesync', 'screener', 'low-seeders']
    },
    player: {
      ...base.player,
      engine: 'exoplayer',
      selectionMode: 'ask',
      addonSubtitleStartup: 'all',
      bufferProfile: 'remux',
      tunneledPlayback: true,
      hardwareDecoding: 'hardware'
    },
    interface: { ...base.interface, homeLayout: 'cinematic' },
    credentials: ['torbox']
  }),
  preset('family-friendly', 'Family-friendly', 'Warnings, spoiler protection, and restrained autoplay.', {
    ...base,
    name: 'Family-friendly',
    targetDevice: 'universal',
    addons: [
      { id: 'cinemeta', enabled: true },
      { id: 'aiometadata', enabled: true },
      { id: 'aiostreams', enabled: true },
      { id: 'opensubtitles', enabled: true }
    ],
    player: { ...base.player, selectionMode: 'ask', autoPlayNext: false, reuseLastLink: false },
    interface: {
      ...base.interface,
      homeLayout: 'family',
      contentWarnings: true,
      hideSpoilers: true,
      autoplayTrailers: false
    }
  })
]

export function createConfigurationProfileFromPreset(id: ConfigurationPresetId): ConfigurationProfile {
  const entry = CONFIGURATION_PRESETS.find(candidate => candidate.id === id)
  if (!entry) throw new ConfigurationProfileValidationError('$.presetId', 'is not a known preset')
  return normalizeConfigurationProfile(entry.profile)
}

export function serializeConfigurationProfile(value: unknown): string {
  return `${JSON.stringify(normalizeConfigurationProfile(value), null, 2)}\n`
}

export interface ConfigurationProfileDownload {
  filename: string
  mimeType: 'application/json'
  contents: string
}

export function createConfigurationProfileDownload(value: unknown): ConfigurationProfileDownload {
  const profile = normalizeConfigurationProfile(value)
  const slug = profile.name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'configuration'
  return {
    filename: `nuvio-${slug}.json`,
    mimeType: 'application/json',
    contents: serializeConfigurationProfile(profile)
  }
}

export function getCredentialPlaceholders(
  profileOrServiceIds: ConfigurationProfile | readonly CredentialServiceId[]
): CredentialPlaceholderDefinition[] {
  const ids = Array.isArray(profileOrServiceIds)
    ? profileOrServiceIds
    : normalizeConfigurationProfile(profileOrServiceIds).credentials
  const selected = new Set(ids)
  return CREDENTIAL_CATALOG
    .filter(entry => selected.has(entry.serviceId))
    .map(entry => ({
      ...entry,
      fields: entry.fields.map(field => ({ ...field }))
    }))
}

const ADDON_NAME_ALIASES: Readonly<Record<CuratedAddonId, readonly string[]>> = {
  cinemeta: ['cinemeta', 'cinemeta v3'],
  aiometadata: ['aiometadata', 'aio metadata'],
  'anime-kitsu': ['anime kitsu', 'kitsu anime', 'kitsu'],
  aiostreams: ['aiostreams', 'aio streams'],
  torrentio: ['torrentio'],
  comet: ['comet'],
  mediafusion: ['mediafusion', 'media fusion'],
  stremthru: ['stremthru', 'strem thru'],
  opensubtitles: ['opensubtitles', 'open subtitles', 'opensubtitles pro', 'open subtitles pro']
}

function addonIdFromPrivateName(value: unknown): CuratedAddonId | null {
  if (typeof value !== 'string') return null
  const normalized = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  if (!normalized) return null

  for (const id of CURATED_ADDON_IDS) {
    if (ADDON_NAME_ALIASES[id].some(alias => (
      normalized === alias
      || normalized.startsWith(`${alias} `)
      || normalized.endsWith(` ${alias}`)
    ))) return id
  }
  return null
}

export interface ProfileTransferSeedOptions {
  name?: string
  targetDevice?: TargetDeviceId
}

/**
 * Seeds only curated addon IDs from private addon names in their original order.
 * URLs, enabled flags, profile names, settings blobs, and every other backup field
 * are deliberately ignored, even if they contain credentials.
 */
export function configurationProfileFromTransferBackup(
  backup: unknown,
  options: ProfileTransferSeedOptions = {}
): ConfigurationProfile {
  const input = expectRecord(backup, '$backup')
  if (input.format !== 'nuvio-profile-export' || input.version !== 1) {
    throw new ConfigurationProfileValidationError('$backup', 'must be a version-1 Nuvio profile export')
  }

  const data = isRecord(input.data) ? input.data : {}
  const privateAddons = Array.isArray(data.addons) ? data.addons : []
  const seen = new Set<CuratedAddonId>()
  const addons: ConfigurationProfile['addons'] = []

  for (const entry of privateAddons) {
    if (!isRecord(entry)) continue
    const id = addonIdFromPrivateName(entry.name)
    if (!id || seen.has(id)) continue
    seen.add(id)
    addons.push({ id, enabled: true })
  }

  const seeded = createDefaultConfigurationProfile(options.name ?? 'Imported configuration')
  seeded.targetDevice = options.targetDevice ?? 'universal'
  seeded.addons = addons
  return normalizeConfigurationProfile(seeded)
}

export const seedConfigurationProfileFromTransferBackup = configurationProfileFromTransferBackup
