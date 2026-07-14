<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { withBase } from 'vitepress'

type ServiceState = 'operational' | 'degraded' | 'outage' | 'unknown'

interface StatusHistory {
  status: ServiceState
  latencyMs: number | null
  checkedAt: string | null
}

interface UptimeWindows {
  h1: number | null
  h12: number | null
  h24: number | null
  d7: number | null
  d30: number | null
}

interface StatusService {
  id: string
  name: string
  group: string
  groupOrder: number
  kind: 'community'
  url: string | null
  hostname: string | null
  status: ServiceState
  latencyMs: number | null
  checkedAt: string | null
  history: StatusHistory[]
  uptimePercent?: number | null
  uptimeWindows?: UptimeWindows | null
  lastStateChangeAt?: string | null
  upSince?: string | null
  downSince?: string | null
  httpStatus?: number | null
  checkDurationMs?: number | null
  attemptCount?: number | null
  statusDetail?: string | null
}

interface StatusSummary {
  total: number
  operational: number
  degraded: number
  outages: number
  unknown: number
}

interface StatusPayload {
  provider: StatusProvider
  updatedAt: string
  partial: boolean
  notices: string[]
  summary: StatusSummary
  services: StatusService[]
  source: {
    label: string
    url: string
  }
}

type StatusProvider = 'ibbylabs' | 'stremio-status'

const STATUS_PROVIDER_STORAGE_KEY = 'nuvio-status-provider'
const statusProviders: { id: StatusProvider; label: string }[] = [
  { id: 'ibbylabs', label: 'Ibby Labs' },
  { id: 'stremio-status', label: 'Stremio Status' }
]

const uptimeWindowOptions: { key: keyof UptimeWindows; shortLabel: string; label: string }[] = [
  { key: 'h1', shortLabel: '1h', label: 'Past hour' },
  { key: 'h12', shortLabel: '12h', label: 'Past 12 hours' },
  { key: 'h24', shortLabel: '24h', label: 'Past 24 hours' },
  { key: 'd7', shortLabel: '7d', label: 'Past 7 days' },
  { key: 'd30', shortLabel: '30d', label: 'Past 30 days' }
]

interface ServiceGroup {
  name: string
  order: number
  services: StatusService[]
}

const statusData = ref<StatusPayload | null>(null)
const isLoading = ref(true)
const isRefreshing = ref(false)
const errorMessage = ref('')
const searchQuery = ref('')
const selectedGroup = ref('all')
const issuesOnly = ref(false)
const lastLoadedAt = ref(0)
const selectedProvider = ref<StatusProvider>('ibbylabs')
const expandedServices = ref<Set<string>>(new Set())

let refreshTimer: ReturnType<typeof setInterval> | undefined
let requestController: AbortController | undefined

const communityServices = computed(() =>
  statusData.value?.services.filter((service) => service.kind === 'community') || []
)

const groupOptions = computed(() => {
  const groups = new Map<string, { order: number; count: number }>()
  for (const service of communityServices.value) {
    const existing = groups.get(service.group)
    groups.set(service.group, {
      order: Math.min(existing?.order ?? service.groupOrder, service.groupOrder),
      count: (existing?.count ?? 0) + 1
    })
  }

  return [...groups.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([name, details]) => ({ name, ...details }))
})

const visibleGroups = computed<ServiceGroup[]>(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  const groups = new Map<string, ServiceGroup>()

  for (const service of communityServices.value) {
    if (selectedGroup.value !== 'all' && service.group !== selectedGroup.value) continue
    if (issuesOnly.value && service.status === 'operational') continue
    if (query && !`${service.name} ${service.hostname || ''} ${service.group}`.toLocaleLowerCase().includes(query)) {
      continue
    }

    const group = groups.get(service.group) || {
      name: service.group,
      order: service.groupOrder,
      services: []
    }
    group.services.push(service)
    groups.set(service.group, group)
  }

  return [...groups.values()]
    .sort((a, b) => a.order - b.order)
    .map((group) => ({
      ...group,
      services: group.services.sort((a, b) => a.name.localeCompare(b.name))
    }))
})

const visibleServiceCount = computed(() =>
  visibleGroups.value.reduce((total, group) => total + group.services.length, 0)
)

