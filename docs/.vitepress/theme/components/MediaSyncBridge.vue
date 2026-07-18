<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref
} from 'vue'
import { useData, withBase } from 'vitepress'
import {
  SERVICE_DEFINITIONS,
  SERVICE_IDS,
  endpointFingerprint,
  routeLabel,
  summarizeScopes,
  validateEndpointPair,
  type BridgeSlot,
  type CanonicalBundle,
  type ServiceId,
  type SyncScopes
} from './mediaBridgeCore'
import {
  planMediaBridgePreview,
  type MediaBridgePreviewPlan
} from './mediaBridgePlan'
import {
  createMediaBridgeVerificationCheckpoint,
  createNuvioConnection,
  createPlexConnection,
  createPlexPinLink,
  createStremioDeviceLink,
  createStremioLinkedConnection,
  createStremioConnection,
  identifyOAuthConnection,
  inspectDestinationMappings,
  pullMediaBridge,
  pullMediaBridgeForVerification,
  pushMediaBridge,
  readPlexPinLink,
  readStremioDeviceLink,
  signInNuvio,
  signInPlex,
  signInStremio,
  selectPlexServer,
  type BridgeConnection,
  type BridgeIssue,
  type PlexPinLink,
  type PushResult,
  type SimklCredentials,
  type StremioDeviceLink,
  type TraktCredentials
} from './mediaBridgeProviders'

const props = withDefaults(defineProps<{
  defaultExpanded?: boolean
  hideTip?: boolean
  hideHeader?: boolean
}>(), {
  defaultExpanded: false,
  hideTip: false,
  hideHeader: false
})

const { lang } = useData()
const isDutch = computed(() => String(lang.value || '').startsWith('nl'))
const copy = computed(() => isDutch.value ? {
  title: 'Sync Bridge',
  subtitle: 'Verplaats kijkgeschiedenis, voortgang en opgeslagen titels tussen Simkl, Stremio, Trakt, Plex en Nuvio.',
  info: 'Koppel een bron en bestemming en start direct met synchroniseren. Een voorbeeld bekijken is optioneel. Bestaande bestemmingsgegevens blijven behouden.',
  source: 'Bron',
  destination: 'Bestemming',
  chooseService: 'Kies dienst',
  connect: 'Verbinden',
  connecting: 'Verbinden…',
  disconnect: 'Ontkoppelen',
  connected: 'Verbonden',
  email: 'E-mailadres',
  password: 'Wachtwoord',
  profile: 'Nuvio-profiel',
  plexServer: 'Plex-server',
  swap: 'Bron en bestemming omwisselen',
  sameService: 'Gebruik twee verschillende accounts, Nuvio-profielen of Plex-servers. Opent de koppeling opnieuw het eerste account, log dan bij die dienst uit en verbind de bestemming opnieuw.',
  scopes: 'Wat wil je verplaatsen?',
  history: 'Kijkgeschiedenis',
  historyHelp: 'Bekeken films en afleveringen',
  progress: 'Verder kijken',
  progressHelp: 'De nieuwste actieve afspeelpositie',
  library: 'Opgeslagen titels',
  libraryHelp: 'Watchlist, collectie of bibliotheek',
  preview: 'Wijzigingen bekijken',
  previewing: 'Gegevens vergelijken…',
  sync: 'Synchronisatie uitvoeren',
  syncing: 'Synchroniseren…',
  reset: 'Voorbeeld wissen',
  sourceItems: 'Bronitems',
  add: 'Toevoegen',
  update: 'Bijwerken',
  present: 'Al aanwezig',
  remapped: 'Herkoppeld',
  skipped: 'Overgeslagen',
  previewTitle: 'Synchronisatievoorbeeld',
  scope: 'Bereik',
  titleCol: 'Titel',
  outcome: 'Resultaat',
  detail: 'Details',
  previous: 'Vorige',
  next: 'Volgende',
  page: 'Pagina',
  activity: 'Activiteit',
  result: 'Synchronisatie voltooid',
  resultWarnings: 'Synchronisatie voltooid met meldingen',
  finishedWarnings: 'Synchronisatie voltooid met meldingen.',
  secureShort: 'Synchronisatie draait lokaal in je browser',
  secure: 'Alle vergelijkings- en synchronisatielogica draait lokaal in dit browsertabblad. De Sync Bridge slaat je wachtwoorden, verbindingstokens en gesynchroniseerde gegevens nooit op; wachtwoorden gaan rechtstreeks naar de dienst waarbij je inlogt.',
  caveat: 'De nieuwste bekeken status wordt verplaatst; afzonderlijke herhaalde afspeelbeurten worden samengevoegd. Trakt-collecties worden opgeslagen titels; benoemde lijsten en beoordelingen blijven bij hun eigen dienst. Plex kan alleen status schrijven voor titels die al op de gekozen server staan.',
  setupStopped: 'Instellen gestopt',
  noChanges: 'Er zijn geen nieuwe of nieuwere items om te synchroniseren.',
  authorizeSeparate: 'Autoriseer voor deze kant een afzonderlijke sessie:',
  stremioDevice: 'Gebruik de apparaatkoppeling van Stremio, zodat deze pagina je wachtwoord nooit ontvangt.',
  plexDevice: 'Meld je aan bij Plex en kies daarna de mediaserver die je wilt synchroniseren.',
  openPlex: 'Open Plex-goedkeuring',
  waitingPlex: 'Wachten op Plex-goedkeuring…',
  openStremio: 'Open Stremio-goedkeuring',
  waitingStremio: 'Wachten op Stremio-goedkeuring…',
  passwordFallback: 'Gebruik in plaats daarvan e-mail en wachtwoord',
  syncPlan: 'Synchronisatieplan',
  providerNotes: 'Koppelings- en providermeldingen',
  moreNotes: 'extra meldingen in deze run',
  historyUnit: 'geschiedenis',
  progressUnit: 'voortgang',
  savedTitlesUnit: 'opgeslagen titels',
  preparingSync: 'Synchronisatie voorbereiden…',
  verifyingSync: 'Bestemming controleren…',
  keepOpen: 'Laat deze pagina open terwijl je gegevens worden vergeleken, geschreven en gecontroleerd.',
  syncFailed: 'Synchronisatie mislukt',
  backToBridge: 'Terug naar Sync Bridge',
  syncNotes: 'Synchronisatiemeldingen',
  syncNotesIntro: 'De synchronisatie is voltooid. Deze meldingen leggen uit welke items zijn overgeslagen of niet konden worden gecontroleerd.',
  note: 'melding',
  notes: 'meldingen',
  moreAffected: 'meer',
  supportMessage: 'If this helped you out or saved you some time, consider supporting me. ❤️',
  supportButton: 'Support me on Ko-fi'
} : {
  title: 'Sync Bridge',
  subtitle: 'Move watch history, playback progress, and saved titles between Simkl, Stremio, Trakt, Plex, and Nuvio.',
  info: 'Connect a source and destination and start syncing directly. Previewing changes is optional. Existing destination data is preserved.',
  source: 'Source',
  destination: 'Destination',
  chooseService: 'Choose service',
  connect: 'Connect',
  connecting: 'Connecting…',
  disconnect: 'Disconnect',
  connected: 'Connected',
  email: 'Email address',
  password: 'Password',
  profile: 'Nuvio profile',
  plexServer: 'Plex server',
  swap: 'Swap source and destination',
  sameService: 'Use two different accounts, Nuvio profiles, or Plex servers. If sign-in reopens the first account, sign out at that service and reconnect the destination.',
  scopes: 'What should move?',
  history: 'Watch history',
  historyHelp: 'Watched movies and episodes',
  progress: 'Continue watching',
  progressHelp: 'The newest active playback position',
  library: 'Saved titles',
  libraryHelp: 'Watchlist, collection, or library membership',
  preview: 'Preview changes',
  previewing: 'Comparing data…',
  sync: 'Run sync',
  syncing: 'Syncing…',
  reset: 'Clear preview',
  sourceItems: 'Source items',
  add: 'Add',
  update: 'Update',
  present: 'Already there',
  remapped: 'Remapped',
  skipped: 'Skipped',
  previewTitle: 'Sync preview',
  scope: 'Scope',
  titleCol: 'Title',
  outcome: 'Outcome',
  detail: 'Details',
  previous: 'Previous',
  next: 'Next',
  page: 'Page',
  activity: 'Activity',
  result: 'Sync complete',
  resultWarnings: 'Sync complete with notes',
  finishedWarnings: 'Sync complete with notes.',
  secureShort: 'Sync runs locally in your browser',
  secure: 'All comparison and sync logic runs locally in this browser tab. The Sync Bridge never stores your passwords, connection tokens, or synced data; passwords go directly to the service you sign in to.',
  caveat: 'The latest watched state is transferred; individual replay events are collapsed. Trakt collections become saved titles; named lists and ratings stay provider-native. Plex can only write state for titles already present on the selected server.',
  setupStopped: 'Setup stopped',
  noChanges: 'There are no new or newer items to sync.',
  authorizeSeparate: 'Authorize a separate session for this side:',
  stremioDevice: 'Use Stremio’s device link so this page never receives your password.',
  plexDevice: 'Sign in with Plex, then choose the media server you want to sync.',
  openPlex: 'Open Plex approval',
  waitingPlex: 'Waiting for Plex approval…',
  openStremio: 'Open Stremio approval',
  waitingStremio: 'Waiting for Stremio approval…',
  passwordFallback: 'Use email and password instead',
  syncPlan: 'Sync plan',
  providerNotes: 'Mapping and provider notes',
  moreNotes: 'more notes in this run',
  historyUnit: 'history',
  progressUnit: 'progress',
  savedTitlesUnit: 'saved titles',
  preparingSync: 'Preparing your sync…',
  verifyingSync: 'Verifying the destination…',
  keepOpen: 'Keep this page open while your data is compared, written, and verified.',
  syncFailed: 'Sync failed',
  backToBridge: 'Back to Sync Bridge',
  syncNotes: 'Sync notes',
  syncNotesIntro: 'The sync completed. These notes explain items that were skipped or could not be verified.',
  note: 'note',
  notes: 'notes',
  moreAffected: 'more',
  supportMessage: 'If this helped you out or saved you some time, consider supporting me. ❤️',
  supportButton: 'Support me on Ko-fi'
})

