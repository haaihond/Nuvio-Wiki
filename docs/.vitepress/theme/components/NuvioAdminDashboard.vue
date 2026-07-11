<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from 'vue'

type AdminTab = 'overview' | 'traffic' | 'services' | 'system'
type TrafficWindow = 'minutes' | 'hours'

interface TrafficPoint {
  at?: string | null
  requests?: number | null
  errors?: number | null
  averageLatencyMs?: number | null
}

interface EndpointMetric {
  method?: string | null
  path?: string | null
  requests?: number | null
  errors?: number | null
  averageLatencyMs?: number | null
  p95LatencyMs?: number | null
  lastSeenAt?: string | null
}

interface RecentRequest {
  at?: string | null
  method?: string | null
  path?: string | null
  status?: number | null
  durationMs?: number | null
}

interface TrafficOverview {
  totalRequests?: number | null
  activeRequests?: number | null
  errorRate?: number | null
  averageLatencyMs?: number | null
  p95LatencyMs?: number | null
  uniqueClients1h?: number | null
  uniqueClients24h?: number | null
  statusCodes?: Record<string, number | null> | null
  minuteSeries?: TrafficPoint[] | null
  hourSeries?: TrafficPoint[] | null
  endpoints?: EndpointMetric[] | null
  recentRequests?: RecentRequest[] | null
}

interface MemoryMetric {
  rss?: number | null
  heapUsed?: number | null
  heapTotal?: number | null
  external?: number | null
}

interface CapacityMetric {
  used?: number | null
  total?: number | null
}

interface RuntimeOverview {
  startedAt?: string | null
  uptimeSeconds?: number | null
  environment?: string | null
  nodeVersion?: string | null
  platform?: string | null
  arch?: string | null
  cpuCount?: number | null
  loadAverage?: number[] | null
  memory?: MemoryMetric | null
  systemMemory?: CapacityMetric | null
  disk?: CapacityMetric | null
}

interface ContentOverview {
  pageCount?: number | null
  totalBytes?: number | null
  lastUpdatedAt?: string | null
}

interface KnowledgeOverview {
  model?: string | null
  mode?: string | null
  loaded?: boolean | null
  rebuilding?: boolean | null
  fileSearch?: Record<string, unknown> | null
  cache?: Record<string, unknown> | null
  content?: ContentOverview | null
}

interface SecurityOverview {
  activeSessions?: number | null
  failedAttempts?: number | null
  lastFailedAt?: string | null
  currentSessionExpiresAt?: string | null
}

interface AdminOverview {
  generatedAt?: string | null
  traffic?: TrafficOverview | null
  runtime?: RuntimeOverview | null
  knowledge?: KnowledgeOverview | null
  integrations?: Record<string, boolean | null> | null
  security?: SecurityOverview | null
}

class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface DashboardProps {
  visible?: boolean
}

const props = withDefaults(defineProps<DashboardProps>(), {
  visible: true
})

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'logout'): void
}>()

const tabs: Array<{ id: AdminTab; label: string; description: string }> = [
  { id: 'overview', label: 'Overview', description: 'Live operating picture' },
  { id: 'traffic', label: 'Traffic', description: 'Requests and latency' },
  { id: 'services', label: 'Services', description: 'Integrations and knowledge' },
  { id: 'system', label: 'System', description: 'Runtime and security' }
]

const rootElement = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const activeTab = ref<AdminTab>('overview')
const trafficWindow = ref<TrafficWindow>('minutes')
const overview = ref<AdminOverview | null>(null)
const isLoading = ref(true)
const isRefreshing = ref(false)
const isLoggingOut = ref(false)
const sessionExpired = ref(false)
const adminError = ref('')
const lastSuccessfulAt = ref(0)

let mounted = false
let requestSequence = 0
let requestController: AbortController | undefined
let logoutController: AbortController | undefined
let pollTimer: ReturnType<typeof setInterval> | undefined
let previousFocus: HTMLElement | null = null
let previousBodyOverflow = ''

const traffic = computed(() => overview.value?.traffic || {})
const runtime = computed(() => overview.value?.runtime || {})
const knowledge = computed(() => overview.value?.knowledge || {})
const security = computed(() => overview.value?.security || {})

const minuteSeries = computed(() => normalizeArray<TrafficPoint>(traffic.value.minuteSeries))
const hourSeries = computed(() => normalizeArray<TrafficPoint>(traffic.value.hourSeries))
const chartSeries = computed(() =>
  trafficWindow.value === 'minutes' ? minuteSeries.value : hourSeries.value
)
const endpointRows = computed(() => normalizeArray<EndpointMetric>(traffic.value.endpoints))
const recentRequests = computed(() => normalizeArray<RecentRequest>(traffic.value.recentRequests))

const activeTabDetails = computed(() =>
  tabs.find((tab) => tab.id === activeTab.value) || tabs[0]
)

const statusCodeEntries = computed(() => {
  const codes = traffic.value.statusCodes
  if (!codes || typeof codes !== 'object' || Array.isArray(codes)) return []

  return Object.entries(codes)
    .map(([code, count]) => ({ code, count: finiteNumber(count) ?? 0 }))
    .filter((entry) => entry.count >= 0)
    .sort((a, b) => b.count - a.count)
})

const totalStatusResponses = computed(() =>
  statusCodeEntries.value.reduce((total, entry) => total + entry.count, 0)
)

const integrationEntries = computed(() => {
  const integrations = overview.value?.integrations
  if (!integrations || typeof integrations !== 'object' || Array.isArray(integrations)) return []
  return Object.entries(integrations)
    .map(([key, enabled]) => ({ key, label: humanizeKey(key), enabled: enabled === true }))
    .sort((a, b) => a.label.localeCompare(b.label))
})

const fileSearchEntries = computed(() => objectEntries(knowledge.value.fileSearch))
const cacheEntries = computed(() => objectEntries(knowledge.value.cache))

const activityBars = computed(() => {
  const points = minuteSeries.value.slice(-24)
  const peak = Math.max(1, ...points.map((point) => finiteNumber(point.requests) ?? 0))
  return points.map((point) => ({
    ...point,
    height: Math.max(4, ((finiteNumber(point.requests) ?? 0) / peak) * 100),
    errorHeight: Math.max(0, ((finiteNumber(point.errors) ?? 0) / peak) * 100)
  }))
})

const chartScaleMaximum = computed(() => Math.max(
  1,
  ...chartSeries.value.flatMap((point) => [
    finiteNumber(point.requests) ?? 0,
    finiteNumber(point.errors) ?? 0
  ])
))
const requestLinePoints = computed(() =>
  buildChartPoints(chartSeries.value, 'requests', chartScaleMaximum.value)
)
const errorLinePoints = computed(() =>
  buildChartPoints(chartSeries.value, 'errors', chartScaleMaximum.value)
)
const requestAreaPath = computed(() => {
  if (!requestLinePoints.value) return ''
  const points = requestLinePoints.value.split(' ')
  return `M 28 190 L ${points.join(' L ')} L 772 190 Z`
})

const chartPeak = computed(() => Math.max(
  0,
  ...chartSeries.value.map((point) => finiteNumber(point.requests) ?? 0)
))

const chartAverage = computed(() => {
  if (!chartSeries.value.length) return null
  const values = chartSeries.value
    .map((point) => finiteNumber(point.requests))
    .filter((value): value is number => value !== null)
  if (!values.length) return null
  return values.reduce((total, value) => total + value, 0) / values.length
})

const memoryPercent = computed(() => capacityPercent(runtime.value.systemMemory))
const diskPercent = computed(() => capacityPercent(runtime.value.disk))
const heapPercent = computed(() => {
  const used = finiteNumber(runtime.value.memory?.heapUsed)
  const total = finiteNumber(runtime.value.memory?.heapTotal)
  return used === null || total === null || total <= 0 ? null : clamp((used / total) * 100, 0, 100)
})

const loadPercent = computed(() => {
  const load = normalizeArray<number>(runtime.value.loadAverage)
    .map(finiteNumber)
    .find((value): value is number => value !== null)
  const cpus = finiteNumber(runtime.value.cpuCount)
  if (load === undefined || cpus === null || cpus <= 0) return null
  return clamp((load / cpus) * 100, 0, 100)
})

const errorRateValue = computed(() => normalizedPercent(traffic.value.errorRate))
const failedAttemptCount = computed(() => finiteNumber(security.value.failedAttempts) ?? 0)

async function requestJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal
  })

  if (!response.ok) {
    throw new HttpError(response.status, `${url} returned HTTP ${response.status}`)
  }

  return await response.json() as T
}

async function refreshDashboard(manual = false) {
  if (!props.visible || typeof window === 'undefined') return

  const sequence = ++requestSequence
  requestController?.abort()
  const controller = new AbortController()
  requestController = controller

  if (!overview.value) isLoading.value = true
  if (manual || overview.value) isRefreshing.value = true
  adminError.value = ''
  const adminResult = await Promise.resolve(requestJson<AdminOverview>('/api/admin/overview', controller.signal))
    .then((value) => ({ status: 'fulfilled' as const, value }))
    .catch((reason) => ({ status: 'rejected' as const, reason }))

  if (sequence !== requestSequence) return

  let receivedData = false

  if (adminResult.status === 'fulfilled') {
    overview.value = adminResult.value && typeof adminResult.value === 'object'
      ? adminResult.value
      : {}
    sessionExpired.value = false
    receivedData = true
  } else if (!isAbortError(adminResult.reason)) {
    if (adminResult.reason instanceof HttpError && [401, 403, 404].includes(adminResult.reason.status)) {
      overview.value = null
      sessionExpired.value = true
      stopPolling()
    } else {
      adminError.value = 'Admin telemetry could not be loaded. Existing values may be out of date.'
    }
  }

  if (receivedData) lastSuccessfulAt.value = Date.now()
  isLoading.value = false
  isRefreshing.value = false
}

async function logout() {
  if (isLoggingOut.value) return
  isLoggingOut.value = true
  logoutController?.abort()
  const controller = new AbortController()
  logoutController = controller

  try {
    await fetch('/api/admin/session', {
      method: 'DELETE',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    })
  } catch {
    // The local dashboard still closes so no sensitive telemetry remains visible.
  } finally {
    overview.value = null
    sessionExpired.value = true
    isLoggingOut.value = false
    emit('logout')
  }
}

function selectTab(tab: AdminTab) {
  activeTab.value = tab
}

