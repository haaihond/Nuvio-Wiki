<script setup lang="ts">
import { ref, reactive, computed, nextTick, onBeforeUnmount, watch } from 'vue'
import { useData, withBase } from 'vitepress'

const { lang } = useData()

const props = withDefaults(defineProps<{
  defaultExpanded?: boolean
  hideTip?: boolean
  hideHeader?: boolean
}>(), {
  defaultExpanded: true,
  hideTip: false,
  hideHeader: false
})

const translations = {
  en: {
    question: 'Do you want to use a paid debrid service for a much smoother, faster experience?',
    questionDesc: 'Pick the option that suits you. You can always change it later.',
    yes: 'Yes, use debrid',
    yesDesc: 'Use TorBox with AIOStreams. It costs money, but playback is usually faster and more reliable.',
    no: 'No, use HTTPS streams',
    noDesc: 'Use PenguPlay without paying for debrid. Stream availability can vary by source.',
    recommended: 'Recommended',
    paidLabel: 'Paid path',
    freeLabel: 'Free path',
    paidIncludes: 'You will need a TorBox account.',
    freeIncludes: 'You will complete a quick human check here in Nuvio.',
    choosePath: 'Use this option',
    changePath: 'Change setup path',
    guidedSetup: 'Quick setup',
    paidTitle: 'TorBox and AIOStreams',
    paidIntro: 'This takes a few short steps. Have your TorBox account ready.',
    freeTitle: 'PenguPlay',
    freeIntro: 'Complete a quick human check and Nuvio will add PenguPlay with its default settings.',
    stepOf: 'Step {current} of {total}',
    back: 'Back',
    continue: 'Continue',
    accountPageTitle: 'Sign in to Nuvio',
    accountPageDesc: 'Use your existing account. If you are new, these details will create one.',
    profilesPageTitle: 'Choose Nuvio profiles',
    profilesPageDesc: 'Select every profile where this streaming setup should be installed.',
    profilesFallback: 'No existing account was found with these details. A new account will use the Main profile. If you already have an account, go back and check your password.',
    profileSharesPrimary: 'Uses the Main profile\'s addons',
    profilesRequiredError: 'Choose at least one Nuvio profile.',
    profilesLoading: 'Loading profiles…',
    torboxPageTitle: 'Connect TorBox',
    torboxPageDesc: 'Copy your API key from TorBox settings and paste it below.',
    modePageTitle: 'How do you want AIOStreams set up?',
    modePageDesc: 'The simple option works well for most people. Advanced lets you change the catalog and matching keys.',
    catalogPageTitle: 'Choose a catalog',
    catalogPageDesc: 'This controls where the home-screen rows and titles come from.',
    matchingPageTitle: 'Add matching keys',
    matchingPageDesc: 'These are optional. Leave them blank if you do not use TMDB or TVDB.',
    penguPageTitle: 'One quick check',
    penguPageDesc: 'Complete the check below so Nuvio can create your personal PenguPlay add-on.',
    reviewTitle: 'Check everything once more',
    reviewDesc: 'If this looks right, start the installation.',
    reviewAccount: 'Nuvio account',
    reviewProfiles: 'Install on',
    reviewStreaming: 'Streaming addon',
    reviewCatalog: 'Catalog',
    reviewMatching: 'Matching keys',
    reviewReady: 'Ready',
    reviewNotAdded: 'Not added',
    edit: 'Edit',
    title: 'Account details',
    nuvioAccount: 'Nuvio account',
    newAccountsAuto: 'The same form works for new and existing accounts',
    emailLabel: 'Email address',
    emailPlaceholder: 'you@example.com',
    emailReqError: 'Enter your email address.',
    emailInvalidError: 'Enter a valid email address, such as name@example.com.',
    passwordLabel: 'Nuvio password',
    passwordPlaceholder: 'At least 6 characters',
    passwordMinError: 'Your Nuvio password must be at least 6 characters.',
    torboxTitle: 'TorBox',
    torboxDesc: 'Your key is available in TorBox settings',
    needTorbox: 'Need TorBox?',
    torboxRefDesc: 'Open the subscription page with my referral',
    getTorbox: 'Get TorBox',
    torboxKeyLabel: 'TorBox API key',
    torboxKeyPlaceholder: 'Paste your TorBox API key',
    torboxHelpLink: 'TorBox settings',
    torboxReqError: 'Enter your TorBox API key.',
    aiostreamsPwdLabel: 'AIOStreams config password',
    aiostreamsPwdHelp: 'Keep this if you want to edit AIOStreams later.',
    aiostreamsPwdMinError: 'The AIOStreams config password must be at least 6 characters.',
    regenerate: 'Regenerate',
    modeLabel: 'Setup mode',
    simpleMode: 'Simple',
    simpleModeDesc: 'Use the usual defaults',
    advancedMode: 'Advanced',
    advancedModeDesc: 'Choose the catalog and add matching keys',
    advanced: 'Advanced options',
    advancedSub: 'Only change what you need',
    catalogLabel: 'Catalog addon',
    catalogHelp: 'Nuvio Catalog is the default in both setup modes.',
    catalogNuvio: 'Nuvio Catalog (recommended)',
    catalogAutomatic: 'Keep existing metadata, otherwise Nuvio Catalog',
    catalogCinemeta: 'Cinemeta',
    catalogNone: 'No catalog addon',
    catalogCustom: 'Custom manifest URL',
    customCatalogLabel: 'Catalog manifest URL',
    customCatalogPlaceholder: 'https://example.com/manifest.json',
    customCatalogError: 'Enter a valid HTTPS catalog or manifest URL.',
    advancedDesc: 'A TMDB key improves title, year, and release matching. Without one, those extra checks stay off.',
    tmdbLabel: 'TMDB API key',
    tvdbLabel: 'TVDB API key',
    optional: 'Optional',
    penguHumanCheck: 'Human check',
    penguHumanCheckDesc: 'This prevents automated PenguPlay account creation.',
    penguChecking: 'Loading the check…',
    penguVerifying: 'Creating PenguPlay…',
    penguConnected: 'Check complete',
    penguConnectedDesc: 'PenguPlay is ready to install. You can continue.',
    penguLoadError: 'The human check could not load. Refresh the page and try again.',
    penguExpired: 'The check expired. Please complete it again.',
    penguManifestError: 'Complete the human check before continuing.',
    submitPaid: 'Install AIOStreams',
    submitFree: 'Install PenguPlay in Nuvio',
    privacyPaid: 'Credentials are sent only to Nuvio, TorBox, and Midnight\'s AIOStreams instance for this setup request.',
    privacyFree: 'No account is needed. Cloudflare handles the human check, then Nuvio creates your private PenguPlay add-on.',
    buildingTitle: 'Setting things up',
    validating: 'Validate details',
    checkTorbox: 'Check TorBox',
    checkPenguplay: 'Check PenguPlay',
    connectNuvio: 'Connect Nuvio',
    buildAiostreams: 'Build AIOStreams',
    installAddons: 'Install addons',
    complete: 'Complete',
    readyTitle: 'Your Nuvio setup is ready',
    addonAio: 'AIOStreams',
    addonCatalog: 'Nuvio Catalog',
    addonPenguplay: 'PenguPlay',
    aioManifestLabel: 'AIOStreams manifest',
    copy: 'Copy',
    copied: 'Copied',
    openAioSettings: 'Open AIOStreams settings',
    startOver: 'Start over',
    retryBtn: 'Try again',
    checkFieldBtn: 'Check field',
    setupStopped: 'Setup stopped',
    keysSecureNote: 'Keys are never stored here',
    yourCredentials: 'Your credentials',
    credentialsNote: 'Save these now - they will not be shown again.',
    nuvioEmail: 'Nuvio email',
    nuvioPasswordLabel: 'Nuvio password',
    aiostreamsPasswordLabel: 'AIOStreams settings password',
    showNuvioPassword: 'Show Nuvio password',
    hideNuvioPassword: 'Hide Nuvio password',
    showTorboxApiKey: 'Show TorBox API key',
    hideTorboxApiKey: 'Hide TorBox API key'
  },
  nl: {
    question: 'Wil je een betaalde debridservice gebruiken voor een veel soepelere en snellere ervaring?',
    questionDesc: 'Kies wat bij je past. Je kunt dit later altijd veranderen.',
    yes: 'Ja, gebruik debrid',
    yesDesc: 'Gebruik TorBox met AIOStreams. Het kost geld, maar afspelen is meestal sneller en betrouwbaarder.',
    no: 'Nee, gebruik HTTPS-streams',
    noDesc: 'Gebruik PenguPlay zonder voor debrid te betalen. Het aanbod kan per bron verschillen.',
    recommended: 'Aanbevolen',
    paidLabel: 'Betaalde route',
    freeLabel: 'Gratis route',
    paidIncludes: 'Je hebt een TorBox-account nodig.',
    freeIncludes: 'Je voltooit hier in Nuvio een korte menselijke controle.',
    choosePath: 'Gebruik deze optie',
    changePath: 'Wijzig installatieroute',
    guidedSetup: 'Snelle installatie',
    paidTitle: 'TorBox en AIOStreams',
    paidIntro: 'Dit bestaat uit een paar korte stappen. Houd je TorBox-account bij de hand.',
    freeTitle: 'PenguPlay',
    freeIntro: 'Voltooi een korte menselijke controle en Nuvio voegt PenguPlay met de standaardinstellingen toe.',
    stepOf: 'Stap {current} van {total}',
    back: 'Terug',
    continue: 'Verder',
    accountPageTitle: 'Meld je aan bij Nuvio',
    accountPageDesc: 'Gebruik je bestaande account. Ben je nieuw, dan wordt met deze gegevens een account gemaakt.',
    profilesPageTitle: 'Kies Nuvio-profielen',
    profilesPageDesc: 'Selecteer elk profiel waarop deze streamingconfiguratie moet worden geïnstalleerd.',
    profilesFallback: 'Er is geen bestaand account gevonden met deze gegevens. Een nieuw account gebruikt het hoofdprofiel. Heb je al een account, ga dan terug en controleer je wachtwoord.',
    profileSharesPrimary: 'Gebruikt de addons van het hoofdprofiel',
    profilesRequiredError: 'Kies minimaal één Nuvio-profiel.',
    profilesLoading: 'Profielen laden…',
    torboxPageTitle: 'Koppel TorBox',
    torboxPageDesc: 'Kopieer je API-sleutel uit de TorBox-instellingen en plak hem hieronder.',
    modePageTitle: 'Hoe wil je AIOStreams instellen?',
    modePageDesc: 'De eenvoudige optie werkt voor de meeste mensen. Met Geavanceerd pas je de catalogus en koppelsleutels aan.',
    catalogPageTitle: 'Kies een catalogus',
    catalogPageDesc: 'Hiermee bepaal je waar de rijen en titels op het startscherm vandaan komen.',
    matchingPageTitle: 'Voeg koppelsleutels toe',
    matchingPageDesc: 'Deze zijn optioneel. Laat ze leeg als je TMDB of TVDB niet gebruikt.',
    penguPageTitle: 'Nog één korte controle',
    penguPageDesc: 'Voltooi de controle hieronder zodat Nuvio je persoonlijke PenguPlay-addon kan maken.',
    reviewTitle: 'Controleer alles nog één keer',
    reviewDesc: 'Klopt alles, start dan de installatie.',
    reviewAccount: 'Nuvio-account',
    reviewProfiles: 'Installeren op',
    reviewStreaming: 'Streaming-addon',
    reviewCatalog: 'Catalogus',
    reviewMatching: 'Koppelsleutels',
    reviewReady: 'Gereed',
    reviewNotAdded: 'Niet toegevoegd',
    edit: 'Wijzig',
    title: 'Accountgegevens',
    nuvioAccount: 'Nuvio-account',
    newAccountsAuto: 'Dit formulier werkt voor nieuwe en bestaande accounts',
    emailLabel: 'E-mailadres',
    emailPlaceholder: 'je@voorbeeld.com',
    emailReqError: 'Voer je e-mailadres in.',
    emailInvalidError: 'Voer een geldig e-mailadres in, zoals naam@voorbeeld.com.',
    passwordLabel: 'Nuvio-wachtwoord',
    passwordPlaceholder: 'Minimaal 6 tekens',
    passwordMinError: 'Je Nuvio-wachtwoord moet minimaal 6 tekens lang zijn.',
    torboxTitle: 'TorBox',
    torboxDesc: 'Je vindt de sleutel in de TorBox-instellingen',
    needTorbox: 'TorBox nodig?',
    torboxRefDesc: 'Open de abonnementspagina met mijn referral',
    getTorbox: 'TorBox verkrijgen',
    torboxKeyLabel: 'TorBox API-sleutel',
    torboxKeyPlaceholder: 'Plak je TorBox API-sleutel',
    torboxHelpLink: 'TorBox-instellingen',
    torboxReqError: 'Voer je TorBox API-sleutel in.',
    aiostreamsPwdLabel: 'AIOStreams-configuratiewachtwoord',
    aiostreamsPwdHelp: 'Bewaar dit als je AIOStreams later wilt bewerken.',
    aiostreamsPwdMinError: 'Het AIOStreams-configuratiewachtwoord moet minimaal 6 tekens lang zijn.',
    regenerate: 'Genereer nieuwe',
    modeLabel: 'Installatiemodus',
    simpleMode: 'Eenvoudig',
    simpleModeDesc: 'Gebruik de gebruikelijke instellingen',
    advancedMode: 'Geavanceerd',
    advancedModeDesc: 'Kies de catalogus en voeg koppelsleutels toe',
    advanced: 'Geavanceerde opties',
    advancedSub: 'Wijzig alleen wat je nodig hebt',
    catalogLabel: 'Catalogus-addon',
    catalogHelp: 'Nuvio Catalog is de standaard in beide installatiemodi.',
    catalogNuvio: 'Nuvio Catalog (aanbevolen)',
    catalogAutomatic: 'Bestaande metadata behouden, anders Nuvio Catalog',
    catalogCinemeta: 'Cinemeta',
    catalogNone: 'Geen catalogus-addon',
    catalogCustom: 'Aangepaste manifest-URL',
    customCatalogLabel: 'Catalogus-manifest-URL',
    customCatalogPlaceholder: 'https://voorbeeld.nl/manifest.json',
    customCatalogError: 'Voer een geldige HTTPS-catalogus- of manifest-URL in.',
    advancedDesc: 'Een TMDB-sleutel verbetert het koppelen van titel, jaar en releasedatum. Zonder sleutel blijven die extra controles uit.',
    tmdbLabel: 'TMDB API-sleutel',
    tvdbLabel: 'TVDB API-sleutel',
    optional: 'Optioneel',
    penguHumanCheck: 'Menselijke controle',
    penguHumanCheckDesc: 'Dit voorkomt dat automatisch PenguPlay-accounts worden aangemaakt.',
    penguChecking: 'Controle laden…',
    penguVerifying: 'PenguPlay maken…',
    penguConnected: 'Controle voltooid',
    penguConnectedDesc: 'PenguPlay is klaar om te installeren. Je kunt verder.',
    penguLoadError: 'De menselijke controle kon niet worden geladen. Vernieuw de pagina en probeer het opnieuw.',
    penguExpired: 'De controle is verlopen. Voltooi hem opnieuw.',
    penguManifestError: 'Voltooi de menselijke controle voordat je verdergaat.',
    submitPaid: 'Installeer AIOStreams',
    submitFree: 'Installeer PenguPlay in Nuvio',
    privacyPaid: 'Inloggegevens worden alleen naar Nuvio, TorBox en de AIOStreams-instantie van Midnight gestuurd.',
    privacyFree: 'Je hebt geen account nodig. Cloudflare voert de menselijke controle uit, waarna Nuvio je privé-PenguPlay-addon maakt.',
    buildingTitle: 'Bezig met instellen',
    validating: 'Gegevens valideren',
    checkTorbox: 'TorBox controleren',
    checkPenguplay: 'PenguPlay controleren',
    connectNuvio: 'Nuvio verbinden',
    buildAiostreams: 'AIOStreams bouwen',
    installAddons: 'Addons installeren',
    complete: 'Voltooid',
    readyTitle: 'Je Nuvio-setup is gereed',
    addonAio: 'AIOStreams',
    addonCatalog: 'Nuvio Catalog',
    addonPenguplay: 'PenguPlay',
    aioManifestLabel: 'AIOStreams-manifest',
    copy: 'Kopiëren',
    copied: 'Gekopieerd',
    openAioSettings: 'Open AIOStreams-instellingen',
    startOver: 'Opnieuw beginnen',
    retryBtn: 'Opnieuw proberen',
    checkFieldBtn: 'Controleer veld',
    setupStopped: 'Setup gestopt',
    keysSecureNote: 'Sleutels worden hier nooit opgeslagen',
    yourCredentials: 'Jouw inloggegevens',
    credentialsNote: 'Sla deze nu op - ze worden niet opnieuw getoond.',
    nuvioEmail: 'Nuvio e-mail',
    nuvioPasswordLabel: 'Nuvio-wachtwoord',
    aiostreamsPasswordLabel: 'AIOStreams-instellingenwachtwoord',
    showNuvioPassword: 'Nuvio-wachtwoord tonen',
    hideNuvioPassword: 'Nuvio-wachtwoord verbergen',
    showTorboxApiKey: 'TorBox API-sleutel tonen',
    hideTorboxApiKey: 'TorBox API-sleutel verbergen'
  }
}

