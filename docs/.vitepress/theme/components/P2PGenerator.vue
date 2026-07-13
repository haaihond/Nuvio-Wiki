<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'

// ---------------------------------------------------------------------------
// TAMS template resolution engine (browser port of template.ts)
// ---------------------------------------------------------------------------

const TEMPLATE_URL =
  'https://raw.githubusercontent.com/Tam-Taro/SEL-Filtering-and-Sorting/main/AIOStreams%20Templates/Tamtaro-complete-setup-template.json'
const TEMPLATE_CACHE_KEY = 'nuvio:tams-template:v1'
const TEMPLATE_CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours
const DEFAULT_INSTANCE_URL = 'https://aiostreamsfortheweebsstable.midnightignite.me'

const REMOVE = Symbol('remove')

function getNestedValue(values, key) {
  return key.split('.').reduce((value, part) => {
    if (value && typeof value === 'object') return value[part]
    return undefined
  }, values)
}

function evaluateCondition(condition, inputValues, services) {
  const expression = condition.trim()
  const orParts = expression.split(/ or (?=!?(?:inputs|services)\b)/)
  if (orParts.length > 1)
    return orParts.some((p) => evaluateCondition(p, inputValues, services))
  const xorParts = expression.split(/ xor (?=!?(?:inputs|services)\b)/)
  if (xorParts.length > 1)
    return xorParts.filter((p) => evaluateCondition(p, inputValues, services)).length % 2 === 1
  const andParts = expression.split(/ and (?=!?(?:inputs|services)\b)/)
  if (andParts.length > 1)
    return andParts.every((p) => evaluateCondition(p, inputValues, services))
  const negated = expression.startsWith('!')
  const valueExpression = negated ? expression.slice(1).trim() : expression
  const numericMatch = valueExpression.match(/^(\w+)\.(.+?)\s+(>=|<=|>|<)\s+(-?\d+(?:\.\d+)?)$/)
  if (numericMatch) {
    const [, namespace, key, operator, rawRight] = numericMatch
    const left = getNestedValue(inputValues, key)
    const leftNumber = typeof left === 'number' ? left : parseFloat(String(left ?? ''))
    const rightNumber = parseFloat(rawRight)
    let result = false
    if (namespace === 'inputs' && !isNaN(leftNumber)) {
      if (operator === '>=') result = leftNumber >= rightNumber
      if (operator === '<=') result = leftNumber <= rightNumber
      if (operator === '>') result = leftNumber > rightNumber
      if (operator === '<') result = leftNumber < rightNumber
    }
    return negated ? !result : result
  }
  const operatorMatch = valueExpression.match(/^(\w+)\.(.+?)\s+(==|!=|includes)\s+(.+)$/)
  if (operatorMatch) {
    const [, namespace, key, operator, rawRight] = operatorMatch
    const left = getNestedValue(inputValues, key)
    const right = rawRight.trim()
    let result = false
    if (namespace === 'inputs') {
      if (operator === '==') result = String(left ?? '') === right
      if (operator === '!=') result = String(left ?? '') !== right
      if (operator === 'includes')
        result = Array.isArray(left) ? left.includes(right) : typeof left === 'string' && left.includes(right)
    }
    return negated ? !result : result
  }
  if (valueExpression === 'services') {
    const result = services.length > 0
    return negated ? !result : result
  }
  const dotIndex = valueExpression.indexOf('.')
  if (dotIndex === -1) return negated
  const namespace = valueExpression.slice(0, dotIndex)
  const key = valueExpression.slice(dotIndex + 1)
  let result = false
  if (namespace === 'services') result = services.includes(key)
  else if (namespace === 'inputs') {
    const value = getNestedValue(inputValues, key)
    result = value !== undefined && value !== null && value !== '' && value !== false && !(Array.isArray(value) && value.length === 0)
  }
  return negated ? !result : result
}

function resolveReference(reference, inputValues, services) {
  const trimmed = reference.trim()
  if (trimmed === 'services') return [...services]
  if (trimmed.startsWith('inputs.')) return getNestedValue(inputValues, trimmed.slice(7))
  if (trimmed.startsWith('services.')) return services.includes(trimmed.slice(9))
  return undefined
}