async function loadStatus(manual = false) {
  requestController?.abort()
  requestController = new AbortController()
  if (manual) isRefreshing.value = true
  if (!statusData.value) isLoading.value = true
  errorMessage.value = ''

  try {
    const provider = selectedProvider.value
    const response = await fetch(`${withBase('/api/status')}?provider=${encodeURIComponent(provider)}`, {
      signal: requestController.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    })
    if (!response.ok) throw new Error(`Status request failed with HTTP ${response.status}`)
    const payload = await response.json() as StatusPayload
    if (provider !== selectedProvider.value) return
    statusData.value = payload
    lastLoadedAt.value = Date.now()
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      errorMessage.value = 'Live status could not be loaded. Please try again in a moment.'
    }
  } finally {
    isLoading.value = false
    isRefreshing.value = false
  }
}

function selectProvider(provider: StatusProvider) {
  if (provider === selectedProvider.value) return
  selectedProvider.value = provider
  localStorage.setItem(STATUS_PROVIDER_STORAGE_KEY, provider)
  statusData.value = null
  selectedGroup.value = 'all'
  expandedServices.value = new Set()
  loadStatus()
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible' && Date.now() - lastLoadedAt.value > 90_000) {
    loadStatus()
  }
}

function selectGroup(group: string) {
  selectedGroup.value = group
}

function clearFilters() {
  searchQuery.value = ''
  selectedGroup.value = 'all'
  issuesOnly.value = false
}

function formatLatency(latencyMs: number | null) {
  if (latencyMs === null) return '—'
  if (latencyMs >= 1_000) return `${(latencyMs / 1_000).toFixed(1)} s`
  return `${latencyMs} ms`
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  const precision = Number.isInteger(value) ? 0 : value >= 99 ? 2 : 1
  const formatted = value.toFixed(precision)
  return `${precision ? formatted.replace(/0+$/, '').replace(/\.$/, '') : formatted}%`
}

function formatCheckedAt(value: string | null) {
  if (!value) return 'Not checked yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not checked yet'

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date)
}

function statusLabel(status: ServiceState) {
  return {
    operational: 'Operational',
    degraded: 'Degraded',
    outage: 'Outage',
    unknown: 'Unknown'
  }[status]
}

function uptimeState(value: number | null): ServiceState {
  if (value === null) return 'unknown'
  if (value >= 99.5) return 'operational'
  if (value >= 95) return 'degraded'
  return 'outage'
}

function activityBars(service: StatusService) {
  const windows = service.uptimeWindows
  if (windows) {
    return uptimeWindowOptions.map(({ key, label }) => {
      const value = windows[key]
      return {
        key,
        status: uptimeState(value),
        height: value === null ? 7 : Math.round(7 + (value / 100) * 15),
        title: `${label}: ${formatPercent(value)} uptime`
      }
    })
  }

  return (service.history || []).slice(-12).map((check, index) => ({
    key: `${check.checkedAt || 'check'}-${index}`,
    status: check.status,
    height: 22,
    title: `${statusLabel(check.status)} · ${formatLatency(check.latencyMs)} · ${formatCheckedAt(check.checkedAt)}`
  }))
}

function activityLabel(service: StatusService) {
  return service.uptimeWindows ? 'Uptime by time window' : 'Recent checks'
}

function toggleService(serviceId: string) {
  const next = new Set(expandedServices.value)
  if (next.has(serviceId)) next.delete(serviceId)
  else next.add(serviceId)
  expandedServices.value = next
}

function detailItems(service: StatusService) {
  const items: { label: string; value: string }[] = []
  if (service.uptimePercent !== null && service.uptimePercent !== undefined) {
    items.push({ label: 'Overall uptime', value: formatPercent(service.uptimePercent) })
  }
  if (service.httpStatus !== null && service.httpStatus !== undefined) {
    items.push({ label: 'Last response', value: `HTTP ${service.httpStatus}` })
  }
  if (service.checkDurationMs !== null && service.checkDurationMs !== undefined) {
    items.push({ label: 'Full check', value: formatLatency(service.checkDurationMs) })
  }
  if (service.attemptCount !== null && service.attemptCount !== undefined) {
    items.push({ label: 'Attempts', value: String(service.attemptCount) })
  }
  if (service.checkedAt) items.push({ label: 'Last checked', value: formatFullDate(service.checkedAt) })
  if (service.status === 'outage' && service.downSince) {
    items.push({ label: 'Down since', value: formatFullDate(service.downSince) })
  } else if (service.upSince) {
    items.push({ label: 'Up since', value: formatFullDate(service.upSince) })
  }
  if (service.lastStateChangeAt) {
    items.push({ label: 'State changed', value: formatFullDate(service.lastStateChangeAt) })
  }
  return items
}

function formatFullDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

function groupAvailableCount(group: ServiceGroup) {
  return group.services.filter((service) =>
    service.status === 'operational' || service.status === 'degraded'
  ).length
}

onMounted(() => {
  const savedProvider = localStorage.getItem(STATUS_PROVIDER_STORAGE_KEY)
  if (savedProvider === 'ibbylabs' || savedProvider === 'stremio-status') {
    selectedProvider.value = savedProvider
  }
  loadStatus()
  refreshTimer = setInterval(() => loadStatus(), 60_000)
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  requestController?.abort()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <main class="status-page">
    <div class="status-shell">
      <header class="status-header">
        <div class="status-heading-row">
          <div>
            <h1>Status</h1>
            <p>Nuvio and the services it relies on.</p>
          </div>
          <button
            class="refresh-button"
            type="button"
            :disabled="isLoading || isRefreshing"
            @click="loadStatus(true)"
          >
            <svg :class="{ spinning: isRefreshing }" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v6h-6" />
            </svg>
            {{ isRefreshing ? 'Refreshing' : 'Refresh' }}
          </button>
        </div>

        <div class="provider-picker" role="group" aria-label="Status data provider">
          <span>Source</span>
          <button
            v-for="provider in statusProviders"
            :key="provider.id"
            type="button"
            :class="{ active: selectedProvider === provider.id }"
            :aria-pressed="selectedProvider === provider.id"
            @click="selectProvider(provider.id)"
          >
            {{ provider.label }}
          </button>
        </div>

        <div v-if="statusData" class="status-overview" aria-label="Current status summary">
          <span><i class="is-operational" aria-hidden="true"></i>{{ statusData.summary.operational }} operating</span>
          <span v-if="statusData.summary.degraded"><i class="is-degraded" aria-hidden="true"></i>{{ statusData.summary.degraded }} degraded</span>
          <span v-if="statusData.summary.outages"><i class="is-outage" aria-hidden="true"></i>{{ statusData.summary.outages }} down</span>
          <span class="status-overview__updated">Updated {{ formatCheckedAt(statusData.updatedAt) }}</span>
        </div>

        <div v-if="errorMessage" class="status-error" role="alert">
          <div>
            <strong>Status data is unavailable</strong>
            <span>{{ errorMessage }}</span>
          </div>
          <button type="button" @click="loadStatus(true)">Try again</button>
        </div>
      </header>

      <div v-if="isLoading" class="status-loading" aria-label="Loading service status">
        <div class="loading-feature"></div>
        <div class="loading-controls"></div>
        <div v-for="index in 3" :key="index" class="loading-group"></div>
      </div>

      <template v-else-if="statusData">
        <section class="community-section" aria-labelledby="community-heading">
          <div class="community-heading">
            <div>
              <h2 id="community-heading">Services</h2>
              <p>Nuvio, community instances and the APIs used by the app.</p>
            </div>
            <span>{{ communityServices.length }} monitored</span>
          </div>

          <div class="status-controls">
            <label class="search-field">
              <span class="sr-only">Search services</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>
              <input v-model="searchQuery" type="search" placeholder="Search services or hosts" />
            </label>
            <button
              class="issues-toggle"
              :class="{ active: issuesOnly }"
              type="button"
              :aria-pressed="issuesOnly"
              @click="issuesOnly = !issuesOnly"
            >
              <span aria-hidden="true"></span>
              Issues only
            </button>
          </div>

          <div class="group-filter" role="group" aria-label="Filter by service category">
            <button
              type="button"
              :class="{ active: selectedGroup === 'all' }"
              @click="selectGroup('all')"
            >
              All <span>{{ communityServices.length }}</span>
            </button>
            <button
              v-for="group in groupOptions"
              :key="group.name"
              type="button"
              :class="{ active: selectedGroup === group.name }"
              @click="selectGroup(group.name)"
            >
              {{ group.name.replace(' Instances', '') }} <span>{{ group.count }}</span>
            </button>
          </div>

          <div v-if="visibleGroups.length" class="service-groups">
            <section v-for="group in visibleGroups" :key="group.name" class="service-group">
              <header class="service-group__header">
                <div>
                  <h3>{{ group.name }}</h3>
                  <span>{{ groupAvailableCount(group) }} of {{ group.services.length }} available</span>
                </div>
                <div class="group-health" aria-hidden="true">
                  <span
                    v-for="service in group.services"
                    :key="service.id"
                    :class="`is-${service.status}`"
                  ></span>
                </div>
              </header>

              <div class="service-list">
                <article v-for="service in group.services" :key="service.id" class="service-row">
                  <div class="service-row__summary">
                    <div class="service-identity">
                      <span class="service-dot" :class="`is-${service.status}`" aria-hidden="true"></span>
                      <div>
                        <a
                          v-if="service.url"
                          :href="service.url"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {{ service.name }}
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M14 5h5v5M19 5l-9 9M19 14v5H5V5h5" />
                          </svg>
                        </a>
                        <strong v-else>{{ service.name }}</strong>
                        <span>{{ service.hostname || 'Host unavailable' }}</span>
                      </div>
                    </div>

                    <div class="service-activity" :aria-label="activityLabel(service)">
                      <span
                        v-for="bar in activityBars(service)"
                        :key="bar.key"
                        class="activity-bar"
                        :class="`is-${bar.status}`"
                        :style="{ height: `${bar.height}px` }"
                        :title="bar.title"
                      ></span>
                    </div>

                    <div class="service-uptime">
                      <span>24h uptime</span>
                      <strong>{{ formatPercent(service.uptimeWindows?.h24) }}</strong>
                    </div>

                    <div class="service-latency">
                      <span>Latency</span>
                      <strong>{{ formatLatency(service.latencyMs) }}</strong>
                    </div>

                    <span class="service-state" :class="`is-${service.status}`">
                      <span aria-hidden="true"></span>
                      {{ statusLabel(service.status) }}
                    </span>

                    <button
                      class="service-expand"
                      type="button"
                      :aria-expanded="expandedServices.has(service.id)"
                      :aria-label="`${expandedServices.has(service.id) ? 'Hide' : 'Show'} details for ${service.name}`"
                      @click="toggleService(service.id)"
                    >
                      <svg :class="{ expanded: expandedServices.has(service.id) }" viewBox="0 0 20 20" aria-hidden="true">
                        <path d="m6 8 4 4 4-4" />
                      </svg>
                    </button>
                  </div>

                  <div v-if="expandedServices.has(service.id)" class="service-details">
                    <div v-if="service.uptimeWindows" class="uptime-windows" aria-label="Uptime by time window">
                      <div v-for="window in uptimeWindowOptions" :key="window.key">
                        <span>{{ window.shortLabel }}</span>
                        <strong>{{ formatPercent(service.uptimeWindows[window.key]) }}</strong>
                      </div>
                    </div>
                    <dl class="service-facts">
                      <div v-for="item in detailItems(service)" :key="item.label">
                        <dt>{{ item.label }}</dt>
                        <dd>{{ item.value }}</dd>
                      </div>
                    </dl>
                    <p v-if="service.statusDetail" class="service-detail-note">{{ service.statusDetail }}</p>
                  </div>
                </article>
              </div>
            </section>
          </div>

          <div v-else class="empty-state">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <strong>No services match these filters</strong>
            <span>Try another search or show all service states.</span>
            <button type="button" @click="clearFilters">Clear filters</button>
          </div>

          <footer class="status-note">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5M12 8h.01" />
            </svg>
            <p>
              Community checks come from an independent monitor and can differ from your own connection.
              A failed check does not necessarily mean a service is unavailable everywhere.
              <a :href="statusData.source.url" target="_blank" rel="noopener noreferrer">View source monitor</a>.
            </p>
          </footer>
        </section>
      </template>
    </div>
  </main>
</template>

<style scoped>
.status-page {
  --status-green: #16a36a;
  --status-green-soft: color-mix(in srgb, var(--status-green) 11%, transparent);
  --status-amber: #d28a13;
  --status-amber-soft: color-mix(in srgb, var(--status-amber) 12%, transparent);
  --status-red: #dc4d5f;
  --status-red-soft: color-mix(in srgb, var(--status-red) 10%, transparent);
  --status-muted: var(--vp-c-text-3);
  min-height: calc(100vh - var(--vp-nav-height));
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}

.status-shell {
  width: min(1120px, calc(100% - 40px));
  margin: 0 auto;
  padding: clamp(42px, 6vw, 68px) 0 80px;
}

.status-header {
  margin-bottom: 38px;
}

.status-heading-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 32px;
}

.status-heading-row h1 {
  margin: 0;
  font-size: clamp(36px, 5vw, 48px);
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 1.05;
}

.status-heading-row p {
  max-width: 610px;
  margin: 10px 0 0;
  color: var(--vp-c-text-2);
  font-size: 15px;
  line-height: 1.55;
}

.refresh-button,
.status-error button,
.empty-state button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 15px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 9px;
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-text-1);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
}