const t = computed(() => translations[(lang.value || '').startsWith('nl') ? 'nl' : 'en'])

type ViewMode = 'choice' | 'form' | 'progress' | 'result'
type SetupPath = 'debrid' | 'https'
type SetupMode = 'simple' | 'advanced'
type CatalogMode = 'nuvio' | 'cinemeta' | 'none' | 'custom'
type WizardPage =
  | 'account'
  | 'profiles'
  | 'torbox'
  | 'mode'
  | 'catalog'
  | 'matching'
  | 'penguplay'
  | 'review'

const currentView = ref<ViewMode>('choice')
const setupPath = ref<SetupPath | null>(null)
const isCollapsed = ref(!props.defaultExpanded)
const setupMode = ref<SetupMode>('simple')
const formPage = ref(0)

const form = reactive({
  email: '',
  nuvioPassword: '',
  torboxApiKey: '',
  aiostreamsPassword: '',
  penguplayReceipt: '',
  tmdbApiKey: '',
  tvdbApiKey: '',
  catalogMode: 'nuvio' as CatalogMode,
  customCatalogUrl: '',
  profileIds: [] as number[]
})

const errors = reactive({
  email: '',
  nuvioPassword: '',
  torboxApiKey: '',
  aiostreamsPassword: '',
  penguplayAuth: '',
  customCatalogUrl: '',
  profiles: ''
})