function onTabKeydown(event: KeyboardEvent, index: number) {
  if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    return
  }

  event.preventDefault()
  const direction = ['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1
  let nextIndex = index
  if (event.key === 'Home') nextIndex = 0
  else if (event.key === 'End') nextIndex = tabs.length - 1
  else nextIndex = (index + direction + tabs.length) % tabs.length

  activeTab.value = tabs[nextIndex].id
  nextTick(() => {
    rootElement.value
      ?.querySelector<HTMLButtonElement>(`#admin-tab-${tabs[nextIndex].id}`)
      ?.focus()
  })
}

function close() {
  emit('close')
}

function onDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }

  if (event.key !== 'Tab' || !rootElement.value) return
  const focusable = [...rootElement.value.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((element) => !element.hasAttribute('inert') && element.offsetParent !== null)

  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function startPolling() {
  stopPolling()
  if (!props.visible || sessionExpired.value || typeof document === 'undefined') return
  if (document.visibilityState !== 'visible') return
  pollTimer = setInterval(() => {
    if (!isLoading.value && !isRefreshing.value) refreshDashboard()
  }, 30_000)
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = undefined
}

function handleDocumentVisibility() {
  if (document.visibilityState === 'hidden') {
    stopPolling()
    return
  }

  if (props.visible && !sessionExpired.value) {
    if (Date.now() - lastSuccessfulAt.value >= 30_000) refreshDashboard()
    startPolling()
  }
}

function activateDashboard() {
  if (typeof document === 'undefined') return
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  previousBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  nextTick(() => closeButton.value?.focus())
  refreshDashboard()
  startPolling()
}

function deactivateDashboard() {
  stopPolling()
  requestSequence += 1
  requestController?.abort()
  if (typeof document !== 'undefined') document.body.style.overflow = previousBodyOverflow
  previousFocus?.focus()
  previousFocus = null
}

function normalizeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number.NaN
  return Number.isFinite(number) ? number : null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizedPercent(value: unknown): number | null {
  const number = finiteNumber(value)
  if (number === null) return null
  return clamp(Math.abs(number) <= 1 ? number * 100 : number, 0, 100)
}

function capacityPercent(value: CapacityMetric | null | undefined): number | null {
  const used = finiteNumber(value?.used)
  const total = finiteNumber(value?.total)
  if (used === null || total === null || total <= 0) return null
  return clamp((used / total) * 100, 0, 100)
}

function buildChartPoints(
  points: TrafficPoint[],
  key: 'requests' | 'errors',
  maximum: number
) {
  if (!points.length) return ''
  const values = points.map((point) => finiteNumber(point[key]) ?? 0)
  return values.map((value, index) => {
    const x = points.length === 1 ? 400 : 28 + (index / (points.length - 1)) * 744
    const y = 190 - (value / maximum) * 158
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')
}

function formatNumber(value: unknown, maximumFractionDigits = 0) {
  const number = finiteNumber(value)
  if (number === null) return '—'
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits }).format(number)
}

function formatExactNumber(value: unknown) {
  const number = finiteNumber(value)
  return number === null ? '—' : new Intl.NumberFormat().format(number)
}

function formatPercent(value: unknown) {
  const percent = normalizedPercent(value)
  return percent === null ? '—' : `${percent.toFixed(percent >= 10 ? 1 : 2)}%`
}

function formatDuration(value: unknown) {
  const milliseconds = finiteNumber(value)
  if (milliseconds === null) return '—'
  if (milliseconds >= 1_000) return `${(milliseconds / 1_000).toFixed(milliseconds >= 10_000 ? 1 : 2)} s`
  return `${Math.round(milliseconds)} ms`
}

function formatBytes(value: unknown) {
  const bytes = finiteNumber(value)
  if (bytes === null) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = clamp(Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)), 0, units.length - 1)
  return `${(bytes / (1024 ** index)).toFixed(index > 1 ? 1 : 0)} ${units[index]}`
}

function formatUptime(value: unknown) {
  const seconds = finiteNumber(value)
  if (seconds === null || seconds < 0) return '—'
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  if (days) return `${days}d ${hours}h ${minutes}m`
  if (hours) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatDate(value: unknown, includeSeconds = false) {
  if (typeof value !== 'string' || !value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {})
  }).format(date)
}

function formatTime(value: unknown) {
  if (typeof value !== 'string' || !value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date)
}

function humanizeKey(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function formatUnknown(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Enabled' : 'Disabled'
  if (typeof value === 'number') return formatExactNumber(value)
  if (typeof value === 'string') return value || '—'
  if (Array.isArray(value)) return value.map(formatUnknown).join(', ') || '—'
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .slice(0, 3)
      .map(([key, nested]) => `${humanizeKey(key)}: ${formatUnknown(nested)}`)
      .join(' · ') || '—'
  }
  return String(value)
}

function objectEntries(value: Record<string, unknown> | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value).slice(0, 10).map(([key, entryValue]) => ({
    key,
    label: humanizeKey(key),
    value: formatUnknown(entryValue)
  }))
}

function statusCodePercent(count: number) {
  if (!totalStatusResponses.value) return 0
  return clamp((count / totalStatusResponses.value) * 100, 0, 100)
}

function statusCodeTone(code: string) {
  const first = Number.parseInt(code.charAt(0), 10)
  if (first === 2 || first === 3) return 'success'
  if (first === 4) return 'warning'
  if (first === 5) return 'danger'
  return 'neutral'
}

function methodTone(value: unknown) {
  const method = typeof value === 'string' ? value.toUpperCase() : ''
  if (method === 'GET') return 'get'
  if (method === 'POST') return 'post'
  if (method === 'PUT' || method === 'PATCH') return 'write'
  if (method === 'DELETE') return 'delete'
  return 'other'
}

function responseTone(value: unknown) {
  const status = finiteNumber(value)
  if (status === null) return 'neutral'
  if (status >= 500) return 'danger'
  if (status >= 400) return 'warning'
  if (status >= 200 && status < 400) return 'success'
  return 'neutral'
}

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

watch(() => props.visible, (visible) => {
  if (!mounted) return
  if (visible) activateDashboard()
  else deactivateDashboard()
})

watch(sessionExpired, (expired) => {
  if (expired) stopPolling()
  else if (props.visible) startPolling()
})

onMounted(() => {
  mounted = true
  document.addEventListener('visibilitychange', handleDocumentVisibility)
  if (props.visible) activateDashboard()
})

