<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useData, withBase } from 'vitepress'

const { lang } = useData()

// --- Translations ---
const translations = {
  en: {
    title: 'Account details',
    nuvioAccount: 'Nuvio account',
    newAccountsAuto: 'New accounts are created automatically',
    emailLabel: 'Email address',
    emailPlaceholder: 'you@example.com',
    emailReqError: 'Enter your email address.',
    emailInvalidError: 'Enter a valid email address, such as name@example.com.',
    passwordLabel: 'Nuvio password',
    passwordPlaceholder: 'At least 6 characters',
    passwordMinError: 'Your Nuvio password must be at least 6 characters.',
    torboxTitle: 'TorBox',
    torboxDesc: 'Connect your account with an API key',
    needTorbox: 'Need TorBox?',
    torboxRefDesc: 'Open a subscription with my referral applied',
    getTorbox: 'Get TorBox',
    torboxKeyLabel: 'TorBox API key',
    torboxKeyPlaceholder: 'Paste your TorBox API key',
    torboxHelp: 'Find it in',
    torboxHelpLink: 'TorBox settings',
    torboxReqError: 'Enter your TorBox API key.',
    aiostreamsPwdLabel: 'AIOStreams config password',
    aiostreamsPwdHelp: 'Keep this if you want to edit AIOStreams later.',
    aiostreamsPwdMinError: 'The AIOStreams config password must be at least 6 characters.',
    regenerate: 'Regenerate',
    advanced: 'Advanced matching',
    advancedSub: 'Optional TMDB and TVDB keys',
    advancedDesc: "Tam's metadata matching is enabled when a TMDB key is supplied. Without it, only those metadata-dependent filters are disabled.",
    tmdbLabel: 'TMDB API key',
    tvdbLabel: 'TVDB API key',
    optional: 'Optional',
    submitBtn: 'Set up my Nuvio account',
    privacyNote: 'Credentials are sent only to Nuvio, TorBox, and Midnight\'s AIOStreams instance for this setup request.',
    buildingTitle: 'Building your setup',
    validating: 'Validate details',
    checkTorbox: 'Check TorBox',
    connectNuvio: 'Connect Nuvio',
    buildAiostreams: 'Build AIOStreams',
    installAddons: 'Install addons',
    complete: 'Complete',
    readyTitle: 'Your Nuvio setup is ready',
    installs: 'Installs',
    addonAio: 'AIOStreams',
    addonCinema: 'Cinemeta',
    manifestLabel: 'AIOStreams manifest',
    copy: 'Copy',
    copied: 'Copied',
    openAioSettings: 'Open AIOStreams settings',
    startOver: 'Start over',
    retryBtn: 'Try again',
    checkFieldBtn: 'Check field',
    setupStopped: 'Setup stopped',
    keysSecureNote: 'Keys are never stored',
    yourCredentials: 'Your credentials',
    credentialsNote: 'Save these now — they won\'t be shown again.',
    nuvioEmail: 'Nuvio email',
    nuvioPasswordLabel: 'Nuvio password',
    aiostreamsPasswordLabel: 'AIOStreams settings password',
    newAccountBadge: 'New account'
  },
  nl: {
    title: 'Accountgegevens',
    nuvioAccount: 'Nuvio-account',
    newAccountsAuto: 'Nieuwe accounts worden automatisch aangemaakt',
    emailLabel: 'E-mailadres',
    emailPlaceholder: 'je@voorbeeld.com',
    emailReqError: 'Voer je e-mailadres in.',
    emailInvalidError: 'Voer een geldig e-mailadres in, zoals naam@voorbeeld.com.',
    passwordLabel: 'Nuvio-wachtwoord',
    passwordPlaceholder: 'Minimaal 6 tekens',
    passwordMinError: 'Je Nuvio-wachtwoord moet minimaal 6 tekens lang zijn.',
    torboxTitle: 'TorBox',
    torboxDesc: 'Verbind je account met een API-sleutel',
    needTorbox: 'TorBox nodig?',
    torboxRefDesc: 'Open een abonnement met mijn referral toegepast',
    getTorbox: 'TorBox verkrijgen',
    torboxKeyLabel: 'TorBox API-sleutel',
    torboxKeyPlaceholder: 'Plak je TorBox API-sleutel',
    torboxHelp: 'Vind deze in',
    torboxHelpLink: 'TorBox-instellingen',
    torboxReqError: 'Voer je TorBox API-sleutel in.',
    aiostreamsPwdLabel: 'AIOStreams-configuratie wachtwoord',
    aiostreamsPwdHelp: 'Bewaar dit als je AIOStreams later wilt bewerken.',
    aiostreamsPwdMinError: 'Het AIOStreams-configuratiewachtwoord moet minimaal 6 tekens lang zijn.',
    regenerate: 'Genereer nieuwe',
    advanced: 'Geavanceerd koppelen',
    advancedSub: 'Optionele TMDB- en TVDB-sleutels',
    advancedDesc: "Tam's metadata-koppeling wordt ingeschakeld wanneer een TMDB-sleutel wordt opgegeven. Zonder deze sleutel worden alleen de filters die afhankelijk zijn van metadata uitgeschakeld.",
    tmdbLabel: 'TMDB API-sleutel',
    tvdbLabel: 'TVDB API-sleutel',
    optional: 'Optioneel',
    submitBtn: 'Mijn Nuvio-account instellen',
    privacyNote: 'Inloggegevens worden voor dit installatieverzoek alleen verzonden naar Nuvio, TorBox en de AIOStreams-instantie van Midnight.',
    buildingTitle: 'Bezig met het bouwen van je setup',
    validating: 'Gegevens valideren',
    checkTorbox: 'TorBox controleren',
    connectNuvio: 'Nuvio verbinden',
    buildAiostreams: 'AIOStreams bouwen',
    installAddons: 'Addons installeren',
    complete: 'Voltooid',
    readyTitle: 'Je Nuvio-setup is gereed',
    installs: 'Installeert',
    addonAio: 'AIOStreams',
    addonCinema: 'Cinemeta',
    manifestLabel: 'AIOStreams manifest',
    copy: 'Kopiëren',
    copied: 'Gekopieerd',
    openAioSettings: 'Open AIOStreams-instellingen',
    startOver: 'Opnieuw beginnen',
    retryBtn: 'Opnieuw proberen',
    checkFieldBtn: 'Controleer veld',
    setupStopped: 'Setup gestopt',
    keysSecureNote: 'Sleutels worden nooit opgeslagen',
    yourCredentials: 'Jouw inloggegevens',
    credentialsNote: 'Sla deze nu op — ze worden niet opnieuw getoond.',
    nuvioEmail: 'Nuvio e-mail',
    nuvioPasswordLabel: 'Nuvio-wachtwoord',
    aiostreamsPasswordLabel: 'AIOStreams-instellingen wachtwoord',
    newAccountBadge: 'Nieuw account'
  }
}