.refresh-button:hover,
.status-error button:hover,
.empty-state button:hover {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 50%, var(--vp-c-divider));
  background: var(--vp-c-bg-soft);
}

.refresh-button:active,
.status-error button:active,
.empty-state button:active { transform: translateY(1px); }
.refresh-button:disabled { cursor: wait; opacity: 0.65; }

.refresh-button svg,
.status-error svg,
.empty-state svg,
.search-field svg,
.status-note svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.refresh-button svg.spinning { animation: spin 800ms linear infinite; }

.provider-picker {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 20px;
}

.provider-picker > span {
  margin-right: 3px;
  color: var(--vp-c-text-3);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.provider-picker button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 11px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-text-2);
  font: inherit;
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
}

.provider-picker button:hover { background: var(--vp-c-bg-soft); }
.provider-picker button.active {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 35%, var(--vp-c-divider));
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

.status-overview {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin-top: 17px;
  color: var(--vp-c-text-2);
  font-size: 11px;
}

.status-overview > span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.status-overview i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--status-muted);
}

.status-overview i.is-operational { background: var(--status-green); }
.status-overview i.is-degraded { background: var(--status-amber); }
.status-overview i.is-outage { background: var(--status-red); }
.status-overview__updated { color: var(--vp-c-text-3); }