const bridgeSlots: readonly BridgeSlot[] = ['source', 'destination']
const SERVICE_LOGOS: Record<ServiceId, string> = {
  simkl: '/service-logos/simkl.ico',
  stremio: '/service-logos/stremio.png',
  trakt: '/service-logos/trakt.svg',
  plex: '/service-logos/plex.svg',
  nuvio: '/official_logo_original.png'
}
const isCollapsed = ref(!props.defaultExpanded)
const selectedService = reactive<Record<BridgeSlot, ServiceId>>({
  source: 'trakt',
  destination: 'nuvio'
})
const connections = reactive<Record<BridgeSlot, BridgeConnection | null>>({
  source: null,
  destination: null
})
const forms = reactive<Record<BridgeSlot, { email: string; password: string }>>({
  source: { email: '', password: '' },
  destination: { email: '', password: '' }
})
const connectionBusy = reactive<Record<BridgeSlot, boolean>>({ source: false, destination: false })
const connectionAttempt = reactive<Record<BridgeSlot, number>>({ source: 0, destination: 0 })
const stremioLinks = reactive<Record<BridgeSlot, StremioDeviceLink | null>>({ source: null, destination: null })
const stremioLinkAttempt = reactive<Record<BridgeSlot, number>>({ source: 0, destination: 0 })
const plexLinks = reactive<Record<BridgeSlot, PlexPinLink | null>>({ source: null, destination: null })
const plexLinkAttempt = reactive<Record<BridgeSlot, number>>({ source: 0, destination: 0 })
const scopes = reactive<SyncScopes>({ history: true, progress: true, library: true })
const globalError = ref('')
const statusMessage = ref('')
const actionBusy = ref<'preview' | 'sync' | null>(null)
const preview = ref<MediaBridgePreviewPlan | null>(null)
const previewSignature = ref('')
const providerIssues = ref<BridgeIssue[]>([])
const syncResult = ref<PushResult | null>(null)
const activity = ref<string[]>([])
const syncViewOpen = ref(false)
const syncView = ref<HTMLElement | null>(null)
const previewPage = ref(1)
const previewPageSize = 50

interface OAuthTransaction {
  slot: BridgeSlot
  service: 'trakt' | 'simkl'
  popup: Window
  timer: ReturnType<typeof setInterval>
  closeTimer?: ReturnType<typeof setTimeout>
}

const oauthTransactions = new Map<string, OAuthTransaction>()
const stremioPopups: Record<BridgeSlot, Window | null> = { source: null, destination: null }
const plexPopups: Record<BridgeSlot, Window | null> = { source: null, destination: null }
let componentMounted = false

const endpointValidation = computed(() => validateEndpointPair(
  connections.source,
  connections.destination
))
const sameService = computed(() => selectedService.source === selectedService.destination)
const routeName = computed(() => routeLabel(selectedService.source, selectedService.destination))
const routeScopeSupport = computed<SyncScopes>(() => {
  const summary = summarizeScopes(selectedService.source, selectedService.destination, scopes)
  return {
    history: Boolean(summary.find(item => item.scope === 'history')?.supported),
    progress: Boolean(summary.find(item => item.scope === 'progress')?.supported),
    library: Boolean(summary.find(item => item.scope === 'library')?.supported)
  }
})
const effectiveScopes = computed<SyncScopes>(() => ({
  history: scopes.history && routeScopeSupport.value.history,
  progress: scopes.progress && routeScopeSupport.value.progress,
  library: scopes.library && routeScopeSupport.value.library
}))
const enabledScopeCount = computed(() => Object.values(effectiveScopes.value).filter(Boolean).length)
const routeLocked = computed(() => Boolean(
  actionBusy.value || connectionBusy.source || connectionBusy.destination
))
const currentSignature = computed(() => JSON.stringify({
  source: endpointFingerprint(connections.source),
  destination: endpointFingerprint(connections.destination),
  services: selectedService,
  scopes: effectiveScopes.value
}))
const transferCount = computed(() => preview.value
  ? preview.value.transfer.history.length
    + preview.value.transfer.progress.length
    + preview.value.transfer.library.length
  : 0
)
const canPreview = computed(() => (
  endpointValidation.value.valid
  && enabledScopeCount.value > 0
  && !actionBusy.value
))
const canSync = computed(() => canPreview.value)
const syncHasWarnings = computed(() => Boolean(
  syncResult.value && providerIssues.value.some(issue => issue.status !== 'note')
))
const syncHasNotes = computed(() => Boolean(syncResult.value && providerIssues.value.length))
const finishedIssueGroups = computed(() => {
  const groups = new Map<string, BridgeIssue & { count: number; mediaLabels: string[] }>()
  for (const issue of providerIssues.value) {
    const key = `${issue.scope}\u0000${issue.status}\u0000${issue.reason}`
    const existing = groups.get(key)
    const mediaLabel = formatIssueMedia(issue)
    if (existing) {
      existing.count++
      if (mediaLabel && existing.mediaLabels.length < 3 && !existing.mediaLabels.includes(mediaLabel)) {
        existing.mediaLabels.push(mediaLabel)
      }
      continue
    }
    groups.set(key, {
      ...issue,
      count: 1,
      mediaLabels: mediaLabel ? [mediaLabel] : []
    })
  }
  return [...groups.values()]
})
const latestActivity = computed(() => activity.value[activity.value.length - 1] || statusMessage.value)
const previewRows = computed(() => {
  const start = (previewPage.value - 1) * previewPageSize
  return preview.value?.rows.slice(start, start + previewPageSize) || []
})
const previewPages = computed(() => Math.max(
  1,
  Math.ceil((preview.value?.rows.length || 0) / previewPageSize)
))

let documentOverflowBeforeSync = ''
let documentScrollLocked = false

function slotLabel(slot: BridgeSlot) {
  return slot === 'source' ? copy.value.source : copy.value.destination
}

function serviceLogo(service: ServiceId) {
  return withBase(SERVICE_LOGOS[service])
}

function handleServiceChange(slot: BridgeSlot, event: Event) {
  selectService(slot, (event.target as HTMLSelectElement).value as ServiceId)
}

