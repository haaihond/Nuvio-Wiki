<script setup>
/**
 * P2PGenerator.vue — Self-contained P2P AIOStreams setup generator.
 *
 * Drop this into a VitePress site's `.vitepress/theme/components/` directory,
 * register it in `theme/index.ts`, and use `<P2PGenerator />` in any markdown
 * page. No backend required — the TAMS template is fetched from GitHub and
 * resolved entirely client-side.
 *
 * Modes:
 *   - Simple: recommended defaults pre-applied, 3 inputs (instance URL,
 *     addon name, language), one-click "Create manifest".
 *   - Advanced: full control panel (presets, languages, filtering, scrapers,
 *     API keys, timeout, install).
 *
 * Based on the TAMS (Tam-Taro Complete SEL) template and the Nuvio-Quickstart
 * conditional engine, ported to run in the browser.
 */
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue'

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
  inputValues.misc = {
    ...miscDefaults,
    ...(options.addonName !== undefined ? { addonName: options.addonName } : {}),
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

const mode = ref('simple') // 'simple' | 'advanced'

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

const config = ref(null)
const configJson = ref('')
const generating = ref(false)
const genError = ref(null)
const installPassword = ref('')
const installing = ref(false)
const installResult = ref(null)
const installError = ref(null)
const advancedOpen = ref(false)
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

// Derived.
const instanceValid = computed(() => {
  try {
    const u = new URL(form.instanceUrl.trim())
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch { return false }
})

const p2pAddons = computed(() => addons.value.filter((a) => a.category === 'P2P'))
const httpAddons = computed(() => addons.value.filter((a) => a.category === 'HTTP'))
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

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function toggleAddon(type) {
  const idx = form.enabledAddons.indexOf(type)
  if (idx >= 0) form.enabledAddons.splice(idx, 1)
  else form.enabledAddons.push(type)
}

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
  try {
    const instanceUrl = form.instanceUrl.replace(/\/$/, '')
    const useLocalProxy = import.meta.env.DEV && instanceUrl === DEFAULT_INSTANCE_URL
    const endpoint = useLocalProxy ? '/api/aiostreams/user' : `${instanceUrl}/api/v1/user`
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
      ? ' This deployment needs a same-origin AIOStreams proxy; direct browser requests are blocked by the instance CORS policy.'
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
    <!-- Mode toggle -->
    <div class="mode-toggle" role="tablist" aria-label="Generator mode">
      <button
        role="tab"
        :aria-selected="mode === 'simple'"
        :class="['mode-btn', { active: mode === 'simple' }]"
        @click="mode = 'simple'"
      >
        ✨ Simple
      </button>
      <button
        role="tab"
        :aria-selected="mode === 'advanced'"
        :class="['mode-btn', { active: mode === 'advanced' }]"
        @click="mode = 'advanced'"
      >
        ⚙️ Advanced
      </button>
    </div>

    <div v-if="templateError" class="callout callout-warn">
      <strong>Couldn't load the TAMS template:</strong> {{ templateError }}
    </div>

    <!-- ===================== SIMPLE MODE ===================== -->
    <div v-if="mode === 'simple' && template" class="simple-mode">
      <div class="simple-header">
        <h3>Quick setup — recommended defaults applied</h3>
        <p>
          Just enter your AIOStreams instance URL and click
          <strong>Create manifest</strong>. We'll build a P2P-safe config and
          push it to your instance in one step.
        </p>
        <div class="default-badges">
          <span class="badge badge-p2p">🛡️ P2P Required</span>
          <span class="badge">⚡ No debrid keys</span>
          <span class="badge">🚫 HTTP off</span>
          <span class="badge">📦 {{ enabledCount }} scrapers</span>
          <span class="badge">Standard SEL</span>
          <span class="badge">15s timeout</span>
          <span class="badge">English subs</span>
        </div>
      </div>

      <div class="simple-form">
        <div class="step">
          <label><span class="step-num">1</span> Your AIOStreams instance URL <span class="req">required</span></label>
          <input
            v-model="form.instanceUrl"
            type="url"
            placeholder="https://your-aiostreams-instance.example.com"
            class="input"
            list="recent-instances"
          />
          <datalist id="recent-instances">
            <option v-for="url in recentInstances" :key="url" :value="url" />
          </datalist>
          <p v-if="form.instanceUrl && !instanceValid" class="error-text">
            Enter a full URL including https://
          </p>
          <p class="hint">
            Self-hosted or a public instance that allows P2P. The official
            ElfHosted instance blocks P2P — it won't work here.
          </p>
        </div>

        <div class="step">
          <label><span class="step-num">2</span> Addon name <span class="opt">optional</span></label>
          <input
            v-model="form.addonName"
            type="text"
            placeholder="AIOStreams (default)"
            class="input"
          />
          <p class="hint">How it shows up in Nuvio's addon list.</p>
        </div>

        <div class="step">
          <label><span class="step-num">3</span> Preferred audio language <span class="opt">optional</span></label>
          <select v-model="form.languages[0]" class="input">
            <option v-for="l in languages" :key="l.value" :value="l.value">{{ l.label }}</option>
          </select>
          <p class="hint">Original / Dual / Multi / Dubbed / Unknown are appended automatically.</p>
        </div>

        <button
          class="btn btn-primary btn-large"
          :disabled="!canInstall"
          @click="handleInstall"
        >
          <span v-if="installing">⏳ Pushing to your instance…</span>
          <span v-else>🚀 Create protected manifest →</span>
        </button>
        <p v-if="!instanceValid" class="hint center">
          Enter your instance URL above to enable this.
        </p>

        <details class="collapsible">
          <summary>Manifest password (optional)</summary>
          <input
            v-model="installPassword"
            type="text"
            placeholder="Auto-generated if blank"
            class="input"
          />
        </details>
      </div>

      <!-- Install result -->
      <div v-if="installResult" class="install-success">
        <p>✅ <strong>Your manifest is ready!</strong> Copy the URL below and paste it into <strong>Nuvio → Addons → Add addon</strong>.</p>
        <div class="copy-field">
          <label>Manifest URL → paste into Nuvio</label>
          <div class="copy-row">
            <input :value="installResult.manifestUrl" readonly class="input mono" />
            <button class="btn btn-sm" @click="copyToClipboard(installResult.manifestUrl, 'Manifest URL copied')">Copy</button>
          </div>
        </div>
        <div class="copy-field">
          <label>Configure URL → edit later (keep safe)</label>
          <div class="copy-row">
            <input :value="installResult.configureUrl" readonly class="input mono" />
            <button class="btn btn-sm" @click="copyToClipboard(installResult.configureUrl, 'Configure URL copied')">Copy</button>
          </div>
        </div>
        <div v-if="installResult.password" class="copy-field">
          <label>Manifest password (keep safe)</label>
          <div class="copy-row">
            <input :value="installResult.password" readonly class="input mono" />
            <button class="btn btn-sm" @click="copyToClipboard(installResult.password, 'Password copied')">Copy</button>
          </div>
        </div>
      </div>

      <div v-if="installError" class="callout callout-warn">
        <strong>Manifest creation failed:</strong> {{ installError }}
      </div>

      <div class="simple-footer">
        <button class="link-btn" @click="mode = 'advanced'">
          🛠️ Need more control? Switch to Advanced mode →
        </button>
        <details>
          <summary class="link-btn-sm">Show generated config JSON</summary>
          <pre class="config-preview">{{ configJson }}</pre>
        </details>
      </div>
    </div>

    <!-- ===================== ADVANCED MODE ===================== -->
    <div v-if="mode === 'advanced' && template" class="advanced-mode">
      <div class="adv-grid">
        <!-- Form column -->
        <div class="adv-form">
          <!-- Quick presets -->
          <div class="adv-card">
            <h3>⚙️ Quick start presets</h3>
            <p class="muted">One-click setups for common use cases.</p>
            <div class="preset-grid">
              <button
                v-for="p in [
                  { id: 'balanced', name: 'Balanced', emoji: '🎯', blurb: 'Recommended mix of P2P scrapers.' },
                  { id: 'lightweight', name: 'Lightweight', emoji: '🍃', blurb: 'Fewer scrapers for fast lists.' },
                  { id: '4k-max', name: '4K / Max quality', emoji: '🎥', blurb: 'Extended SEL + more scrapers.' },
                  { id: 'anime', name: 'Anime', emoji: '🌸', blurb: 'Japanese audio + English subs.' },
                  { id: 'multilingual', name: 'Multilingual', emoji: '🌍', blurb: 'Broad language set.' },
                  { id: 'subs-first', name: 'Subtitles-first', emoji: '💬', blurb: 'Multi-subtitle setup.' },
                ]"
                :key="p.id"
                class="preset-card"
                @click="
                  form.p2pStrictness = 'required';
                  form.coreFilter = p.id === '4k-max' || p.id === 'anime' ? 'extended' : 'standard';
                  form.languages = p.id === 'anime' ? ['Japanese', 'English'] : p.id === 'multilingual' ? ['English', 'Spanish', 'French', 'German'] : ['English'];
                  form.subtitles = p.id === 'subs-first' ? ['English', 'Spanish', 'French'] : ['English'];
                  form.enabledAddons = p.id === 'lightweight' ? ['meteor', 'torrentio'] : p.id === '4k-max' ? ['meteor', 'comet', 'torrentio', 'torrents-db', 'peerflix', 'stremthruTorz'] : p.id === 'anime' ? ['mediafusion', 'meteor', 'comet', 'torrentio'] : ['meteor', 'comet', 'torrentio', 'torrents-db', 'peerflix'];
                "
              >
                <span class="preset-emoji">{{ p.emoji }}</span>
                <span class="preset-name">{{ p.name }}</span>
                <span class="preset-blurb">{{ p.blurb }}</span>
              </button>
            </div>
          </div>

          <!-- Instance -->
          <div class="adv-card">
            <h3>🖥️ AIOStreams instance</h3>
            <label>Instance URL</label>
            <input v-model="form.instanceUrl" type="url" placeholder="https://…" class="input" list="recent-instances" />
            <datalist id="recent-instances-adv">
              <option v-for="url in recentInstances" :key="url" :value="url" />
            </datalist>
            <p v-if="form.instanceUrl && !instanceValid" class="error-text">Enter a full URL including https://</p>
            <label style="margin-top: 12px">Addon name (optional)</label>
            <input v-model="form.addonName" type="text" placeholder="AIOStreams (default)" class="input" />
          </div>

          <!-- Languages -->
          <div class="adv-card">
            <h3>🌐 Language preferences</h3>
            <label>Preferred audio languages</label>
            <div class="lang-chips">
              <button
                v-for="l in languages"
                :key="l.value"
                :class="['chip', { active: form.languages.includes(l.value) }]"
                @click="form.languages.includes(l.value) ? form.languages = form.languages.filter((x) => x !== l.value) : form.languages.push(l.value)"
              >{{ l.label }}</button>
            </div>
            <label style="margin-top: 12px">Preferred subtitles</label>
            <div class="lang-chips">
              <button
                v-for="s in subtitles"
                :key="s.value"
                :class="['chip', { active: form.subtitles.includes(s.value) }]"
                @click="form.subtitles.includes(s.value) ? form.subtitles = form.subtitles.filter((x) => x !== s.value) : form.subtitles.push(s.value)"
              >{{ s.label }}</button>
            </div>
          </div>

          <!-- Filtering -->
          <div class="adv-card">
            <h3>🔧 Filtering & formatting</h3>
            <label>Core filter (SEL density)</label>
            <select v-model="form.coreFilter" class="input">
              <option value="standard">Standard SEL (~20 results/title)</option>
              <option value="extended">Extended SEL (~40 results/title)</option>
            </select>
            <label style="margin-top: 12px">Formatter</label>
            <select v-model="form.formatterChoice" class="input">
              <option value="default">Default (recommended)</option>
              <option value="min">Minimal</option>
              <option value="tamtaro">Tamtaro</option>
              <option value="viren">Viren</option>
              <option value="none">None</option>
            </select>
            <div style="margin-top: 16px">
              <label>P2P stream-type enforcement</label>
              <div class="strict-grid">
                <button
                  :class="['strict-card', { active: form.p2pStrictness === 'preferred' }]"
                  @click="form.p2pStrictness = 'preferred'"
                >
                  <strong>Preferred</strong>
                  <p>P2P prioritised; other types allowed as fallback.</p>
                </button>
                <button
                  :class="['strict-card', { active: form.p2pStrictness === 'required' }]"
                  @click="form.p2pStrictness = 'required'"
                >
                  <strong>Required</strong>
                  <p>Only raw P2P (magnet) streams pass — safest for Nuvio.</p>
                </button>
              </div>
            </div>
          </div>

          <!-- Scrapers -->
          <div class="adv-card">
            <div class="card-header-row">
              <h3>📦 P2P scraper addons</h3>
              <button class="btn btn-sm" @click="resetAddonsToDefault">Reset to defaults</button>
            </div>
            <div class="scraper-search-row">
              <input v-model="scraperQuery" type="search" placeholder="Search scrapers…" class="input" />
              <button class="btn btn-sm" @click="enableAllVisible">Enable all</button>
              <button class="btn btn-sm" @click="disableAllVisible">Disable all</button>
            </div>
            <p class="muted small">P2P scrapers ({{ filteredP2p.filter((a) => form.enabledAddons.includes(a.type)).length }}/{{ p2pAddons.length }})</p>
            <div class="addon-grid">
              <button
                v-for="a in filteredP2p"
                :key="a.type"
                :class="['addon-card', { on: form.enabledAddons.includes(a.type) }]"
                @click="toggleAddon(a.type)"
              >
                <span class="addon-name">{{ a.name }}</span>
                <span class="addon-type">{{ a.type }}</span>
                <span :class="['addon-cat', a.category.toLowerCase()]">{{ a.category }}</span>
              </button>
            </div>
            <p v-if="httpAddons.length > 0" class="muted small" style="margin-top: 16px">HTTP scrapers ({{ filteredHttp.filter((a) => form.enabledAddons.includes(a.type)).length }}/{{ httpAddons.length }})</p>
            <div class="addon-grid" v-if="httpAddons.length > 0">
              <button
                v-for="a in filteredHttp"
                :key="a.type"
                :class="['addon-card', { on: form.enabledAddons.includes(a.type) }]"
                @click="toggleAddon(a.type)"
              >
                <span class="addon-name">{{ a.name }}</span>
                <span class="addon-type">{{ a.type }}</span>
                <span :class="['addon-cat', a.category.toLowerCase()]">{{ a.category }}</span>
              </button>
            </div>
            <p class="muted small">{{ enabledCount }} of {{ addons.length }} scrapers enabled.</p>
          </div>

          <!-- Advanced (collapsible) -->
          <details class="adv-card collapsible-card">
            <summary class="card-header-row">
              <h3>🔑 Advanced — API keys, statistics, timeout</h3>
            </summary>
            <div style="padding-top: 12px">
              <label>TMDB API key (optional)</label>
              <input v-model="form.tmdbApiKey" type="password" placeholder="Enables metadata-based matching" class="input" />
              <label style="margin-top: 12px">TVDB API key (optional)</label>
              <input v-model="form.tvdbApiKey" type="password" placeholder="For TV show metadata" class="input" />
              <label style="margin-top: 12px">Per-addon scrape timeout: {{ (form.timeout / 1000).toFixed(1) }}s</label>
              <input v-model.number="form.timeout" type="range" min="5000" max="60000" step="1000" class="slider" />
              <label class="checkbox-row">
                <input v-model="form.showStats" type="checkbox" /> Show statistics footer
              </label>
            </div>
          </details>
        </div>

        <!-- Preview column -->
        <div class="adv-preview">
          <div class="status-bar">
            <span class="badge badge-p2p">🛡️ P2P mode</span>
            <span class="badge">{{ form.p2pStrictness }}</span>
            <span class="badge">📦 {{ enabledCount }} scrapers</span>
            <span v-if="templateVersion" class="badge">TAMS v{{ templateVersion }}</span>
            <span class="auto-sync">
              <span v-if="generating">⏳ Generating…</span>
              <span v-else>🟢 Auto-syncing</span>
            </span>
          </div>

          <!-- Config + actions -->
          <div class="adv-card">
            <div class="card-header-row">
              <h3>📄 Config JSON</h3>
              <div class="header-actions">
                <button class="btn btn-sm" @click="copyToClipboard(configJson, 'Config copied')">Copy</button>
                <button class="btn btn-sm" @click="downloadConfig">Download</button>
              </div>
            </div>
            <pre v-if="configJson" class="config-block">{{ configJson }}</pre>
            <div v-else class="loading-skeleton" />
          </div>

          <!-- Install -->
          <div class="adv-card">
            <h3>🚀 Create protected manifest</h3>
            <p class="muted">Push this config to your instance and get a ready-to-paste manifest URL.</p>
            <label>Manifest password (optional)</label>
            <input v-model="installPassword" type="text" placeholder="Auto-generated if blank" class="input" />
            <button class="btn btn-primary" :disabled="!canInstall" @click="handleInstall" style="margin-top: 12px; width: 100%">
              <span v-if="installing">⏳ Creating…</span>
              <span v-else>🚀 Create protected manifest</span>
            </button>
            <p v-if="!instanceValid" class="muted small">Enter a valid instance URL to enable this.</p>
          </div>

          <!-- Install result -->
          <div v-if="installResult" class="install-success">
            <p>✅ <strong>Manifest created!</strong></p>
            <div class="copy-field">
              <label>Manifest URL</label>
              <div class="copy-row">
                <input :value="installResult.manifestUrl" readonly class="input mono" />
                <button class="btn btn-sm" @click="copyToClipboard(installResult.manifestUrl, 'Copied')">Copy</button>
              </div>
            </div>
            <div class="copy-field">
              <label>Configure URL</label>
              <div class="copy-row">
                <input :value="installResult.configureUrl" readonly class="input mono" />
                <button class="btn btn-sm" @click="copyToClipboard(installResult.configureUrl, 'Copied')">Copy</button>
              </div>
            </div>
            <div class="copy-field">
              <label>Manifest password (keep safe)</label>
              <div class="copy-row">
                <input :value="installResult.password" readonly class="input mono" />
                <button class="btn btn-sm" @click="copyToClipboard(installResult.password, 'Copied')">Copy</button>
              </div>
            </div>
          </div>

          <div v-if="installError" class="callout callout-warn">
            <strong>Install failed:</strong> {{ installError }}
          </div>
        </div>
      </div>
    </div>

    <div v-if="!template && !templateError" class="loading">
      <p>⏳ Loading the TAMS template…</p>
    </div>
  </div>
</template>

<style scoped>
.p2p-gen {
  margin: 24px 0;
  font-family: inherit;
}

/* Mode toggle */
.mode-toggle {
  display: inline-flex;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 4px;
  background: var(--vp-c-bg-soft);
  margin-bottom: 20px;
}
.mode-btn {
  padding: 8px 16px;
  border: none;
  background: transparent;
  color: var(--vp-c-text-2);
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.mode-btn.active {
  background: var(--vp-c-brand);
  color: var(--vp-c-white);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
.mode-btn:not(.active):hover {
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
}

/* Simple mode */
.simple-header {
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  padding: 20px 24px;
  background: var(--vp-c-bg-soft);
  margin-bottom: 20px;
}
.simple-header h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
}
.simple-header p {
  margin: 0 0 12px 0;
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 1.6;
}
.default-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  background: var(--vp-c-bg);
}
.badge-p2p {
  border-color: rgba(16, 185, 129, 0.4);
  background: rgba(16, 185, 129, 0.1);
  color: rgb(16, 185, 129);
}

.simple-form {
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  padding: 24px;
  background: var(--vp-c-bg);
}
.step {
  margin-bottom: 20px;
}
.step label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}
.step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--vp-c-brand);
  color: var(--vp-c-white);
  font-size: 12px;
  font-weight: 700;
}
.req { color: var(--vp-c-danger); font-size: 10px; text-transform: uppercase; }
.opt { color: var(--vp-c-text-3); font-size: 10px; text-transform: uppercase; }