const t = computed(() => {
  const currentLang = (lang.value || '').startsWith('nl') ? 'nl' : 'en'
  return translations[currentLang]
})

// --- State Management ---
type ViewMode = 'form' | 'progress' | 'result'
const currentView = ref<ViewMode>('form')
const isCollapsed = ref(true)

const form = reactive({
  email: '',
  nuvioPassword: '',
  torboxApiKey: '',
  aiostreamsPassword: '',
  tmdbApiKey: '',
  tvdbApiKey: ''
})

const errors = reactive({
  email: '',
  nuvioPassword: '',
  torboxApiKey: '',
  aiostreamsPassword: ''
})

const showNuvioPassword = ref(false)
const showTorboxApiKey = ref(false)
const advancedOpen = ref(false)

const progressMessage = ref('Starting...')
const activeStep = ref('details')
const completedSteps = ref<string[]>([])
const stepsOrder = ['details', 'torbox', 'nuvio', 'aiostreams', 'addons']

interface SetupResult {
  email: string
  nuvioAccountCreated: boolean
  nuvioPassword?: string
  aiostreamsPassword: string
  installedProfiles: number
  aiostreamsManifest: string
  aiostreamsConfigureUrl: string
  aiostreamsName: string
  tamTemplateVersion: string
  metadataMatchingEnabled: boolean
  torboxPlan: number
  addons: string[]
}

const result = ref<SetupResult | null>(null)
const globalError = ref<string | null>(null)
const errorStep = ref<string>('setup')
const lastErrorField = ref<string | null>(null)
const isSubmitting = ref(false)
const copySuccess = ref(false)

// --- Helper Functions ---
function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
  return Array.from(bytes).map((val) => alphabet[val % alphabet.length]).join('')
}

function generatePassword() {
  form.aiostreamsPassword = randomPassword()
  errors.aiostreamsPassword = ''
}

// Initialize password
generatePassword()

function validateForm(): boolean {
  let isValid = true
  errors.email = ''
  errors.nuvioPassword = ''
  errors.torboxApiKey = ''
  errors.aiostreamsPassword = ''

  if (!form.email.trim()) {
    errors.email = t.value.emailReqError
    isValid = false
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = t.value.emailInvalidError
    isValid = false
  }

  if (form.nuvioPassword.length < 6) {
    errors.nuvioPassword = t.value.passwordMinError
    isValid = false
  }

  if (!form.torboxApiKey.trim()) {
    errors.torboxApiKey = t.value.torboxReqError
    isValid = false
  }

  if (form.aiostreamsPassword.length < 6) {
    errors.aiostreamsPassword = t.value.aiostreamsPwdMinError
    isValid = false
  }

  return isValid
}

async function handleCopy() {
  if (!result.value) return
  await navigator.clipboard.writeText(result.value.aiostreamsManifest)
  copySuccess.value = true
  setTimeout(() => {
    copySuccess.value = false
  }, 1500)
}

function startOver() {
  form.email = ''
  form.nuvioPassword = ''
  form.torboxApiKey = ''
  form.tmdbApiKey = ''
  form.tvdbApiKey = ''
  generatePassword()
  globalError.value = null
  lastErrorField.value = null
  completedSteps.value = []
  activeStep.value = 'details'
  currentView.value = 'form'
}