function appendLog(message: string) {
  activity.value.push(`${new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })}  ${message}`)
  if (activity.value.length > 250) activity.value.splice(0, activity.value.length - 250)
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function restoreDocumentScroll() {
  if (!documentScrollLocked || typeof document === 'undefined') return
  document.documentElement.style.overflow = documentOverflowBeforeSync
  documentScrollLocked = false
}

function openSyncView() {
  if (!syncViewOpen.value && typeof document !== 'undefined') {
    documentOverflowBeforeSync = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    documentScrollLocked = true
  }
  syncViewOpen.value = true
  void nextTick(() => syncView.value?.focus())
}

function closeSyncView() {
  if (actionBusy.value === 'sync') return
  syncViewOpen.value = false
  restoreDocumentScroll()
}

function clearPreview() {
  preview.value = null
  previewSignature.value = ''
  providerIssues.value = []
  syncResult.value = null
  previewPage.value = 1
}

function selectService(slot: BridgeSlot, service: ServiceId) {
  if (selectedService[slot] === service) return
  disconnect(slot, false)
  selectedService[slot] = service
  clearPreview()
  globalError.value = ''
}

function cancelOAuthForSlot(slot: BridgeSlot) {
  for (const [state, transaction] of oauthTransactions) {
    if (transaction.slot !== slot) continue
    oauthTransactions.delete(state)
    clearInterval(transaction.timer)
    if (transaction.closeTimer) clearTimeout(transaction.closeTimer)
    if (!transaction.popup.closed) transaction.popup.close()
  }
}

function disconnect(slot: BridgeSlot, record = true) {
  const connection = connections[slot]
  const stremioPopup = stremioPopups[slot]
  if (stremioPopup && !stremioPopup.closed) stremioPopup.close()
  stremioPopups[slot] = null
  const plexPopup = plexPopups[slot]
  if (plexPopup && !plexPopup.closed) plexPopup.close()
  plexPopups[slot] = null
  connections[slot] = null
  forms[slot].password = ''
  connectionBusy[slot] = false
  connectionAttempt[slot]++
  stremioLinks[slot] = null
  stremioLinkAttempt[slot]++
  plexLinks[slot] = null
  plexLinkAttempt[slot]++
  cancelOAuthForSlot(slot)
  clearPreview()
  if (record && connection) appendLog(`${slotLabel(slot)} ${connection.service} account disconnected.`)
}

async function connectStremioDevice(slot: BridgeSlot) {
  if (selectedService[slot] !== 'stremio') return
  const attempt = ++stremioLinkAttempt[slot]
  const popup = window.open('about:blank', `stremio-${slot}-link`, 'width=720,height=780')
  if (!popup) {
    globalError.value = 'Allow popups for this site, then try again.'
    return
  }
  stremioPopups[slot] = popup
  connectionBusy[slot] = true
  globalError.value = ''
  appendLog(`Creating a secure Stremio device link for the ${slotLabel(slot).toLowerCase()}...`)
  try {
    const deviceLink = await createStremioDeviceLink()
    if (
      !componentMounted
      || attempt !== stremioLinkAttempt[slot]
      || selectedService[slot] !== 'stremio'
    ) {
      if (!popup.closed) popup.close()
      return
    }
    if (popup.closed) throw new Error('The Stremio approval window was closed.')
    stremioLinks[slot] = deviceLink
    popup.location.replace(deviceLink.link)
    popup.focus()
    appendLog('Approve the request in the Stremio link window. The bridge is waiting for the account key...')
    for (let poll = 0; poll < 120; poll++) {
      if (attempt !== stremioLinkAttempt[slot] || selectedService[slot] !== 'stremio') return
      if (popup.closed) throw new Error('The Stremio approval window was closed before linking finished.')
      const authKey = await readStremioDeviceLink(deviceLink.code)
      if (authKey) {
        connections[slot] = await createStremioLinkedConnection(slot, authKey)
        stremioLinks[slot] = null
        clearPreview()
        appendLog(`Stremio device linked for the ${slotLabel(slot).toLowerCase()}.`)
        statusMessage.value = `${slotLabel(slot)} connected.`
        if (!popup.closed) popup.close()
        return
      }
      await wait(1_500)
    }
    throw new Error('The Stremio device link expired. Start a new connection and approve it within three minutes.')
  } catch (error: any) {
    if (attempt !== stremioLinkAttempt[slot]) return
    if (!popup.closed) popup.close()
    stremioLinks[slot] = null
    globalError.value = error.message
    appendLog(`Stremio device link failed: ${error.message}`)
  } finally {
    if (stremioPopups[slot] === popup) stremioPopups[slot] = null
    if (attempt === stremioLinkAttempt[slot]) connectionBusy[slot] = false
  }
}

async function connectPlex(slot: BridgeSlot) {
  if (selectedService[slot] !== 'plex') return
  const attempt = ++plexLinkAttempt[slot]
  const popup = window.open('about:blank', `plex-${slot}-link`, 'width=720,height=780')
  if (!popup) {
    globalError.value = 'Allow popups for this site, then try again.'
    return
  }
  plexPopups[slot] = popup
  connectionBusy[slot] = true
  globalError.value = ''
  appendLog(`Creating a Plex sign-in link for the ${slotLabel(slot).toLowerCase()}...`)
  try {
    const pin = await createPlexPinLink()
    if (!componentMounted || attempt !== plexLinkAttempt[slot] || selectedService[slot] !== 'plex') {
      if (!popup.closed) popup.close()
      return
    }
    if (popup.closed) throw new Error('The Plex approval window was closed.')
    plexLinks[slot] = pin
    popup.location.replace(pin.link)
    popup.focus()
    appendLog('Approve the request with Plex. The bridge is waiting for the account token...')
    for (let poll = 0; poll < 180; poll++) {
      if (attempt !== plexLinkAttempt[slot] || selectedService[slot] !== 'plex') return
      const token = await readPlexPinLink(pin)
      if (token) {
        const login = await signInPlex(token, pin.clientIdentifier)
        if (attempt !== plexLinkAttempt[slot] || selectedService[slot] !== 'plex') return
        connections[slot] = createPlexConnection(slot, login)
        plexLinks[slot] = null
        clearPreview()
        const serverName = connections[slot]!.credentials.service === 'plex'
          ? connections[slot]!.credentials.server.name
          : 'the selected server'
        appendLog(`Plex connected to ${serverName}.`)
        statusMessage.value = `${slotLabel(slot)} connected.`
        if (!popup.closed) popup.close()
        return
      }
      if (popup.closed) throw new Error('The Plex approval window was closed before linking finished.')
      await wait(1_000)
    }
    throw new Error('The Plex sign-in link expired. Start a new connection and approve it again.')
  } catch (error: any) {
    if (attempt !== plexLinkAttempt[slot]) return
    if (!popup.closed) popup.close()
    plexLinks[slot] = null
    globalError.value = error.message
    appendLog(`Plex connection failed: ${error.message}`)
  } finally {
    if (plexPopups[slot] === popup) plexPopups[slot] = null
    if (attempt === plexLinkAttempt[slot]) connectionBusy[slot] = false
  }
}

function updatePlexServer(slot: BridgeSlot, event: Event) {
  const connection = connections[slot]
  if (!connection || connection.service !== 'plex') return
  connections[slot] = selectPlexServer(connection, (event.target as HTMLSelectElement).value)
  clearPreview()
}

function oauthUrl(path: string) {
  return new URL(withBase(path), window.location.origin).toString()
}

async function connectOAuth(slot: BridgeSlot) {
  const service = selectedService[slot]
  if (service !== 'trakt' && service !== 'simkl') return
  const attempt = ++connectionAttempt[slot]
  // Open synchronously while the click still carries user activation. Waiting
  // for the login-url fetch first causes modern popup blockers to reject it.
  const popup = window.open('about:blank', `${service}-${slot}-sign-in`, 'width=620,height=780')
  if (!popup) {
    globalError.value = 'Allow popups for this site, then try again.'
    return
  }
  connectionBusy[slot] = true
  globalError.value = ''
  appendLog(`Opening ${SERVICE_DEFINITIONS[service].label} authorization for the ${slotLabel(slot).toLowerCase()}...`)
  try {
    const response = await fetch(withBase(`/api/${service}/login-url`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ return_origin: window.location.origin })
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || data?.message || `${response.status} ${response.statusText}`)
    if (!data?.url || !data?.state) throw new Error('The authorization server returned an incomplete transaction.')
    if (
      !componentMounted
      || attempt !== connectionAttempt[slot]
      || selectedService[slot] !== service
    ) {
      if (!popup.closed) popup.close()
      return
    }
    if (popup.closed) throw new Error('The authorization window was closed.')
    popup.location.replace(data.url)
    const timer = setInterval(() => {
      if (!popup.closed) return
      const transaction = oauthTransactions.get(data.state)
      if (!transaction) return
      clearInterval(transaction.timer)
      if (!transaction.closeTimer) {
        transaction.closeTimer = setTimeout(() => {
          if (oauthTransactions.get(data.state) !== transaction) return
          oauthTransactions.delete(data.state)
          connectionBusy[slot] = false
        }, 3_000)
      }
    }, 500)
    oauthTransactions.set(data.state, { slot, service, popup, timer })
    popup.focus()
  } catch (error: any) {
    if (!popup.closed) popup.close()
    if (attempt !== connectionAttempt[slot]) return
    connectionBusy[slot] = false
    globalError.value = error.message
    appendLog(`${SERVICE_DEFINITIONS[service].label} connection failed: ${error.message}`)
  }
}

async function handleOAuthMessage(event: MessageEvent) {
  if (event.origin !== window.location.origin) return
  const payload = event.data
  if (!payload || payload.status !== 'success' || typeof payload.state !== 'string') return
  const transaction = oauthTransactions.get(payload.state)
  if (!transaction || event.source !== transaction.popup) return
  if (payload.source !== `${transaction.service}-oauth`) return
  oauthTransactions.delete(payload.state)
  clearInterval(transaction.timer)
  if (transaction.closeTimer) clearTimeout(transaction.closeTimer)
  const { slot, service } = transaction
  try {
    const credentials = service === 'trakt'
      ? {
          service: 'trakt',
          clientId: String(payload.client_id || ''),
          tokens: payload.tokens,
          refreshUrl: oauthUrl('/api/trakt/refresh')
        } as TraktCredentials
      : {
          service: 'simkl',
          clientId: String(payload.client_id || ''),
          accessToken: String(payload.tokens?.access_token || payload.tokens?.token || '')
        } as SimklCredentials
    const connection = await identifyOAuthConnection(slot, credentials)
    connections[slot] = connection
    clearPreview()
    appendLog(`${SERVICE_DEFINITIONS[service].label} connected as ${connection.displayName || connection.accountId}.`)
    statusMessage.value = `${slotLabel(slot)} connected.`
  } catch (error: any) {
    globalError.value = error.message
    appendLog(`${SERVICE_DEFINITIONS[service].label} identity check failed: ${error.message}`)
  } finally {
    connectionBusy[slot] = false
  }
}

async function connectPasswordService(slot: BridgeSlot) {
  const service = selectedService[slot]
  if (service !== 'nuvio' && service !== 'stremio') return
  const email = forms[slot].email.trim()
  const password = forms[slot].password
  if (!email || !password) {
    globalError.value = `Enter the ${SERVICE_DEFINITIONS[service].label} email and password.`
    return
  }
  const attempt = ++connectionAttempt[slot]
  connectionBusy[slot] = true
  globalError.value = ''
  appendLog(`Signing in to ${SERVICE_DEFINITIONS[service].label} for the ${slotLabel(slot).toLowerCase()}...`)
  try {
    if (service === 'nuvio') {
      const login = await signInNuvio(email, password)
      if (attempt !== connectionAttempt[slot] || selectedService[slot] !== service) return
      connections[slot] = createNuvioConnection(slot, login)
    } else {
      const login = await signInStremio(email, password)
      if (attempt !== connectionAttempt[slot] || selectedService[slot] !== service) return
      connections[slot] = createStremioConnection(slot, login)
    }
    clearPreview()
    const connection = connections[slot]!
    appendLog(`${SERVICE_DEFINITIONS[service].label} connected as ${connection.displayName || connection.accountId}.`)
    statusMessage.value = `${slotLabel(slot)} connected.`
  } catch (error: any) {
    if (attempt !== connectionAttempt[slot]) return
    globalError.value = error.message
    appendLog(`${SERVICE_DEFINITIONS[service].label} sign-in failed: ${error.message}`)
  } finally {
    forms[slot].password = ''
    if (attempt === connectionAttempt[slot]) connectionBusy[slot] = false
  }
}