interface NuvioProfileOption {
  profileIndex: number
  name: string
  usesPrimaryAddons: boolean
}

const profileOptions = ref<NuvioProfileOption[]>([])
const profilesLoading = ref(false)
const profileLookupFallback = ref(false)
const profilesLoaded = ref(false)

const showNuvioPassword = ref(false)
const showTorboxApiKey = ref(false)
const turnstileContainer = ref<HTMLElement | null>(null)
const turnstileToken = ref('')
const turnstileLoading = ref(false)
const penguplayCreateBusy = ref(false)
const progressMessage = ref('Starting...')
const activeStep = ref('details')
const completedSteps = ref<string[]>([])

const stepsOrder = computed(() => setupPath.value === 'https'
  ? ['details', 'penguplay', 'nuvio', 'addons']
  : ['details', 'torbox', 'nuvio', 'aiostreams', 'addons'])

const progressSteps = computed(() => setupPath.value === 'https'
  ? [
      { id: 'details', label: t.value.validating },
      { id: 'penguplay', label: t.value.checkPenguplay },
      { id: 'nuvio', label: t.value.connectNuvio },
      { id: 'addons', label: t.value.installAddons }
    ]
  : [
      { id: 'details', label: t.value.validating },
      { id: 'torbox', label: t.value.checkTorbox },
      { id: 'nuvio', label: t.value.connectNuvio },
      { id: 'aiostreams', label: t.value.buildAiostreams },
      { id: 'addons', label: t.value.installAddons }
    ])

const wizardPages = computed<WizardPage[]>(() => {
  if (setupPath.value === 'https') {
    return ['account', 'profiles', 'penguplay', 'review']
  }

  return setupMode.value === 'advanced'
    ? ['account', 'profiles', 'torbox', 'mode', 'catalog', 'matching', 'review']
    : ['account', 'profiles', 'torbox', 'mode', 'review']
})

const currentPage = computed<WizardPage>(() =>
  wizardPages.value[Math.min(formPage.value, wizardPages.value.length - 1)] || 'account'
)

const wizardStepLabel = computed(() => t.value.stepOf
  .replace('{current}', String(formPage.value + 1))
  .replace('{total}', String(wizardPages.value.length)))

const wizardProgress = computed(() =>
  `${((formPage.value + 1) / wizardPages.value.length) * 100}%`
)

const pageTitle = computed(() => ({
  account: t.value.accountPageTitle,
  profiles: t.value.profilesPageTitle,
  torbox: t.value.torboxPageTitle,
  mode: t.value.modePageTitle,
  catalog: t.value.catalogPageTitle,
  matching: t.value.matchingPageTitle,
  penguplay: t.value.penguPageTitle,
  review: t.value.reviewTitle
})[currentPage.value])

const pageDescription = computed(() => ({
  account: t.value.accountPageDesc,
  profiles: t.value.profilesPageDesc,
  torbox: t.value.torboxPageDesc,
  mode: t.value.modePageDesc,
  catalog: t.value.catalogPageDesc,
  matching: t.value.matchingPageDesc,
  penguplay: t.value.penguPageDesc,
  review: t.value.reviewDesc
})[currentPage.value])

const catalogName = computed(() => ({
  nuvio: t.value.catalogNuvio,
  cinemeta: t.value.catalogCinemeta,
  none: t.value.catalogNone,
  custom: t.value.catalogCustom
})[form.catalogMode])

const matchingSummary = computed(() => {
  const names = [
    ...(form.tmdbApiKey.trim() ? ['TMDB'] : []),
    ...(form.tvdbApiKey.trim() ? ['TVDB'] : [])
  ]
  return names.length ? names.join(' + ') : t.value.reviewNotAdded
})

const profileSummary = computed(() => profileOptions.value
  .filter(profile => form.profileIds.includes(profile.profileIndex))
  .map(profile => profile.name)
  .join(' + '))

interface SetupResult {
  setupPath: SetupPath
  email: string
  nuvioAccountCreated: boolean
  nuvioPassword?: string
  aiostreamsPassword?: string
  installedProfiles: number
  aiostreamsManifest?: string
  aiostreamsConfigureUrl?: string
  addons: string[]
}

const result = ref<SetupResult | null>(null)
const globalError = ref<string | null>(null)
const lastErrorField = ref<string | null>(null)
const isSubmitting = ref(false)
const copySuccess = ref(false)

const resultManifest = computed(() => result.value?.aiostreamsManifest || '')

const resultConfigureUrl = computed(() => result.value?.setupPath === 'https'
  ? ''
  : result.value?.aiostreamsConfigureUrl || '')

const penguplayConnected = computed(() => form.penguplayReceipt.length >= 32)
const penguplayCheckComplete = computed(() => penguplayConnected.value || Boolean(turnstileToken.value))
let turnstileWidgetId: string | null = null

interface TurnstileApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string
  reset: (widgetId?: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
  return Array.from(bytes).map((val) => alphabet[val % alphabet.length]).join('')
}

function generatePassword() {
  form.aiostreamsPassword = randomPassword()
  errors.aiostreamsPassword = ''
}

function selectPath(path: SetupPath) {
  if (path === 'debrid') resetPenguplayConnection()
  setupPath.value = path
  formPage.value = 0
  globalError.value = null
  currentView.value = 'form'
}

function changePath() {
  formPage.value = 0
  globalError.value = null
  lastErrorField.value = null
  currentView.value = 'choice'
}

function setSetupMode(mode: SetupMode) {
  setupMode.value = mode
  errors.customCatalogUrl = ''
}

function resetProfileSelection() {
  profileOptions.value = []
  form.profileIds = []
  profileLookupFallback.value = false
  profilesLoaded.value = false
  errors.profiles = ''
}

function handleAccountInput(field: 'email' | 'nuvioPassword') {
  errors[field] = ''
  resetProfileSelection()
}

async function loadProfileOptions(): Promise<boolean> {
  if (profilesLoaded.value && profileOptions.value.length) return true

  profilesLoading.value = true
  errors.profiles = ''
  try {
    const response = await fetch(withBase('/api/ai/profiles'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.email, password: form.nuvioPassword })
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || 'Nuvio profiles could not be loaded.')

    const profiles = Array.isArray(data?.profiles)
      ? data.profiles.filter((profile: any) => (
          Number.isInteger(Number(profile?.profileIndex)) &&
          Number(profile.profileIndex) > 0
        )).map((profile: any) => ({
          profileIndex: Number(profile.profileIndex),
          name: String(profile.name || `Profile ${profile.profileIndex}`),
          usesPrimaryAddons: profile.usesPrimaryAddons === true
        }))
      : []
    if (!profiles.length) throw new Error('Nuvio returned no usable profiles.')

    profileOptions.value = profiles
    form.profileIds = profiles.map((profile: NuvioProfileOption) => profile.profileIndex)
    profileLookupFallback.value = data.existingAccount === false
    profilesLoaded.value = true
    return true
  } catch (error: any) {
    errors.profiles = error.message || 'Nuvio profiles could not be loaded.'
    return false
  } finally {
    profilesLoading.value = false
  }
}

generatePassword()

function removeTurnstileWidget() {
  if (turnstileWidgetId && window.turnstile) {
    try {
      window.turnstile.remove(turnstileWidgetId)
    } catch {
      // The widget may already have been removed when its page was closed.
    }
  }
  turnstileWidgetId = null
}

function resetPenguplayConnection() {
  removeTurnstileWidget()
  turnstileToken.value = ''
  turnstileLoading.value = false
  penguplayCreateBusy.value = false
  form.penguplayReceipt = ''
  errors.penguplayAuth = ''
}

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()

  return new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>('script[data-nuvio-turnstile]')
    const timeout = window.setTimeout(() => finish(new Error('Turnstile took too long to load.')), 15_000)

    const finish = (error?: Error) => {
      window.clearTimeout(timeout)
      script?.removeEventListener('load', handleLoad)
      script?.removeEventListener('error', handleError)
      if (error) reject(error)
      else resolve()
    }
    const handleLoad = () => window.turnstile
      ? finish()
      : finish(new Error('Turnstile did not become available.'))
    const handleError = () => finish(new Error('Turnstile could not be loaded.'))

    if (!script) {
      script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      script.dataset.nuvioTurnstile = 'true'
      script.addEventListener('load', handleLoad, { once: true })
      script.addEventListener('error', handleError, { once: true })
      document.head.appendChild(script)
      return
    }
    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener('error', handleError, { once: true })
  })
}

