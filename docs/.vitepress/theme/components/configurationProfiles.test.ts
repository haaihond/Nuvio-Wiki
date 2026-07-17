import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ADDON_CATALOG,
  CONFIGURATION_PRESET_IDS,
  CONFIGURATION_PRESETS,
  CREDENTIAL_CATALOG,
  CREDENTIAL_SERVICE_IDS,
  ConfigurationProfileValidationError,
  createConfigurationProfileDownload,
  createConfigurationProfileFromPreset,
  createDefaultConfigurationProfile,
  findSecretLikeString,
  getCredentialPlaceholders,
  normalizeConfigurationProfile,
  serializeConfigurationProfile,
  configurationProfileFromTransferBackup,
  validateConfigurationProfile
} from './configurationProfiles.ts'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

test('default profile normalizes to the strict version-1 allowlist shape', () => {
  const profile = createDefaultConfigurationProfile('  Living room  ')

  assert.equal(profile.format, 'nuvio-configuration-profile')
  assert.equal(profile.version, 1)
  assert.equal(profile.name, 'Living room')
  assert.deepEqual(Object.keys(profile), [
    'format',
    'version',
    'name',
    'targetDevice',
    'addons',
    'sourcePriority',
    'quality',
    'languages',
    'player',
    'interface',
    'credentials'
  ])
  assert.equal(validateConfigurationProfile(profile).valid, true)
  assert.equal(normalizeConfigurationProfile({ ...profile, targetDevice: 'ios' }).targetDevice, 'ios')
})

test('all eight editable presets are present, valid, and independently cloned', () => {
  assert.deepEqual(CONFIGURATION_PRESETS.map(preset => preset.id), CONFIGURATION_PRESET_IDS)
  assert.equal(CONFIGURATION_PRESETS.length, 8)

  for (const preset of CONFIGURATION_PRESETS) {
    const result = validateConfigurationProfile(preset.profile)
    assert.equal(result.valid, true, `${preset.id} should be valid`)
    assert.equal(preset.profile.presetId, preset.id)
  }

  const first = createConfigurationProfileFromPreset('android-tv')
  const second = createConfigurationProfileFromPreset('android-tv')
  first.name = 'Edited locally'
  first.addons.reverse()

  assert.equal(second.name, 'Android TV')
  assert.deepEqual(second.addons.map(addon => addon.id), ['cinemeta', 'aiometadata', 'aiostreams'])
  assert.equal(CONFIGURATION_PRESETS[0].profile.name, 'Android TV')
})

test('addon and source ordering survive normalization and JSON serialization', () => {
  const profile = createDefaultConfigurationProfile('Ordered setup')
  profile.addons = [
    { id: 'comet', enabled: true },
    { id: 'aiostreams', enabled: false },
    { id: 'cinemeta', enabled: true }
  ]
  profile.sourcePriority = ['usenet', 'direct', 'debrid', 'p2p']

  const normalized = normalizeConfigurationProfile(profile)
  const serialized = JSON.parse(serializeConfigurationProfile(normalized))

  assert.deepEqual(normalized.addons.map(addon => addon.id), ['comet', 'aiostreams', 'cinemeta'])
  assert.deepEqual(serialized.addons.map((addon: { id: string }) => addon.id), ['comet', 'aiostreams', 'cinemeta'])
  assert.deepEqual(serialized.sourcePriority, ['usenet', 'direct', 'debrid', 'p2p'])
})

test('strict validation rejects unknown fields, arbitrary URLs, and uncurated IDs', () => {
  const profile = createDefaultConfigurationProfile()

  assert.throws(
    () => normalizeConfigurationProfile({ ...profile, apiKey: 'not-even-needed' }),
    /unsupported field/
  )
  assert.throws(
    () => normalizeConfigurationProfile({
      ...profile,
      quality: { ...profile.quality, customFilter: 'anything' }
    }),
    /unsupported field/
  )
  assert.throws(
    () => normalizeConfigurationProfile({ ...profile, name: 'https:\/\/example.com\/configured\/manifest.json' }),
    /URLs are not allowed/
  )
  assert.throws(
    () => normalizeConfigurationProfile({
      ...profile,
      addons: [{ id: 'https://example.com/manifest.json', enabled: true }]
    }),
    /must be one of/
  )
})

test('secret-like strings are rejected without reflecting the secret value', () => {
  const secretSamples = [
    'Bearer abcdefghijklmnopqrstuvwxyz123456',
    'api_key=super-sensitive-value',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop',
    '0123456789abcdef0123456789abcdef',
    'mixedAlphaNumericToken12345',
    'sk-abcdefghijklmnopqrstuvwxyz123456'
  ]

  for (const secret of secretSamples) {
    const finding = findSecretLikeString({ nested: { value: secret } })
    assert.ok(finding, `expected a secret finding for ${secret.slice(0, 4)}`)
    assert.equal(finding.path, '$.nested.value')

    const profile = createDefaultConfigurationProfile()
    assert.throws(
      () => normalizeConfigurationProfile({ ...profile, name: secret }),
      error => {
        assert.ok(error instanceof ConfigurationProfileValidationError)
        assert.equal(error.message.includes(secret), false)
        return true
      }
    )
  }
})