function applyConditionals(value, inputValues, services) {
  if (Array.isArray(value)) {
    const output = []
    for (const item of value) {
      const obj = item
      if (obj && typeof obj === 'object' && !Array.isArray(obj) && '__if' in obj && !evaluateCondition(obj.__if, inputValues, services)) continue
      let candidate = item
      if (obj && typeof obj === 'object' && !Array.isArray(obj) && '__if' in obj) {
        const { __if: _ignored, ...rest } = obj
        candidate = '__value' in rest ? rest.__value : rest
      } else if (obj && typeof obj === 'object' && !Array.isArray(obj) && '__value' in obj) {
        candidate = obj.__value
      }
      const resolved = applyConditionals(candidate, inputValues, services)
      if (resolved === REMOVE) continue
      if (Array.isArray(resolved)) output.push(...resolved)
      else output.push(resolved)
    }
    return output
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if ('__switch' in value) {
      const resolved = resolveReference(value.__switch, inputValues, services)
      const key = resolved == null ? null : String(resolved)
      const cases = value.cases ?? {}
      const selected = key !== null && Object.prototype.hasOwnProperty.call(cases, key) ? cases[key] : (value.default ?? null)
      return applyConditionals(selected, inputValues, services)
    }
    if ('__if' in value && '__value' in value)
      return evaluateCondition(value.__if, inputValues, services) ? applyConditionals(value.__value, inputValues, services) : REMOVE
    if (value.__remove === true) return REMOVE
    const output = {}
    for (const [key, entry] of Object.entries(value)) {
      const resolved = applyConditionals(entry, inputValues, services)
      if (resolved !== REMOVE) output[key] = resolved
    }
    return output
  }
  if (typeof value !== 'string') return value
  if (value === '{{services}}') return [...services]
  const singleToken = value.match(/^\{\{(inputs|services)\.([^}]+)\}\}$/)
  if (singleToken) {
    const [, namespace, key] = singleToken
    if (namespace === 'inputs') return getNestedValue(inputValues, key) ?? ''
    if (key.includes('.')) return `{{services.${key}}}`
    return services.includes(key)
  }
  return value
    .replace(/\{\{services\}\}/g, services.join(','))
    .replace(/\{\{(inputs|services)\.([^}]+)\}\}/g, (_match, ns, key) => {
      if (ns === 'inputs') return String(getNestedValue(inputValues, key) ?? '')
      if (key.includes('.')) return `{{services.${key}}}`
      return String(services.includes(key))
    })
}

function deepClone(value) {
  // JSON round-trip is safer than structuredClone for template data that may
  // contain non-cloneable structures.
  return JSON.parse(JSON.stringify(value))
}

function collectDefaults(options) {
  const values = {}
  for (const option of options ?? []) {
    if (option.default !== undefined) values[option.id] = deepClone(option.default)
    else if (option.type === 'boolean') values[option.id] = false
    if (Array.isArray(option.subOptions))
      values[option.id] = { ...collectDefaults(option.subOptions), ...(values[option.id] ? values[option.id] : {}) }
  }
  return values
}

function containsPlaceholder(value) {
  if (typeof value === 'string') return /<.*template_placeholder>/i.test(value)
  if (Array.isArray(value)) return value.some(containsPlaceholder)
  if (value && typeof value === 'object') return Object.values(value).some(containsPlaceholder)
  return false
}

function disableMetadataDependentFeatures(config) {
  if (config.titleMatching && typeof config.titleMatching === 'object') config.titleMatching.enabled = false
  if (config.yearMatching && typeof config.yearMatching === 'object') config.yearMatching.enabled = false
  if (config.digitalReleaseFilter && typeof config.digitalReleaseFilter === 'object') config.digitalReleaseFilter.enabled = false
  if (config.bitrate && typeof config.bitrate === 'object') config.bitrate.useMetadataRuntime = false
}

/** Fetch the TAMS template (with localStorage cache). */
async function loadTemplate() {
  // Check cache first.
  try {
    const cached = localStorage.getItem(TEMPLATE_CACHE_KEY)
    if (cached) {
      const parsed = JSON.parse(cached)
      if (parsed.fetchedAt && Date.now() - parsed.fetchedAt < TEMPLATE_CACHE_TTL)
        return parsed.template
    }
  } catch {}
  const res = await fetch(TEMPLATE_URL)
  if (!res.ok) throw new Error(`Failed to fetch TAMS template (${res.status})`)
  const template = await res.json()
  if (template.metadata?.id !== 'tamtaro.complete')
    throw new Error('TAMS template is missing or invalid.')
  try {
    localStorage.setItem(TEMPLATE_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), template }))
  } catch {}
  return template
}