.provider-picker small {
  padding: 2px 5px;
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 10%, transparent);
  font-size: 8px;
  font-weight: 750;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.status-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-top: 38px;
  padding: 20px 22px;
  border: 1px solid color-mix(in srgb, var(--status-red) 28%, var(--vp-c-divider));
  border-radius: 14px;
  background: var(--status-red-soft);
}

.status-error > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.status-error strong { font-size: 14px; }
.status-error span { color: var(--vp-c-text-2); font-size: 13px; }

.service-identity a {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--vp-c-text-3);
  text-decoration: none;
  transition: color 150ms ease;
}

.service-identity a:hover { color: var(--vp-c-brand-1); }

.service-identity a svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.service-activity {
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  gap: 3px;
  min-width: 37px;
  height: 22px;
}

.activity-bar {
  display: block;
  width: 5px;
  border-radius: 3px;
  background: var(--status-muted);
}

.activity-bar.is-operational { background: var(--status-green); }
.activity-bar.is-degraded { background: var(--status-amber); }
.activity-bar.is-outage { background: var(--status-red); }
.activity-bar.is-unknown { background: var(--vp-c-divider); }

.service-uptime,
.service-latency {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.service-uptime span,
.service-latency span {
  color: var(--vp-c-text-3);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.service-uptime strong,
.service-latency strong {
  font-size: 13px;
  font-weight: 650;
  white-space: nowrap;
}

.service-state {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--status-muted);
  font-size: 11px;
  font-weight: 650;
}

.service-state > span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}

.service-state.is-operational { color: var(--status-green); }
.service-state.is-degraded { color: var(--status-amber); }
.service-state.is-outage { color: var(--status-red); }

.service-expand {
  display: inline-grid;
  width: 28px;
  height: 28px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--vp-c-text-3);
  cursor: pointer;
}

.service-expand:hover { background: var(--vp-c-bg-soft); color: var(--vp-c-text-1); }
.service-expand svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 160ms ease;
}
.service-expand svg.expanded { transform: rotate(180deg); }