onBeforeUnmount(() => {
  mounted = false
  deactivateDashboard()
  logoutController?.abort()
  document.removeEventListener('visibilitychange', handleDocumentVisibility)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="admin-dashboard" appear>
      <section
        v-if="visible"
        ref="rootElement"
        class="admin-dashboard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-dashboard-title"
        :aria-busy="isLoading || isRefreshing"
        @keydown="onDialogKeydown"
      >
        <div class="admin-dashboard__glow" aria-hidden="true"></div>

        <header class="admin-topbar">
          <div class="admin-brand">
            <div class="admin-brand__mark" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 3 20 6v5c0 5.1-3.3 8.5-8 10-4.7-1.5-8-4.9-8-10V6l8-3Z" />
                <path d="M9 12.2 11.1 14 15.5 9.5" />
              </svg>
            </div>
            <div>
              <div class="admin-brand__eyebrow">Private workspace</div>
              <h1 id="admin-dashboard-title">Nuvio control room</h1>
            </div>
          </div>

          <div class="admin-topbar__status" role="status" aria-live="polite">
            <span
              class="live-dot"
              :class="{ 'is-paused': sessionExpired || adminError }"
              aria-hidden="true"
            ></span>
            <span v-if="sessionExpired">Session ended</span>
            <span v-else-if="isRefreshing">Refreshing telemetry</span>
            <span v-else-if="adminError">Telemetry interrupted</span>
            <span v-else>Live telemetry</span>
            <small v-if="overview?.generatedAt">{{ formatTime(overview.generatedAt) }}</small>
          </div>

          <div class="admin-topbar__actions">
            <button
              type="button"
              class="icon-action refresh-action"
              :disabled="isLoading || isRefreshing || sessionExpired"
              :aria-label="isRefreshing ? 'Refreshing dashboard' : 'Refresh dashboard'"
              @click="refreshDashboard(true)"
            >
              <svg :class="{ spinning: isRefreshing }" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 12a8 8 0 1 1-2.35-5.65M20 4v6h-6" />
              </svg>
              <span>Refresh</span>
            </button>
            <button
              type="button"
              class="icon-action logout-action"
              :disabled="isLoggingOut"
              @click="logout"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M10 17l5-5-5-5M15 12H3M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" />
              </svg>
              <span>{{ isLoggingOut ? 'Signing out' : 'Sign out' }}</span>
            </button>
            <button
              ref="closeButton"
              type="button"
              class="close-action"
              aria-label="Close admin dashboard"
              @click="close"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        </header>

        <div class="admin-workspace">
          <aside class="admin-sidebar">
            <nav class="admin-tabs" role="tablist" aria-label="Dashboard sections">
              <button
                v-for="(tab, index) in tabs"
                :id="`admin-tab-${tab.id}`"
                :key="tab.id"
                type="button"
                role="tab"
                class="admin-tab"
                :class="{ 'is-active': activeTab === tab.id }"
                :aria-selected="activeTab === tab.id"
                :aria-controls="`admin-panel-${tab.id}`"
                :tabindex="activeTab === tab.id ? 0 : -1"
                @click="selectTab(tab.id)"
                @keydown="onTabKeydown($event, index)"
              >
                <span class="admin-tab__icon" aria-hidden="true">
                  <svg v-if="tab.id === 'overview'" viewBox="0 0 24 24">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                  <svg v-else-if="tab.id === 'traffic'" viewBox="0 0 24 24">
                    <path d="M4 18V9M10 18V5M16 18v-7M22 18V3" />
                    <path d="M2 18h20" />
                  </svg>
                  <svg v-else-if="tab.id === 'services'" viewBox="0 0 24 24">
                    <rect x="3" y="4" width="18" height="6" rx="2" />
                    <rect x="3" y="14" width="18" height="6" rx="2" />
                    <path d="M7 7h.01M7 17h.01M11 7h7M11 17h7" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
                  </svg>
                </span>
                <span class="admin-tab__copy">
                  <strong>{{ tab.label }}</strong>
                  <small>{{ tab.description }}</small>
                </span>
              </button>
            </nav>

            <div class="session-summary">
              <div class="session-summary__heading">
                <span>Session</span>
                <span class="session-state" :class="{ 'is-expired': sessionExpired }">
                  {{ sessionExpired ? 'Expired' : 'Protected' }}
                </span>
              </div>
              <dl>
                <div>
                  <dt>Active sessions</dt>
                  <dd>{{ formatExactNumber(security.activeSessions) }}</dd>
                </div>
                <div>
                  <dt>This session ends</dt>
                  <dd>{{ formatDate(security.currentSessionExpiresAt) }}</dd>
                </div>
              </dl>
              <p>Admin access is stored in an HTTP-only session and is never exposed in this page.</p>
            </div>
          </aside>

          <main class="admin-main">
            <div class="section-heading">
              <div>
                <span class="section-heading__eyebrow">Admin / {{ activeTabDetails.label }}</span>
                <h2>{{ activeTabDetails.label }}</h2>
                <p>{{ activeTabDetails.description }}</p>
              </div>
              <div class="section-heading__freshness">
                <span>Snapshot</span>
                <strong>{{ formatDate(overview?.generatedAt, true) }}</strong>
              </div>
            </div>

            <div v-if="isLoading && !overview" class="dashboard-loading" aria-label="Loading admin dashboard">
              <div class="skeleton skeleton--hero"></div>
              <div class="skeleton-grid">
                <div v-for="index in 6" :key="index" class="skeleton skeleton--metric"></div>
              </div>
              <div class="skeleton-grid skeleton-grid--wide">
                <div class="skeleton skeleton--panel"></div>
                <div class="skeleton skeleton--panel"></div>
              </div>
            </div>

            <section v-else-if="sessionExpired" class="dashboard-state" role="alert">
              <div class="dashboard-state__icon is-warning" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M12 3 20 6v5c0 5.1-3.3 8.5-8 10-4.7-1.5-8-4.9-8-10V6l8-3Z" />
                  <path d="M12 8v5M12 16h.01" />
                </svg>
              </div>
              <span class="state-kicker">Authentication required</span>
              <h2>Your admin session has ended</h2>
              <p>Close the dashboard and enter the configured access phrase in search again to start a new secure session.</p>
              <div class="dashboard-state__actions">
                <button type="button" class="primary-button" @click="close">Return to search</button>
                <button type="button" class="secondary-button" @click="refreshDashboard(true)">Check session</button>
              </div>
            </section>

            <section v-else-if="!overview" class="dashboard-state" role="alert">
              <div class="dashboard-state__icon is-danger" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v6M12 17h.01" />
                </svg>
              </div>
              <span class="state-kicker">Telemetry unavailable</span>
              <h2>The control room could not be loaded</h2>
              <p>{{ adminError || 'The server did not return admin telemetry. Try again in a moment.' }}</p>
              <button type="button" class="primary-button" @click="refreshDashboard(true)">Try again</button>
            </section>

            <template v-else>
              <div v-if="adminError" class="warning-banner" role="status">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 4 21 20H3L12 4Z" />
                  <path d="M12 9v5M12 17h.01" />
                </svg>
                <div>
                  <strong>Some telemetry is incomplete</strong>
                  <span>{{ adminError }}</span>
                </div>
                <button type="button" :disabled="isRefreshing" @click="refreshDashboard(true)">Retry</button>
              </div>

              <section
                v-show="activeTab === 'overview'"
                id="admin-panel-overview"
                class="tab-panel"
                role="tabpanel"
                aria-labelledby="admin-tab-overview"
              >
                <div class="metric-grid">
                  <article class="metric-card metric-card--brand">
                    <span class="metric-card__label">Total requests</span>
                    <strong>{{ formatNumber(traffic.totalRequests, 1) }}</strong>
                    <small>Since process start</small>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18V9M10 18V5M16 18v-7M22 18V3" /></svg>
                  </article>
                  <article class="metric-card">
                    <span class="metric-card__label">Active now</span>
                    <strong>{{ formatExactNumber(traffic.activeRequests) }}</strong>
                    <small>Requests in flight</small>
                    <span class="metric-pulse" aria-hidden="true"></span>
                  </article>
                  <article class="metric-card" :class="{ 'is-warning': (errorRateValue ?? 0) >= 2 }">
                    <span class="metric-card__label">Error rate</span>
                    <strong>{{ formatPercent(traffic.errorRate) }}</strong>
                    <small>{{ (errorRateValue ?? 0) < 1 ? 'Within target' : 'Watch closely' }}</small>
                  </article>
                  <article class="metric-card">
                    <span class="metric-card__label">Average latency</span>
                    <strong>{{ formatDuration(traffic.averageLatencyMs) }}</strong>
                    <small>Across all endpoints</small>
                  </article>
                  <article class="metric-card">
                    <span class="metric-card__label">P95 latency</span>
                    <strong>{{ formatDuration(traffic.p95LatencyMs) }}</strong>
                    <small>95th percentile</small>
                  </article>
                  <article class="metric-card">
                    <span class="metric-card__label">Unique clients</span>
                    <strong>{{ formatNumber(traffic.uniqueClients24h, 1) }}</strong>
                    <small>{{ formatExactNumber(traffic.uniqueClients1h) }} in the last hour</small>
                  </article>
                </div>

                <div class="overview-grid overview-grid--single">
                  <article class="dashboard-card activity-card">
                    <header class="card-heading">
                      <div>
                        <span>Request activity</span>
                        <h3>Last 24 minutes</h3>
                      </div>
                      <div class="chart-legend" aria-label="Chart legend">
                        <span><i class="is-request"></i>Requests</span>
                        <span><i class="is-error"></i>Errors</span>
                      </div>
                    </header>
                    <div v-if="activityBars.length" class="activity-chart" aria-label="Request volume for the last 24 minutes">
                      <div
                        v-for="(point, index) in activityBars"
                        :key="`${point.at || 'point'}-${index}`"
                        class="activity-column"
                        :title="`${formatTime(point.at)} · ${formatExactNumber(point.requests)} requests · ${formatExactNumber(point.errors)} errors`"
                      >
                        <span class="activity-bar" :style="{ height: `${point.height}%` }"></span>
                        <span v-if="point.errorHeight" class="activity-error" :style="{ height: `${point.errorHeight}%` }"></span>
                      </div>
                    </div>
                    <div v-else class="inline-empty">No minute-level traffic has been recorded yet.</div>
                    <footer class="card-footnote">
                      <span>{{ formatExactNumber(traffic.activeRequests) }} currently active</span>
                      <span>Auto-refreshes every 30 seconds</span>
                    </footer>
                  </article>

                </div>

                <div class="overview-grid overview-grid--lower">
                  <article class="dashboard-card request-card">
                    <header class="card-heading">
                      <div><span>Live feed</span><h3>Recent requests</h3></div>
                      <button type="button" class="text-button" @click="selectTab('traffic')">View traffic</button>
                    </header>
                    <div v-if="recentRequests.length" class="request-list">
                      <div v-for="(request, index) in recentRequests.slice(0, 8)" :key="`${request.at}-${index}`" class="request-row">
                        <span class="method-chip" :class="`is-${methodTone(request.method)}`">{{ request.method || '—' }}</span>
                        <code :title="request.path || ''">{{ request.path || 'Unknown route' }}</code>
                        <span class="response-chip" :class="`is-${responseTone(request.status)}`">{{ request.status ?? '—' }}</span>
                        <span class="request-duration">{{ formatDuration(request.durationMs) }}</span>
                        <time :datetime="request.at || undefined">{{ formatTime(request.at) }}</time>
                      </div>
                    </div>
                    <div v-else class="inline-empty">No recent request records are available.</div>
                  </article>

                  <article class="dashboard-card runtime-card">
                    <header class="card-heading"><div><span>Runtime</span><h3>Resource pressure</h3></div></header>
                    <div class="gauge-list">
                      <div class="gauge-row">
                        <div><span>System memory</span><strong>{{ memoryPercent === null ? '—' : `${memoryPercent.toFixed(1)}%` }}</strong></div>
                        <div class="progress-track"><span :style="{ width: `${memoryPercent ?? 0}%` }"></span></div>
                        <small>{{ formatBytes(runtime.systemMemory?.used) }} of {{ formatBytes(runtime.systemMemory?.total) }}</small>
                      </div>
                      <div class="gauge-row">
                        <div><span>Heap</span><strong>{{ heapPercent === null ? '—' : `${heapPercent.toFixed(1)}%` }}</strong></div>
                        <div class="progress-track"><span :style="{ width: `${heapPercent ?? 0}%` }"></span></div>
                        <small>{{ formatBytes(runtime.memory?.heapUsed) }} of {{ formatBytes(runtime.memory?.heapTotal) }}</small>
                      </div>
                      <div class="gauge-row">
                        <div><span>Load / CPU</span><strong>{{ loadPercent === null ? '—' : `${loadPercent.toFixed(1)}%` }}</strong></div>
                        <div class="progress-track"><span :style="{ width: `${loadPercent ?? 0}%` }"></span></div>
                        <small>{{ formatExactNumber(runtime.cpuCount) }} logical CPUs</small>
                      </div>
                    </div>
                  </article>
                </div>
              </section>

              <section
                v-show="activeTab === 'traffic'"
                id="admin-panel-traffic"
                class="tab-panel"
                role="tabpanel"
                aria-labelledby="admin-tab-traffic"
              >
                <article class="dashboard-card traffic-chart-card">
                  <header class="card-heading card-heading--responsive">
                    <div>
                      <span>Request volume</span>
                      <h3>{{ trafficWindow === 'minutes' ? 'Minute-by-minute' : 'Hourly trend' }}</h3>
                    </div>
                    <div class="segmented-control" role="group" aria-label="Traffic chart time range">
                      <button type="button" :class="{ active: trafficWindow === 'minutes' }" :aria-pressed="trafficWindow === 'minutes'" @click="trafficWindow = 'minutes'">Minutes</button>
                      <button type="button" :class="{ active: trafficWindow === 'hours' }" :aria-pressed="trafficWindow === 'hours'" @click="trafficWindow = 'hours'">Hours</button>
                    </div>
                  </header>
                  <div v-if="chartSeries.length" class="line-chart-wrap">
                    <svg class="line-chart" viewBox="0 0 800 220" preserveAspectRatio="none" role="img" :aria-label="`Traffic chart with a peak of ${formatExactNumber(chartPeak)} requests`">
                      <defs>
                        <linearGradient id="admin-request-area" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stop-color="currentColor" stop-opacity=".28" />
                          <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
                        </linearGradient>
                      </defs>
                      <g class="chart-grid" aria-hidden="true">
                        <path d="M28 32H772M28 84H772M28 137H772M28 190H772" />
                      </g>
                      <path v-if="requestAreaPath" class="chart-area" :d="requestAreaPath" />
                      <polyline class="chart-line chart-line--requests" :points="requestLinePoints" />
                      <polyline class="chart-line chart-line--errors" :points="errorLinePoints" />
                    </svg>
                    <div class="chart-axis">
                      <span>{{ formatTime(chartSeries[0]?.at) }}</span>
                      <span>{{ formatTime(chartSeries[Math.floor(chartSeries.length / 2)]?.at) }}</span>
                      <span>{{ formatTime(chartSeries[chartSeries.length - 1]?.at) }}</span>
                    </div>
                  </div>
                  <div v-else class="inline-empty inline-empty--large">No traffic samples exist for this time range.</div>
                  <div class="chart-stats">
                    <div><span>Peak requests</span><strong>{{ formatExactNumber(chartPeak) }}</strong></div>
                    <div><span>Average per interval</span><strong>{{ formatNumber(chartAverage, 1) }}</strong></div>
                    <div><span>Average latency</span><strong>{{ formatDuration(traffic.averageLatencyMs) }}</strong></div>
                    <div><span>P95 latency</span><strong>{{ formatDuration(traffic.p95LatencyMs) }}</strong></div>
                  </div>
                </article>

                <div class="traffic-secondary-grid">
                  <article class="dashboard-card status-code-card">
                    <header class="card-heading"><div><span>Responses</span><h3>Status code mix</h3></div><strong class="card-total">{{ formatNumber(totalStatusResponses, 1) }}</strong></header>
                    <div v-if="statusCodeEntries.length" class="distribution-list">
                      <div v-for="entry in statusCodeEntries" :key="entry.code" class="distribution-row">
                        <span class="response-chip" :class="`is-${statusCodeTone(entry.code)}`">{{ entry.code }}</span>
                        <div class="distribution-bar"><span :class="`is-${statusCodeTone(entry.code)}`" :style="{ width: `${statusCodePercent(entry.count)}%` }"></span></div>
                        <strong>{{ formatExactNumber(entry.count) }}</strong>
                        <small>{{ statusCodePercent(entry.count).toFixed(1) }}%</small>
                      </div>
                    </div>
                    <div v-else class="inline-empty">No response status data is available.</div>
                  </article>

                  <article class="dashboard-card client-card">
                    <header class="card-heading"><div><span>Audience</span><h3>Unique clients</h3></div></header>
                    <div class="client-comparison">
                      <div><span>Last hour</span><strong>{{ formatExactNumber(traffic.uniqueClients1h) }}</strong></div>
                      <svg viewBox="0 0 80 40" aria-hidden="true"><path d="M3 33C14 31 17 10 29 19s14 8 21 0 13-6 27-15" /></svg>
                      <div><span>Last 24 hours</span><strong>{{ formatExactNumber(traffic.uniqueClients24h) }}</strong></div>
                    </div>
                    <dl class="compact-details">
                      <div><dt>Total requests</dt><dd>{{ formatExactNumber(traffic.totalRequests) }}</dd></div>
                      <div><dt>Requests in flight</dt><dd>{{ formatExactNumber(traffic.activeRequests) }}</dd></div>
                      <div><dt>Error rate</dt><dd>{{ formatPercent(traffic.errorRate) }}</dd></div>
                    </dl>
                  </article>
                </div>

                <article class="dashboard-card table-card">
                  <header class="card-heading"><div><span>Routes</span><h3>Endpoint performance</h3></div><span class="record-count">{{ endpointRows.length }} endpoints</span></header>
                  <div v-if="endpointRows.length" class="data-table-wrap">
                    <table class="data-table">
                      <thead><tr><th>Endpoint</th><th>Requests</th><th>Errors</th><th>Average</th><th>P95</th><th>Last seen</th></tr></thead>
                      <tbody>
                        <tr v-for="(endpoint, index) in endpointRows" :key="`${endpoint.method}-${endpoint.path}-${index}`">
                          <td><span class="method-chip" :class="`is-${methodTone(endpoint.method)}`">{{ endpoint.method || '—' }}</span><code>{{ endpoint.path || 'Unknown route' }}</code></td>
                          <td>{{ formatExactNumber(endpoint.requests) }}</td>
                          <td><span :class="{ 'danger-text': (finiteNumber(endpoint.errors) ?? 0) > 0 }">{{ formatExactNumber(endpoint.errors) }}</span></td>
                          <td>{{ formatDuration(endpoint.averageLatencyMs) }}</td>
                          <td>{{ formatDuration(endpoint.p95LatencyMs) }}</td>
                          <td><time :datetime="endpoint.lastSeenAt || undefined">{{ formatDate(endpoint.lastSeenAt, true) }}</time></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div v-else class="inline-empty inline-empty--large">No endpoint metrics have been recorded.</div>
                </article>

                <article class="dashboard-card table-card">
                  <header class="card-heading"><div><span>Request log</span><h3>Most recent activity</h3></div><span class="record-count">{{ recentRequests.length }} records</span></header>
                  <div v-if="recentRequests.length" class="data-table-wrap">
                    <table class="data-table request-table">
                      <thead><tr><th>Time</th><th>Method</th><th>Path</th><th>Status</th><th>Duration</th></tr></thead>
                      <tbody>
                        <tr v-for="(request, index) in recentRequests" :key="`${request.at}-${index}`">
                          <td><time :datetime="request.at || undefined">{{ formatDate(request.at, true) }}</time></td>
                          <td><span class="method-chip" :class="`is-${methodTone(request.method)}`">{{ request.method || '—' }}</span></td>
                          <td><code>{{ request.path || 'Unknown route' }}</code></td>
                          <td><span class="response-chip" :class="`is-${responseTone(request.status)}`">{{ request.status ?? '—' }}</span></td>
                          <td>{{ formatDuration(request.durationMs) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div v-else class="inline-empty inline-empty--large">The recent request log is empty.</div>
                </article>
              </section>

              <section
                v-show="activeTab === 'services'"
                id="admin-panel-services"
                class="tab-panel"
                role="tabpanel"
                aria-labelledby="admin-tab-services"
              >
                <div class="services-secondary-grid">
                  <article class="dashboard-card integrations-card">
                    <header class="card-heading"><div><span>Connectivity</span><h3>Integrations</h3></div><span class="record-count">{{ integrationEntries.filter((entry) => entry.enabled).length }} online</span></header>
                    <div v-if="integrationEntries.length" class="integration-grid">
                      <div v-for="integration in integrationEntries" :key="integration.key" class="integration-item" :class="{ 'is-enabled': integration.enabled }">
                        <span class="integration-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 12h8M12 8v8" /><circle cx="12" cy="12" r="9" /></svg></span>
                        <div><strong>{{ integration.label }}</strong><span>{{ integration.enabled ? 'Connected' : 'Not configured' }}</span></div>
                        <i :aria-label="integration.enabled ? 'Connected' : 'Not configured'"></i>
                      </div>
                    </div>
                    <div v-else class="inline-empty">No integration telemetry was provided.</div>
                  </article>

                  <article class="dashboard-card knowledge-card">
                    <header class="card-heading"><div><span>AI service</span><h3>Knowledge engine</h3></div><span class="state-badge" :class="knowledge.rebuilding ? 'is-degraded' : knowledge.loaded ? 'is-operational' : 'is-unknown'"><i aria-hidden="true"></i>{{ knowledge.rebuilding ? 'Rebuilding' : knowledge.loaded ? 'Ready' : 'Unknown' }}</span></header>
                    <div class="knowledge-identity">
                      <div><span>Model</span><strong>{{ knowledge.model || 'Not reported' }}</strong></div>
                      <div><span>Mode</span><strong>{{ knowledge.mode || 'Not reported' }}</strong></div>
                    </div>
                    <div class="knowledge-stats">
                      <div><strong>{{ formatExactNumber(knowledge.content?.pageCount) }}</strong><span>Indexed pages</span></div>
                      <div><strong>{{ formatBytes(knowledge.content?.totalBytes) }}</strong><span>Content size</span></div>
                      <div><strong>{{ formatDate(knowledge.content?.lastUpdatedAt) }}</strong><span>Last content update</span></div>
                    </div>
                  </article>
                </div>

                <div class="services-secondary-grid">
                  <article class="dashboard-card details-card">
                    <header class="card-heading"><div><span>Retrieval</span><h3>File search</h3></div></header>
                    <dl v-if="fileSearchEntries.length" class="detail-list">
                      <div v-for="entry in fileSearchEntries" :key="entry.key"><dt>{{ entry.label }}</dt><dd>{{ entry.value }}</dd></div>
                    </dl>
                    <div v-else class="inline-empty">No file-search diagnostics were supplied.</div>
                  </article>
                  <article class="dashboard-card details-card">
                    <header class="card-heading"><div><span>Performance</span><h3>Knowledge cache</h3></div></header>
                    <dl v-if="cacheEntries.length" class="detail-list">
                      <div v-for="entry in cacheEntries" :key="entry.key"><dt>{{ entry.label }}</dt><dd>{{ entry.value }}</dd></div>
                    </dl>
                    <div v-else class="inline-empty">No cache diagnostics were supplied.</div>
                  </article>
                </div>
              </section>

              <section
                v-show="activeTab === 'system'"
                id="admin-panel-system"
                class="tab-panel"
                role="tabpanel"
                aria-labelledby="admin-tab-system"
              >
                <div class="runtime-identity-grid">
                  <article><span>Environment</span><strong>{{ runtime.environment || '—' }}</strong><small>Deployment mode</small></article>
                  <article><span>Node runtime</span><strong>{{ runtime.nodeVersion || '—' }}</strong><small>{{ runtime.platform || 'Unknown platform' }} / {{ runtime.arch || 'unknown arch' }}</small></article>
                  <article><span>Process uptime</span><strong>{{ formatUptime(runtime.uptimeSeconds) }}</strong><small>Started {{ formatDate(runtime.startedAt) }}</small></article>
                  <article><span>CPU topology</span><strong>{{ formatExactNumber(runtime.cpuCount) }} cores</strong><small>{{ normalizeArray(runtime.loadAverage).map((value) => formatNumber(value, 2)).join(' / ') || 'No load average' }}</small></article>
                </div>

                <div class="system-grid">
                  <article class="dashboard-card utilization-card">
                    <header class="card-heading"><div><span>Capacity</span><h3>Resource utilization</h3></div></header>
                    <div class="utilization-list">
                      <div class="utilization-row">
                        <div class="radial-gauge" :style="{ '--gauge': `${memoryPercent ?? 0}%` }"><strong>{{ memoryPercent === null ? '—' : `${Math.round(memoryPercent)}%` }}</strong></div>
                        <div><span>System memory</span><strong>{{ formatBytes(runtime.systemMemory?.used) }} used</strong><small>{{ formatBytes(runtime.systemMemory?.total) }} total</small></div>
                      </div>
                      <div class="utilization-row">
                        <div class="radial-gauge is-secondary" :style="{ '--gauge': `${heapPercent ?? 0}%` }"><strong>{{ heapPercent === null ? '—' : `${Math.round(heapPercent)}%` }}</strong></div>
                        <div><span>Node heap</span><strong>{{ formatBytes(runtime.memory?.heapUsed) }} used</strong><small>{{ formatBytes(runtime.memory?.heapTotal) }} allocated</small></div>
                      </div>
                      <div v-if="runtime.disk" class="utilization-row">
                        <div class="radial-gauge is-tertiary" :style="{ '--gauge': `${diskPercent ?? 0}%` }"><strong>{{ diskPercent === null ? '—' : `${Math.round(diskPercent)}%` }}</strong></div>
                        <div><span>Disk storage</span><strong>{{ formatBytes(runtime.disk.used) }} used</strong><small>{{ formatBytes(runtime.disk.total) }} total</small></div>
                      </div>
                    </div>
                  </article>

                  <article class="dashboard-card process-card">
                    <header class="card-heading"><div><span>Node process</span><h3>Memory breakdown</h3></div></header>
                    <dl class="process-memory">
                      <div><dt>Resident set</dt><dd>{{ formatBytes(runtime.memory?.rss) }}</dd><span>All process memory</span></div>
                      <div><dt>Heap used</dt><dd>{{ formatBytes(runtime.memory?.heapUsed) }}</dd><span>Live JavaScript objects</span></div>
                      <div><dt>Heap total</dt><dd>{{ formatBytes(runtime.memory?.heapTotal) }}</dd><span>Allocated V8 heap</span></div>
                      <div><dt>External</dt><dd>{{ formatBytes(runtime.memory?.external) }}</dd><span>Native and buffer data</span></div>
                    </dl>
                  </article>
                </div>

                <div class="system-grid">
                  <article class="dashboard-card security-card">
                    <header class="card-heading"><div><span>Access control</span><h3>Security activity</h3></div><span class="security-shield" :class="{ 'has-warning': failedAttemptCount > 0 }"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v5c0 5.1-3.3 8.5-8 10-4.7-1.5-8-4.9-8-10V6l8-3Z" /><path d="M9 12.2 11.1 14 15.5 9.5" /></svg></span></header>
                    <div class="security-stats">
                      <div><span>Active sessions</span><strong>{{ formatExactNumber(security.activeSessions) }}</strong><small>Authenticated admin sessions</small></div>
                      <div :class="{ 'is-alert': failedAttemptCount > 0 }"><span>Failed attempts</span><strong>{{ formatExactNumber(security.failedAttempts) }}</strong><small>Last: {{ formatDate(security.lastFailedAt, true) }}</small></div>
                    </div>
                    <div class="session-expiry">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                      <div><span>Current session expiry</span><strong>{{ formatDate(security.currentSessionExpiresAt, true) }}</strong></div>
                    </div>
                  </article>

                  <article class="dashboard-card details-card system-details-card">
                    <header class="card-heading"><div><span>Host identity</span><h3>Runtime details</h3></div></header>
                    <dl class="detail-list">
                      <div><dt>Environment</dt><dd>{{ runtime.environment || '—' }}</dd></div>
                      <div><dt>Operating system</dt><dd>{{ runtime.platform || '—' }}</dd></div>
                      <div><dt>Architecture</dt><dd>{{ runtime.arch || '—' }}</dd></div>
                      <div><dt>Node version</dt><dd>{{ runtime.nodeVersion || '—' }}</dd></div>
                      <div><dt>Logical CPUs</dt><dd>{{ formatExactNumber(runtime.cpuCount) }}</dd></div>
                      <div><dt>Load averages</dt><dd>{{ normalizeArray(runtime.loadAverage).map((value) => formatNumber(value, 2)).join(' / ') || '—' }}</dd></div>
                    </dl>
                  </article>
                </div>
              </section>
            </template>
          </main>
        </div>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.admin-dashboard {
  --admin-green: #16a36a;
  --admin-green-soft: color-mix(in srgb, var(--admin-green) 12%, transparent);
  --admin-amber: #d28a13;
  --admin-amber-soft: color-mix(in srgb, var(--admin-amber) 12%, transparent);
  --admin-red: #dc4d5f;
  --admin-red-soft: color-mix(in srgb, var(--admin-red) 11%, transparent);
  --admin-blue: var(--vp-c-brand-1);
  --admin-blue-soft: var(--vp-c-brand-soft);
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background:
    radial-gradient(circle at 80% -12%, color-mix(in srgb, var(--vp-c-brand-1) 11%, transparent), transparent 32%),
    var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-family: var(--vp-font-family-base);
  line-height: 1.5;
  isolation: isolate;
}

.admin-dashboard,
.admin-dashboard * {
  box-sizing: border-box;
}

.admin-dashboard button,
.admin-dashboard input {
  font: inherit;
}

.admin-dashboard button {
  -webkit-tap-highlight-color: transparent;
}

.admin-dashboard button:focus-visible,
.admin-dashboard a:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.admin-dashboard__glow {
  position: absolute;
  z-index: -1;
  width: 520px;
  height: 520px;
  top: -330px;
  left: 20%;
  border-radius: 999px;
  background: var(--vp-c-brand-1);
  opacity: .055;
  filter: blur(80px);
  pointer-events: none;
}

.admin-topbar {
  position: relative;
  z-index: 4;
  min-height: 74px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 24px;
  padding: max(12px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) 12px max(20px, env(safe-area-inset-left));
  border-bottom: 1px solid var(--vp-c-divider);
  background: color-mix(in srgb, var(--vp-c-bg) 91%, transparent);
  backdrop-filter: blur(22px) saturate(145%);
}

.admin-brand,
.admin-topbar__actions,
.admin-topbar__status,
.icon-action,
.admin-tab,
.section-heading,
.card-heading,
.chart-legend,
.state-badge,
.request-row,
.service-row-card,
.service-summary-card,
.integration-item,
.session-expiry {
  display: flex;
  align-items: center;
}

.admin-brand {
  min-width: 0;
  gap: 12px;
}

.admin-brand__mark {
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  display: grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 30%, var(--vp-c-divider));
  border-radius: 11px;
  background: linear-gradient(145deg, var(--vp-c-brand-soft), color-mix(in srgb, var(--vp-c-bg-elv) 88%, transparent));
  color: var(--vp-c-brand-1);
  box-shadow: 0 8px 26px color-mix(in srgb, var(--vp-c-brand-1) 13%, transparent);
}

.admin-brand__mark svg,
.security-shield svg {
  width: 21px;
  height: 21px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.admin-brand__eyebrow,
.section-heading__eyebrow,
.state-kicker {
  color: var(--vp-c-text-3);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: .11em;
  text-transform: uppercase;
}

.admin-brand h1 {
  margin: 1px 0 0;
  font-size: 15px;
  line-height: 1.2;
  letter-spacing: -.01em;
}

.admin-topbar__status {
  gap: 8px;
  min-width: 0;
  padding: 6px 11px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  background: color-mix(in srgb, var(--vp-c-bg-soft) 78%, transparent);
  color: var(--vp-c-text-2);
  font-size: 11px;
  font-weight: 650;
  white-space: nowrap;
}

.admin-topbar__status small {
  padding-left: 7px;
  border-left: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-3);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.live-dot {
  position: relative;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--admin-green);
  box-shadow: 0 0 0 3px var(--admin-green-soft);
}

.live-dot::after {
  content: '';
  position: absolute;
  inset: -4px;
  border: 1px solid var(--admin-green);
  border-radius: inherit;
  animation: live-pulse 2s ease-out infinite;
}

.live-dot.is-paused {
  background: var(--admin-amber);
  box-shadow: 0 0 0 3px var(--admin-amber-soft);
}

.live-dot.is-paused::after {
  display: none;
}

.admin-topbar__actions {
  justify-content: flex-end;
  gap: 7px;
}

.icon-action,
.close-action,
.text-button,
.warning-banner button,
.primary-button,
.secondary-button,
.segmented-control button {
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: border-color .16s ease, background .16s ease, color .16s ease, transform .16s ease;
}

.icon-action {
  justify-content: center;
  gap: 7px;
  min-height: 35px;
  padding: 0 11px;
  border-radius: 9px;
  font-size: 11px;
  font-weight: 650;
}

.icon-action svg,
.close-action svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.icon-action:hover:not(:disabled),
.close-action:hover,
.secondary-button:hover,
.warning-banner button:hover {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 40%, var(--vp-c-divider));
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
}

.logout-action:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--admin-red) 38%, var(--vp-c-divider));
  background: var(--admin-red-soft);
  color: var(--admin-red);
}