/** Extract the P2P scraper addon choices from the template. */
function getAddonChoices(template) {
  const presets = template.config.presets
  if (!presets || !presets.__value || !presets.__value.cases) return []
  const p2pRaw = presets.__value.cases[''] ?? []
  return p2pRaw
    .map((p) => ({
      type: p.type,
      name: p.options?.name ?? p.type,
      category: p.category ?? 'P2P',
      enabledByDefault: p.enabled !== false,
    }))
    .filter((p) => p.type !== 'opensubtitles-v3-plus')
}

/** Build a fully-resolved P2P config from the TAMS template + user options. */
function buildP2PConfig(template, options = {}) {
  const services = [] // P2P mode = no debrid services.
  const inputValues = collectDefaults(template.metadata.inputs)
  if (options.languages) inputValues.languages = [...options.languages]
  if (options.subtitles) inputValues.subtitles = [...options.subtitles]
  if (options.addonPreset) inputValues.addonPreset = options.addonPreset
  if (options.formatterChoice) inputValues.formatterChoice = options.formatterChoice
  if (options.coreFilter) inputValues.coreFilter = options.coreFilter
  const miscDefaults = inputValues.misc ?? {}
  const addonName = options.addonName?.trim() || 'AIOStreams'
  inputValues.misc = {
    ...miscDefaults,
    addonName,
    ...(options.showStats !== undefined ? { showStats: options.showStats ? 'true' : 'false' } : {}),
  }
  if (options.timeout !== undefined)
    inputValues.includeAddon = { ...(inputValues.includeAddon ?? {}), timeout: options.timeout }
  let config = applyConditionals(template.config, inputValues, services)
  if (config === REMOVE || config === null) throw new Error('Failed to resolve TAMS template.')
  // P2P overrides.
  const strictness = options.p2pStrictness ?? 'preferred'
  if (strictness === 'required') {
    config.preferredStreamTypes = []
    config.requiredStreamTypes = ['p2p']
  } else {
    config.preferredStreamTypes = ['p2p']
    config.requiredStreamTypes = []
  }
  config.excludedStreamTypes = ['debrid']
  config.excludeUncached = true
  config.excludeCachedFromStreamTypes = ['debrid']
  config.serviceWrap = { enabled: false, reconfigureService: false }
  config.cacheAndPlay = { enabled: false, streamTypes: [] }
  config.services = []
  // Curate scrapers.
  if (Array.isArray(config.presets) && options.enabledAddons) {
    const wanted = new Set(options.enabledAddons)
    config.presets = config.presets.filter((p) => wanted.has(p.type)).map((p) => ({ ...p, enabled: true }))
  }
  // API keys.
  if (options.tmdbApiKey) config.tmdbApiKey = options.tmdbApiKey
  else {
    delete config.tmdbApiKey
    delete config.tmdbAccessToken
    disableMetadataDependentFeatures(config)
  }
  if (options.tvdbApiKey) config.tvdbApiKey = options.tvdbApiKey
  else delete config.tvdbApiKey
  // Provenance.
  config.appliedTemplates = [
    { id: template.metadata.id, version: template.metadata.version, url: TEMPLATE_URL },
  ]
  if (containsPlaceholder(config)) throw new Error('The TAMS template contains an unresolved required value.')
  return config
}

// ---------------------------------------------------------------------------
// Component state
// ---------------------------------------------------------------------------

const template = ref(null)
const templateError = ref(null)
const addons = ref([])
const languages = ref([])
const subtitles = ref([])
const templateVersion = ref('')

const mode = ref('simple')
const presetId = ref('defaults')

// Form state (shared between Simple + Advanced).
const form = reactive({
  instanceUrl: DEFAULT_INSTANCE_URL,
  addonName: '',
  languages: ['English'],
  subtitles: ['English'],
  addonPreset: 'default',
  formatterChoice: 'default',
  coreFilter: 'standard',
  p2pStrictness: 'required',
  enabledAddons: [],
  tmdbApiKey: '',
  tvdbApiKey: '',
  showStats: false,
  timeout: 15000,
})