function updateNuvioProfile(slot: BridgeSlot, event: Event) {
  const connection = connections[slot]
  if (!connection || connection.service !== 'nuvio') return
  const profileId = Number((event.target as HTMLSelectElement).value)
  const profile = connection.profiles?.find(item => Number(item.profile_index) === profileId)
  const accountName = String(connection.displayName || connection.accountId).split(' · ')[0]
  connections[slot] = {
    ...connection,
    profileId,
    displayName: profile?.name ? `${accountName} · ${profile.name}` : accountName
  }
  clearPreview()
}

async function preparePlan(
  sourceConnection: BridgeConnection,
  destinationConnection: BridgeConnection,
  requestedScopes: SyncScopes
) {
  const [sourceResult, destinationResult] = await Promise.all([
    pullMediaBridge({ connection: sourceConnection, scopes: requestedScopes, log: appendLog }),
    pullMediaBridge({ connection: destinationConnection, scopes: requestedScopes, log: appendLog })
  ])
  const mappingIssues = await inspectDestinationMappings(
    destinationConnection,
    sourceResult.bundle,
    requestedScopes,
    appendLog,
    sourceConnection
  )
  const plan = planMediaBridgePreview({
    source: sourceResult.bundle,
    destination: destinationResult.bundle,
    scopes: requestedScopes,
    mappingIssues
  })
  return {
    plan,
    destination: destinationResult.bundle,
    issues: [...sourceResult.issues, ...destinationResult.issues]
  }
}

function planTransferCount(plan: MediaBridgePreviewPlan) {
  return plan.transfer.history.length
    + plan.transfer.progress.length
    + plan.transfer.library.length
}

async function buildPreview() {
  if (!canPreview.value || !connections.source || !connections.destination) return
  const sourceConnection = connections.source
  const destinationConnection = connections.destination
  const requestedScopes = { ...effectiveScopes.value }
  actionBusy.value = 'preview'
  globalError.value = ''
  statusMessage.value = copy.value.previewing
  activity.value = []
  syncResult.value = null
  appendLog(`Preparing ${routeName.value}.`)
  try {
    const prepared = await preparePlan(sourceConnection, destinationConnection, requestedScopes)
    preview.value = prepared.plan
    providerIssues.value = prepared.issues
    previewSignature.value = currentSignature.value
    previewPage.value = 1
    const changes = planTransferCount(prepared.plan)
    appendLog(`Preview ready: ${changes} changes, ${prepared.plan.stats.skipped} mapping skips.`)
    statusMessage.value = `${changes} changes ready to review.`
  } catch (error: any) {
    preview.value = null
    previewSignature.value = ''
    globalError.value = error.message
    appendLog(`Preview failed: ${error.message}`)
    statusMessage.value = 'Preview failed.'
  } finally {
    actionBusy.value = null
  }
}

function mutableTransfer(plan: MediaBridgePreviewPlan): CanonicalBundle {
  return {
    history: [...plan.transfer.history],
    progress: [...plan.transfer.progress],
    library: [...plan.transfer.library]
  }
}

async function runSync() {
  if (!canSync.value || !connections.source || !connections.destination) return
  const sourceConnection = connections.source
  const destinationConnection = connections.destination
  const requestedScopes = { ...effectiveScopes.value }
  previewSignature.value = ''
  actionBusy.value = 'sync'
  globalError.value = ''
  syncResult.value = null
  providerIssues.value = []
  preview.value = null
  activity.value = []
  statusMessage.value = copy.value.preparingSync
  openSyncView()
  appendLog(`Comparing source and destination for ${routeName.value}...`)
  try {
    // Build a fresh plan for every run. This makes preview optional and avoids
    // reusing stale writes on providers whose history endpoints are append-only.
    const prepared = await preparePlan(sourceConnection, destinationConnection, requestedScopes)
    providerIssues.value = prepared.issues
    const transfer = mutableTransfer(prepared.plan)
    const changes = planTransferCount(prepared.plan)
    appendLog(`Comparison complete: ${changes} changes are ready.`)
    if (changes === 0) {
      syncResult.value = {
        written: { history: 0, progress: 0, library: 0 },
        issues: []
      }
      statusMessage.value = copy.value.noChanges
      return
    }

    const verificationCheckpoint = await createMediaBridgeVerificationCheckpoint({
      connection: destinationConnection,
      log: appendLog
    })
    statusMessage.value = copy.value.syncing
    appendLog(`Writing changes to ${SERVICE_DEFINITIONS[destinationConnection.service].label}...`)
    const result = await pushMediaBridge({
      connection: destinationConnection,
      bundle: transfer,
      scopes: requestedScopes,
      log: appendLog
    })
    const confirmedScopes = new Set(result.confirmedScopes || [])
    const verificationScopes: SyncScopes = {
      history: requestedScopes.history && transfer.history.length > 0 && !confirmedScopes.has('history'),
      progress: requestedScopes.progress && transfer.progress.length > 0 && !confirmedScopes.has('progress'),
      library: requestedScopes.library && transfer.library.length > 0 && !confirmedScopes.has('library')
    }
    if (Object.values(verificationScopes).some(Boolean)) {
      appendLog('Verifying unconfirmed destination writes...')
      statusMessage.value = copy.value.verifyingSync
      const verified = await pullMediaBridgeForVerification({
        connection: destinationConnection,
        scopes: verificationScopes,
        log: appendLog,
        baseline: prepared.destination,
        checkpoint: verificationCheckpoint
      })
      const remaining = planMediaBridgePreview({
        source: transfer,
        destination: verified.bundle,
        scopes: verificationScopes
      })
      for (const scope of ['history', 'progress', 'library'] as const) {
        if (!verificationScopes[scope]) continue
        // Provider sync endpoints can return HTTP success with per-item misses.
        // Count only records observed in the destination refresh.
        result.written[scope] = Math.max(
          0,
          transfer[scope].length - remaining.transfer[scope].length
        )
        const unconfirmed = Math.max(
          0,
          remaining.transfer[scope].length - (result.skipped?.[scope] || 0)
        )
        if (unconfirmed > 0) {
          result.issues.push({
            scope,
            status: 'warning',
            reason: `${unconfirmed} ${formatScope(scope).toLowerCase()} record${unconfirmed === 1 ? '' : 's'} could not be confirmed after verification.`
          })
        }
      }
      result.issues.push(...verified.issues)
    } else {
      appendLog('Destination write responses confirmed every submitted record.')
    }
    syncResult.value = result
    providerIssues.value = [...providerIssues.value, ...result.issues]
    appendLog(`Sync finished. Wrote ${result.written.history} history, ${result.written.progress} progress, and ${result.written.library} saved-title records.`)
    statusMessage.value = syncHasWarnings.value ? copy.value.finishedWarnings : copy.value.result
  } catch (error: any) {
    globalError.value = error.message
    appendLog(`Sync failed: ${error.message}`)
    statusMessage.value = copy.value.syncFailed
  } finally {
    actionBusy.value = null
  }
}

function formatScope(scope: string) {
  return ({ history: copy.value.history, progress: copy.value.progress, library: copy.value.library } as Record<string, string>)[scope] || scope
}

function formatIssueMedia(issue: BridgeIssue) {
  const media = issue.media
  if (!media?.title) return ''
  const episode = Number.isInteger(media.season) && Number.isInteger(media.episode)
    ? ` S${media.season}E${media.episode}`
    : ''
  const year = media.year ? ` (${media.year})` : ''
  return `${media.title}${year}${episode}`
}

function outcomeClass(outcome: string) {
  return `outcome-${outcome}`
}

onMounted(() => {
  componentMounted = true
  window.addEventListener('message', handleOAuthMessage)
})
onBeforeUnmount(() => {
  componentMounted = false
  restoreDocumentScroll()
  connectionAttempt.source++
  connectionAttempt.destination++
  stremioLinkAttempt.source++
  stremioLinkAttempt.destination++
  plexLinkAttempt.source++
  plexLinkAttempt.destination++
  window.removeEventListener('message', handleOAuthMessage)
  for (const transaction of oauthTransactions.values()) {
    clearInterval(transaction.timer)
    if (transaction.closeTimer) clearTimeout(transaction.closeTimer)
    if (!transaction.popup.closed) transaction.popup.close()
  }
  oauthTransactions.clear()
  for (const slot of bridgeSlots) {
    const popup = stremioPopups[slot]
    if (popup && !popup.closed) popup.close()
    stremioPopups[slot] = null
    const plexPopup = plexPopups[slot]
    if (plexPopup && !plexPopup.closed) plexPopup.close()
    plexPopups[slot] = null
  }
})
</script>