async function renderPenguplayChallenge() {
  if (
    currentView.value !== 'form' ||
    currentPage.value !== 'penguplay' ||
    penguplayConnected.value ||
    turnstileWidgetId ||
    turnstileLoading.value
  ) return

  turnstileLoading.value = true
  errors.penguplayAuth = ''
  try {
    const configRequest = fetch(withBase('/api/penguplay/turnstile-config'))
    await loadTurnstileScript()
    const response = await configRequest
    const data = await response.json().catch(() => ({}))
    if (!response.ok || typeof data?.siteKey !== 'string' || !data.siteKey) {
      throw new Error(data?.error || t.value.penguLoadError)
    }

    await nextTick()
    if (!turnstileContainer.value || !window.turnstile) throw new Error(t.value.penguLoadError)
    turnstileWidgetId = window.turnstile.render(turnstileContainer.value, {
      sitekey: data.siteKey,
      action: 'penguplay-create',
      theme: 'auto',
      size: 'flexible',
      callback: (token: string) => {
        turnstileToken.value = token
        errors.penguplayAuth = ''
      },
      'expired-callback': () => {
        turnstileToken.value = ''
        errors.penguplayAuth = t.value.penguExpired
      },
      'error-callback': () => {
        turnstileToken.value = ''
        errors.penguplayAuth = t.value.penguLoadError
      }
    })
  } catch (error: any) {
    errors.penguplayAuth = error.message || t.value.penguLoadError
  } finally {
    turnstileLoading.value = false
  }
}

function resetTurnstileChallenge() {
  turnstileToken.value = ''
  if (turnstileWidgetId && window.turnstile) window.turnstile.reset(turnstileWidgetId)
}

async function createPenguplayConnection(): Promise<boolean> {
  if (penguplayConnected.value) return true
  if (!turnstileToken.value) {
    errors.penguplayAuth = t.value.penguManifestError
    return false
  }

  penguplayCreateBusy.value = true
  errors.penguplayAuth = ''
  try {
    const response = await fetch(withBase('/api/penguplay/create'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turnstileToken: turnstileToken.value })
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || 'PenguPlay could not be created.')
    if (typeof data?.receipt !== 'string' || data.receipt.length < 32) {
      throw new Error('The PenguPlay server returned an incomplete response.')
    }

    form.penguplayReceipt = data.receipt
    turnstileToken.value = ''
    removeTurnstileWidget()
    return true
  } catch (error: any) {
    errors.penguplayAuth = error.message || 'PenguPlay could not be created.'
    resetTurnstileChallenge()
    return false
  } finally {
    penguplayCreateBusy.value = false
  }
}

watch([currentView, currentPage, setupPath], async () => {
  if (currentView.value === 'form' && currentPage.value === 'penguplay') {
    await nextTick()
    await renderPenguplayChallenge()
  }
}, { flush: 'post' })

onBeforeUnmount(() => {
  removeTurnstileWidget()
})

function clearErrors() {
  Object.keys(errors).forEach((key) => { errors[key as keyof typeof errors] = '' })
}

function validatePage(page: WizardPage): string | null {
  if (page === 'account') {
    if (!form.email.trim()) {
      errors.email = t.value.emailReqError
      return 'email'
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errors.email = t.value.emailInvalidError
      return 'email'
    }
    if (form.nuvioPassword.length < 6) {
      errors.nuvioPassword = t.value.passwordMinError
      return 'nuvioPassword'
    }
  }

  if (page === 'profiles' && form.profileIds.length === 0) {
    errors.profiles = t.value.profilesRequiredError
    return 'profiles'
  }

  if (page === 'torbox' && !form.torboxApiKey.trim()) {
    errors.torboxApiKey = t.value.torboxReqError
    return 'torboxApiKey'
  }

  if (page === 'catalog' && form.catalogMode === 'custom') {
    try {
      const url = new URL(form.customCatalogUrl)
      if (url.protocol !== 'https:') throw new Error()
    } catch {
      errors.customCatalogUrl = t.value.customCatalogError
      return 'customCatalogUrl'
    }
  }

  if (page === 'matching' && form.aiostreamsPassword.length < 6) {
    errors.aiostreamsPassword = t.value.aiostreamsPwdMinError
    return 'aiostreamsPassword'
  }

  if (page === 'penguplay' && !penguplayCheckComplete.value) {
    errors.penguplayAuth = t.value.penguManifestError
    return 'penguplayAuth'
  }

  return null
}

async function focusField(field: string | null) {
  if (!field) return
  await nextTick()
  document.getElementById(field)?.focus()
}

function openWizardPage(page: WizardPage) {
  const index = wizardPages.value.indexOf(page)
  formPage.value = index >= 0 ? index : 0
}

async function goNext() {
  clearErrors()
  globalError.value = null
  const invalidField = validatePage(currentPage.value)
  if (invalidField) {
    await focusField(invalidField)
    return
  }

  if (currentPage.value === 'review') {
    await submitSetup()
    return
  }

  if (currentPage.value === 'account' && !await loadProfileOptions()) {
    globalError.value = errors.profiles
    return
  }

  if (currentPage.value === 'penguplay' && !await createPenguplayConnection()) return

  formPage.value += 1
}

function goBack() {
  globalError.value = null
  if (currentPage.value === 'penguplay' && !penguplayConnected.value) {
    removeTurnstileWidget()
    turnstileToken.value = ''
  }
  if (formPage.value === 0) {
    changePath()
    return
  }
  formPage.value -= 1
}

function validateForm(): boolean {
  clearErrors()
  for (const page of wizardPages.value) {
    const invalidField = validatePage(page)
    if (invalidField) {
      openWizardPage(page)
      focusField(invalidField)
      return false
    }
  }
  return true
}

async function handleCopy() {
  if (!resultManifest.value) return
  await navigator.clipboard.writeText(resultManifest.value)
  copySuccess.value = true
  setTimeout(() => { copySuccess.value = false }, 1500)
}

function startOver() {
  resetPenguplayConnection()
  Object.assign(form, {
    email: '',
    nuvioPassword: '',
    torboxApiKey: '',
    aiostreamsPassword: '',
    penguplayReceipt: '',
    tmdbApiKey: '',
    tvdbApiKey: '',
    catalogMode: 'nuvio',
    customCatalogUrl: '',
    profileIds: []
  })
  setupPath.value = null
  setupMode.value = 'simple'
  formPage.value = 0
  generatePassword()
  globalError.value = null
  lastErrorField.value = null
  completedSteps.value = []
  activeStep.value = 'details'
  result.value = null
  resetProfileSelection()
  currentView.value = 'choice'
}

function handleRetry() {
  globalError.value = null
  currentView.value = 'form'
  if (lastErrorField.value) {
    const pageByField: Record<string, WizardPage> = {
      email: 'account',
      nuvioPassword: 'account',
      torboxApiKey: 'torbox',
      aiostreamsPassword: 'matching',
      customCatalogUrl: 'catalog',
      profiles: 'profiles',
      penguplayAuth: 'penguplay'
    }
    openWizardPage(pageByField[lastErrorField.value] || 'account')
    focusField(lastErrorField.value)
  }
}

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
    const payload = setupPath.value === 'https'
      ? {
          setupPath: 'https',
          email: form.email,
          nuvioPassword: form.nuvioPassword,
          penguplayReceipt: form.penguplayReceipt,
          catalogMode: 'nuvio',
          profileIds: form.profileIds
        }
      : setupMode.value === 'simple'
        ? {
            ...form,
            setupPath: 'debrid',
            tmdbApiKey: '',
            tvdbApiKey: '',
            catalogMode: 'nuvio',
            customCatalogUrl: ''
          }
        : { ...form, setupPath: 'debrid' }

    const response = await fetch(withBase('/api/ai/setup'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errBody = await response.json().catch(() => null)
      throw new Error(errBody?.error || `Request failed with status ${response.status}`)
    }
    if (!response.body) throw new Error('No response stream available.')

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
          const currentIdx = stepsOrder.value.indexOf(event.step)
          completedSteps.value = currentIdx >= 0 ? stepsOrder.value.slice(0, currentIdx) : []
        } else if (event.type === 'error') {
          throw { message: event.message, step: event.step }
        } else if (event.type === 'result') {
          completedSteps.value = [...stepsOrder.value]
          activeStep.value = 'complete'
          result.value = event.data
          currentView.value = 'result'
          isSubmitting.value = false
          return
        }
      }
      if (done) break
    }
    throw new Error('The setup ended before a result was returned.')
  } catch (err: any) {
    isSubmitting.value = false
    const errMsg = err.message || 'An unexpected error occurred.'
    const step = err.step || 'setup'
    globalError.value = errMsg

    if (step === 'torbox') {
      errors.torboxApiKey = errMsg
      lastErrorField.value = 'torboxApiKey'
      openWizardPage('torbox')
    } else if (step === 'penguplay') {
      form.penguplayReceipt = ''
      turnstileToken.value = ''
      removeTurnstileWidget()
      errors.penguplayAuth = errMsg
      lastErrorField.value = 'penguplayAuth'
      openWizardPage('penguplay')
    } else if (step === 'profiles') {
      errors.profiles = errMsg
      lastErrorField.value = 'profiles'
      openWizardPage('profiles')
    } else if (step === 'details' && /email/i.test(errMsg)) {
      errors.email = errMsg
      lastErrorField.value = 'email'
      openWizardPage('account')
    } else if (step === 'details' && /password/i.test(errMsg)) {
      errors.nuvioPassword = errMsg
      lastErrorField.value = 'nuvioPassword'
      openWizardPage('account')
    } else if (step === 'details' && /(catalog|manifest|url)/i.test(errMsg)) {
      errors.customCatalogUrl = errMsg
      lastErrorField.value = 'customCatalogUrl'
      setupMode.value = 'advanced'
      openWizardPage('catalog')
    }
    currentView.value = 'form'
  }
}
</script>