const presets = [
  { id: 'defaults', name: 'Template defaults' },
  { id: 'balanced', name: 'Balanced' },
  { id: 'lightweight', name: 'Lightweight' },
  { id: '4k-max', name: 'Maximum quality' },
  { id: 'anime', name: 'Anime' },
  { id: 'multilingual', name: 'Multilingual' },
  { id: 'subs-first', name: 'Subtitles first' },
]

function applyPreset(id) {
  form.p2pStrictness = 'required'
  form.coreFilter = id === '4k-max' || id === 'anime' ? 'extended' : 'standard'
  form.languages = id === 'anime'
    ? ['Japanese', 'English']
    : id === 'multilingual'
      ? ['English', 'Spanish', 'French', 'German']
      : ['English']
  form.subtitles = id === 'subs-first' ? ['English', 'Spanish', 'French'] : ['English']
  if (id === 'defaults') {
    form.enabledAddons = defaultAddonTypes()
    return
  }
  form.enabledAddons = id === 'lightweight'
    ? ['meteor', 'torrentio']
    : id === '4k-max'
      ? ['meteor', 'comet', 'torrentio', 'torrents-db', 'peerflix', 'stremthruTorz']
      : id === 'anime'
        ? ['mediafusion', 'meteor', 'comet', 'torrentio']
        : ['meteor', 'comet', 'torrentio', 'torrents-db', 'peerflix']
}

const ICONS = {
  shield: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 9.7a1 1 0 0 1-.68 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 .76-.97l8-2a1 1 0 0 1 .48 0l8 2A1 1 0 0 1 20 6Z"/></svg>`,
  checkCircle: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`,
  loader: `<svg class="spin-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
}

function getIconHtml(name, size = 16) {
  const raw = ICONS[name]
  if (!raw) return ''
  return raw.replace(/<svg /, `<svg width="${size}" height="${size}" `)
}

function highlightJson(jsonStr) {
  if (!jsonStr) return ''
  let html = jsonStr
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  
  return html.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'json-number'
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key'
          return `<span class="${cls}">${match.replace(/:$/, '')}</span>:`
        } else {
          cls = 'json-string'
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean'
      } else if (/null/.test(match)) {
        cls = 'json-null'
      }
      return `<span class="${cls}">${match}</span>`
    }
  )
}

const config = ref(null)
const configJson = ref('')
const generating = ref(false)
const genError = ref(null)
const installPassword = ref('')
const installing = ref(false)
const installResult = ref(null)
const installError = ref(null)
const scraperQuery = ref('')

// Recent instances (localStorage).
const recentInstances = ref([])
const RECENT_KEY = 'nuvio:recent-instances'
function loadRecent() {
  try {
    recentInstances.value = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, 5)
  } catch { recentInstances.value = [] }
}
function recordRecent(url) {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter((u) => u !== url)
    list.unshift(url)
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 10)))
    loadRecent()
  } catch {}
}

function createInstallPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
  return [...bytes].map((value) => alphabet[value % alphabet.length]).join('')
}