<template>
  <div class="bridge-wrapper">
    <div v-if="!hideTip" class="custom-block tip bridge-tip">
      <p class="custom-block-title">INFO</p>
      <p>{{ copy.info }}</p>
    </div>

    <section class="sync-bridge border-base" :class="{ 'is-expanded': !isCollapsed, 'is-standalone': hideHeader }">
      <button
        v-if="!hideHeader"
        class="bridge-header"
        type="button"
        :aria-expanded="!isCollapsed"
        @click="isCollapsed = !isCollapsed"
      >
        <span class="bridge-brand">
          <img :src="withBase('/tools_icon_coloured.webp')" class="bridge-logo" alt="" aria-hidden="true" />
          <span>{{ copy.title }}</span>
        </span>
        <span class="header-meta">
          <span v-if="!isCollapsed" class="secure-note">{{ copy.secureShort }}</span>
          <svg viewBox="0 0 20 20" aria-hidden="true" :class="['header-arrow', { rotated: !isCollapsed }]">
            <path d="m6 8 4 4 4-4" />
          </svg>
        </span>
      </button>

      <div v-show="!isCollapsed" class="bridge-body">
        <div v-if="!hideHeader" class="bridge-intro">
          <div>
            <p>{{ copy.subtitle }}</p>
          </div>
          <span class="route-badge">{{ routeName }}</span>
        </div>

        <p class="security-line">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8V6a5 5 0 0 1 10 0v2" /><rect x="3" y="8" width="14" height="10" rx="3" /></svg>
          {{ copy.secure }}
        </p>

        <div v-if="globalError" class="error-panel" role="alert">
          <span class="error-mark" aria-hidden="true">!</span>
          <div><strong>{{ copy.setupStopped }}</strong><p>{{ globalError }}</p></div>
        </div>

        <div class="route-builder">
          <article
            v-for="slot in bridgeSlots"
            :key="slot"
            class="endpoint-card"
            :aria-labelledby="`bridge-${slot}-label bridge-${slot}-heading`"
          >
            <div class="endpoint-heading">
              <span class="step-number">{{ slot === 'source' ? 1 : 2 }}</span>
              <div>
                <span :id="`bridge-${slot}-label`" class="eyebrow">{{ slotLabel(slot) }}</span>
                <strong :id="`bridge-${slot}-heading`">{{ SERVICE_DEFINITIONS[selectedService[slot]].accountLabel }}</strong>
              </div>
              <span v-if="connections[slot]" class="connected-badge">{{ copy.connected }}</span>
            </div>

            <label class="service-picker" :for="`bridge-${slot}-service`">
              <span class="sr-only">{{ copy.chooseService }}: {{ slotLabel(slot) }}</span>
              <span class="service-select-shell">
                <img
                  :src="serviceLogo(selectedService[slot])"
                  class="service-logo"
                  alt=""
                  aria-hidden="true"
                />
                <select
                  :id="`bridge-${slot}-service`"
                  :name="`${slot}-service`"
                  :value="selectedService[slot]"
                  :aria-label="`${copy.chooseService}: ${slotLabel(slot)}`"
                  :disabled="routeLocked"
                  @change="handleServiceChange(slot, $event)"
                >
                  <option v-for="service in SERVICE_IDS" :key="service" :value="service">
                    {{ SERVICE_DEFINITIONS[service].label }}
                  </option>
                </select>
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="m6 8 4 4 4-4" />
                </svg>
              </span>
            </label>

            <div v-if="connections[slot]" class="connection-summary">
              <img
                :src="serviceLogo(connections[slot]!.service)"
                class="service-avatar"
                alt=""
                aria-hidden="true"
              />
              <span class="account-copy">
                <strong>{{ connections[slot]!.displayName || connections[slot]!.accountId }}</strong>
                <small>{{ SERVICE_DEFINITIONS[connections[slot]!.service].label }} · {{ connections[slot]!.accountId }}</small>
              </span>
              <button
                type="button"
                class="text-button"
                :aria-label="`${copy.disconnect} ${slotLabel(slot)} ${SERVICE_DEFINITIONS[connections[slot]!.service].label}`"
                :disabled="routeLocked"
                @click="disconnect(slot)"
              >
                {{ copy.disconnect }}
              </button>
            </div>

            <label v-if="connections[slot]?.service === 'nuvio'" class="field-block">
              <span>{{ copy.profile }}</span>
              <select
                :value="connections[slot]!.profileId"
                :aria-label="`${slotLabel(slot)} ${copy.profile}`"
                :disabled="routeLocked"
                @change="updateNuvioProfile(slot, $event)"
              >
                <option
                  v-for="profile in connections[slot]!.profiles"
                  :key="profile.profile_index"
                  :value="profile.profile_index"
                >
                  {{ profile.name || `Profile ${profile.profile_index}` }}
                </option>
              </select>
            </label>

            <label v-if="connections[slot]?.service === 'plex'" class="field-block">
              <span>{{ copy.plexServer }}</span>
              <select
                :value="connections[slot]!.serverId"
                :aria-label="`${slotLabel(slot)} ${copy.plexServer}`"
                :disabled="routeLocked"
                @change="updatePlexServer(slot, $event)"
              >
                <option
                  v-for="server in connections[slot]!.servers"
                  :key="server.id"
                  :value="server.id"
                >
                  {{ server.name }}{{ server.owned ? '' : ' · shared' }}
                </option>
              </select>
            </label>

            <div v-if="!connections[slot] && ['trakt', 'simkl'].includes(selectedService[slot])" class="connect-area">
              <p>{{ copy.authorizeSeparate }} {{ SERVICE_DEFINITIONS[selectedService[slot]].label }}</p>
              <button
                type="button"
                class="primary-button connect-button"
                :aria-label="`${copy.connect} ${SERVICE_DEFINITIONS[selectedService[slot]].label} ${slotLabel(slot)}`"
                :disabled="connectionBusy[slot]"
                @click="connectOAuth(slot)"
              >
                {{ connectionBusy[slot] ? copy.connecting : `${copy.connect} ${SERVICE_DEFINITIONS[selectedService[slot]].label}` }}
              </button>
            </div>

            <form
              v-if="!connections[slot] && selectedService[slot] === 'nuvio'"
              class="credential-form"
              @submit.prevent="connectPasswordService(slot)"
            >
              <label class="field-block">
                <span>{{ copy.email }}</span>
                <input
                  v-model="forms[slot].email"
                  type="email"
                  autocomplete="username"
                  :aria-label="`${slotLabel(slot)} ${SERVICE_DEFINITIONS[selectedService[slot]].label} ${copy.email}`"
                  placeholder="you@example.com"
                />
              </label>
              <label class="field-block">
                <span>{{ copy.password }}</span>
                <input
                  v-model="forms[slot].password"
                  type="password"
                  autocomplete="current-password"
                  :aria-label="`${slotLabel(slot)} ${SERVICE_DEFINITIONS[selectedService[slot]].label} ${copy.password}`"
                />
              </label>
              <button
                type="submit"
                class="primary-button connect-button"
                :aria-label="`${copy.connect} ${SERVICE_DEFINITIONS[selectedService[slot]].label} ${slotLabel(slot)}`"
                :disabled="connectionBusy[slot]"
              >
                {{ connectionBusy[slot] ? copy.connecting : `${copy.connect} ${SERVICE_DEFINITIONS[selectedService[slot]].label}` }}
              </button>
            </form>

            <div v-if="!connections[slot] && selectedService[slot] === 'stremio'" class="connect-area">
              <p>{{ copy.stremioDevice }}</p>
              <a
                v-if="stremioLinks[slot]"
                class="device-link"
                :href="stremioLinks[slot]!.link"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ copy.openStremio }} · {{ stremioLinks[slot]!.code }}
              </a>
              <button
                type="button"
                class="primary-button connect-button"
                :aria-label="`${copy.connect} Stremio ${slotLabel(slot)}`"
                :disabled="connectionBusy[slot]"
                @click="connectStremioDevice(slot)"
              >
                {{ connectionBusy[slot] ? copy.waitingStremio : `${copy.connect} Stremio` }}
              </button>
              <details class="password-fallback">
                <summary>{{ copy.passwordFallback }}</summary>
                <form class="credential-form" @submit.prevent="connectPasswordService(slot)">
                  <label class="field-block">
                    <span>{{ copy.email }}</span>
                    <input
                      v-model="forms[slot].email"
                      type="email"
                      autocomplete="username"
                      :aria-label="`${slotLabel(slot)} Stremio ${copy.email}`"
                      placeholder="you@example.com"
                    />
                  </label>
                  <label class="field-block">
                    <span>{{ copy.password }}</span>
                    <input
                      v-model="forms[slot].password"
                      type="password"
                      autocomplete="current-password"
                      :aria-label="`${slotLabel(slot)} Stremio ${copy.password}`"
                    />
                  </label>
                  <button
                    type="submit"
                    class="secondary-button connect-button"
                    :aria-label="`${copy.connect} Stremio ${slotLabel(slot)}`"
                    :disabled="connectionBusy[slot]"
                  >
                    {{ copy.connect }} Stremio
                  </button>
                </form>
              </details>
            </div>

            <div v-if="!connections[slot] && selectedService[slot] === 'plex'" class="connect-area">
              <p>{{ copy.plexDevice }}</p>
              <a
                v-if="plexLinks[slot]"
                class="device-link"
                :href="plexLinks[slot]!.link"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ copy.openPlex }}
              </a>
              <button
                type="button"
                class="primary-button connect-button"
                :aria-label="`${copy.connect} Plex ${slotLabel(slot)}`"
                :disabled="connectionBusy[slot]"
                @click="connectPlex(slot)"
              >
                {{ connectionBusy[slot] ? copy.waitingPlex : `${copy.connect} Plex` }}
              </button>
            </div>
          </article>

        </div>

        <p v-if="sameService" class="same-service-note">
          <strong>{{ routeName }}:</strong> {{ copy.sameService }}
        </p>
        <p v-if="connections.source && connections.destination && !endpointValidation.valid" class="validation-note" role="alert">
          {{ endpointValidation.message }}
        </p>

        <section class="scope-panel" aria-labelledby="bridge-scope-title">
          <div class="section-heading">
            <span class="step-number">3</span>
            <div><span class="eyebrow">{{ copy.syncPlan }}</span><strong id="bridge-scope-title">{{ copy.scopes }}</strong></div>
          </div>
          <div class="scope-grid">
            <label
              v-for="scope in (['history', 'progress', 'library'] as const)"
              :key="scope"
              :class="['scope-option', { 'is-unsupported': !routeScopeSupport[scope] }]"
            >
              <input
                v-model="scopes[scope]"
                type="checkbox"
                :disabled="routeLocked || !routeScopeSupport[scope]"
                @change="clearPreview"
              />
              <span class="check-box" aria-hidden="true">
                <svg viewBox="0 0 16 16"><path d="m3 8 3 3 7-7" /></svg>
              </span>
              <span><strong>{{ copy[scope] }}</strong><small>{{ copy[`${scope}Help` as keyof typeof copy] }}</small></span>
            </label>
          </div>
          <p class="caveat-note">{{ copy.caveat }}</p>
        </section>

        <div class="bridge-actions">
          <button type="button" class="primary-button" :disabled="!canSync" @click="runSync">
            <span v-if="actionBusy === 'sync'" class="spinner" aria-hidden="true"></span>
            {{ actionBusy === 'sync' ? copy.syncing : `${copy.sync}: ${routeName}` }}
          </button>
          <button type="button" class="secondary-button" :disabled="!canPreview" @click="buildPreview">
            <span v-if="actionBusy === 'preview'" class="spinner" aria-hidden="true"></span>
            {{ actionBusy === 'preview' ? copy.previewing : copy.preview }}
          </button>
          <button v-if="preview" type="button" class="text-button" :disabled="Boolean(actionBusy)" @click="clearPreview">{{ copy.reset }}</button>
        </div>

        <section v-if="preview" class="preview-panel" aria-labelledby="preview-title">
          <div class="preview-heading">
            <div><span class="eyebrow">{{ routeName }}</span><h3 id="preview-title">{{ copy.previewTitle }}</h3></div>
            <span class="preview-total">{{ transferCount }} changes</span>
          </div>
          <div class="stats-grid">
            <div><strong>{{ preview.stats.source }}</strong><span>{{ copy.sourceItems }}</span></div>
            <div><strong>{{ preview.stats.add }}</strong><span>{{ copy.add }}</span></div>
            <div><strong>{{ preview.stats.update }}</strong><span>{{ copy.update }}</span></div>
            <div><strong>{{ preview.stats.alreadyPresent }}</strong><span>{{ copy.present }}</span></div>
            <div><strong>{{ preview.stats.remapped }}</strong><span>{{ copy.remapped }}</span></div>
            <div><strong>{{ preview.stats.skipped + providerIssues.length }}</strong><span>{{ copy.skipped }}</span></div>
          </div>

          <div class="preview-table-wrap">
            <table>
              <caption class="sr-only">{{ copy.previewTitle }}: {{ routeName }}</caption>
              <thead><tr><th>{{ copy.scope }}</th><th>{{ copy.titleCol }}</th><th>{{ copy.outcome }}</th><th>{{ copy.detail }}</th></tr></thead>
              <tbody>
                <tr v-for="row in previewRows" :key="row.id">
                  <td><span class="scope-chip">{{ formatScope(row.scope) }}</span></td>
                  <td><strong>{{ row.title }}</strong></td>
                  <td><span :class="['outcome-chip', outcomeClass(row.outcome)]">{{ row.outcomeLabel }}</span></td>
                  <td class="detail-cell">{{ row.detail }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="previewPages > 1" class="pagination">
            <button type="button" :disabled="previewPage <= 1" @click="previewPage--">{{ copy.previous }}</button>
            <span>{{ copy.page }} {{ previewPage }} / {{ previewPages }}</span>
            <button type="button" :disabled="previewPage >= previewPages" @click="previewPage++">{{ copy.next }}</button>
          </div>
          <p v-if="transferCount === 0" class="empty-state">{{ copy.noChanges }}</p>
        </section>

        <section v-if="providerIssues.length" class="issues-panel" aria-labelledby="issues-title">
          <h3 id="issues-title">{{ copy.providerNotes }}</h3>
          <ul>
            <li v-for="(issue, index) in providerIssues.slice(0, 20)" :key="`${issue.scope}-${index}`">
              <span :class="['issue-status', `issue-${issue.status}`]">{{ issue.status }}</span>
              <span>{{ issue.reason }}</span>
            </li>
          </ul>
          <p v-if="providerIssues.length > 20">{{ providerIssues.length - 20 }} {{ copy.moreNotes }}.</p>
        </section>

        <section
          v-if="syncResult"
          :class="['result-panel', { 'has-warnings': syncHasWarnings }]"
          aria-labelledby="result-title"
        >
          <span class="result-check" aria-hidden="true">{{ syncHasWarnings ? '!' : '✓' }}</span>
          <div>
            <h3 id="result-title">{{ syncHasWarnings ? copy.resultWarnings : copy.result }}</h3>
            <p>
              {{ syncResult.written.history }} {{ copy.historyUnit }} ·
              {{ syncResult.written.progress }} {{ copy.progressUnit }} ·
              {{ syncResult.written.library }} {{ copy.savedTitlesUnit }}
            </p>
          </div>
        </section>

        <details v-if="activity.length" class="activity-panel" :open="Boolean(actionBusy)">
          <summary>{{ copy.activity }} <span>{{ activity.length }}</span></summary>
          <pre>{{ activity.join('\n') }}</pre>
        </details>

        <p class="sr-only" aria-live="polite">{{ statusMessage }}</p>
      </div>
    </section>

    <Teleport to="body">
      <div
        v-if="syncViewOpen"
        ref="syncView"
        class="sync-run-screen"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-run-title"
        tabindex="-1"
        @keydown.esc="closeSyncView"
      >
        <header class="sync-run-header">
          <span class="bridge-brand">
            <img :src="withBase('/tools_icon_coloured.webp')" class="bridge-logo" alt="" aria-hidden="true" />
            <span>{{ copy.title }}</span>
          </span>
          <span class="route-badge">{{ routeName }}</span>
          <button
            v-if="actionBusy !== 'sync'"
            type="button"
            class="sync-run-close"
            @click="closeSyncView"
          >
            {{ copy.backToBridge }}
          </button>
        </header>

        <main class="sync-run-main">
          <div v-if="actionBusy === 'sync'" class="sync-run-state" aria-live="polite">
            <span class="sync-run-spinner" aria-hidden="true"></span>
            <span class="eyebrow">{{ copy.sync }}</span>
            <h2 id="sync-run-title">{{ statusMessage }}</h2>
            <p>{{ copy.keepOpen }}</p>
            <div class="sync-run-activity">
              <span class="sync-run-pulse" aria-hidden="true"></span>
              <span>{{ latestActivity }}</span>
            </div>
          </div>

          <div v-else-if="syncResult" class="sync-run-state sync-run-finished" aria-live="polite">
            <span :class="['sync-run-check', { 'has-warnings': syncHasWarnings }]" aria-hidden="true">
              ✓
              <span v-if="syncHasWarnings" class="sync-run-note-badge">i</span>
            </span>
            <span class="eyebrow">{{ routeName }}</span>
            <h2 id="sync-run-title">{{ statusMessage }}</h2>
            <p class="sync-run-counts">
              {{ syncResult.written.history }} {{ copy.historyUnit }} ·
              {{ syncResult.written.progress }} {{ copy.progressUnit }} ·
              {{ syncResult.written.library }} {{ copy.savedTitlesUnit }}
            </p>
            <section
              v-if="syncHasNotes"
              class="sync-run-notes"
              aria-labelledby="sync-run-notes-title"
            >
              <div class="sync-run-notes-heading">
                <div>
                  <h3 id="sync-run-notes-title">{{ copy.syncNotes }}</h3>
                  <p>{{ copy.syncNotesIntro }}</p>
                </div>
                <span class="sync-run-notes-count">
                  {{ providerIssues.length }} {{ providerIssues.length === 1 ? copy.note : copy.notes }}
                </span>
              </div>
              <ul class="sync-run-note-list">
                <li
                  v-for="(issue, index) in finishedIssueGroups"
                  :key="`${issue.scope}-${issue.status}-${index}`"
                >
                  <span class="sync-run-note-scope">{{ formatScope(issue.scope) }}</span>
                  <div>
                    <p>{{ issue.reason }}</p>
                    <small v-if="issue.mediaLabels.length">
                      {{ issue.mediaLabels.join(' · ') }}<template v-if="issue.count > issue.mediaLabels.length"> · +{{ issue.count - issue.mediaLabels.length }} {{ copy.moreAffected }}</template>
                    </small>
                  </div>
                  <span v-if="issue.count > 1" class="sync-run-note-repeat">×{{ issue.count }}</span>
                </li>
              </ul>
            </section>
            <div class="sync-support-card">
              <p>{{ copy.supportMessage }}</p>
              <a
                class="kofi-button"
                href="https://ko-fi.com/haaihond"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span aria-hidden="true">☕</span>
                {{ copy.supportButton }}
              </a>
            </div>
          </div>

          <div v-else class="sync-run-state sync-run-failed" role="alert">
            <span class="sync-run-check is-error" aria-hidden="true">!</span>
            <span class="eyebrow">{{ routeName }}</span>
            <h2 id="sync-run-title">{{ copy.syncFailed }}</h2>
            <p>{{ globalError }}</p>
          </div>
        </main>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.bridge-wrapper {
  --bridge-radius: 14px;
  --bridge-radius-sm: 10px;
  --bridge-shadow: 0 16px 40px rgb(0 0 0 / 8%);
  margin: 0;
}

.bridge-tip { margin-bottom: 18px; }

.sync-bridge {
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--bridge-radius);
  background: var(--vp-c-bg);
  box-shadow: var(--bridge-shadow);
}