.community-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 21px;
}

.community-heading h2 {
  margin: 0;
  font-size: 27px;
  font-weight: 700;
  letter-spacing: -0.035em;
}

.community-heading p {
  margin: 7px 0 0;
  color: var(--vp-c-text-2);
  font-size: 14px;
}

.community-heading > span {
  flex: 0 0 auto;
  color: var(--vp-c-text-3);
  font-size: 12px;
}

.status-controls {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}

.search-field {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  align-items: center;
}

.search-field svg {
  position: absolute;
  left: 13px;
  color: var(--vp-c-text-3);
  pointer-events: none;
}

.search-field input {
  width: 100%;
  height: 43px;
  padding: 0 15px 0 40px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  outline: none;
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-text-1);
  font: inherit;
  font-size: 13px;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.search-field input:focus {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 60%, var(--vp-c-divider));
  box-shadow: 0 0 0 3px var(--vp-c-brand-soft);
}

.search-field input::placeholder { color: var(--vp-c-text-3); }

.issues-toggle {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  height: 43px;
  padding: 0 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-text-2);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.issues-toggle > span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--vp-c-text-3);
}

.issues-toggle.active {
  border-color: color-mix(in srgb, var(--status-red) 35%, var(--vp-c-divider));
  background: var(--status-red-soft);
  color: var(--status-red);
}

.issues-toggle.active > span { background: var(--status-red); }

.group-filter {
  display: flex;
  gap: 7px;
  margin: 0 -2px 20px;
  padding: 2px;
  overflow-x: auto;
  scrollbar-width: none;
}

.group-filter::-webkit-scrollbar { display: none; }

.group-filter button {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 11px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: transparent;
  color: var(--vp-c-text-2);
  font: inherit;
  font-size: 11px;
  font-weight: 620;
  cursor: pointer;
}

.group-filter button span {
  color: var(--vp-c-text-3);
  font-size: 10px;
}

.group-filter button:hover { background: var(--vp-c-bg-soft); }
.group-filter button.active {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 35%, var(--vp-c-divider));
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

.group-filter button.active span { color: currentColor; opacity: 0.72; }

.service-groups {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.service-group {
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: 13px;
  background: var(--vp-c-bg-elv);
}

.service-group__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--vp-c-divider);
  background: color-mix(in srgb, var(--vp-c-bg-soft) 62%, var(--vp-c-bg-elv));
}

.service-group__header > div:first-child {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.service-group__header h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.service-group__header > div:first-child > span {
  color: var(--vp-c-text-3);
  font-size: 10px;
}

.group-health {
  display: flex;
  gap: 3px;
}

.group-health span {
  width: 16px;
  height: 3px;
  border-radius: 999px;
  background: var(--status-muted);
}

.group-health .is-operational { background: var(--status-green); }
.group-health .is-degraded { background: var(--status-amber); }
.group-health .is-outage { background: var(--status-red); }

.service-row {
  border-bottom: 1px solid var(--vp-c-divider);
}

.service-row__summary {
  display: grid;
  grid-template-columns: minmax(190px, 1fr) 42px 74px 64px 84px 28px;
  align-items: center;
  gap: 20px;
  min-height: 68px;
  padding: 11px 18px;
}

.service-row:last-child { border-bottom: 0; }
.service-row:hover { background: color-mix(in srgb, var(--vp-c-bg-soft) 45%, transparent); }

.service-identity {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}

.service-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--status-muted);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--status-muted) 10%, transparent);
}

.service-dot.is-operational {
  background: var(--status-green);
  box-shadow: 0 0 0 4px var(--status-green-soft);
}

.service-dot.is-degraded {
  background: var(--status-amber);
  box-shadow: 0 0 0 4px var(--status-amber-soft);
}

.service-dot.is-outage {
  background: var(--status-red);
  box-shadow: 0 0 0 4px var(--status-red-soft);
}