const instanceValid = computed(() => {
  try {
    const u = new URL(form.instanceUrl.trim())
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch { return false }
})

const scraperQueryLower = computed(() => scraperQuery.value.trim().toLowerCase())
const filteredAddons = computed(() =>
  scraperQueryLower.value
    ? addons.value.filter((a) => a.name.toLowerCase().includes(scraperQueryLower.value) || a.type.toLowerCase().includes(scraperQueryLower.value))
    : addons.value
)
const filteredP2p = computed(() => filteredAddons.value.filter((a) => a.category === 'P2P'))
const filteredHttp = computed(() => filteredAddons.value.filter((a) => a.category === 'HTTP'))
const enabledCount = computed(() => form.enabledAddons.length)

const canInstall = computed(() => instanceValid.value && !!config.value && !installing.value)

function defaultAddonTypes() {
  return addons.value
    .filter((addon) => addon.enabledByDefault && addon.category === 'P2P')
    .map((addon) => addon.type)
}

function resetAddonsToDefault() {
  form.enabledAddons = defaultAddonTypes()
}

function enableAllVisible() {
  const visible = filteredAddons.value.map((a) => a.type)
  form.enabledAddons = [...new Set([...form.enabledAddons, ...visible])]
}
function disableAllVisible() {
  const visibleTypes = new Set(filteredAddons.value.map((a) => a.type))
  form.enabledAddons = form.enabledAddons.filter((t) => !visibleTypes.has(t))
}

// Live config generation (debounced).
let genTimer = null
async function regenerate() {
  if (!template.value) return
  generating.value = true
  try {
    const cfg = buildP2PConfig(template.value, { ...form })
    config.value = cfg
    configJson.value = JSON.stringify(cfg, null, 2)
    genError.value = null
  } catch (e) {
    config.value = null
    configJson.value = ''
    genError.value = e.message
    console.error('[P2PGenerator] regenerate failed:', e)
  } finally {
    generating.value = false
  }
}
watch(form, () => {
  clearTimeout(genTimer)
  genTimer = setTimeout(regenerate, 200)
}, { deep: true })

async function handleInstall() {
  if (!canInstall.value) return
  installing.value = true
  installError.value = null
  installResult.value = null
  const instanceUrl = form.instanceUrl.replace(/\/$/, '')
  const useSameOriginProxy = instanceUrl === DEFAULT_INSTANCE_URL
  try {
    const endpoint = useSameOriginProxy ? '/api/aiostreams/user' : `${instanceUrl}/api/v1/user`
    const password = installPassword.value || createInstallPassword()
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: config.value,
        password,
      }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      throw new Error(body?.detail || body?.error?.message || body?.message || body?.error || `Install failed (${res.status})`)
    }
    const data = body?.data ?? body
    if (!data?.uuid || !data?.encryptedPassword) {
      throw new Error('AIOStreams did not return a manifest identifier.')
    }
    const stremioBase = `${instanceUrl}/stremio/${encodeURIComponent(data.uuid)}/${encodeURIComponent(data.encryptedPassword)}`
    const manifestUrl = `${stremioBase}/manifest.json`
    const configureUrl = `${stremioBase}/configure`
    installResult.value = {
      manifestUrl,
      configureUrl,
      password,
    }
    recordRecent(form.instanceUrl)
  } catch (e) {
    const networkHint = e instanceof TypeError
      ? useSameOriginProxy
        ? ' The same-origin AIOStreams proxy is unavailable.'
        : ' Direct browser requests may be blocked by this instance CORS policy.'
      : ''
    installError.value = `${e.message || 'Manifest creation failed.'}${networkHint} You can still download the config JSON and import it manually.`
  } finally {
    installing.value = false
  }
}

function copyToClipboard(text, label = 'Copied') {
  navigator.clipboard.writeText(text).then(() => {
    // Simple feedback — VitePress doesn't bundle a toast lib.
    console.log(label)
  })
}