.sync-bridge.is-standalone {
  overflow: visible;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.sync-bridge.is-standalone .bridge-body { padding: 0; }

.bridge-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-height: 66px;
  padding: 16px 20px;
  border: 0;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  text-align: left;
  cursor: pointer;
}

.bridge-brand, .header-meta, .endpoint-heading, .connection-summary, .section-heading,
.preview-heading, .result-panel, .security-line { display: flex; align-items: center; }
.bridge-brand { gap: 12px; font-size: 16px; font-weight: 700; }
.bridge-logo { width: 34px; height: 34px; object-fit: contain; }
.header-meta { gap: 12px; min-width: 0; }
.secure-note { max-width: 410px; color: var(--vp-c-text-2); font-size: 12px; }
.header-arrow { width: 20px; fill: none; stroke: currentColor; stroke-width: 2; transition: transform .2s ease; }
.header-arrow.rotated { transform: rotate(180deg); }

.bridge-body { padding: 30px; }
.bridge-intro { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; margin-bottom: 22px; }
.bridge-intro h3, .preview-heading h3, .issues-panel h3, .result-panel h3 { margin: 0; color: var(--vp-c-text-1); }
.bridge-intro p { max-width: 760px; margin: 4px 0 0; color: var(--vp-c-text-2); line-height: 1.6; }
.route-badge, .preview-total {
  flex: none;
  padding: 7px 10px;
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 35%, var(--vp-c-divider));
  border-radius: 999px;
  background: color-mix(in srgb, var(--vp-c-brand-soft) 75%, transparent);
  color: var(--vp-c-brand-1);
  font-size: 12px;
  font-weight: 600;
}