test('credentials serialize as service IDs and resolve to placeholder-only local metadata', () => {
  const profile = createDefaultConfigurationProfile('Credential placeholders')
  profile.credentials = ['torbox', 'usenet-provider']

  const serialized = serializeConfigurationProfile(profile)
  const parsed = JSON.parse(serialized)
  assert.deepEqual(parsed.credentials, ['torbox', 'usenet-provider'])
  assert.equal(serialized.includes('api-token'), false)
  assert.equal(serialized.includes('Enter your own'), false)
  assert.equal(serialized.includes('value'), false)

  const placeholders = getCredentialPlaceholders(profile)
  assert.deepEqual(placeholders.map(entry => entry.serviceId), ['torbox', 'usenet-provider'])
  for (const entry of placeholders) {
    for (const field of entry.fields) {
      assert.match(field.placeholder, /^Enter your own /)
      assert.equal(Object.prototype.hasOwnProperty.call(field, 'value'), false)
      assert.equal(Object.prototype.hasOwnProperty.call(field, 'defaultValue'), false)
    }
  }

  assert.throws(
    () => normalizeConfigurationProfile({
      ...profile,
      credentials: [{ serviceId: 'torbox', value: 'secret' }]
    }),
    /must be one of/
  )
})

test('every credential ID has fixed placeholder metadata and every preset uses IDs only', () => {
  assert.deepEqual(CREDENTIAL_CATALOG.map(entry => entry.serviceId), CREDENTIAL_SERVICE_IDS)
  assert.equal(new Set(CREDENTIAL_CATALOG.map(entry => entry.serviceId)).size, CREDENTIAL_CATALOG.length)

  for (const preset of CONFIGURATION_PRESETS) {
    assert.ok(preset.profile.credentials.every(id => CREDENTIAL_SERVICE_IDS.includes(id)))
    const json = JSON.stringify(preset.profile)
    assert.equal(json.includes('apiKey'), false)
    assert.equal(json.includes('access_token'), false)
    assert.equal(json.includes('refresh_token'), false)
  }
})

test('addon catalog URLs are fixed HTTPS metadata and never enter serialized profiles', () => {
  assert.equal(new Set(ADDON_CATALOG.map(addon => addon.id)).size, ADDON_CATALOG.length)

  for (const addon of ADDON_CATALOG) {
    const configureUrl = new URL(addon.configureUrl)
    assert.equal(configureUrl.protocol, 'https:')
    assert.equal(configureUrl.username, '')
    assert.equal(configureUrl.password, '')
    assert.equal(configureUrl.search, '')
    assert.equal(configureUrl.hash, '')

    if (addon.publicManifestUrl) {
      const manifestUrl = new URL(addon.publicManifestUrl)
      assert.equal(manifestUrl.protocol, 'https:')
      assert.equal(manifestUrl.search, '')
      assert.match(manifestUrl.pathname, /\/manifest\.json$/)
      assert.ok(addon.id === 'cinemeta' || addon.id === 'anime-kitsu')
    }
  }

  const serialized = serializeConfigurationProfile(createConfigurationProfileFromPreset('anime'))
  assert.equal(serialized.includes('configureUrl'), false)
  assert.equal(serialized.includes('manifest.json'), false)
  assert.equal(serialized.includes('https://'), false)
})

test('private Profile Transfer seeding copies known addon names and order only', () => {
  const privateBackup = {
    format: 'nuvio-profile-export',
    version: 1,
    source: {
      profileName: 'Private Person',
      access_token: 'source-secret-should-never-copy'
    },
    data: {
      addons: [
        {
          name: 'Comet',
          enabled: false,
          sort_order: 9,
          url: 'https://comet.example/secret-user-key/manifest.json?token=url-secret'
        },
        {
          name: 'AIOStreams | private instance',
          enabled: false,
          url: 'https://private.example/eyJhbGciOiJIUzI1NiJ9/manifest.json'
        },
        { name: 'Unknown secret addon', url: 'https://private.invalid/token-value' },
        { name: 'Cinemeta v3', enabled: false, url: 'https://safe.example/manifest.json' },
        { name: 'OpenSubtitles PRO', url: 'https://subtitle.example/private-token/manifest.json' },
        { name: 'Comet duplicate', url: 'https://another-secret.invalid/manifest.json' }
      ],
      profileSettings: [{
        platform: 'tv',
        settings: { apiKey: 'settings-secret', endpoint: 'https://private.example' }
      }],
      homeCatalogSettings: [{ settings: { password: 'catalog-secret' } }],
      collections: [{ url: 'https://private.example/collection?key=secret' }]
    }
  }
  const before = clone(privateBackup)

  const seeded = configurationProfileFromTransferBackup(privateBackup, {
    name: 'Seeded safely',
    targetDevice: 'android-tv'
  })
  const serialized = serializeConfigurationProfile(seeded)

  assert.deepEqual(seeded.addons, [
    { id: 'comet', enabled: true },
    { id: 'aiostreams', enabled: true },
    { id: 'cinemeta', enabled: true },
    { id: 'opensubtitles', enabled: true }
  ])
  assert.equal(seeded.name, 'Seeded safely')
  assert.equal(seeded.targetDevice, 'android-tv')
  assert.deepEqual(privateBackup, before)

  for (const leakedValue of [
    'Private Person',
    'source-secret-should-never-copy',
    'url-secret',
    'settings-secret',
    'catalog-secret',
    'private.example',
    'sort_order'
  ]) {
    assert.equal(serialized.includes(leakedValue), false, `${leakedValue} must not leak`)
  }
})