function handleRetry() {
  globalError.value = null
  currentView.value = 'form'
  if (lastErrorField.value && lastErrorField.value in form) {
    const el = document.getElementById(lastErrorField.value)
    el?.focus()
  }
}

// --- Setup Submission (SSE stream parsing) ---
async function submitSetup() {
  if (!validateForm()) return

  isSubmitting.value = true
  globalError.value = null
  lastErrorField.value = null
  completedSteps.value = []
  activeStep.value = 'details'
  progressMessage.value = 'Validating details...'
  currentView.value = 'progress'

  try {
    const response = await fetch(withBase('/api/ai/setup'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(form)
    })

    if (!response.ok) {
      const errBody = await response.json().catch(() => null)
      throw new Error(errBody?.error || `Request failed with status ${response.status}`)
    }

    if (!response.body) {
      throw new Error('No response stream available.')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        const event = JSON.parse(line)

        if (event.type === 'progress') {
          activeStep.value = event.step
          progressMessage.value = event.message
          // Add to completed steps if it's past the step
          const currentIdx = stepsOrder.indexOf(event.step)
          completedSteps.value = stepsOrder.slice(0, currentIdx)
        } else if (event.type === 'error') {
          throw { message: event.message, step: event.step }
        } else if (event.type === 'result') {
          completedSteps.value = [...stepsOrder]
          activeStep.value = 'complete'
          result.value = event.data
          currentView.value = 'result'
          isSubmitting.value = false
          return
        }
      }

      if (done) break
    }
  } catch (err: any) {
    isSubmitting.value = false
    const errMsg = err.message || 'An unexpected error occurred.'
    const step = err.step || 'setup'
    errorStep.value = step

    globalError.value = errMsg

    if (step === 'torbox') {
      errors.torboxApiKey = errMsg
      lastErrorField.value = 'torboxApiKey'
    } else if (step === 'details' && /email/i.test(errMsg)) {
      errors.email = errMsg
      lastErrorField.value = 'email'
    } else if (step === 'details' && /password/i.test(errMsg)) {
      errors.nuvioPassword = errMsg
      lastErrorField.value = 'nuvioPassword'
    }

    currentView.value = 'form'
  }
}
</script>