.error-panel {
  display: flex;
  gap: 12px;
  margin-bottom: 18px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--vp-c-danger-1) 45%, var(--vp-c-divider));
  border-radius: var(--bridge-radius-sm);
  background: var(--vp-c-danger-soft);
  color: var(--vp-c-text-1);
}
.error-panel p { margin: 3px 0 0; color: var(--vp-c-text-2); }
.error-mark { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--vp-c-danger-1); color: white; font-weight: 800; }

.route-builder {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 20px;
}
.endpoint-card, .scope-panel, .preview-panel, .issues-panel, .activity-panel {
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--bridge-radius);
  background: var(--vp-c-bg);
}
.endpoint-card {
  min-width: 0;
  padding: 22px;
  border-radius: 12px;
  background: var(--tool-surface-alt, var(--vp-c-bg-alt));
}
.endpoint-heading { gap: 11px; min-height: 38px; }
.endpoint-heading > div, .section-heading > div { display: flex; flex-direction: column; min-width: 0; }
.endpoint-heading strong, .section-heading strong { color: var(--vp-c-text-1); font-weight: 600; }
.eyebrow { color: var(--vp-c-text-3); font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
.step-number { display: grid; place-items: center; flex: none; width: 30px; height: 30px; border-radius: 8px; background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); font-size: 12px; font-weight: 600; }
.connected-badge { margin-left: auto; color: var(--vp-c-green-1); font-size: 11px; font-weight: 600; }

.service-picker { display: block; margin: 20px 0; }
.service-select-shell {
  display: flex;
  align-items: center;
  gap: 11px;
  height: 52px;
  padding: 0 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
}
.service-select-shell:focus-within {
  border-color: var(--vp-c-brand-1);
  box-shadow: inset 0 0 0 1px var(--vp-c-brand-1);
}
.service-logo, .service-avatar { flex: none; object-fit: contain; }
.service-logo { width: 28px; height: 28px; }
.service-avatar { width: 36px; height: 36px; }
.service-select-shell select {
  min-width: 0;
  height: 100%;
  flex: 1;
  appearance: none;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--vp-c-text-1);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.service-select-shell select:disabled { cursor: not-allowed; }
.service-select-shell svg { width: 18px; fill: none; stroke: currentColor; stroke-width: 2; pointer-events: none; }

.connect-area { display: flex; flex-direction: column; gap: 14px; }
.connect-area p { margin: 0; color: var(--vp-c-text-2); font-size: 13px; line-height: 1.55; }
.device-link { display: inline-flex; align-items: center; min-height: 36px; color: var(--vp-c-brand-1); font-size: 12px; font-weight: 600; }
.password-fallback { color: var(--vp-c-text-3); font-size: 11px; }
.password-fallback summary { cursor: pointer; }
.password-fallback .credential-form { margin-top: 9px; }
.credential-form { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.credential-form .connect-button { grid-column: 1 / -1; }
.field-block { display: flex; flex-direction: column; gap: 7px; margin-top: 12px; color: var(--vp-c-text-2); font-size: 12px; font-weight: 500; }
.field-block input, .field-block select {
  width: 100%;
  height: 42px;
  padding: 0 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font: inherit;
  font-size: 13px;
}
.connection-summary { gap: 10px; padding: 11px; border: 1px solid var(--vp-c-divider); border-radius: 10px; background: var(--vp-c-bg); }
.account-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.account-copy strong, .account-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.account-copy strong { color: var(--vp-c-text-1); font-size: 12px; }
.account-copy small { color: var(--vp-c-text-3); font-size: 10px; }

.primary-button, .secondary-button, .text-button, .pagination button {
  min-height: 42px;
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.primary-button { border: 1px solid var(--vp-c-brand-1); background: var(--vp-c-brand-1); color: var(--vp-c-white); padding: 0 16px; }
.secondary-button { border: 1px solid var(--vp-c-divider); background: var(--vp-c-bg); color: var(--vp-c-text-1); padding: 0 16px; }
.text-button { min-height: 30px; padding: 0 8px; border: 0; background: transparent; color: var(--vp-c-brand-1); }
button:disabled { opacity: .48; cursor: not-allowed; }

.same-service-note, .validation-note { margin: 12px 0 0; padding: 10px 12px; border-radius: 9px; font-size: 12px; line-height: 1.5; }
.same-service-note { border: 1px solid var(--vp-c-divider); background: var(--vp-c-bg-alt); color: var(--vp-c-text-2); }
.validation-note { border: 1px solid color-mix(in srgb, var(--vp-c-warning-1) 50%, var(--vp-c-divider)); background: var(--vp-c-warning-soft); color: var(--vp-c-text-1); }

.scope-panel { margin-top: 24px; padding: 24px 26px; }
.section-heading { gap: 12px; margin-bottom: 18px; }
.scope-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.scope-option { position: relative; display: flex; align-items: flex-start; gap: 11px; padding: 16px; border: 1px solid var(--vp-c-divider); border-radius: 10px; background: var(--vp-c-bg-alt); cursor: pointer; }
.scope-option.is-unsupported { opacity: .48; cursor: not-allowed; }
.scope-option input { position: absolute; opacity: 0; }
.scope-option > span:last-child { display: flex; flex-direction: column; }
.scope-option strong { color: var(--vp-c-text-1); font-size: 13px; font-weight: 600; }
.scope-option small { margin-top: 3px; color: var(--vp-c-text-3); font-size: 11px; line-height: 1.45; }
.check-box { display: grid; place-items: center; flex: none; width: 18px; height: 18px; border: 1px solid var(--vp-c-divider); border-radius: 5px; color: transparent; }
.check-box svg { width: 13px; fill: none; stroke: currentColor; stroke-width: 2; }
.scope-option input:checked + .check-box { border-color: var(--vp-c-brand-1); background: var(--vp-c-brand-1); color: white; }
.caveat-note { margin: 16px 0 0; color: var(--vp-c-text-3); font-size: 12px; line-height: 1.6; }

.bridge-actions { display: flex; align-items: center; gap: 12px; margin-top: 24px; }
.bridge-actions .primary-button { min-width: 190px; }
.spinner { display: inline-block; width: 12px; height: 12px; margin-right: 6px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; vertical-align: -2px; animation: spin .7s linear infinite; }
.security-line {
  gap: 10px;
  margin: 0 0 22px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 28%, var(--vp-c-divider));
  border-radius: 9px;
  background: color-mix(in srgb, var(--vp-c-brand-soft) 55%, transparent);
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.5;
}
.security-line svg { flex: none; width: 18px; fill: none; stroke: var(--vp-c-brand-1); stroke-width: 1.7; }

.preview-panel { margin-top: 20px; padding: 18px; }
.preview-heading { justify-content: space-between; gap: 14px; margin-bottom: 14px; }
.stats-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; margin-bottom: 14px; }
.stats-grid > div { display: flex; flex-direction: column; padding: 11px; border: 1px solid var(--vp-c-divider); border-radius: 9px; background: var(--vp-c-bg); }
.stats-grid strong { color: var(--vp-c-text-1); font-size: 20px; line-height: 1; }
.stats-grid span { margin-top: 5px; color: var(--vp-c-text-3); font-size: 9px; text-transform: uppercase; }
.preview-table-wrap { overflow: auto; max-height: 520px; border: 1px solid var(--vp-c-divider); border-radius: 10px; background: var(--vp-c-bg); }
table { width: 100%; border-collapse: collapse; font-size: 11px; }
th, td { padding: 10px 12px; border-bottom: 1px solid var(--vp-c-divider); text-align: left; vertical-align: top; }
th { position: sticky; top: 0; z-index: 1; background: var(--vp-c-bg-alt); color: var(--vp-c-text-2); font-size: 9px; letter-spacing: .06em; text-transform: uppercase; }
td { color: var(--vp-c-text-2); }
td strong { color: var(--vp-c-text-1); font-weight: 650; }
.detail-cell { min-width: 220px; max-width: 380px; }
.scope-chip, .outcome-chip, .issue-status { display: inline-flex; padding: 4px 7px; border-radius: 999px; font-size: 9px; font-weight: 750; white-space: nowrap; }
.scope-chip { background: var(--vp-c-default-soft); color: var(--vp-c-text-2); }
.outcome-add { background: var(--vp-c-green-soft); color: var(--vp-c-green-1); }
.outcome-update { background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); }
.outcome-already-present { background: var(--vp-c-default-soft); color: var(--vp-c-text-3); }
.outcome-unresolved, .outcome-ambiguous { background: var(--vp-c-warning-soft); color: var(--vp-c-warning-1); }
.pagination { display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-top: 12px; color: var(--vp-c-text-3); font-size: 10px; }
.pagination button { min-height: 30px; padding: 0 10px; border: 1px solid var(--vp-c-divider); background: var(--vp-c-bg); color: var(--vp-c-text-2); }
.empty-state { margin: 14px 0 0; color: var(--vp-c-text-2); font-size: 12px; }