.icon-action:disabled {
  opacity: .52;
  cursor: wait;
}

.close-action {
  width: 35px;
  height: 35px;
  display: grid;
  place-items: center;
  border-radius: 9px;
}

.spinning {
  animation: admin-spin .75s linear infinite;
}

.admin-workspace {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: 238px minmax(0, 1fr);
}

.admin-sidebar {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
  overflow-y: auto;
  padding: 24px 16px max(18px, env(safe-area-inset-bottom));
  border-right: 1px solid var(--vp-c-divider);
  background: color-mix(in srgb, var(--vp-c-bg-alt) 68%, transparent);
  scrollbar-width: thin;
}

.admin-tabs {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.admin-tab {
  position: relative;
  width: 100%;
  gap: 11px;
  padding: 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--vp-c-text-2);
  text-align: left;
  cursor: pointer;
  transition: color .16s ease, background .16s ease, border-color .16s ease, transform .16s ease;
}

.admin-tab:hover {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
}

.admin-tab.is-active {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 22%, var(--vp-c-divider));
  background: color-mix(in srgb, var(--vp-c-brand-soft) 74%, var(--vp-c-bg-elv));
  color: var(--vp-c-brand-1);
  box-shadow: 0 7px 22px color-mix(in srgb, var(--vp-c-brand-1) 8%, transparent);
}