<template>
  <div class="nuvio-quickstart-wrapper">
    <!-- TIP Block -->
    <div class="custom-block tip toggler-tip">
      <p class="custom-block-title">TIP</p>
      <p>
        <span v-if="(lang || '').startsWith('nl')">
          Voor een eenvoudigere installatie kun je de <strong>Nuvio Quickstart Tool</strong> hieronder gebruiken om Nuvio addons voor je in te stellen. Dit installeert <em>AIOStreams</em> met behulp van het sjabloon van Tam-Taro en <em>Cinemeta</em>.
        </span>
        <span v-else>
          For an easier setup, use the <strong>Nuvio Quickstart Tool</strong> below to set up Nuvio addons for you. This will install <em>AIOStreams</em> using Tam-Taro's template and <em>Cinemeta</em>.
        </span>
      </p>
    </div>

    <!-- The actual setup tool card -->
    <div class="nuvio-quickstart border-base" :class="{ 'is-expanded': !isCollapsed }">
      <!-- HEADER acting as accordion toggle -->
      <div class="qs-header clickable-header" @click="isCollapsed = !isCollapsed" role="button" :aria-expanded="!isCollapsed" tabindex="0" @keydown.enter.prevent="isCollapsed = !isCollapsed" @keydown.space.prevent="isCollapsed = !isCollapsed">
        <div class="qs-brand">
          <svg viewBox="0 0 40 40" class="logo-mark" aria-hidden="true">
            <path d="M9 27V13l11-6 11 6v14l-11 6-11-6Z"></path>
            <path d="m15 24 5-9 5 9"></path>
          </svg>
          <span class="qs-brand-text">Nuvio Quickstart Tool</span>
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

      <!-- COLLAPSIBLE FORM BODY -->
      <div v-show="!isCollapsed" class="qs-body">

    <!-- ERROR PANEL -->
    <div v-if="globalError" class="error-panel" role="alert">
      <div class="error-icon">!</div>
      <div class="error-content">
        <strong class="error-title">{{ t.setupStopped }}</strong>
        <p class="error-desc">{{ globalError }}</p>
      </div>
      <button class="retry-btn" type="button" @click="handleRetry">
        {{ lastErrorField ? t.checkFieldBtn : t.retryBtn }}
      </button>
    </div>

    <!-- FORM VIEW -->
    <form v-if="currentView === 'form'" @submit.prevent="submitSetup" class="qs-form" novalidate>
      <div class="form-section-title">
        <span class="step-num">1</span>
        <div>
          <strong>{{ t.nuvioAccount }}</strong>
          <small>{{ t.newAccountsAuto }}</small>
        </div>
      </div>

      <!-- Email Field -->
      <div class="form-field" :class="{ 'has-error': errors.email }">
        <label for="email" class="field-label">{{ t.emailLabel }}</label>
        <div class="input-container">
          <svg class="field-icon" viewBox="0 0 20 20" aria-hidden="true">
            <path d="m3 5 7 5 7-5"></path>
            <rect x="2" y="4" width="16" height="12" rx="3"></rect>
          </svg>
          <input
            id="email"
            v-model="form.email"
            type="email"
            :placeholder="t.emailPlaceholder"
            autocomplete="email"
            required
            @input="errors.email = ''"
          />
        </div>
        <span v-if="errors.email" class="field-error">{{ errors.email }}</span>
      </div>

      <!-- Nuvio Password Field -->
      <div class="form-field" :class="{ 'has-error': errors.nuvioPassword }">
        <label for="nuvioPassword" class="field-label">{{ t.passwordLabel }}</label>
        <div class="input-container">
          <svg class="field-icon" viewBox="0 0 20 20" aria-hidden="true">
            <rect x="3" y="8" width="14" height="10" rx="3"></rect>
            <path d="M6 8V6a4 4 0 0 1 8 0v2"></path>
          </svg>
          <input
            id="nuvioPassword"
            v-model="form.nuvioPassword"
            :type="showNuvioPassword ? 'text' : 'password'"
            :placeholder="t.passwordPlaceholder"
            autocomplete="current-password"
            required
            @input="errors.nuvioPassword = ''"
          />
          <button class="password-toggle" type="button" @click="showNuvioPassword = !showNuvioPassword" aria-label="Toggle password visibility">
            <svg class="toggle-icon" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z"></path>
              <circle cx="10" cy="10" r="2.5"></circle>
            </svg>
          </button>
        </div>
        <span v-if="errors.nuvioPassword" class="field-error">{{ errors.nuvioPassword }}</span>
      </div>

      <div class="divider"></div>

      <div class="form-section-title">
        <span class="step-num">2</span>
        <div>
          <strong>{{ t.torboxTitle }}</strong>
          <small>{{ t.torboxDesc }}</small>
        </div>
      </div>

      <!-- TorBox Callout Box -->
      <div class="torbox-callout">
        <div class="callout-copy">
          <strong>{{ t.needTorbox }}</strong>
          <small class="ref-desc">
            {{ t.torboxRefDesc }}
            <svg viewBox="0 0 24 24" class="heart-icon" aria-hidden="true">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path>
            </svg>
          </small>
        </div>
        <a
          href="https://torbox.app/subscription?referral=41d1ac85-ee5e-4699-9f0a-92e67cbc2fb2"
          target="_blank"
          rel="noreferrer"
          class="callout-link"
        >
          {{ t.getTorbox }}
          <svg viewBox="0 0 20 20" aria-hidden="true" class="external-icon">
            <path d="M7 13 13 7M8 7h5v5"></path>
          </svg>
        </a>
      </div>

      <!-- TorBox API Key Field -->
      <div class="form-field" :class="{ 'has-error': errors.torboxApiKey }">
        <label for="torboxApiKey" class="field-label">{{ t.torboxKeyLabel }}</label>
        <div class="input-container">
          <svg class="field-icon" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="7" cy="10" r="4"></circle>
            <path d="M11 10h7M15 10v3M17 10v2"></path>
          </svg>
          <input
            id="torboxApiKey"
            v-model="form.torboxApiKey"
            :type="showTorboxApiKey ? 'text' : 'password'"
            :placeholder="t.torboxKeyPlaceholder"
            autocomplete="off"
            required
            @input="errors.torboxApiKey = ''"
          />
          <button class="password-toggle" type="button" @click="showTorboxApiKey = !showTorboxApiKey" aria-label="Toggle API Key visibility">
            <svg class="toggle-icon" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z"></path>
              <circle cx="10" cy="10" r="2.5"></circle>
            </svg>
          </button>
        </div>
        <div class="field-help">
          {{ t.torboxHelp }}
          <a href="https://torbox.app/settings" target="_blank" rel="noreferrer">{{ t.torboxHelpLink }}</a>.
        </div>
        <span v-if="errors.torboxApiKey" class="field-error">{{ errors.torboxApiKey }}</span>
      </div>

      <!-- AIOStreams Config Password Field -->
      <div class="form-field" :class="{ 'has-error': errors.aiostreamsPassword }">
        <label for="aiostreamsPassword" class="field-label">{{ t.aiostreamsPwdLabel }}</label>
        <div class="input-container">
          <svg class="field-icon" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 2v3M4.3 4.3l2.1 2.1M2 10h3M4.3 15.7l2.1-2.1M10 18v-3M15.7 15.7l-2.1-2.1M18 10h-3M15.7 4.3l-2.1 2.1"></path>
          </svg>
          <input
            id="aiostreamsPassword"
            v-model="form.aiostreamsPassword"
            type="text"
            required
            @input="errors.aiostreamsPassword = ''"
          />
          <button class="text-btn-action" type="button" @click="generatePassword">
            {{ t.regenerate }}
          </button>
        </div>
        <div class="field-help">{{ t.aiostreamsPwdHelp }}</div>
        <span v-if="errors.aiostreamsPassword" class="field-error">{{ errors.aiostreamsPassword }}</span>
      </div>

      <!-- Advanced Details -->
      <details class="advanced-section" :open="advancedOpen" @toggle="advancedOpen = ($event.target as any).open">
        <summary class="advanced-summary">
          <div>
            <strong>{{ t.advanced }}</strong>
            <small>{{ t.advancedSub }}</small>
          </div>
          <svg viewBox="0 0 20 20" aria-hidden="true" class="summary-arrow" :class="{ rotated: advancedOpen }">
            <path d="m6 8 4 4 4-4"></path>
          </svg>
        </summary>
        <div class="advanced-body">
          <p class="advanced-desc-text">{{ t.advancedDesc }}</p>
          <div class="form-field">
            <label for="tmdbApiKey" class="field-label">{{ t.tmdbLabel }} <i class="optional-label">({{ t.optional }})</i></label>
            <input
              id="tmdbApiKey"
              v-model="form.tmdbApiKey"
              type="password"
              class="simple-input"
              autocomplete="off"
            />
          </div>
          <div class="form-field">
            <label for="tvdbApiKey" class="field-label">{{ t.tvdbLabel }} <i class="optional-label">({{ t.optional }})</i></label>
            <input
              id="tvdbApiKey"
              v-model="form.tvdbApiKey"
              type="password"
              class="simple-input"
              autocomplete="off"
            />
          </div>
        </div>
      </details>

      <!-- Submit Button -->
      <button class="btn-primary btn-large btn-submit" type="submit" :disabled="isSubmitting">
        <span class="btn-content">
          {{ t.submitBtn }}
          <svg viewBox="0 0 20 20" aria-hidden="true" class="btn-arrow-icon">
            <path d="M4 10h12M12 6l4 4-4 4"></path>
          </svg>
        </span>
      </button>

      <p class="privacy-text">{{ t.privacyNote }}</p>
    </form>

    <!-- PROGRESS VIEW -->
    <div v-else-if="currentView === 'progress'" class="progress-panel" aria-live="polite">
      <div class="progress-heading">
        <div class="spinner"></div>
        <div class="progress-heading-text">
          <strong>{{ t.buildingTitle }}</strong>
          <small>{{ progressMessage }}</small>
        </div>
      </div>
      <ol class="progress-list">
        <li :class="{ current: activeStep === 'details', done: completedSteps.includes('details') }">
          <span></span>{{ t.validating }}
        </li>
        <li :class="{ current: activeStep === 'torbox', done: completedSteps.includes('torbox') }">
          <span></span>{{ t.checkTorbox }}
        </li>
        <li :class="{ current: activeStep === 'nuvio', done: completedSteps.includes('nuvio') }">
          <span></span>{{ t.connectNuvio }}
        </li>
        <li :class="{ current: activeStep === 'aiostreams', done: completedSteps.includes('aiostreams') }">
          <span></span>{{ t.buildAiostreams }}
        </li>
        <li :class="{ current: activeStep === 'addons', done: completedSteps.includes('addons') }">
          <span></span>{{ t.installAddons }}
        </li>
      </ol>
    </div>

    <!-- RESULT VIEW -->
    <div v-else-if="currentView === 'result' && result" class="result-panel" aria-live="polite">
      <div class="success-mark">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="m8 16 5 5 11-11"></path>
        </svg>
      </div>
      <span class="complete-label">{{ t.complete }}</span>
      <h2 class="ready-title">{{ t.readyTitle }}</h2>
      <p class="result-summary">
        {{ result.email }} was {{ result.nuvioAccountCreated ? 'created' : 'connected' }}.
        Both addons were installed on {{ result.installedProfiles }} profile{{ result.installedProfiles === 1 ? '' : 's' }}.
      </p>

      <div class="result-addons">
        <span class="addon-tag">
          <i class="addon-icon addon-icon-aio">
            <svg viewBox="0 0 24 24" class="inline-logo-svg" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
              <polyline points="16 6 12 2 8 6"></polyline>
              <line x1="12" y1="2" x2="12" y2="15"></line>
            </svg>
          </i>
          {{ t.addonAio }}
        </span>
        <span class="addon-tag">
          <i class="addon-icon addon-icon-cinema">
            <svg viewBox="0 0 24 24" class="inline-logo-svg" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
              <line x1="7" y1="2" x2="7" y2="22"></line>
              <line x1="17" y1="2" x2="17" y2="22"></line>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <line x1="2" y1="7" x2="7" y2="7"></line>
              <line x1="2" y1="17" x2="7" y2="17"></line>
              <line x1="17" y1="17" x2="22" y2="17"></line>
              <line x1="17" y1="7" x2="22" y2="7"></line>
            </svg>
          </i>
          {{ t.addonCinema }}
        </span>
      </div>

      <div class="manifest-field">
        <label for="manifestUrl" class="manifest-field-label">{{ t.manifestLabel }}</label>
        <div class="manifest-copy-row">
          <input id="manifestUrl" :value="result.aiostreamsManifest" readonly />
          <button class="copy-btn" type="button" @click="handleCopy">
            {{ copySuccess ? t.copied : t.copy }}
          </button>
        </div>
      </div>

      <!-- Credentials block -->
      <div class="credentials-block">
        <div class="credentials-header">
          <svg viewBox="0 0 20 20" aria-hidden="true" class="cred-icon">
            <rect x="3" y="8" width="14" height="10" rx="3"></rect>
            <path d="M6 8V6a4 4 0 0 1 8 0v2"></path>
          </svg>
          <strong>{{ t.yourCredentials }}</strong>
          <span class="cred-save-note">{{ t.credentialsNote }}</span>
        </div>
        <div class="cred-rows">
          <!-- Nuvio account — only shown if a new account was created -->
          <template v-if="result.nuvioAccountCreated">
            <div class="cred-row">
              <span class="cred-label">
                {{ t.nuvioEmail }}
                <span class="cred-badge">{{ t.newAccountBadge }}</span>
              </span>
              <span class="cred-value">{{ result.email }}</span>
            </div>
            <div class="cred-row">
              <span class="cred-label">{{ t.nuvioPasswordLabel }}</span>
              <span class="cred-value mono">{{ result.nuvioPassword }}</span>
            </div>
          </template>
          <!-- AIOStreams password — always shown -->
          <div class="cred-row">
            <span class="cred-label">{{ t.aiostreamsPasswordLabel }}</span>
            <span class="cred-value mono">{{ result.aiostreamsPassword }}</span>
          </div>
        </div>
      </div>

      <div class="result-actions">
        <a :href="result.aiostreamsConfigureUrl" class="btn-primary btn-aio-settings" target="_blank" rel="noreferrer">
          {{ t.openAioSettings }}
        </a>
        <button class="btn-secondary" type="button" @click="startOver">
          {{ t.startOver }}
        </button>
      </div>

      <p class="result-note">
        {{
          result.metadataMatchingEnabled
            ? `Tam-Taro Complete SEL v${result.tamTemplateVersion} was applied with metadata matching enabled.`
            : `Tam-Taro Complete SEL v${result.tamTemplateVersion} was applied. Metadata-dependent matching is disabled because no TMDB key was supplied.`
        }}
      </p>
    </div>
    </div>
    </div>
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
  border: 1px solid #1c1e24;
  border-radius: 16px;
  background: #0d0e12;
  padding: 16px 24px;
  margin: 16px 0 28px 0;
  color: #f3f4f6;
  transition: padding 0.2s ease;
}