test('private backup seed rejects other formats and ignores non-record addon entries', () => {
  assert.throws(
    () => configurationProfileFromTransferBackup({ format: 'nuvio-configuration-profile', version: 1 }),
    /must be a version-1 Nuvio profile export/
  )

  const seeded = configurationProfileFromTransferBackup({
    format: 'nuvio-profile-export',
    version: 1,
    data: { addons: [null, 'AIOStreams', 42, { name: 'Torrentio' }] }
  })
  assert.deepEqual(seeded.addons, [{ id: 'torrentio', enabled: true }])
})

test('download serialization is normalized, deterministic, and filename-safe', () => {
  const profile = createDefaultConfigurationProfile('  TV Bedroom (4K)  ')
  const download = createConfigurationProfileDownload(profile)

  assert.equal(download.filename, 'nuvio-tv-bedroom-4k.json')
  assert.equal(download.mimeType, 'application/json')
  assert.equal(download.contents.endsWith('\n'), true)
  assert.deepEqual(JSON.parse(download.contents), normalizeConfigurationProfile(profile))
})

test('profile names are short plain labels without controls or HTML punctuation', () => {
  const profile = createDefaultConfigurationProfile()
  assert.equal(normalizeConfigurationProfile({ ...profile, name: "Familie’s TV + Kids_2" }).name,
    "Familie’s TV + Kids_2")
  assert.equal(normalizeConfigurationProfile({ ...profile, name: '日本語 リビング' }).name,
    '日本語 リビング')

  for (const name of [
    'x'.repeat(61),
    '<script>alert(1)</script>',
    'Line one\nLine two',
    'Bedroom: private',
    'Setup / bedroom',
    'TV 🔑'
  ]) {
    assert.throws(() => normalizeConfigurationProfile({ ...profile, name }), /\$\.name/)
  }
})

test('validation reports malformed bounds, duplicate ordered IDs, and invalid nested values', () => {
  const profile = createDefaultConfigurationProfile()

  assert.equal(validateConfigurationProfile({ ...profile, quality: { ...profile.quality, maxSizeGb: 0 } }).valid, false)
  assert.equal(validateConfigurationProfile({
    ...profile,
    addons: [
      { id: 'cinemeta', enabled: true },
      { id: 'cinemeta', enabled: false }
    ]
  }).valid, false)
  assert.equal(validateConfigurationProfile({
    ...profile,
    sourcePriority: ['debrid', 'debrid']
  }).valid, false)
  assert.equal(validateConfigurationProfile({
    ...profile,
    player: { ...profile.player, bufferProfile: 'unbounded' }
  }).valid, false)
  assert.equal(validateConfigurationProfile({
    ...profile,
    player: { ...profile.player, addonSubtitleStartup: true }
  }).valid, false)
})

test('subtitle startup modes and OpenSubtitles preset ordering use curated IDs', () => {
  assert.deepEqual(
    createConfigurationProfileFromPreset('anime').addons.map(addon => addon.id),
    ['anime-kitsu', 'aiometadata', 'aiostreams', 'opensubtitles']
  )
  assert.deepEqual(
    createConfigurationProfileFromPreset('dutch').addons.map(addon => addon.id),
    ['cinemeta', 'aiometadata', 'aiostreams', 'opensubtitles']
  )
  assert.deepEqual(
    createConfigurationProfileFromPreset('family-friendly').addons.map(addon => addon.id),
    ['cinemeta', 'aiometadata', 'aiostreams', 'opensubtitles']
  )
  assert.equal(createConfigurationProfileFromPreset('low-bandwidth').player.addonSubtitleStartup, 'fast')
  assert.equal(createConfigurationProfileFromPreset('4k-remux').player.addonSubtitleStartup, 'all')
  assert.equal(ADDON_CATALOG.find(addon => addon.id === 'opensubtitles')?.configureUrl,
    'https://opensubtitlesv3-pro.dexter21767.com/configure/')

  const seeded = configurationProfileFromTransferBackup({
    format: 'nuvio-profile-export',
    version: 1,
    data: { addons: [{ name: 'Open Subtitles PRO configured', url: 'https://secret.invalid/key' }] }
  })
  assert.deepEqual(seeded.addons, [{ id: 'opensubtitles', enabled: true }])
})