.input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 14px;
  font-family: inherit;
}
.input:focus {
  outline: 2px solid var(--vp-c-brand);
  outline-offset: -1px;
}
.input.mono { font-family: var(--vp-font-family-mono); font-size: 12px; }
.hint { font-size: 12px; color: var(--vp-c-text-3); margin: 4px 0 0 0; }
.hint.center { text-align: center; }
.error-text { font-size: 12px; color: var(--vp-c-danger); margin: 4px 0 0 0; }

.btn {
  padding: 8px 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}
.btn:hover { border-color: var(--vp-c-brand); }
.btn-sm { padding: 4px 10px; font-size: 12px; }
.btn-primary {
  background: var(--vp-c-brand);
  color: var(--vp-c-white);
  border-color: var(--vp-c-brand);
}
.btn-primary:hover { opacity: 0.9; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-large {
  width: 100%;
  padding: 14px;
  font-size: 16px;
  font-weight: 600;
  margin-top: 8px;
}

.collapsible {
  margin-top: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 12px;
}
.collapsible summary {
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--vp-c-text-2);
}

/* Install success */
.install-success {
  border: 1px solid rgba(16, 185, 129, 0.4);
  border-radius: 12px;
  padding: 16px 20px;
  background: rgba(16, 185, 129, 0.05);
  margin: 16px 0;
}
.copy-field { margin-top: 12px; }
.copy-field label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--vp-c-text-2);
}
.copy-row { display: flex; gap: 8px; }
.copy-row .input { flex: 1; }