.admin-tab.is-active::before {
  content: '';
  position: absolute;
  left: -17px;
  width: 3px;
  height: 24px;
  border-radius: 0 5px 5px 0;
  background: var(--vp-c-brand-1);
}

.admin-tab__icon {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  display: grid;
  place-items: center;
  border: 1px solid var(--vp-c-divider);
  border-radius: 9px;
  background: var(--vp-c-bg-elv);
}

.admin-tab.is-active .admin-tab__icon {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 28%, var(--vp-c-divider));
  background: var(--vp-c-brand-soft);
}

.admin-tab__icon svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.admin-tab__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.admin-tab__copy strong {
  color: inherit;
  font-size: 12px;
  line-height: 1.3;
}

.admin-tab__copy small {
  overflow: hidden;
  color: var(--vp-c-text-3);
  font-size: 9px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-summary {
  margin-top: auto;
  padding: 13px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 11px;
  background: color-mix(in srgb, var(--vp-c-bg-elv) 82%, transparent);
}

.session-summary__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 11px;
  color: var(--vp-c-text-2);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.session-state {
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--admin-green-soft);
  color: var(--admin-green);
  font-size: 8px;
}

.session-state.is-expired {
  background: var(--admin-amber-soft);
  color: var(--admin-amber);
}

.session-summary dl,
.compact-details,
.detail-list,
.process-memory {
  margin: 0;
}