.service-identity > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.service-identity a,
.service-identity strong {
  overflow: hidden;
  color: var(--vp-c-text-1);
  font-size: 12px;
  font-weight: 660;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.service-identity > div > span {
  overflow: hidden;
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.service-uptime,
.service-latency { align-items: flex-end; }
.service-state { justify-self: start; }
.service-expand { justify-self: end; }

.service-details {
  margin: 0 18px;
  padding: 15px 0 17px 19px;
  border-top: 1px solid var(--vp-c-divider);
}

.uptime-windows {
  display: grid;
  grid-template-columns: repeat(5, minmax(54px, 1fr));
  gap: 8px;
  margin-bottom: 16px;
}

.uptime-windows > div,
.service-facts > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.uptime-windows span,
.service-facts dt {
  color: var(--vp-c-text-3);
  font-size: 9px;
  font-weight: 650;
  letter-spacing: 0.045em;
  text-transform: uppercase;
}

.uptime-windows strong {
  font-size: 12px;
  font-weight: 650;
}

.service-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
  gap: 14px 18px;
  margin: 0;
}

.service-facts dd {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 11px;
}

.service-detail-note {
  margin: 15px 0 0;
  padding-left: 10px;
  border-left: 2px solid var(--status-amber);
  color: var(--vp-c-text-2);
  font-size: 11px;
  line-height: 1.55;
}

.empty-state {
  display: flex;
  min-height: 260px;
  padding: 40px 20px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  border: 1px dashed var(--vp-c-divider);
  border-radius: 13px;
  background: var(--vp-c-bg-elv);
  text-align: center;
}

.empty-state svg {
  width: 28px;
  height: 28px;
  margin-bottom: 13px;
  color: var(--vp-c-text-3);
}

.empty-state strong { font-size: 14px; }
.empty-state > span { margin: 4px 0 18px; color: var(--vp-c-text-3); font-size: 12px; }

.status-note {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 22px;
  padding: 0 3px;
  color: var(--vp-c-text-3);
}

.status-note svg { flex: 0 0 auto; margin-top: 2px; }
.status-note p { margin: 0; font-size: 11px; line-height: 1.65; }
.status-note a { color: var(--vp-c-text-2); text-underline-offset: 3px; }
.status-note a:hover { color: var(--vp-c-brand-1); }

.status-loading {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.loading-feature,
.loading-controls,
.loading-group {
  border-radius: 13px;
  background: linear-gradient(90deg, var(--vp-c-bg-soft) 25%, var(--vp-c-bg-elv) 50%, var(--vp-c-bg-soft) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}

.loading-feature { height: 96px; }
.loading-controls { width: 72%; height: 43px; margin: 28px 0 6px; }
.loading-group { height: 190px; }

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes shimmer { to { background-position: -200% 0; } }

@media (max-width: 860px) {
  .service-row__summary {
    grid-template-columns: minmax(160px, 1fr) 42px 64px 84px 28px;
    gap: 14px;
  }

  .service-uptime { display: none; }
}

@media (max-width: 680px) {
  .status-shell {
    width: min(100% - 28px, 1120px);
    padding-top: 38px;
  }

  .status-heading-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 22px;
  }

  .status-heading-row h1 { font-size: 38px; }
  .refresh-button { width: 100%; }
  .provider-picker { flex-wrap: wrap; }
  .provider-picker > span { width: 100%; }

  .community-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 9px;
  }

  .status-controls { flex-direction: column; }
  .issues-toggle { justify-content: center; }

  .service-group__header { padding: 14px; }
  .service-group__header > div:first-child {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }

  .group-health { display: none; }

  .service-row__summary {
    grid-template-columns: minmax(0, 1fr) 84px 28px;
    gap: 12px;
    min-height: 72px;
    padding: 12px 14px;
  }

  .service-activity,
  .service-uptime,
  .service-latency { display: none; }
  .service-state { font-size: 10px; }
  .service-identity > div > span { max-width: 190px; }

  .service-details {
    margin: 0 14px;
    padding-left: 0;
  }

  .uptime-windows { grid-template-columns: repeat(5, minmax(42px, 1fr)); }

  .status-note { margin-top: 18px; }
}

@media (max-width: 420px) {
  .service-row__summary { grid-template-columns: minmax(0, 1fr) 20px 28px; }
  .service-state { width: 20px; font-size: 0; }
  .service-state > span { width: 8px; height: 8px; }
  .service-identity > div > span { max-width: 180px; }
}

@media (prefers-reduced-motion: reduce) {
  .refresh-button svg.spinning,
  .service-expand svg,
  .loading-feature,
  .loading-controls,
  .loading-group { animation: none; }
}
</style>