.simple-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 20px;
  padding: 12px 16px;
  border: 1px dashed var(--vp-c-divider);
  border-radius: 8px;
}
.link-btn {
  background: none;
  border: none;
  color: var(--vp-c-brand);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.link-btn:hover { text-decoration: underline; }
.link-btn-sm {
  background: none;
  border: none;
  color: var(--vp-c-text-3);
  font-size: 12px;
  cursor: pointer;
}
.link-btn-sm:hover { color: var(--vp-c-text-1); }

.config-preview {
  max-height: 300px;
  overflow: auto;
  font-size: 11px;
  font-family: var(--vp-font-family-mono);
  background: var(--vp-c-bg-soft);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
  white-space: pre-wrap;
  word-break: break-all;
}

/* Advanced mode */
.advanced-mode { }
.adv-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
}
.adv-form { display: flex; flex-direction: column; gap: 16px; }
.adv-preview { display: flex; flex-direction: column; gap: 16px; }

.adv-card {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 20px;
  background: var(--vp-c-bg);
}
.adv-card h3 {
  margin: 0 0 8px 0;
  font-size: 15px;
}
.adv-card label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 4px;
  color: var(--vp-c-text-2);
}
.muted { color: var(--vp-c-text-2); font-size: 13px; }
.small { font-size: 11px; }