<template>
  <div class="quickstart-shell">
    <section class="quickstart-card" :class="{ 'is-standalone': hideHeader }">
      <button
        v-if="!hideHeader"
        class="quickstart-toggle"
        type="button"
        :aria-expanded="!isCollapsed"
        aria-controls="nuvio-quickstart-body"
        @click="isCollapsed = !isCollapsed"
      >
        <span class="quickstart-toggle__identity">
          <img :src="withBase('/tools_icon_coloured.webp')" alt="" aria-hidden="true" />
          <span><strong>Nuvio Quickstart</strong><small>AIOStreams or PenguPlay</small></span>
        </span>
        <svg viewBox="0 0 20 20" aria-hidden="true" :class="{ rotated: !isCollapsed }"><path d="m6 8 4 4 4-4" /></svg>
      </button>

      <div id="nuvio-quickstart-body" v-show="!isCollapsed" class="quickstart-body">
        <header v-if="currentView === 'choice'" class="choice-heading">
          <div>
            <span class="eyebrow">{{ t.guidedSetup }}</span>
            <h2>{{ t.question }}</h2>
            <p>{{ t.questionDesc }}</p>
          </div>
        </header>

        <header v-else-if="currentView === 'form'" class="quickstart-intro quickstart-intro--simple">
          <div>
            <h2>{{ setupPath === 'https' ? t.freeTitle : t.paidTitle }}</h2>
            <p>{{ setupPath === 'https' ? t.freeIntro : t.paidIntro }}</p>
          </div>
        </header>

        <div v-if="currentView === 'choice'" class="path-choice">
          <div class="path-grid">
            <button class="path-option path-option--recommended" type="button" @click="selectPath('debrid')">
              <span class="path-option__top"><i>{{ t.paidLabel }}</i><em>{{ t.recommended }}</em></span>
              <strong>{{ t.yes }}</strong>
              <p>{{ t.yesDesc }}</p>
              <small>{{ t.paidIncludes }}</small>
              <span class="path-option__action">{{ t.choosePath }} <b aria-hidden="true">→</b></span>
            </button>

            <button class="path-option" type="button" @click="selectPath('https')">
              <span class="path-option__top"><i>{{ t.freeLabel }}</i></span>
              <strong>{{ t.no }}</strong>
              <p>{{ t.noDesc }}</p>
              <small>{{ t.freeIncludes }}</small>
              <span class="path-option__action">{{ t.choosePath }} <b aria-hidden="true">→</b></span>
            </button>
          </div>
        </div>

        <div v-if="globalError" class="inline-alert" role="alert">
          <span class="inline-alert__mark">!</span>
          <div><strong>{{ t.setupStopped }}</strong><p>{{ globalError }}</p></div>
          <button type="button" @click="handleRetry">{{ lastErrorField ? t.checkFieldBtn : t.retryBtn }}</button>
        </div>

        <form v-if="currentView === 'form'" class="wizard-form" novalidate @submit.prevent="goNext">
          <div class="wizard-meta">
            <span>{{ setupPath === 'https' ? t.no : t.yes }}</span>
            <span>{{ wizardStepLabel }}</span>
          </div>
          <div class="wizard-progress" aria-hidden="true"><i :style="{ width: wizardProgress }"></i></div>

          <section class="wizard-page" aria-live="polite">
            <header class="wizard-page__heading">
              <h3>{{ pageTitle }}</h3>
              <p>{{ pageDescription }}</p>
            </header>

            <div class="wizard-page__content">
              <template v-if="currentPage === 'account'">
                <p class="page-note">{{ t.newAccountsAuto }}</p>
                <label class="field" :class="{ 'has-error': errors.email }">
                  <span>{{ t.emailLabel }}</span>
                  <input id="email" v-model="form.email" type="email" :placeholder="t.emailPlaceholder" autocomplete="email" required :aria-invalid="Boolean(errors.email)" :aria-describedby="errors.email ? 'email-error' : undefined" @input="handleAccountInput('email')" />
                  <small v-if="errors.email" id="email-error">{{ errors.email }}</small>
                </label>
                <label class="field" :class="{ 'has-error': errors.nuvioPassword }">
                  <span>{{ t.passwordLabel }}</span>
                  <span class="input-action">
                    <input id="nuvioPassword" v-model="form.nuvioPassword" :type="showNuvioPassword ? 'text' : 'password'" :placeholder="t.passwordPlaceholder" autocomplete="current-password" required :aria-invalid="Boolean(errors.nuvioPassword)" :aria-describedby="errors.nuvioPassword ? 'nuvio-password-error' : undefined" @input="handleAccountInput('nuvioPassword')" />
                    <button type="button" :aria-label="showNuvioPassword ? t.hideNuvioPassword : t.showNuvioPassword" :aria-pressed="showNuvioPassword" @click="showNuvioPassword = !showNuvioPassword">
                      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" /><circle cx="10" cy="10" r="2.5" /></svg>
                    </button>
                  </span>
                  <small v-if="errors.nuvioPassword" id="nuvio-password-error">{{ errors.nuvioPassword }}</small>
                </label>
              </template>

              <template v-else-if="currentPage === 'profiles'">
                <p v-if="profileLookupFallback" class="page-note">{{ t.profilesFallback }}</p>
                <div id="profiles" class="profile-picker" role="group" :aria-label="t.profilesPageTitle" :aria-invalid="Boolean(errors.profiles)">
                  <label v-for="profile in profileOptions" :key="profile.profileIndex" :class="{ active: form.profileIds.includes(profile.profileIndex) }">
                    <input v-model="form.profileIds" type="checkbox" :value="profile.profileIndex" @change="errors.profiles = ''" />
                    <span>
                      <strong>{{ profile.name }}</strong>
                      <small v-if="profile.usesPrimaryAddons">{{ t.profileSharesPrimary }}</small>
                    </span>
                  </label>
                </div>
                <small v-if="errors.profiles" class="profile-picker-error" role="alert">{{ errors.profiles }}</small>
              </template>

              <template v-else-if="currentPage === 'torbox'">
                <label class="field" :class="{ 'has-error': errors.torboxApiKey }">
                  <span class="field-label-row">
                    <span>{{ t.torboxKeyLabel }}</span>
                    <a href="https://torbox.app/settings" target="_blank" rel="noreferrer">{{ t.torboxHelpLink }} ↗</a>
                  </span>
                  <span class="input-action">
                    <input id="torboxApiKey" v-model="form.torboxApiKey" :type="showTorboxApiKey ? 'text' : 'password'" :placeholder="t.torboxKeyPlaceholder" autocomplete="off" required :aria-invalid="Boolean(errors.torboxApiKey)" :aria-describedby="errors.torboxApiKey ? 'torbox-api-key-error' : undefined" @input="errors.torboxApiKey = ''" />
                    <button type="button" :aria-label="showTorboxApiKey ? t.hideTorboxApiKey : t.showTorboxApiKey" :aria-pressed="showTorboxApiKey" @click="showTorboxApiKey = !showTorboxApiKey">
                      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" /><circle cx="10" cy="10" r="2.5" /></svg>
                    </button>
                  </span>
                  <small v-if="errors.torboxApiKey" id="torbox-api-key-error">{{ errors.torboxApiKey }}</small>
                </label>
                <a class="torbox-referral" href="https://torbox.app/subscription?referral=41d1ac85-ee5e-4699-9f0a-92e67cbc2fb2" target="_blank" rel="noreferrer">
                  <span><strong>{{ t.needTorbox }}</strong><small>{{ t.torboxRefDesc }}</small></span>
                  <span>{{ t.getTorbox }} ↗</span>
                </a>
              </template>

              <div v-else-if="currentPage === 'mode'" class="mode-picker" role="group" :aria-label="t.modeLabel">
                <button type="button" :class="{ active: setupMode === 'simple' }" :aria-pressed="setupMode === 'simple'" @click="setSetupMode('simple')">
                  <span>{{ t.simpleMode }}</span><small>{{ t.simpleModeDesc }}</small>
                </button>
                <button type="button" :class="{ active: setupMode === 'advanced' }" :aria-pressed="setupMode === 'advanced'" @click="setSetupMode('advanced')">
                  <span>{{ t.advancedMode }}</span><small>{{ t.advancedModeDesc }}</small>
                </button>
              </div>

              <template v-else-if="currentPage === 'catalog'">
                <label class="field">
                  <span>{{ t.catalogLabel }}</span>
                  <select v-model="form.catalogMode" @change="errors.customCatalogUrl = ''">
                    <option value="nuvio">{{ t.catalogNuvio }}</option>
                    <option value="cinemeta">{{ t.catalogCinemeta }}</option>
                    <option value="none">{{ t.catalogNone }}</option>
                    <option value="custom">{{ t.catalogCustom }}</option>
                  </select>
                  <em>{{ t.catalogHelp }}</em>
                </label>
                <label v-if="form.catalogMode === 'custom'" class="field" :class="{ 'has-error': errors.customCatalogUrl }">
                  <span>{{ t.customCatalogLabel }}</span>
                  <input id="customCatalogUrl" v-model="form.customCatalogUrl" type="url" :placeholder="t.customCatalogPlaceholder" autocomplete="url" :aria-invalid="Boolean(errors.customCatalogUrl)" :aria-describedby="errors.customCatalogUrl ? 'custom-catalog-error' : undefined" @input="errors.customCatalogUrl = ''" />
                  <small v-if="errors.customCatalogUrl" id="custom-catalog-error">{{ errors.customCatalogUrl }}</small>
                </label>
              </template>

              <template v-else-if="currentPage === 'matching'">
                <p class="page-note">{{ t.advancedDesc }}</p>
                <div class="matching-fields">
                  <label class="field"><span>{{ t.tmdbLabel }} <i>{{ t.optional }}</i></span><input id="tmdbApiKey" v-model="form.tmdbApiKey" type="password" autocomplete="off" /></label>
                  <label class="field"><span>{{ t.tvdbLabel }} <i>{{ t.optional }}</i></span><input id="tvdbApiKey" v-model="form.tvdbApiKey" type="password" autocomplete="off" /></label>
                </div>
                <label class="field" :class="{ 'has-error': errors.aiostreamsPassword }">
                  <span>{{ t.aiostreamsPwdLabel }}</span>
                  <span class="input-action input-action--text">
                    <input id="aiostreamsPassword" v-model="form.aiostreamsPassword" type="text" required :aria-invalid="Boolean(errors.aiostreamsPassword)" :aria-describedby="errors.aiostreamsPassword ? 'aiostreams-password-error' : undefined" @input="errors.aiostreamsPassword = ''" />
                    <button type="button" @click="generatePassword">{{ t.regenerate }}</button>
                  </span>
                  <small v-if="errors.aiostreamsPassword" id="aiostreams-password-error">{{ errors.aiostreamsPassword }}</small>
                  <em v-else>{{ t.aiostreamsPwdHelp }}</em>
                </label>
              </template>

              <template v-else-if="currentPage === 'penguplay'">
                <div class="human-check-card" :class="{ 'is-connected': penguplayConnected }">
                  <div class="human-check-card__identity">
                    <span class="human-check-mark" aria-hidden="true">
                      <svg viewBox="0 0 20 20"><path d="M10 2.5 16 5v4.4c0 3.8-2.4 6.6-6 8.1-3.6-1.5-6-4.3-6-8.1V5l6-2.5Z"/><path v-if="penguplayConnected" d="m7 10 2 2 4-4"/></svg>
                    </span>
                    <span>
                      <strong>{{ penguplayConnected ? t.penguConnected : t.penguHumanCheck }}</strong>
                      <small>{{ penguplayConnected ? t.penguConnectedDesc : t.penguHumanCheckDesc }}</small>
                    </span>
                  </div>
                  <div v-if="!penguplayConnected" id="penguplayAuth" ref="turnstileContainer" class="turnstile-slot">
                    <span v-if="turnstileLoading">{{ t.penguChecking }}</span>
                  </div>
                </div>
                <small v-if="errors.penguplayAuth" class="human-check-error" role="alert">{{ errors.penguplayAuth }}</small>
                <p class="page-note page-note--private">{{ t.privacyFree }}</p>
              </template>

              <template v-else-if="currentPage === 'review'">
                <div class="review-list">
                  <div><span><small>{{ t.reviewAccount }}</small><strong>{{ form.email }}</strong></span><button type="button" @click="openWizardPage('account')">{{ t.edit }}</button></div>
                  <div><span><small>{{ t.reviewProfiles }}</small><strong>{{ profileSummary }}</strong></span><button type="button" @click="openWizardPage('profiles')">{{ t.edit }}</button></div>
                  <div><span><small>{{ t.reviewStreaming }}</small><strong>{{ setupPath === 'https' ? 'PenguPlay' : 'AIOStreams + TorBox' }}</strong></span><button type="button" @click="openWizardPage(setupPath === 'https' ? 'penguplay' : 'torbox')">{{ t.edit }}</button></div>
                  <div><span><small>{{ t.reviewCatalog }}</small><strong>{{ setupPath === 'https' || setupMode === 'simple' ? t.catalogAutomatic : catalogName }}</strong></span><button v-if="setupPath === 'debrid' && setupMode === 'advanced'" type="button" @click="openWizardPage('catalog')">{{ t.edit }}</button></div>
                  <div v-if="setupPath === 'debrid'"><span><small>{{ t.modeLabel }}</small><strong>{{ setupMode === 'simple' ? t.simpleMode : t.advancedMode }}</strong></span><button type="button" @click="openWizardPage('mode')">{{ t.edit }}</button></div>
                  <div v-if="setupPath === 'debrid' && setupMode === 'advanced'"><span><small>{{ t.reviewMatching }}</small><strong>{{ matchingSummary }}</strong></span><button type="button" @click="openWizardPage('matching')">{{ t.edit }}</button></div>
                </div>
                <p class="page-note page-note--private">{{ setupPath === 'https' ? t.privacyFree : t.privacyPaid }}</p>
              </template>
            </div>
          </section>

          <footer class="wizard-footer">
            <button class="secondary-action" type="button" @click="goBack">{{ t.back }}</button>
            <button class="primary-action" type="submit" :disabled="isSubmitting || profilesLoading || penguplayCreateBusy || (currentPage === 'penguplay' && !penguplayCheckComplete)">
              {{ profilesLoading ? t.profilesLoading : (penguplayCreateBusy ? t.penguVerifying : (currentPage === 'review' ? (setupPath === 'https' ? t.submitFree : t.submitPaid) : t.continue)) }}
              <svg v-if="currentPage !== 'review'" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M12 6l4 4-4 4" /></svg>
            </button>
          </footer>
        </form>

        <div v-else-if="currentView === 'progress'" class="state-view" aria-live="polite">
          <div class="state-heading"><span class="loader"></span><div><span class="eyebrow">In progress</span><h2>{{ t.buildingTitle }}</h2><p>{{ progressMessage }}</p></div></div>
          <ol class="step-track" :style="{ gridTemplateColumns: `repeat(${progressSteps.length}, minmax(0, 1fr))` }">
            <li v-for="step in progressSteps" :key="step.id" :class="{ active: activeStep === step.id, done: completedSteps.includes(step.id) }">
              <i></i><span>{{ step.label }}</span>
            </li>
          </ol>
        </div>

        <div v-else-if="currentView === 'result' && result" class="state-view result-view" aria-live="polite">
          <div class="success-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg></div>
          <span class="eyebrow">{{ t.complete }}</span>
          <h2>{{ t.readyTitle }}</h2>
          <p v-if="(lang || '').startsWith('nl')">{{ result.email }} is {{ result.nuvioAccountCreated ? 'aangemaakt' : 'gekoppeld' }}. {{ result.addons.join(' en ') }} is geïnstalleerd op {{ result.installedProfiles }} profiel{{ result.installedProfiles === 1 ? '' : 'en' }}.</p>
          <p v-else>{{ result.email }} was {{ result.nuvioAccountCreated ? 'created' : 'connected' }}. {{ result.addons.join(' and ') }} {{ result.addons.length === 1 ? 'was' : 'were' }} installed on {{ result.installedProfiles }} profile{{ result.installedProfiles === 1 ? '' : 's' }}.</p>

          <div v-if="result.setupPath !== 'https' || result.nuvioAccountCreated" class="result-grid" :class="{ 'result-grid--single': result.setupPath === 'https' }">
            <section v-if="result.setupPath !== 'https'">
              <span class="result-label">{{ t.aioManifestLabel }}</span>
              <div class="copy-row"><input :value="resultManifest" readonly /><button type="button" @click="handleCopy">{{ copySuccess ? t.copied : t.copy }}</button></div>
            </section>
            <section v-if="result.nuvioAccountCreated || result.aiostreamsPassword" class="credentials">
              <span class="result-label">{{ t.yourCredentials }}</span>
              <p>{{ t.credentialsNote }}</p>
              <dl>
                <template v-if="result.nuvioAccountCreated"><dt>{{ t.nuvioEmail }}</dt><dd>{{ result.email }}</dd><dt>{{ t.nuvioPasswordLabel }}</dt><dd><code>{{ result.nuvioPassword }}</code></dd></template>
                <template v-if="result.aiostreamsPassword"><dt>{{ t.aiostreamsPasswordLabel }}</dt><dd><code>{{ result.aiostreamsPassword }}</code></dd></template>
              </dl>
            </section>
          </div>

          <div class="result-actions">
            <a v-if="result.setupPath !== 'https'" :href="resultConfigureUrl" target="_blank" rel="noreferrer">{{ t.openAioSettings }} ↗</a>
            <button type="button" @click="startOver">{{ t.startOver }}</button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.quickstart-shell { --qs-radius: 14px; color: var(--vp-c-text-1); }