.session-summary dl > div,
.compact-details > div,
.detail-list > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--vp-c-divider) 72%, transparent);
}

.session-summary dl > div:last-child,
.compact-details > div:last-child,
.detail-list > div:last-child {
  border-bottom: 0;
}

.session-summary dt,
.compact-details dt,
.detail-list dt {
  color: var(--vp-c-text-3);
  font-size: 9px;
}

.session-summary dd,
.compact-details dd,
.detail-list dd {
  margin: 0;
  color: var(--vp-c-text-1);
  font-size: 9px;
  font-weight: 650;
  text-align: right;
}

.session-summary p {
  margin: 10px 0 0;
  color: var(--vp-c-text-3);
  font-size: 8px;
  line-height: 1.55;
}

.admin-main {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 26px clamp(20px, 3vw, 46px) max(42px, env(safe-area-inset-bottom));
  scrollbar-color: var(--vp-c-divider) transparent;
  scrollbar-width: thin;
}

.section-heading {
  justify-content: space-between;
  gap: 24px;
  width: min(100%, 1480px);
  margin: 0 auto 22px;
}

.section-heading h2 {
  margin: 2px 0 0;
  color: var(--vp-c-text-1);
  font-size: clamp(20px, 2vw, 26px);
  line-height: 1.2;
  letter-spacing: -.035em;
}

.section-heading p {
  margin: 3px 0 0;
  color: var(--vp-c-text-3);
  font-size: 11px;
}

.section-heading__freshness {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  color: var(--vp-c-text-3);
  font-size: 9px;
}

.section-heading__freshness strong {
  color: var(--vp-c-text-2);
  font-size: 10px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.tab-panel,
.dashboard-loading,
.dashboard-state,
.warning-banner {
  width: min(100%, 1480px);
  margin-inline: auto;
}

.tab-panel {
  animation: panel-enter .22s ease-out;
}

.warning-banner {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--admin-amber) 34%, var(--vp-c-divider));
  border-radius: 10px;
  background: var(--admin-amber-soft);
}

.warning-banner > svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: var(--admin-amber);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.warning-banner div {
  display: flex;
  flex-direction: column;
}

.warning-banner strong {
  font-size: 10px;
}

.warning-banner span {
  color: var(--vp-c-text-2);
  font-size: 9px;
}

.warning-banner button {
  padding: 5px 9px;
  border-radius: 7px;
  font-size: 9px;
  font-weight: 650;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.metric-card,
.dashboard-card,
.service-summary-card,
.runtime-identity-grid > article {
  border: 1px solid var(--vp-c-divider);
  background: color-mix(in srgb, var(--vp-c-bg-elv) 92%, transparent);
  box-shadow: 0 8px 28px color-mix(in srgb, #000 5%, transparent);
}

.metric-card {
  position: relative;
  min-width: 0;
  min-height: 116px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  overflow: hidden;
  padding: 14px;
  border-radius: 11px;
}

.metric-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 2px;
  background: var(--vp-c-divider);
}

.metric-card--brand::before {
  background: linear-gradient(90deg, var(--vp-c-brand-1), var(--vp-c-brand-2));
}

.metric-card.is-warning::before {
  background: var(--admin-amber);
}

.metric-card__label {
  margin-bottom: auto;
  color: var(--vp-c-text-3);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .035em;
  text-transform: uppercase;
}

.metric-card > strong {
  display: block;
  overflow: hidden;
  color: var(--vp-c-text-1);
  font-size: clamp(19px, 2.1vw, 27px);
  line-height: 1.15;
  letter-spacing: -.045em;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.metric-card > small {
  margin-top: 2px;
  overflow: hidden;
  color: var(--vp-c-text-3);
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-card > svg {
  position: absolute;
  right: 12px;
  top: 13px;
  width: 23px;
  height: 23px;
  fill: none;
  stroke: var(--vp-c-brand-1);
  stroke-width: 1.35;
  opacity: .45;
}

.metric-pulse {
  position: absolute;
  right: 14px;
  top: 15px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--admin-green);
  box-shadow: 0 0 0 4px var(--admin-green-soft);
}

.overview-grid,
.traffic-secondary-grid,
.services-secondary-grid,
.system-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(280px, .85fr);
  gap: 14px;
  margin-bottom: 14px;
}

.overview-grid--lower {
  grid-template-columns: minmax(0, 1.45fr) minmax(300px, .75fr);
}

.overview-grid--single {
  grid-template-columns: minmax(0, 1fr);
}

.dashboard-card {
  min-width: 0;
  border-radius: 12px;
}

.card-heading {
  min-height: 62px;
  justify-content: space-between;
  gap: 14px;
  padding: 13px 15px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.card-heading > div:first-child {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.card-heading > div:first-child > span {
  color: var(--vp-c-text-3);
  font-size: 8px;
  font-weight: 750;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.card-heading h3 {
  margin: 1px 0 0;
  overflow: hidden;
  color: var(--vp-c-text-1);
  font-size: 12px;
  line-height: 1.3;
  letter-spacing: -.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chart-legend {
  gap: 10px;
  color: var(--vp-c-text-3);
  font-size: 8px;
}

.chart-legend span {
  display: flex;
  align-items: center;
  gap: 4px;
}

.chart-legend i {
  width: 7px;
  height: 7px;
  border-radius: 2px;
  background: var(--vp-c-brand-1);
}

.chart-legend i.is-error {
  background: var(--admin-red);
}

.activity-chart {
  height: 148px;
  display: flex;
  align-items: flex-end;
  gap: clamp(2px, .45vw, 6px);
  padding: 22px 16px 14px;
  background:
    repeating-linear-gradient(to bottom, transparent 0, transparent 32px, color-mix(in srgb, var(--vp-c-divider) 55%, transparent) 33px);
}

.activity-column {
  position: relative;
  height: 100%;
  flex: 1 1 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.activity-bar {
  width: 100%;
  max-width: 15px;
  min-height: 3px;
  border-radius: 3px 3px 1px 1px;
  background: linear-gradient(to top, color-mix(in srgb, var(--vp-c-brand-1) 58%, transparent), var(--vp-c-brand-1));
  opacity: .8;
  transition: height .25s ease, opacity .16s ease;
}

.activity-column:hover .activity-bar {
  opacity: 1;
}

.activity-error {
  position: absolute;
  bottom: 0;
  width: 100%;
  max-width: 15px;
  border-radius: 2px 2px 1px 1px;
  background: var(--admin-red);
}

.card-footnote {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 15px;
  border-top: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-3);
  font-size: 8px;
}

.state-badge {
  flex: 0 0 auto;
  gap: 5px;
  padding: 4px 7px;
  border: 1px solid currentColor;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 7%, transparent);
  color: var(--vp-c-text-3);
  font-size: 8px;
  font-weight: 700;
  line-height: 1;
}

.state-badge i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.state-badge.is-operational { color: var(--admin-green); }
.state-badge.is-degraded { color: var(--admin-amber); }
.state-badge.is-outage { color: var(--admin-red); }
.state-badge.is-unknown { color: var(--vp-c-text-3); }

.health-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 17px 15px 13px;
}

.health-summary > div {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 7px;
  border-right: 1px solid var(--vp-c-divider);
}

.health-summary > div:last-child { border-right: 0; }

.health-number,
.summary-number {
  font-size: 20px;
  font-weight: 760;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.is-success { color: var(--admin-green); }
.is-warning { color: var(--admin-amber); }
.is-danger,
.danger-text { color: var(--admin-red); }

.health-summary small {
  margin-top: 4px;
  color: var(--vp-c-text-3);
  font-size: 8px;
}

.health-card .compact-details,
.client-card .compact-details {
  padding: 0 15px 12px;
}

.request-list {
  padding: 4px 15px 8px;
}

.request-row {
  min-width: 0;
  display: grid;
  grid-template-columns: 45px minmax(120px, 1fr) 38px 58px 62px;
  gap: 9px;
  min-height: 34px;
  border-bottom: 1px solid color-mix(in srgb, var(--vp-c-divider) 70%, transparent);
  color: var(--vp-c-text-2);
  font-size: 8px;
}

.request-row:last-child { border-bottom: 0; }

.request-row code,
.data-table code {
  overflow: hidden;
  color: var(--vp-c-text-1);
  font-family: var(--vp-font-family-mono);
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.request-duration,
.request-row time,
.data-table time {
  color: var(--vp-c-text-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.method-chip,
.response-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 31px;
  width: fit-content;
  padding: 2px 5px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 5px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-mono);
  font-size: 7px;
  font-weight: 750;
  line-height: 1.4;
}

.method-chip.is-get { border-color: color-mix(in srgb, var(--admin-green) 27%, var(--vp-c-divider)); background: var(--admin-green-soft); color: var(--admin-green); }
.method-chip.is-post { border-color: color-mix(in srgb, var(--vp-c-brand-1) 27%, var(--vp-c-divider)); background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); }
.method-chip.is-write { border-color: color-mix(in srgb, var(--admin-amber) 27%, var(--vp-c-divider)); background: var(--admin-amber-soft); color: var(--admin-amber); }
.method-chip.is-delete { border-color: color-mix(in srgb, var(--admin-red) 27%, var(--vp-c-divider)); background: var(--admin-red-soft); color: var(--admin-red); }

.response-chip.is-success { border-color: color-mix(in srgb, var(--admin-green) 26%, var(--vp-c-divider)); background: var(--admin-green-soft); color: var(--admin-green); }
.response-chip.is-warning { border-color: color-mix(in srgb, var(--admin-amber) 26%, var(--vp-c-divider)); background: var(--admin-amber-soft); color: var(--admin-amber); }
.response-chip.is-danger { border-color: color-mix(in srgb, var(--admin-red) 26%, var(--vp-c-divider)); background: var(--admin-red-soft); color: var(--admin-red); }

.text-button {
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: var(--vp-c-brand-1);
  font-size: 8px;
  font-weight: 700;
}

.text-button:hover { color: var(--vp-c-brand-2); }

.gauge-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 15px;
}

.gauge-row > div:first-child {
  display: flex;
  justify-content: space-between;
  color: var(--vp-c-text-2);
  font-size: 9px;
}

.gauge-row > div:first-child strong {
  color: var(--vp-c-text-1);
  font-size: 9px;
}

.progress-track {
  height: 5px;
  margin: 6px 0 4px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--vp-c-bg-soft);
}

.progress-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--vp-c-brand-2), var(--vp-c-brand-1));
  transition: width .25s ease;
}