.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.header-actions { display: flex; gap: 4px; }

.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
  margin-top: 12px;
}
.preset-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg);
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
}
.preset-card:hover {
  border-color: var(--vp-c-brand);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
.preset-emoji { font-size: 20px; }
.preset-name { font-weight: 600; font-size: 13px; }
.preset-blurb { font-size: 11px; color: var(--vp-c-text-3); }

.lang-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  padding: 4px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  background: var(--vp-c-bg);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}
.chip.active {
  background: var(--vp-c-brand);
  color: var(--vp-c-white);
  border-color: var(--vp-c-brand);
}

.strict-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 8px;
}
.strict-card {
  padding: 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg);
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
}
.strict-card.active {
  border-color: rgb(16, 185, 129);
  background: rgba(16, 185, 129, 0.05);
}
.strict-card strong { font-size: 13px; display: block; }
.strict-card p { font-size: 11px; color: var(--vp-c-text-3); margin: 4px 0 0 0; }

.scraper-search-row {
  display: flex;
  gap: 6px;
  margin: 12px 0;
}
.scraper-search-row .input { flex: 1; }

.addon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 6px;
  margin-top: 8px;
}
.addon-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
  opacity: 0.85;
}
.addon-card:hover { opacity: 1; border-color: var(--vp-c-brand); }
.addon-card.on {
  border-color: rgba(16, 185, 129, 0.5);
  background: rgba(16, 185, 129, 0.05);
  opacity: 1;
}
.addon-name { font-size: 13px; font-weight: 500; }
.addon-type { font-size: 10px; color: var(--vp-c-text-3); }
.addon-cat {
  display: inline-block;
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 999px;
  text-transform: uppercase;
  font-weight: 600;
  margin-top: 4px;
  align-self: flex-start;
}
.addon-cat.p2p { background: rgba(16, 185, 129, 0.1); color: rgb(16, 185, 129); }
.addon-cat.http { background: rgba(245, 158, 11, 0.1); color: rgb(245, 158, 11); }
.addon-cat.subs { background: rgba(59, 130, 246, 0.1); color: rgb(59, 130, 246); }

.collapsible-card { cursor: pointer; }
.collapsible-card summary { list-style: none; }
.collapsible-card summary::-webkit-details-marker { display: none; }

.checkbox-row {
  display: flex !important;
  align-items: center;
  gap: 8px;
  margin-top: 12px !important;
  cursor: pointer;
}

.slider { width: 100%; margin-top: 8px; }

.status-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg);
}
.auto-sync {
  margin-left: auto;
  font-size: 12px;
  color: var(--vp-c-text-3);
}

.config-block {
  max-height: 400px;
  overflow: auto;
  font-size: 11px;
  font-family: var(--vp-font-family-mono);
  background: var(--vp-c-bg-soft);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
  white-space: pre-wrap;
  word-break: break-all;
  margin-top: 8px;
}
.loading-skeleton {
  height: 200px;
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
  animation: pulse 2s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.callout {
  padding: 12px 16px;
  border-radius: 8px;
  margin: 12px 0;
  font-size: 14px;
}
.callout-warn {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: rgb(245, 158, 11);
}

.loading {
  text-align: center;
  padding: 40px;
  color: var(--vp-c-text-2);
}

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
</style>