.issues-panel { margin-top: 16px; padding: 16px; }
.issues-panel h3 { font-size: 13px; }
.issues-panel ul { display: grid; gap: 7px; margin: 12px 0 0; padding: 0; list-style: none; }
.issues-panel li { display: flex; align-items: flex-start; gap: 8px; color: var(--vp-c-text-2); font-size: 11px; line-height: 1.5; }
.issue-status { background: var(--vp-c-warning-soft); color: var(--vp-c-warning-1); text-transform: uppercase; }
.issue-warning, .issue-note { background: var(--vp-c-default-soft); color: var(--vp-c-text-2); }
.issues-panel > p { margin: 9px 0 0; color: var(--vp-c-text-3); font-size: 10px; }

.result-panel { gap: 13px; margin-top: 16px; padding: 16px; border: 1px solid color-mix(in srgb, var(--vp-c-green-1) 40%, var(--vp-c-divider)); border-radius: var(--bridge-radius); background: var(--vp-c-green-soft); }
.result-check { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: var(--vp-c-green-1); color: white; font-weight: 800; }
.result-panel.has-warnings { border-color: color-mix(in srgb, var(--vp-c-warning-1) 45%, var(--vp-c-divider)); background: var(--vp-c-warning-soft); }
.result-panel.has-warnings .result-check { background: var(--vp-c-warning-1); }
.result-panel h3 { font-size: 14px; }
.result-panel p { margin: 3px 0 0; color: var(--vp-c-text-2); font-size: 11px; }

.activity-panel { margin-top: 16px; overflow: hidden; background: #0d0f14; }
.activity-panel summary { padding: 12px 14px; color: #d9dce5; font-size: 11px; font-weight: 700; cursor: pointer; }
.activity-panel summary span { margin-left: 5px; color: #858b9b; }
.activity-panel pre { max-height: 260px; overflow: auto; margin: 0; padding: 13px 14px; border-top: 1px solid #252936; background: #090b0f; color: #aeb5c6; font: 10px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; }

.sync-run-screen {
  --bridge-radius: 14px;
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 100vh;
  min-height: 100dvh;
  overflow: auto;
  background:
    radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--vp-c-brand-soft) 70%, transparent) 0, transparent 42%),
    var(--vp-c-bg);
  color: var(--vp-c-text-1);
  outline: none;
}

.sync-run-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 20px;
  min-height: 76px;
  padding: 14px 28px;
  border-bottom: 1px solid var(--vp-c-divider);
  background: color-mix(in srgb, var(--vp-c-bg) 88%, transparent);
  backdrop-filter: blur(14px);
}

.sync-run-header .route-badge { grid-column: 2; }
.sync-run-close {
  grid-column: 3;
  justify-self: end;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.sync-run-main {
  display: flex;
  min-height: 0;
  align-items: center;
  justify-content: center;
  padding: 44px 24px 64px;
}

.sync-run-state {
  display: flex;
  width: min(760px, 100%);
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.sync-run-state h2 {
  max-width: 680px;
  margin: 10px 0 0;
  border: 0;
  color: var(--vp-c-text-1);
  font-size: clamp(28px, 5vw, 52px);
  line-height: 1.08;
  letter-spacing: -.035em;
}

.sync-run-state > p {
  max-width: 620px;
  margin: 16px 0 0;
  color: var(--vp-c-text-2);
  font-size: 15px;
  line-height: 1.65;
}

.sync-run-spinner {
  width: 58px;
  height: 58px;
  margin-bottom: 24px;
  border: 4px solid color-mix(in srgb, var(--vp-c-brand-1) 22%, var(--vp-c-divider));
  border-top-color: var(--vp-c-brand-1);
  border-radius: 50%;
  animation: spin .8s linear infinite;
}

.sync-run-activity {
  display: flex;
  width: min(640px, 100%);
  align-items: flex-start;
  gap: 11px;
  margin-top: 34px;
  padding: 15px 17px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 11px;
  background: color-mix(in srgb, var(--vp-c-bg-alt) 88%, transparent);
  color: var(--vp-c-text-2);
  font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace;
  text-align: left;
}

.sync-run-pulse {
  flex: none;
  width: 8px;
  height: 8px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--vp-c-brand-1) 45%, transparent);
  animation: sync-pulse 1.8s ease-out infinite;
}

.sync-run-check {
  position: relative;
  display: grid;
  width: 72px;
  height: 72px;
  place-items: center;
  margin-bottom: 24px;
  border-radius: 50%;
  background: var(--vp-c-green-1);
  color: white;
  box-shadow: 0 16px 40px color-mix(in srgb, var(--vp-c-green-1) 30%, transparent);
  font-size: 34px;
  font-weight: 800;
}

.sync-run-check.has-warnings { background: var(--vp-c-green-1); box-shadow: 0 16px 40px color-mix(in srgb, var(--vp-c-green-1) 24%, transparent); }
.sync-run-note-badge {
  position: absolute;
  right: -3px;
  bottom: -3px;
  display: grid;
  width: 25px;
  height: 25px;
  place-items: center;
  border: 3px solid var(--vp-c-bg);
  border-radius: 50%;
  background: var(--vp-c-warning-1);
  color: white;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
}
.sync-run-check.is-error { background: var(--vp-c-danger-1); box-shadow: 0 16px 40px color-mix(in srgb, var(--vp-c-danger-1) 28%, transparent); }
.sync-run-counts { font-weight: 600; }

.sync-run-notes {
  width: min(660px, 100%);
  margin-top: 26px;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  background: color-mix(in srgb, var(--vp-c-bg-alt) 82%, var(--vp-c-bg));
  text-align: left;
}

.sync-run-notes-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 17px 18px 15px;
}

.sync-run-notes-heading h3 {
  margin: 0;
  border: 0;
  color: var(--vp-c-text-1);
  font-size: 14px;
  line-height: 1.4;
}

.sync-run-notes-heading p {
  margin: 4px 0 0;
  color: var(--vp-c-text-2);
  font-size: 11px;
  line-height: 1.55;
}

.sync-run-notes-count,
.sync-run-note-repeat {
  flex: none;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  font-size: 10px;
  font-weight: 650;
  white-space: nowrap;
}

.sync-run-notes-count { padding: 5px 8px; }

.sync-run-note-list {
  max-height: 220px;
  overflow-y: auto;
  margin: 0;
  padding: 0 18px 16px;
  list-style: none;
  scrollbar-gutter: stable;
}

.sync-run-note-list li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
  padding: 11px 0;
  border-top: 1px solid var(--vp-c-divider);
}

.sync-run-note-list p {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 11px;
  line-height: 1.55;
}

.sync-run-note-list small {
  display: block;
  margin-top: 4px;
  color: var(--vp-c-text-3);
  font-size: 9px;
  line-height: 1.5;
}

.sync-run-note-scope {
  padding: 4px 7px;
  border-radius: 999px;
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-2);
  font-size: 9px;
  font-weight: 700;
  white-space: nowrap;
}

.sync-run-note-repeat { padding: 3px 6px; }

.sync-support-card {
  width: min(660px, 100%);
  margin-top: 34px;
  padding: 26px;
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 28%, var(--vp-c-divider));
  border-radius: 16px;
  background: color-mix(in srgb, var(--vp-c-brand-soft) 55%, var(--vp-c-bg));
}

.sync-support-card p {
  margin: 0;
  color: var(--vp-c-text-1);
  font-size: 17px;
  font-weight: 600;
  line-height: 1.55;
}

.kofi-button {
  display: inline-flex;
  min-height: 46px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 18px;
  padding: 0 19px;
  border-radius: 9px;
  background: #ff5e5b;
  color: white !important;
  font-size: 14px;
  font-weight: 750;
  text-decoration: none !important;
  box-shadow: 0 10px 26px rgb(255 94 91 / 24%);
}

.kofi-button:hover { background: #e84e4b; }

.sr-only { position: absolute !important; width: 1px !important; height: 1px !important; padding: 0 !important; margin: -1px !important; overflow: hidden !important; clip: rect(0, 0, 0, 0) !important; white-space: nowrap !important; border: 0 !important; }

button:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible, .scope-option:has(input:focus-visible) {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes sync-pulse {
  70%, 100% { box-shadow: 0 0 0 9px transparent; }
}

@media (max-width: 900px) {
  .route-builder { grid-template-columns: 1fr; gap: 16px; }
  .scope-grid { grid-template-columns: 1fr; }
  .stats-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 600px) {
  .bridge-body { padding: 18px; }
  .sync-bridge.is-standalone .bridge-body { padding: 17px; }
  .endpoint-card { padding: 17px; }
  .scope-panel {
    padding: 17px;
    border-radius: 12px;
    background: var(--tool-surface-alt, var(--vp-c-bg-alt));
  }
  .bridge-intro { flex-direction: column; }
  .secure-note { display: none; }
  .credential-form { grid-template-columns: 1fr; }
  .bridge-actions { align-items: stretch; flex-direction: column; }
  .bridge-actions button { width: 100%; }
  .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .preview-total { display: none; }
  .sync-run-header { grid-template-columns: 1fr auto; gap: 10px; min-height: 66px; padding: 12px 16px; }
  .sync-run-header .route-badge { display: none; }
  .sync-run-close { grid-column: 2; padding: 0 10px; }
  .sync-run-main { padding: 32px 16px 48px; }
  .sync-run-state h2 { font-size: 32px; }
  .sync-run-notes-heading { flex-direction: column; gap: 10px; }
  .sync-run-note-list { max-height: 190px; }
  .sync-run-note-list li { grid-template-columns: minmax(0, 1fr) auto; }
  .sync-run-note-scope { grid-column: 1 / -1; justify-self: start; }
  .sync-support-card { padding: 22px 17px; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
}
</style>