.gauge-row small {
  color: var(--vp-c-text-3);
  font-size: 8px;
}

.inline-empty {
  min-height: 90px;
  display: grid;
  place-items: center;
  padding: 20px;
  color: var(--vp-c-text-3);
  font-size: 9px;
  text-align: center;
}

.inline-empty--large { min-height: 150px; }

.traffic-chart-card,
.table-card,
.services-card {
  margin-bottom: 14px;
}

.segmented-control {
  display: flex;
  padding: 3px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
}

.segmented-control button {
  min-height: 25px;
  padding: 0 10px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  font-size: 8px;
  font-weight: 650;
}

.segmented-control button.active {
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-brand-1);
  box-shadow: 0 1px 4px color-mix(in srgb, #000 9%, transparent);
}

.line-chart-wrap {
  padding: 12px 15px 2px;
}

.line-chart {
  width: 100%;
  height: clamp(190px, 25vw, 290px);
  overflow: visible;
  color: var(--vp-c-brand-1);
}

.chart-grid path {
  fill: none;
  stroke: var(--vp-c-divider);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.chart-area {
  fill: url(#admin-request-area);
  stroke: none;
}

.chart-line {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.chart-line--requests {
  stroke: var(--vp-c-brand-1);
  stroke-width: 2;
}

.chart-line--errors {
  stroke: var(--admin-red);
  stroke-width: 1.4;
  stroke-dasharray: 4 4;
}

.chart-axis {
  display: flex;
  justify-content: space-between;
  padding: 0 14px;
  color: var(--vp-c-text-3);
  font-size: 8px;
  font-variant-numeric: tabular-nums;
}

.chart-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  margin-top: 11px;
  border-top: 1px solid var(--vp-c-divider);
}

.chart-stats > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 15px;
  border-right: 1px solid var(--vp-c-divider);
}

.chart-stats > div:last-child { border-right: 0; }
.chart-stats span { color: var(--vp-c-text-3); font-size: 8px; }
.chart-stats strong { font-size: 12px; font-variant-numeric: tabular-nums; }

.traffic-secondary-grid {
  grid-template-columns: minmax(0, 1.25fr) minmax(280px, .75fr);
}

.card-total,
.record-count {
  color: var(--vp-c-text-3);
  font-size: 9px;
  font-weight: 650;
  white-space: nowrap;
}

.distribution-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 15px;
}

.distribution-row {
  display: grid;
  grid-template-columns: 38px minmax(80px, 1fr) 48px 42px;
  align-items: center;
  gap: 9px;
}

.distribution-bar {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--vp-c-bg-soft);
}

.distribution-bar span {
  display: block;
  height: 100%;
  min-width: 2px;
  border-radius: inherit;
  background: var(--vp-c-text-3);
}

.distribution-bar span.is-success { background: var(--admin-green); }
.distribution-bar span.is-warning { background: var(--admin-amber); }
.distribution-bar span.is-danger { background: var(--admin-red); }
.distribution-row > strong { color: var(--vp-c-text-2); font-size: 9px; text-align: right; }
.distribution-row > small { color: var(--vp-c-text-3); font-size: 8px; text-align: right; }

.client-comparison {
  display: grid;
  grid-template-columns: 1fr 64px 1fr;
  align-items: end;
  gap: 10px;
  padding: 19px 15px 14px;
}

.client-comparison > div {
  display: flex;
  flex-direction: column;
}

.client-comparison span { color: var(--vp-c-text-3); font-size: 8px; }
.client-comparison strong { font-size: 20px; line-height: 1.2; font-variant-numeric: tabular-nums; }
.client-comparison svg { width: 64px; height: 32px; fill: none; stroke: var(--vp-c-brand-1); stroke-width: 2; stroke-linecap: round; }

.data-table-wrap {
  width: 100%;
  overflow-x: auto;
  scrollbar-color: var(--vp-c-divider) transparent;
  scrollbar-width: thin;
}

.data-table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
  color: var(--vp-c-text-2);
  font-size: 9px;
  text-align: left;
}

.data-table th {
  padding: 9px 13px;
  border-bottom: 1px solid var(--vp-c-divider);
  background: color-mix(in srgb, var(--vp-c-bg-soft) 73%, transparent);
  color: var(--vp-c-text-3);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: .035em;
  text-transform: uppercase;
  white-space: nowrap;
}

.data-table td {
  height: 42px;
  padding: 8px 13px;
  border-bottom: 1px solid color-mix(in srgb, var(--vp-c-divider) 72%, transparent);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.data-table tr:last-child td { border-bottom: 0; }
.data-table tbody tr:hover { background: color-mix(in srgb, var(--vp-c-bg-soft) 55%, transparent); }
.data-table td:first-child { max-width: 440px; }
.data-table td:first-child .method-chip { margin-right: 8px; }
.data-table code { display: inline-block; max-width: min(32vw, 400px); vertical-align: middle; }
.request-table td:nth-child(3) { max-width: 520px; }
.request-table td:nth-child(3) code { max-width: min(45vw, 500px); }

.service-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.service-summary-card {
  min-width: 0;
  min-height: 91px;
  gap: 12px;
  padding: 13px;
  border-radius: 11px;
}

.service-summary-card > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.service-summary-card div > span {
  color: var(--vp-c-text-3);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: .035em;
  text-transform: uppercase;
}

.service-summary-card div > strong {
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.service-summary-card div > small {
  overflow: hidden;
  color: var(--vp-c-text-3);
  font-size: 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-orb {
  position: relative;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--vp-c-bg-soft);
}

.status-orb i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--vp-c-text-3);
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--vp-c-text-3) 11%, transparent);
}

.service-summary-card.is-operational .status-orb i { background: var(--admin-green); box-shadow: 0 0 0 5px var(--admin-green-soft); }
.service-summary-card.is-degraded .status-orb i { background: var(--admin-amber); box-shadow: 0 0 0 5px var(--admin-amber-soft); }
.service-summary-card.is-outage .status-orb i { background: var(--admin-red); box-shadow: 0 0 0 5px var(--admin-red-soft); }

.summary-number {
  min-width: 34px;
  text-align: center;
}

.service-list {
  padding: 4px 15px 8px;
}

.service-row-card {
  min-width: 0;
  display: grid;
  grid-template-columns: 10px minmax(180px, .9fr) minmax(150px, 1.3fr) 70px 82px;
  gap: 12px;
  min-height: 55px;
  border-bottom: 1px solid color-mix(in srgb, var(--vp-c-divider) 72%, transparent);
}

.service-row-card:last-child { border-bottom: 0; }

.service-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--vp-c-text-3);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--vp-c-text-3) 10%, transparent);
}

.service-dot.is-operational { background: var(--admin-green); box-shadow: 0 0 0 3px var(--admin-green-soft); }
.service-dot.is-degraded { background: var(--admin-amber); box-shadow: 0 0 0 3px var(--admin-amber-soft); }
.service-dot.is-outage { background: var(--admin-red); box-shadow: 0 0 0 3px var(--admin-red-soft); }

.service-identity {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.service-identity > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.service-identity strong,
.service-identity span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.service-identity strong { font-size: 9px; }
.service-identity span { color: var(--vp-c-text-3); font-size: 8px; }
.service-identity a { flex: 0 0 auto; color: var(--vp-c-text-3); }
.service-identity a:hover { color: var(--vp-c-brand-1); }
.service-identity a svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

.service-history {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 3px;
}

.service-history > span {
  height: 20px;
  flex: 1 1 0;
  max-width: 8px;
  min-width: 3px;
  border-radius: 2px;
  background: var(--vp-c-divider);
}

.service-history > span.is-operational { background: color-mix(in srgb, var(--admin-green) 75%, var(--vp-c-bg)); }
.service-history > span.is-degraded { background: color-mix(in srgb, var(--admin-amber) 78%, var(--vp-c-bg)); }
.service-history > span.is-outage { background: color-mix(in srgb, var(--admin-red) 78%, var(--vp-c-bg)); }

.service-latency {
  display: flex;
  flex-direction: column;
}

.service-latency span { color: var(--vp-c-text-3); font-size: 7px; }
.service-latency strong { font-size: 9px; font-variant-numeric: tabular-nums; }

.services-secondary-grid,
.system-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.integration-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 13px;
}

.integration-item {
  min-width: 0;
  gap: 9px;
  padding: 9px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 9px;
  background: var(--vp-c-bg-soft);
}

.integration-icon {
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-text-3);
}

.integration-icon svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.8; }
.integration-item > div { min-width: 0; display: flex; flex: 1; flex-direction: column; }
.integration-item strong,
.integration-item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.integration-item strong { font-size: 8px; }
.integration-item div span { color: var(--vp-c-text-3); font-size: 7px; }
.integration-item > i { width: 6px; height: 6px; flex: 0 0 6px; border-radius: 50%; background: var(--vp-c-text-3); }
.integration-item.is-enabled { border-color: color-mix(in srgb, var(--admin-green) 23%, var(--vp-c-divider)); background: var(--admin-green-soft); }
.integration-item.is-enabled .integration-icon { color: var(--admin-green); }
.integration-item.is-enabled > i { background: var(--admin-green); box-shadow: 0 0 0 3px var(--admin-green-soft); }

.knowledge-identity {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 14px 15px 10px;
}

.knowledge-identity > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 9px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
}

.knowledge-identity span,
.knowledge-stats span { color: var(--vp-c-text-3); font-size: 7px; }
.knowledge-identity strong { overflow: hidden; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }

.knowledge-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 3px 15px 14px;
}

.knowledge-stats > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 6px 9px;
  border-right: 1px solid var(--vp-c-divider);
}

.knowledge-stats > div:first-child { padding-left: 0; }
.knowledge-stats > div:last-child { padding-right: 0; border-right: 0; }
.knowledge-stats strong { overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }

.details-card .detail-list {
  padding: 6px 15px 11px;
}

.detail-list > div {
  align-items: flex-start;
}

.detail-list dd {
  max-width: 65%;
  overflow-wrap: anywhere;
}

.runtime-identity-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.runtime-identity-grid > article {
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 13px;
  border-radius: 11px;
}