function downloadConfig() {
  const blob = new Blob([configJson.value], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'aiostreams-p2p-config.json'
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

onMounted(async () => {
  loadRecent()
  try {
    const tpl = await loadTemplate()
    template.value = tpl
    templateVersion.value = tpl.metadata.version
    addons.value = getAddonChoices(tpl)
    // Extract language + subtitle options from the template inputs.
    const langInput = tpl.metadata.inputs.find((i) => i.id === 'languages')
    const subInput = tpl.metadata.inputs.find((i) => i.id === 'subtitles')
    languages.value = (langInput?.options || []).map((o) => ({ value: o.value, label: o.label || o.value }))
    subtitles.value = (subInput?.options || []).map((o) => ({ value: o.value, label: o.label || o.value }))
    // Apply recommended defaults.
    form.enabledAddons = defaultAddonTypes()
    await regenerate()
  } catch (e) {
    templateError.value = e.message
  }
})
</script>

<template>
  <div class="p2p-gen">
    <header class="p2p-header">
      <div class="p2p-title">
        <span class="p2p-title-icon" aria-hidden="true" v-html="getIconHtml('shield', 20)"></span>
        <div>
          <p class="p2p-kicker">AIOStreams</p>
          <h2>P2P setup</h2>
          <p>Create a keyless manifest for Nuvio using the TAMS configuration.</p>
        </div>
      </div>

      <div class="mode-toggle" role="tablist" aria-label="Setup mode">
        <button
          role="tab"
          type="button"
          :aria-selected="mode === 'simple'"
          :class="['mode-btn', { active: mode === 'simple' }]"
          @click="mode = 'simple'"
        >
          Basic
        </button>
        <button
          role="tab"
          type="button"
          :aria-selected="mode === 'advanced'"
          :class="['mode-btn', { active: mode === 'advanced' }]"
          @click="mode = 'advanced'"
        >
          Advanced
        </button>
      </div>
    </header>

    <div v-if="templateError" class="callout callout-warn">
      <strong>Configuration unavailable.</strong> {{ templateError }}
    </div>

    <div v-if="genError" class="callout callout-warn" role="alert">
      <strong>Could not generate the configuration.</strong> {{ genError }}
    </div>

    <div v-if="mode === 'simple' && template" class="simple-mode">
      <section class="setup-panel panel">
        <div class="section-heading">
          <div>
            <h3>Create manifest</h3>
            <p>Use an AIOStreams instance that accepts P2P traffic.</p>
          </div>
          <span class="section-count">3 fields</span>
        </div>

        <div class="field field-wide">
          <label for="p2p-instance">Instance URL</label>
          <input
            id="p2p-instance"
            v-model="form.instanceUrl"
            type="url"
            placeholder="https://your-instance.example.com"
            class="input"
            list="recent-instances"
          />
          <datalist id="recent-instances">
            <option v-for="url in recentInstances" :key="url" :value="url" />
          </datalist>
          <p v-if="form.instanceUrl && !instanceValid" class="error-text">Enter a complete http:// or https:// URL.</p>
          <p v-else class="hint">The official ElfHosted instance does not allow P2P.</p>
        </div>

        <div class="field">
          <label for="p2p-name">Addon name <span>Optional</span></label>
          <input
            id="p2p-name"
            v-model="form.addonName"
            type="text"
            placeholder="AIOStreams"
            class="input"
          />
        </div>

        <div class="field">
          <label for="p2p-language">Audio language</label>
          <select id="p2p-language" v-model="form.languages[0]" class="input">
            <option v-for="l in languages" :key="l.value" :value="l.value">{{ l.label }}</option>
          </select>
        </div>

        <details class="password-field field-wide">
          <summary>Set a manifest password</summary>
          <div class="field">
            <label for="p2p-password">Password <span>Optional</span></label>
            <input
              id="p2p-password"
              v-model="installPassword"
              type="text"
              placeholder="Generated automatically when left blank"
              class="input"
            />
          </div>
        </details>

        <button
          type="button"
          class="btn btn-primary submit-button field-wide"
          :disabled="!canInstall"
          @click="handleInstall"
        >
          <span v-if="installing" class="btn-content"><span v-html="getIconHtml('loader', 17)"></span> Creating manifest</span>
          <span v-else class="btn-content">Create manifest</span>
        </button>
      </section>

      <aside class="summary-panel panel">
        <div class="section-heading">
          <div>
            <h3>Configuration</h3>
            <p>Defaults applied before the manifest is created.</p>
          </div>
        </div>

        <dl class="config-summary">
          <div><dt>Stream type</dt><dd>P2P required</dd></div>
          <div><dt>Debrid services</dt><dd>Disabled</dd></div>
          <div><dt>Scrapers</dt><dd>{{ enabledCount }} enabled</dd></div>
          <div><dt>Filtering</dt><dd>Standard SEL</dd></div>
          <div><dt>Timeout</dt><dd>15 seconds</dd></div>
          <div><dt>Subtitles</dt><dd>English</dd></div>
        </dl>

        <button type="button" class="text-button" @click="mode = 'advanced'">Review all settings</button>

        <details class="config-details">
          <summary>Generated JSON</summary>
          <div class="config-actions">
            <button type="button" class="small-button" @click="copyToClipboard(configJson, 'Config copied')">Copy</button>
            <button type="button" class="small-button" @click="downloadConfig">Download</button>
          </div>
          <pre class="config-block" v-html="highlightJson(configJson)"></pre>
        </details>
      </aside>
    </div>

    <div v-if="mode === 'advanced' && template" class="advanced-mode">
      <div class="advanced-layout">
        <section class="advanced-settings panel">
          <div class="settings-section settings-grid">
            <div class="section-heading field-wide">
              <div>
                <h3>Profile</h3>
                <p>Start with a preset, then adjust only what you need.</p>
              </div>
            </div>

            <div class="field">
              <label for="p2p-preset">Preset</label>
              <select id="p2p-preset" v-model="presetId" class="input" @change="applyPreset(presetId)">
                <option v-for="preset in presets" :key="preset.id" :value="preset.id">{{ preset.name }}</option>
              </select>
            </div>
            <div class="field">
              <label for="p2p-advanced-name">Addon name <span>Optional</span></label>
              <input id="p2p-advanced-name" v-model="form.addonName" type="text" placeholder="AIOStreams" class="input" />
            </div>
            <div class="field field-wide">
              <label for="p2p-advanced-instance">Instance URL</label>
              <input id="p2p-advanced-instance" v-model="form.instanceUrl" type="url" placeholder="https://your-instance.example.com" class="input" list="recent-instances" />
              <p v-if="form.instanceUrl && !instanceValid" class="error-text">Enter a complete http:// or https:// URL.</p>
            </div>
          </div>

          <div class="settings-section settings-grid">
            <div class="section-heading field-wide">
              <div>
                <h3>Filtering</h3>
                <p>Control which streams pass and how results are displayed.</p>
              </div>
            </div>

            <div class="field">
              <label for="p2p-filter">Result density</label>
              <select id="p2p-filter" v-model="form.coreFilter" class="input">
                <option value="standard">Standard SEL</option>
                <option value="extended">Extended SEL</option>
              </select>
            </div>
            <div class="field">
              <label for="p2p-formatter">Formatter</label>
              <select id="p2p-formatter" v-model="form.formatterChoice" class="input">
                <option value="default">Default</option>
                <option value="min">Minimal</option>
                <option value="tamtaro">Tamtaro</option>
                <option value="viren">Viren</option>
                <option value="none">None</option>
              </select>
            </div>

            <fieldset class="field-wide enforcement-field">
              <legend>P2P enforcement</legend>
              <label :class="['radio-option', { active: form.p2pStrictness === 'preferred' }]">
                <input v-model="form.p2pStrictness" type="radio" value="preferred" />
                <span><strong>Preferred</strong><small>Use other stream types only as a fallback.</small></span>
              </label>
              <label :class="['radio-option', { active: form.p2pStrictness === 'required' }]">
                <input v-model="form.p2pStrictness" type="radio" value="required" />
                <span><strong>Required</strong><small>Only pass raw P2P magnet streams.</small></span>
              </label>
            </fieldset>
          </div>

          <div class="settings-section settings-grid">
            <div class="section-heading field-wide">
              <div>
                <h3>Languages</h3>
                <p>Select one or more audio and subtitle languages.</p>
              </div>
            </div>

            <details class="choice-picker">
              <summary><span>Audio</span><strong>{{ form.languages.length }} selected</strong></summary>
              <div class="choice-list">
                <label v-for="language in languages" :key="language.value">
                  <input v-model="form.languages" type="checkbox" :value="language.value" />
                  <span>{{ language.label }}</span>
                </label>
              </div>
            </details>
            <details class="choice-picker">
              <summary><span>Subtitles</span><strong>{{ form.subtitles.length }} selected</strong></summary>
              <div class="choice-list">
                <label v-for="subtitle in subtitles" :key="subtitle.value">
                  <input v-model="form.subtitles" type="checkbox" :value="subtitle.value" />
                  <span>{{ subtitle.label }}</span>
                </label>
              </div>
            </details>
          </div>

          <div class="settings-section">
            <div class="section-heading">
              <div>
                <h3>Scrapers</h3>
                <p>{{ enabledCount }} of {{ addons.length }} enabled.</p>
              </div>
              <button type="button" class="small-button" @click="resetAddonsToDefault">Reset</button>
            </div>

            <div class="scraper-toolbar">
              <input v-model="scraperQuery" type="search" placeholder="Find a scraper" class="input" />
              <button type="button" class="small-button" @click="enableAllVisible">Enable shown</button>
              <button type="button" class="small-button" @click="disableAllVisible">Disable shown</button>
            </div>

            <div class="addon-list">
              <label v-for="addon in filteredP2p" :key="addon.type" class="addon-row">
                <input v-model="form.enabledAddons" type="checkbox" :value="addon.type" />
                <span><strong>{{ addon.name }}</strong><small>{{ addon.type }}</small></span>
                <em>P2P</em>
              </label>
              <label v-for="addon in filteredHttp" :key="addon.type" class="addon-row">
                <input v-model="form.enabledAddons" type="checkbox" :value="addon.type" />
                <span><strong>{{ addon.name }}</strong><small>{{ addon.type }}</small></span>
                <em>HTTP</em>
              </label>
            </div>
          </div>

          <details class="settings-section technical-settings">
            <summary>API keys and timeout</summary>
            <div class="settings-grid technical-grid">
              <div class="field">
                <label for="p2p-tmdb">TMDB API key <span>Optional</span></label>
                <input id="p2p-tmdb" v-model="form.tmdbApiKey" type="password" class="input" />
              </div>
              <div class="field">
                <label for="p2p-tvdb">TVDB API key <span>Optional</span></label>
                <input id="p2p-tvdb" v-model="form.tvdbApiKey" type="password" class="input" />
              </div>
              <div class="field field-wide">
                <label for="p2p-timeout">Scrape timeout <span>{{ (form.timeout / 1000).toFixed(0) }} seconds</span></label>
                <input id="p2p-timeout" v-model.number="form.timeout" type="range" min="5000" max="60000" step="1000" class="slider" />
              </div>
              <label class="check-option field-wide">
                <input v-model="form.showStats" type="checkbox" />
                <span>Show the statistics footer</span>
              </label>
            </div>
          </details>
        </section>

        <aside class="output-panel panel">
          <div class="output-status">
            <span :class="['status-dot', { working: generating }]"></span>
            <span>{{ generating ? 'Updating configuration' : 'Configuration ready' }}</span>
            <small v-if="templateVersion">TAMS {{ templateVersion }}</small>
          </div>

          <div class="output-summary">
            <div><span>Mode</span><strong>{{ form.p2pStrictness }}</strong></div>
            <div><span>Scrapers</span><strong>{{ enabledCount }}</strong></div>
            <div><span>Filter</span><strong>{{ form.coreFilter }}</strong></div>
          </div>

          <details class="config-details" open>
            <summary>Configuration JSON</summary>
            <div class="config-actions">
              <button type="button" class="small-button" @click="copyToClipboard(configJson, 'Config copied')">Copy</button>
              <button type="button" class="small-button" @click="downloadConfig">Download</button>
            </div>
            <pre v-if="configJson" class="config-block" v-html="highlightJson(configJson)"></pre>
          </details>

          <div class="manifest-controls">
            <div class="field">
              <label for="p2p-advanced-password">Manifest password <span>Optional</span></label>
              <input id="p2p-advanced-password" v-model="installPassword" type="text" placeholder="Generated automatically" class="input" />
            </div>
            <button type="button" class="btn btn-primary submit-button" :disabled="!canInstall" @click="handleInstall">
              <span v-if="installing" class="btn-content"><span v-html="getIconHtml('loader', 17)"></span> Creating manifest</span>
              <span v-else class="btn-content">Create manifest</span>
            </button>
          </div>
        </aside>
      </div>
    </div>

    <section v-if="installResult" class="install-success panel" aria-live="polite">
      <div class="result-heading">
        <span v-html="getIconHtml('checkCircle', 18)"></span>
        <div>
          <h3>Manifest created</h3>
          <p>Add the manifest URL in Nuvio under Content &amp; Discovery, then Addons.</p>
        </div>
      </div>
      <div class="result-grid">
        <div class="copy-field">
          <label>Manifest URL</label>
          <div class="copy-row">
            <input :value="installResult.manifestUrl" readonly class="input mono" />
            <button type="button" class="small-button" @click="copyToClipboard(installResult.manifestUrl, 'Manifest URL copied')">Copy</button>
          </div>
        </div>
        <div class="copy-field">
          <label>Configure URL</label>
          <div class="copy-row">
            <input :value="installResult.configureUrl" readonly class="input mono" />
            <button type="button" class="small-button" @click="copyToClipboard(installResult.configureUrl, 'Configure URL copied')">Copy</button>
          </div>
        </div>
        <div v-if="installResult.password" class="copy-field">
          <label>Password</label>
          <div class="copy-row">
            <input :value="installResult.password" readonly class="input mono" />
            <button type="button" class="small-button" @click="copyToClipboard(installResult.password, 'Password copied')">Copy</button>
          </div>
        </div>
      </div>
    </section>

    <div v-if="installError" class="callout callout-warn" role="alert">
      <strong>Manifest creation failed.</strong> {{ installError }}
    </div>

    <div v-if="!template && !templateError" class="loading">
      <p><span v-html="getIconHtml('loader', 24)" class="loading-spinner"></span> Loading the TAMS template…</p>
    </div>
  </div>
</template>


<style scoped src="./P2PGenerator.css"></style>