.nuvio-quickstart.is-expanded {
  padding: 24px;
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

.qs-header:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 4px;
  border-radius: 6px;
}

.nuvio-quickstart.is-expanded .qs-header {
  border-bottom-color: #1c1e24;
  padding-bottom: 16px;
  margin-bottom: 24px;
}

.qs-meta-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #9ca3af;
}

.qs-brand {
  display: inline-flex;
  gap: 10px;
  align-items: center;
  color: #ffffff;
}

.logo-mark {
  width: 32px;
  height: 32px;
  border: 1px solid #1c1e24;
  border-radius: 6px;
  background: var(--vp-c-brand-1);
  fill: none;
  stroke: #ffffff;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.qs-brand-text {
  font-family: var(--vp-font-family-mono);
  font-size: 14px;
  font-weight: 700;
}

.secure-note {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  color: #9ca3af;
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

.form-section-title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
}

.form-section-title strong {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
}

.form-section-title small {
  display: block;
  font-size: 11px;
  color: #9ca3af;
  line-height: 1.2;
}

.form-field {
  margin-bottom: 20px;
}

.field-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
  color: #f3f4f6;
}

.input-container {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

.field-icon {
  position: absolute;
  left: 12px;
  width: 16px;
  height: 16px;
  fill: none;
  stroke: #9ca3af;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
  pointer-events: none;
}

.input-container input {
  width: 100%;
  padding: 10px 12px 10px 38px;
  border: 1px solid #1c1e24;
  border-radius: 8px;
  background: #07080a;
  color: #ffffff;
  font-size: 14px;
  transition: border-color 0.2s, box-shadow 0.2s;
  outline: none;
}

.input-container input:focus {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--vp-c-brand-1) 15%, transparent);
}