.runtime-identity-grid span { color: var(--vp-c-text-3); font-size: 8px; font-weight: 700; letter-spacing: .035em; text-transform: uppercase; }
.runtime-identity-grid strong { margin-top: 8px; overflow: hidden; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
.runtime-identity-grid small { overflow: hidden; color: var(--vp-c-text-3); font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }

.utilization-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 16px;
}

.utilization-row {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 11px;
}

.radial-gauge {
  --gauge: 0%;
  width: 56px;
  height: 56px;
  flex: 0 0 56px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: conic-gradient(var(--vp-c-brand-1) var(--gauge), var(--vp-c-bg-soft) 0);
}

.radial-gauge::before {
  content: '';
  grid-area: 1 / 1;
  width: 44px;
  height: 44px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 50%;
  background: var(--vp-c-bg-elv);
}

.radial-gauge strong {
  z-index: 1;
  grid-area: 1 / 1;
  font-size: 9px;
}

.radial-gauge.is-secondary { background: conic-gradient(var(--admin-green) var(--gauge), var(--vp-c-bg-soft) 0); }
.radial-gauge.is-tertiary { background: conic-gradient(var(--admin-amber) var(--gauge), var(--vp-c-bg-soft) 0); }

.utilization-row > div:last-child {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.utilization-row span { color: var(--vp-c-text-3); font-size: 8px; }
.utilization-row > div:last-child strong,
.utilization-row > div:last-child small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.utilization-row > div:last-child strong { font-size: 9px; }
.utilization-row small { color: var(--vp-c-text-3); font-size: 7px; }

.process-memory {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 14px;
}

.process-memory > div {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 1px 8px;
  padding: 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
}

.process-memory dt { color: var(--vp-c-text-2); font-size: 8px; }
.process-memory dd { margin: 0; font-size: 9px; font-weight: 700; text-align: right; }
.process-memory span { grid-column: 1 / -1; color: var(--vp-c-text-3); font-size: 7px; }

.security-shield {
  width: 31px;
  height: 31px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: var(--admin-green-soft);
  color: var(--admin-green);
}

.security-shield.has-warning {
  background: var(--admin-amber-soft);
  color: var(--admin-amber);
}

.security-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  padding: 14px;
}

.security-stats > div {
  display: flex;
  flex-direction: column;
  padding: 11px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 9px;
  background: var(--vp-c-bg-soft);
}

.security-stats > div.is-alert { border-color: color-mix(in srgb, var(--admin-amber) 30%, var(--vp-c-divider)); background: var(--admin-amber-soft); }
.security-stats span { color: var(--vp-c-text-3); font-size: 8px; }
.security-stats strong { margin: 4px 0; font-size: 19px; line-height: 1; }
.security-stats small { color: var(--vp-c-text-3); font-size: 7px; }

.session-expiry {
  gap: 10px;
  margin: 0 14px 14px;
  padding: 9px 11px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
}

.session-expiry svg { width: 17px; height: 17px; fill: none; stroke: var(--vp-c-brand-1); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.session-expiry div { display: flex; flex-direction: column; }
.session-expiry span { color: var(--vp-c-text-3); font-size: 7px; }
.session-expiry strong { font-size: 9px; font-variant-numeric: tabular-nums; }

.dashboard-state {
  min-height: min(560px, 70vh);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 44px 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  background: color-mix(in srgb, var(--vp-c-bg-elv) 88%, transparent);
  text-align: center;
}

.dashboard-state__icon {
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  margin-bottom: 18px;
  border-radius: 15px;
  background: var(--vp-c-bg-soft);
}

.dashboard-state__icon.is-warning { background: var(--admin-amber-soft); color: var(--admin-amber); }
.dashboard-state__icon.is-danger { background: var(--admin-red-soft); color: var(--admin-red); }
.dashboard-state__icon svg { width: 27px; height: 27px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.dashboard-state h2 { margin: 5px 0 7px; font-size: 22px; letter-spacing: -.03em; }
.dashboard-state p { max-width: 500px; margin: 0; color: var(--vp-c-text-2); font-size: 11px; }
.dashboard-state__actions { display: flex; gap: 8px; margin-top: 21px; }
.dashboard-state > .primary-button { margin-top: 21px; }

.primary-button,
.secondary-button {
  min-height: 36px;
  padding: 0 14px;
  border-radius: 9px;
  font-size: 10px;
  font-weight: 700;
}

.primary-button {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  color: var(--vp-c-white);
}

.primary-button:hover { border-color: var(--vp-c-brand-2); background: var(--vp-c-brand-2); transform: translateY(-1px); }

.dashboard-loading {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: 11px;
  background: var(--vp-c-bg-soft);
}

.skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--vp-c-bg-elv) 75%, transparent), transparent);
  transform: translateX(-100%);
  animation: skeleton-sweep 1.35s ease-in-out infinite;
}

.skeleton--hero { height: 42px; }
.skeleton-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
.skeleton-grid--wide { grid-template-columns: 1.6fr 1fr; }
.skeleton--metric { height: 116px; }
.skeleton--panel { height: 290px; }

.admin-dashboard-enter-active,
.admin-dashboard-leave-active {
  transition: opacity .18s ease, transform .18s ease;
}

.admin-dashboard-enter-from,
.admin-dashboard-leave-to {
  opacity: 0;
  transform: scale(.995);
}

@keyframes live-pulse {
  0% { opacity: .7; transform: scale(.55); }
  70%, 100% { opacity: 0; transform: scale(1.25); }
}

@keyframes admin-spin { to { transform: rotate(360deg); } }

@keyframes panel-enter {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes skeleton-sweep { to { transform: translateX(100%); } }

@media (max-width: 1180px) {
  .metric-grid { grid-template-columns: repeat(3, 1fr); }
  .service-summary-grid,
  .runtime-identity-grid { grid-template-columns: repeat(2, 1fr); }
  .utilization-list { grid-template-columns: 1fr; }
  .utilization-row { justify-content: center; }
}

@media (max-width: 900px) {
  .admin-topbar { grid-template-columns: 1fr auto; }
  .admin-topbar__status { display: none; }
  .admin-workspace { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
  .admin-sidebar {
    z-index: 3;
    display: block;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 8px max(14px, env(safe-area-inset-right)) 8px max(14px, env(safe-area-inset-left));
    border-right: 0;
    border-bottom: 1px solid var(--vp-c-divider);
    background: color-mix(in srgb, var(--vp-c-bg-alt) 91%, transparent);
    backdrop-filter: blur(18px);
    scrollbar-width: none;
  }
  .admin-sidebar::-webkit-scrollbar { display: none; }
  .admin-tabs { min-width: max-content; flex-direction: row; gap: 6px; }
  .admin-tab { width: auto; min-width: 118px; padding: 7px 10px; }
  .admin-tab.is-active::before { inset: auto 12px -9px; width: auto; height: 2px; border-radius: 4px 4px 0 0; }
  .admin-tab__icon { width: 27px; height: 27px; flex-basis: 27px; }
  .admin-tab__icon svg { width: 14px; height: 14px; }
  .admin-tab__copy small { display: none; }
  .session-summary { display: none; }
  .admin-main { padding-top: 20px; }
  .overview-grid,
  .overview-grid--lower,
  .traffic-secondary-grid { grid-template-columns: 1fr; }
  .activity-chart { height: 175px; }
}

@media (max-width: 680px) {
  .admin-topbar {
    min-height: 62px;
    gap: 10px;
    padding-top: max(9px, env(safe-area-inset-top));
    padding-bottom: 9px;
  }
  .admin-brand__mark { width: 34px; height: 34px; flex-basis: 34px; }
  .admin-brand__eyebrow { display: none; }
  .admin-brand h1 { font-size: 13px; }
  .icon-action { width: 35px; padding: 0; }
  .icon-action span { display: none; }
  .admin-main { padding: 17px 12px max(30px, env(safe-area-inset-bottom)); }
  .section-heading { margin-bottom: 15px; }
  .section-heading__freshness { display: none; }
  .section-heading h2 { font-size: 20px; }
  .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .metric-card { min-height: 108px; padding: 12px; }
  .metric-card > strong { font-size: 21px; }
  .services-secondary-grid,
  .system-grid,
  .service-summary-grid,
  .runtime-identity-grid { grid-template-columns: 1fr; }
  .service-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .chart-stats { grid-template-columns: repeat(2, 1fr); }
  .chart-stats > div:nth-child(2) { border-right: 0; }
  .chart-stats > div:nth-child(-n + 2) { border-bottom: 1px solid var(--vp-c-divider); }
  .card-heading--responsive { align-items: flex-start; flex-direction: column; }
  .line-chart { height: 190px; }
  .request-row { grid-template-columns: 42px minmax(100px, 1fr) 36px 54px; }
  .request-row time { display: none; }
  .service-row-card { grid-template-columns: 8px minmax(150px, 1fr) 60px 78px; gap: 9px; }
  .service-history { display: none; }
  .integration-grid { grid-template-columns: 1fr; }
  .utilization-list { align-items: stretch; }
  .utilization-row { justify-content: flex-start; }
  .warning-banner { grid-template-columns: auto 1fr; }
  .warning-banner button { grid-column: 2; justify-self: start; }
  .skeleton-grid { grid-template-columns: repeat(2, 1fr); }
  .skeleton-grid--wide { grid-template-columns: 1fr; }
}

@media (max-width: 420px) {
  .admin-brand h1 { max-width: 138px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .refresh-action { display: none; }
  .admin-tab { min-width: 102px; }
  .metric-card { min-height: 101px; }
  .metric-card > strong { font-size: 19px; }
  .service-summary-grid { grid-template-columns: 1fr; }
  .process-memory,
  .security-stats,
  .knowledge-identity { grid-template-columns: 1fr; }
  .knowledge-stats { grid-template-columns: 1fr; gap: 6px; }
  .knowledge-stats > div { padding: 4px 0; border-right: 0; border-bottom: 1px solid var(--vp-c-divider); }
  .knowledge-stats > div:last-child { border-bottom: 0; }
  .distribution-row { grid-template-columns: 38px minmax(60px, 1fr) 42px; }
  .distribution-row > small { display: none; }
  .client-comparison { grid-template-columns: 1fr 45px 1fr; }
  .client-comparison svg { width: 45px; }
  .dashboard-state__actions { width: 100%; flex-direction: column; }
}

@media (prefers-reduced-motion: reduce) {
  .admin-dashboard *,
  .admin-dashboard *::before,
  .admin-dashboard *::after {
    scroll-behavior: auto !important;
    animation-duration: .001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .001ms !important;
  }
}
</style>