.quickstart-tip { display: flex; gap: 10px; margin: 0 0 16px; padding: 12px 14px; border: 1px solid var(--vp-c-divider); border-radius: 10px; background: var(--vp-c-bg-soft); font-size: 13px; }
.quickstart-tip span { color: var(--vp-c-text-2); }
.quickstart-card { overflow: hidden; border: 1px solid var(--vp-c-divider); border-radius: var(--qs-radius); background: var(--vp-c-bg); }
.quickstart-card.is-standalone { border: 0; border-radius: 0; background: transparent; }
.quickstart-toggle { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 15px 18px; border: 0; background: transparent; color: inherit; cursor: pointer; }
.quickstart-toggle__identity { display: flex; align-items: center; gap: 11px; text-align: left; }
.quickstart-toggle__identity img { width: 32px; height: 32px; }
.quickstart-toggle__identity span { display: grid; }
.quickstart-toggle__identity strong { font-size: 14px; }
.quickstart-toggle__identity small { color: var(--vp-c-text-3); }
.quickstart-toggle > svg { width: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; transition: transform .2s ease; }
.rotated { transform: rotate(180deg); }
.quickstart-body { padding: 22px; }
.choice-heading { max-width: 780px; margin: 0 auto; padding: 10px 6px 22px; text-align: center; }
.choice-heading h2 { max-width: 720px; margin: 0 auto !important; border: 0 !important; font-size: 24px !important; line-height: 1.3; }
.choice-heading p { max-width: 660px; margin: 9px auto 0; color: var(--vp-c-text-2); font-size: 13px; line-height: 1.55; }
.path-choice { padding-top: 4px; }
.path-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px; }
.path-option { position: relative; display: flex; min-height: 235px; flex-direction: column; align-items: flex-start; padding: 19px; border: 1px solid var(--vp-c-divider); border-radius: 12px; background: var(--tool-surface-alt, var(--vp-c-bg-alt)); color: var(--vp-c-text-1); text-align: left; cursor: pointer; transition: border-color .18s, box-shadow .18s, transform .18s; }
.path-option:hover { border-color: var(--vp-c-brand-1); box-shadow: 0 8px 24px rgb(0 0 0 / 7%); transform: translateY(-2px); }
.path-option--recommended { border-color: color-mix(in srgb, var(--vp-c-brand-1) 45%, var(--vp-c-divider)); background: color-mix(in srgb, var(--vp-c-brand-soft) 28%, var(--vp-c-bg)); }
.path-option__top { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 10px; }
.path-option__top i { color: var(--vp-c-text-3); font: 700 9px/1.2 var(--vp-font-family-mono); font-style: normal; letter-spacing: .09em; text-transform: uppercase; }
.path-option__top em { padding: 3px 7px; border-radius: 999px; background: var(--vp-c-brand-1); color: white; font-size: 8px; font-style: normal; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
.path-option > strong { margin-top: 17px; font-size: 17px; }
.path-option > p { margin: 6px 0 0; color: var(--vp-c-text-2); font-size: 12px; line-height: 1.5; }
.path-option > small { margin: 14px 0 18px; color: var(--vp-c-text-3); font-size: 10px; line-height: 1.5; }
.path-option__action { display: flex; width: 100%; align-items: center; justify-content: space-between; margin-top: auto; padding-top: 12px; border-top: 1px solid var(--vp-c-divider); color: var(--vp-c-brand-1); font-size: 10px; font-weight: 750; }
.path-option__action b { font-size: 16px; font-weight: 500; }
.quickstart-intro { display: flex; align-items: flex-end; justify-content: space-between; gap: 30px; padding-bottom: 20px; border-bottom: 1px solid var(--vp-c-divider); }
.quickstart-intro--simple { align-items: flex-start; }
.eyebrow { display: block; margin-bottom: 5px; color: var(--vp-c-brand-1); font: 700 10px/1.2 var(--vp-font-family-mono); letter-spacing: .1em; text-transform: uppercase; }
.quickstart-intro h2, .state-view h2 { margin: 0 !important; border: 0 !important; font-size: 21px !important; line-height: 1.25; }
.quickstart-intro p, .state-view > p { margin: 6px 0 0; max-width: 550px; color: var(--vp-c-text-2); font-size: 13px; line-height: 1.55; }
.setup-summary { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px 14px; min-width: 300px; color: var(--vp-c-text-2); font-size: 11px; }
.setup-summary > span { display: inline-flex; align-items: center; gap: 6px; }
.summary-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--vp-c-text-3); }
.summary-dot--brand { background: var(--vp-c-brand-1); }
.secure-pill { width: 100%; justify-content: flex-end; color: var(--vp-c-text-3); }
.secure-pill svg { width: 13px; fill: none; stroke: currentColor; stroke-width: 1.7; }
.inline-alert { display: flex; align-items: center; gap: 12px; margin-top: 18px; padding: 12px; border: 1px solid var(--vp-c-danger-2); border-radius: 10px; background: color-mix(in srgb, var(--vp-c-danger-1) 7%, transparent); }
.inline-alert__mark { display: grid; place-items: center; width: 25px; height: 25px; border-radius: 50%; background: var(--vp-c-danger-1); color: white; font-weight: 800; }
.inline-alert div { flex: 1; }
.inline-alert strong { font-size: 12px; }
.inline-alert p { margin: 1px 0 0; color: var(--vp-c-danger-1); font-size: 11px; }
.inline-alert button { border: 0; background: transparent; color: var(--vp-c-danger-1); font-weight: 700; cursor: pointer; }
.wizard-form { max-width: 680px; margin: 0 auto; padding-top: 18px; }
.wizard-meta { display: flex; align-items: center; justify-content: space-between; gap: 16px; color: var(--vp-c-text-3); font-size: 10px; font-weight: 700; }
.wizard-progress { height: 3px; margin-top: 9px; overflow: hidden; border-radius: 999px; background: var(--vp-c-divider); }
.wizard-progress i { display: block; height: 100%; border-radius: inherit; background: var(--vp-c-brand-1); transition: width .2s ease; }
.wizard-page { min-height: 360px; margin-top: 16px; padding: 22px; border: 1px solid var(--vp-c-divider); border-radius: 12px; background: var(--tool-surface-alt, var(--vp-c-bg-alt)); }
.wizard-page__heading { padding-bottom: 16px; border-bottom: 1px solid var(--vp-c-divider); }
.wizard-page__heading h3 { margin: 0 !important; font-size: 18px !important; line-height: 1.3; }
.wizard-page__heading p { max-width: 540px; margin: 5px 0 0; color: var(--vp-c-text-2); font-size: 12px; line-height: 1.5; }
.wizard-page__content { display: grid; gap: 15px; max-width: 560px; margin: 18px auto 0; }
.page-note { margin: 0; padding: 11px 12px; border-radius: 8px; background: var(--vp-c-bg-soft); color: var(--vp-c-text-2); font-size: 10px; line-height: 1.5; }
.page-note--private { color: var(--vp-c-text-3); }
.mode-picker { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; padding: 5px; border: 1px solid var(--vp-c-divider); border-radius: 11px; background: var(--vp-c-bg-soft); }
.mode-picker button { display: grid; gap: 2px; padding: 9px 12px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: var(--vp-c-text-2); text-align: left; cursor: pointer; }
.mode-picker button:hover { color: var(--vp-c-text-1); }
.mode-picker button.active { border-color: var(--vp-c-divider); background: var(--vp-c-bg); color: var(--vp-c-text-1); box-shadow: 0 1px 3px rgb(0 0 0 / 5%); }
.mode-picker span { font-size: 11px; font-weight: 700; }
.mode-picker small { color: var(--vp-c-text-3); font-size: 9px; }
.profile-picker { display: grid; gap: 8px; }
.profile-picker label { display: flex; align-items: center; gap: 11px; padding: 11px 12px; border: 1px solid var(--vp-c-divider); border-radius: 9px; background: var(--vp-c-bg); cursor: pointer; }
.profile-picker label.active { border-color: color-mix(in srgb, var(--vp-c-brand-1) 55%, var(--vp-c-divider)); background: color-mix(in srgb, var(--vp-c-brand-soft) 28%, var(--vp-c-bg)); }
.profile-picker input { width: 16px; height: 16px; margin: 0; accent-color: var(--vp-c-brand-1); }
.profile-picker span { display: grid; gap: 2px; }
.profile-picker strong { color: var(--vp-c-text-1); font-size: 11px; }
.profile-picker small { color: var(--vp-c-text-3); font-size: 9px; }
.profile-picker-error { color: var(--vp-c-danger-1); font-size: 10px; }
.field { display: grid; gap: 6px; margin: 0; }
.field > span:first-child, .field-label-row { color: var(--vp-c-text-2); font-size: 11px; font-weight: 650; }
.field input, .field select { box-sizing: border-box; width: 100%; min-height: 42px; padding: 9px 11px; border: 1px solid var(--vp-c-divider); border-radius: 8px; outline: none; background: var(--vp-c-bg); color: var(--vp-c-text-1); font: 13px var(--vp-font-family-base); transition: border-color .15s, box-shadow .15s; }
.field input:focus, .field select:focus { border-color: var(--vp-c-brand-1); box-shadow: 0 0 0 3px var(--vp-c-brand-soft); }
.field input::placeholder { color: var(--vp-c-text-3); }
.field.has-error input { border-color: var(--vp-c-danger-1); }
.field small { color: var(--vp-c-danger-1); font-size: 10px; }
.field em { color: var(--vp-c-text-3); font-size: 10px; font-style: normal; }
.field i { color: var(--vp-c-text-3); font-weight: 400; font-style: normal; }
.field-label-row { display: flex; justify-content: space-between; gap: 10px; }
.field-label-row a { color: var(--vp-c-brand-1); font-weight: 500; text-decoration: none; }
.input-action { position: relative; display: block; }
.input-action input { padding-right: 44px; }
.input-action button { position: absolute; top: 5px; right: 5px; height: 32px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: var(--vp-c-text-3); font-size: 10px; font-weight: 700; cursor: pointer; }
.input-action button:hover { background: var(--vp-c-bg-alt); color: var(--vp-c-text-1); }
.input-action svg { width: 17px; fill: none; stroke: currentColor; stroke-width: 1.5; }
.input-action--text input { padding-right: 88px; font-family: var(--vp-font-family-mono); font-size: 11px; }
.torbox-referral { display: flex; align-items: center; justify-content: space-between; gap: 15px; padding-top: 11px; border-top: 1px solid var(--vp-c-divider); color: inherit; text-decoration: none !important; }
.torbox-referral > span:first-child { display: grid; }
.torbox-referral strong { font-size: 11px; }
.torbox-referral small { color: var(--vp-c-text-3); font-size: 9px; }
.torbox-referral > span:last-child { color: var(--vp-c-brand-1); font-size: 10px; font-weight: 700; white-space: nowrap; }
.human-check-card { display: grid; gap: 16px; padding: 18px; border: 1px solid var(--vp-c-divider); border-radius: 10px; background: var(--vp-c-bg); }
.human-check-card.is-connected { border-color: color-mix(in srgb, var(--vp-c-brand-1) 45%, var(--vp-c-divider)); }
.human-check-card__identity { display: flex; align-items: center; gap: 12px; }
.human-check-card__identity > span:last-child { display: grid; gap: 3px; }
.human-check-card__identity strong { color: var(--vp-c-text-1); font-size: 12px; }
.human-check-card__identity small { color: var(--vp-c-text-3); font-size: 10px; line-height: 1.45; }
.human-check-mark { display: grid; width: 38px; height: 38px; flex: 0 0 auto; place-items: center; border: 1px solid var(--vp-c-divider); border-radius: 9px; background: var(--vp-c-bg-soft); color: var(--vp-c-brand-1); }
.human-check-mark svg { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.7; }
.turnstile-slot { display: grid; min-height: 65px; place-items: center; overflow: hidden; }
.turnstile-slot > span { color: var(--vp-c-text-3); font-size: 10px; }
.human-check-error { display: block; margin-top: -5px; color: var(--vp-c-danger-1); font-size: 10px; line-height: 1.45; }
.matching-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.review-list { display: grid; overflow: hidden; border: 1px solid var(--vp-c-divider); border-radius: 10px; background: var(--vp-c-bg); }
.review-list > div { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 12px; border-bottom: 1px solid var(--vp-c-divider); }
.review-list > div:last-child { border-bottom: 0; }
.review-list > div > span { display: grid; min-width: 0; gap: 2px; }
.review-list small { color: var(--vp-c-text-3); font-size: 9px; }
.review-list strong { overflow: hidden; color: var(--vp-c-text-1); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.review-list button { flex: 0 0 auto; padding: 0; border: 0; background: transparent; color: var(--vp-c-brand-1); font-size: 10px; font-weight: 700; cursor: pointer; }
.wizard-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; }
.secondary-action { display: inline-flex; min-height: 42px; align-items: center; justify-content: center; padding: 0 17px; border: 1px solid var(--vp-c-divider); border-radius: 8px; background: transparent; color: var(--vp-c-text-1); font-size: 12px; font-weight: 700; cursor: pointer; }
.secondary-action:hover { border-color: var(--vp-c-text-3); background: var(--vp-c-bg-soft); }
.primary-action { display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 42px; padding: 0 17px; border: 0; border-radius: 8px; background: var(--vp-c-brand-1); color: white; font-size: 12px; font-weight: 700; white-space: nowrap; cursor: pointer; }
.primary-action:hover { background: var(--vp-c-brand-2); }
.primary-action:disabled { opacity: .6; cursor: wait; }
.primary-action svg { width: 16px; fill: none; stroke: currentColor; stroke-width: 2; }
.state-view { max-width: 760px; margin: 0 auto; padding: 54px 20px; }
.state-heading { display: flex; align-items: center; gap: 17px; }
.state-heading p { margin: 4px 0 0; color: var(--vp-c-text-2); font-size: 12px; }
.loader { width: 38px; height: 38px; border: 2px solid var(--vp-c-divider); border-top-color: var(--vp-c-brand-1); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.step-track { display: grid; grid-template-columns: repeat(5, 1fr); padding: 0; margin: 38px 0 0; list-style: none; }
.step-track li { position: relative; display: grid; justify-items: center; gap: 9px; color: var(--vp-c-text-3); font-size: 10px; text-align: center; }
.step-track li:not(:last-child)::after { content: ''; position: absolute; top: 5px; left: calc(50% + 8px); width: calc(100% - 16px); height: 1px; background: var(--vp-c-divider); }
.step-track i { z-index: 1; width: 11px; height: 11px; border: 2px solid var(--vp-c-divider); border-radius: 50%; background: var(--vp-c-bg); }
.step-track li.active { color: var(--vp-c-text-1); font-weight: 700; }
.step-track li.active i { border-color: var(--vp-c-brand-1); }
.step-track li.done i { border-color: var(--vp-c-brand-1); background: var(--vp-c-brand-1); }
.result-view { text-align: center; }
.success-icon { display: grid; place-items: center; width: 42px; height: 42px; margin: 0 auto 13px; border-radius: 50%; background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); }
.success-icon svg { width: 22px; fill: none; stroke: currentColor; stroke-width: 2.3; }
.result-view > p { margin: 7px auto 25px; }
.result-grid { display: grid; grid-template-columns: 1.15fr .85fr; gap: 12px; text-align: left; }
.result-grid--single { grid-template-columns: 1fr; }
.result-grid section { padding: 14px; border: 1px solid var(--vp-c-divider); border-radius: 10px; background: var(--tool-surface-alt, var(--vp-c-bg-alt)); }
.result-label { display: block; margin-bottom: 8px; color: var(--vp-c-text-2); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
.copy-row { display: flex; overflow: hidden; border: 1px solid var(--vp-c-divider); border-radius: 7px; background: var(--vp-c-bg); }
.copy-row input { flex: 1; min-width: 0; padding: 9px; border: 0; outline: 0; background: transparent; color: var(--vp-c-text-2); font: 10px var(--vp-font-family-mono); }
.copy-row button { border: 0; background: var(--vp-c-brand-1); color: white; padding: 0 12px; font-size: 10px; font-weight: 700; cursor: pointer; }
.credentials > p { margin: -4px 0 8px; color: var(--vp-c-text-3); font-size: 9px; }
.credentials dl { display: grid; grid-template-columns: auto 1fr; gap: 5px 12px; margin: 0; font-size: 10px; }
.credentials dt { color: var(--vp-c-text-3); }
.credentials dd { min-width: 0; margin: 0; overflow-wrap: anywhere; text-align: right; }
.credentials code { color: var(--vp-c-text-1); font-size: 9px; }
.result-actions { display: flex; justify-content: center; gap: 9px; margin-top: 16px; }
.result-actions a, .result-actions button { min-height: 38px; padding: 0 14px; border-radius: 7px; font-size: 11px; font-weight: 700; cursor: pointer; }
.result-actions a { display: inline-flex; align-items: center; border: 1px solid var(--vp-c-brand-1); background: var(--vp-c-brand-1); color: white; text-decoration: none; }
.result-actions button { border: 1px solid var(--vp-c-divider); background: transparent; color: var(--vp-c-text-1); }
button:focus-visible, a:focus-visible, summary:focus-visible, input:focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 2px; }
@media (max-width: 760px) {
  .quickstart-body { padding: 17px; }
  .quickstart-intro { align-items: flex-start; }
  .setup-summary { min-width: 0; }
  .path-grid, .result-grid { grid-template-columns: 1fr; }
  .matching-fields { grid-template-columns: 1fr; }
}
@media (max-width: 560px) {
  .quickstart-intro { display: block; }
  .setup-summary { justify-content: flex-start; margin-top: 13px; }
  .secure-pill { width: auto; justify-content: flex-start; }
  .wizard-page { min-height: 0; padding: 17px; }
  .wizard-footer { display: grid; grid-template-columns: 1fr; }
  .wizard-footer .primary-action { width: auto; }
  .primary-action { width: 100%; }
  .step-track { grid-template-columns: 1fr; gap: 13px; margin-top: 28px; }
  .step-track li { grid-template-columns: 13px 1fr; justify-items: start; text-align: left; }
  .step-track li:not(:last-child)::after { top: 12px; bottom: -14px; left: 5px; width: 1px; height: auto; }
  .result-actions { flex-direction: column; }
  .result-actions a { justify-content: center; }
  .quickstart-tip { flex-direction: column; gap: 2px; }
}
</style>