.password-toggle {
  position: absolute;
  right: 12px;
  border: none;
  background: none;
  color: #9ca3af;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
}

.password-toggle:hover {
  color: #ffffff;
}

.toggle-icon {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.text-btn-action {
  position: absolute;
  right: 12px;
  background: none;
  border: none;
  color: var(--vp-c-brand-1);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.text-btn-action:hover {
  text-decoration: underline;
}

.field-help {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 4px;
}

.field-help a {
  color: var(--vp-c-brand-1);
  text-decoration: underline;
}

.field-error {
  display: block;
  font-size: 11px;
  color: #ef4444;
  margin-top: 4px;
}

.form-field.has-error input {
  border-color: #ef4444;
}

.form-field.has-error input:focus {
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15);
}

.divider {
  height: 1px;
  background: #1c1e24;
  margin: 24px 0;
}

.torbox-callout {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: color-mix(in srgb, var(--vp-c-brand-1) 8%, #07080a);
  border: 1px dashed var(--vp-c-brand-1);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 20px;
  gap: 12px;
}

.callout-copy {
  display: flex;
  flex-direction: column;
}

.callout-copy strong {
  font-size: 13px;
  color: #ffffff;
}

.callout-copy small {
  font-size: 11px;
  color: #9ca3af;
}

.ref-desc {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.heart-icon {
  width: 12px;
  height: 12px;
  fill: #f43f5e;
  stroke: none;
  display: inline-block;
  vertical-align: middle;
}

.callout-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--vp-c-brand-1);
  color: #ffffff !important;
  font-size: 11px;
  font-weight: 700;
  padding: 8px 12px;
  border-radius: 6px;
  text-decoration: none !important;
  transition: opacity 0.15s;
  white-space: nowrap;
}

.callout-link:hover {
  opacity: 0.9;
}

.external-icon {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
}

.advanced-section {
  border: 1px solid #1c1e24;
  border-radius: 8px;
  background: #07080a;
  padding: 12px 16px;
  margin-bottom: 24px;
}

.advanced-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.advanced-summary::-webkit-details-marker {
  display: none;
}

.advanced-summary div {
  display: flex;
  flex-direction: column;
}

.advanced-summary strong {
  font-size: 13px;
  color: #ffffff;
}

.advanced-summary small {
  font-size: 11px;
  color: #9ca3af;
}

.summary-arrow {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: #9ca3af;
  stroke-width: 2;
  transition: transform 0.2s;
}

.summary-arrow.rotated {
  transform: rotate(180deg);
}

.advanced-body {
  margin-top: 14px;
  border-top: 1px solid #1c1e24;
  padding-top: 14px;
}

.advanced-desc-text {
  font-size: 12px;
  color: #9ca3af;
  margin-bottom: 14px;
  line-height: 1.5;
}

.simple-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #1c1e24;
  border-radius: 8px;
  background: #07080a;
  color: #ffffff;
  font-size: 13px;
  outline: none;
}

.simple-input:focus {
  border-color: var(--vp-c-brand-1);
}

.optional-label {
  font-weight: normal;
  font-size: 11px;
  color: #9ca3af;
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--vp-c-brand-1);
  color: #ffffff;
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-primary:active {
  transform: scale(0.98);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-large {
  width: 100%;
  padding: 12px 18px;
}

.btn-content {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.btn-arrow-icon {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.privacy-text {
  font-size: 11px;
  color: #9ca3af;
  text-align: center;
  margin-top: 14px;
  line-height: 1.4;
}

/* PROGRESS STYLES */
.progress-panel {
  padding: 24px 8px;
}

.progress-heading {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 28px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 2px solid #1c1e24;
  border-top-color: var(--vp-c-brand-1);
  border-radius: 50%;
  animation: spin 850ms linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.progress-heading-text {
  display: flex;
  flex-direction: column;
}

.progress-heading-text strong {
  font-size: 16px;
  color: #ffffff;
}

.progress-heading-text small {
  font-size: 12px;
  color: #9ca3af;
  margin-top: 2px;
}

.progress-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.progress-list li {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 24px;
  color: #9ca3af;
  font-size: 13px;
  transition: color 0.3s;
}

.progress-list li:last-child {
  padding-bottom: 0;
}

.progress-list li:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 16px;
  bottom: 0;
  width: 1px;
  background: #1c1e24;
}

.progress-list li > span {
  position: relative;
  z-index: 2;
  width: 13px;
  height: 13px;
  border: 2px solid #4b5563;
  border-radius: 50%;
  background: #07080a;
  margin-top: 3px;
  flex-shrink: 0;
  transition: border-color 0.3s, background-color 0.3s;
}

.progress-list li.current {
  color: #ffffff;
  font-weight: 600;
}

.progress-list li.current > span {
  border-color: var(--vp-c-brand-1);
  background: color-mix(in srgb, var(--vp-c-brand-1) 20%, #07080a);
}

.progress-list li.done {
  color: #d1d5db;
}

.progress-list li.done > span {
  border-color: #10b981;
  background: #10b981;
}

/* ERROR PANEL */
.error-panel {
  display: flex;
  align-items: center;
  background: color-mix(in srgb, #ef4444 8%, #07080a);
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
  color: #ffffff;
}

.error-desc {
  font-size: 11px;
  color: #fca5a5;
  margin: 2px 0 0 0;
  line-height: 1.4;
}

.retry-btn {
  background: transparent;
  border: 1px solid #ef4444;
  color: #ef4444;
  font-size: 11px;
  font-weight: 700;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
}

.retry-btn:hover {
  background: #ef4444;
  color: #ffffff;
}

/* RESULT PANEL */
.result-panel {
  text-align: center;
  padding: 16px 0;
}

.success-mark {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: color-mix(in srgb, #10b981 12%, #07080a);
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
  fill: none;
  stroke: currentColor;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.complete-label {
  display: block;
  font-family: var(--vp-font-family-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #10b981;
  margin-bottom: 6px;
}

.ready-title {
  font-size: 20px;
  font-weight: 700;
  margin-top: 0;
  margin-bottom: 8px;
  color: #ffffff;
}

.result-summary {
  font-size: 13px;
  color: #9ca3af;
  margin-bottom: 24px;
  max-width: 500px;
  margin-left: auto;
  margin-right: auto;
}

.result-addons {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-bottom: 24px;
}

.addon-tag {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #07080a;
  border: 1px solid #1c1e24;
  border-radius: 6px;
  padding: 6px 12px 6px 8px;
  font-size: 12px;
  font-weight: 600;
  color: #ffffff;
}

.addon-icon {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
}

.addon-icon-aio {
  background: var(--vp-c-brand-1);
}

.addon-icon-cinema {
  background: #4b5563;
}

.inline-logo-svg {
  width: 14px;
  height: 14px;
}

.manifest-field {
  text-align: left;
  max-width: 480px;
  margin: 0 auto 24px;
}

.manifest-field-label {
  display: block;
  font-family: var(--vp-font-family-mono);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  color: #9ca3af;
  margin-bottom: 6px;
}

.manifest-copy-row {
  display: flex;
  border: 1px solid #1c1e24;
  border-radius: 8px;
  background: #07080a;
  overflow: hidden;
}

.manifest-copy-row input {
  flex-grow: 1;
  border: none;
  background: transparent;
  padding: 10px 12px;
  font-size: 11px;
  font-family: var(--vp-font-family-mono);
  color: #ffffff;
  outline: none;
}

.copy-btn {
  background: var(--vp-c-brand-1);
  color: #ffffff;
  border: none;
  padding: 0 16px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s;
}

.copy-btn:hover {
  opacity: 0.9;
}

.result-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-bottom: 24px;
}

.btn-aio-settings {
  text-decoration: none !important;
  font-size: 13px;
  padding: 10px 20px;
}

.btn-secondary {
  background: transparent;
  border: 1px solid #1c1e24;
  color: #ffffff;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.15s;
}

.btn-secondary:hover {
  background: #1c1e24;
}

.result-note {
  font-size: 11px;
  color: #9ca3af;
  background: #07080a;
  border: 1px solid #1c1e24;
  border-radius: 8px;
  padding: 10px 14px;
  display: inline-block;
  max-width: 500px;
  text-align: left;
  line-height: 1.4;
}

/* CREDENTIALS BLOCK */
.credentials-block {
  text-align: left;
  max-width: 480px;
  margin: 0 auto 24px;
  border: 1px solid #78350f;
  border-radius: 10px;
  background: color-mix(in srgb, #f59e0b 6%, #07080a);
  overflow: hidden;
}

.credentials-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid #78350f;
  flex-wrap: wrap;
}

.credentials-header strong {
  font-size: 12px;
  font-weight: 700;
  color: #fbbf24;
}

.cred-save-note {
  font-size: 11px;
  color: #d97706;
  margin-left: auto;
}

.cred-icon {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: #fbbf24;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
  flex-shrink: 0;
}

.cred-rows {
  padding: 0;
}

.cred-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 14px;
  border-bottom: 1px solid #1c1e24;
}

.cred-row:last-child {
  border-bottom: none;
}

.cred-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #9ca3af;
  white-space: nowrap;
  flex-shrink: 0;
}

.cred-badge {
  display: inline-block;
  background: color-mix(in srgb, #10b981 15%, transparent);
  color: #10b981;
  border: 1px solid #10b981;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.cred-value {
  font-size: 12px;
  color: #f3f4f6;
  text-align: right;
  word-break: break-all;
}

.cred-value.mono {
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  color: #fbbf24;
}

/* Prevent text overlapping with absolute buttons/toggles */
.input-container input:has(+ .password-toggle) {
  padding-right: 44px;
}

.input-container input:has(+ .text-btn-action) {
  padding-right: 96px;
}

/* Mobile responsive styles */
@media (max-width: 480px) {
  .nuvio-quickstart {
    padding: 16px 14px;
    margin: 12px 0 20px 0;
  }
  
  .nuvio-quickstart.is-expanded {
    padding: 18px 14px;
  }

  .qs-header {
    gap: 8px;
  }

  .qs-brand-text {
    font-size: 13px;
  }

  .secure-note-text {
    display: none;
  }

  .secure-note {
    gap: 0;
  }

  .torbox-callout {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    text-align: center;
    padding: 14px;
  }

  .callout-link {
    justify-content: center;
    width: 100%;
  }

  .result-actions {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .result-actions .btn-primary,
  .result-actions .btn-secondary {
    width: 100%;
    justify-content: center;
  }

  .cred-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 10px 12px;
  }

  .cred-value {
    text-align: left;
    width: 100%;
  }

  .copy-btn {
    padding: 0 12px;
    font-size: 11px;
  }
}
</style>
