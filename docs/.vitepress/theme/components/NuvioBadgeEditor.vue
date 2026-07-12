<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  androidColorAlpha,
  androidColorToCss,
  androidColorToHex,
  cloneBadge,
  cloneGroup,
  findDisplayBadges,
  findWinningBadges,
  parseBadgeDocument,
  serializeBadgeSet,
  testBadgePattern,
  validateBadgeDocument,
  withAndroidColorAlpha,
  withAndroidColorHex,
  type BadgeField,
  type BadgeGroup,
  type BadgeIssue,
  type EditorBadge
} from './badgeEditorUtils'

type PreviewMode = 'apps' | 'priority'
type ImportStrategy = 'replace' | 'append'
type ColorField = 'tagColor' | 'borderColor' | 'textColor'

const STORAGE_KEY = 'nuvio-badge-studio-v1'
const NARD_IMAGE_BASE = 'https://raw.githubusercontent.com/vowl313/NardBadges/refs/heads/main/'

const starterGroups: BadgeGroup[] = [
  { id: 'resolution', name: 'Resolution', color: '#FFFFBE01', borderColor: '#FFFFBE01', isExpanded: true, extra: {} },
  { id: 'source', name: 'Source', color: '#FF27C04F', borderColor: '#FF27C04F', isExpanded: true, extra: {} },
  { id: 'visual', name: 'Visual', color: '#FFFF6B6B', borderColor: '#FFFF6B6B', isExpanded: true, extra: {} },
  { id: 'audio', name: 'Audio', color: '#FF45B7D1', borderColor: '#FF45B7D1', isExpanded: true, extra: {} },
  { id: 'channels', name: 'Channels', color: '#FFFFD700', borderColor: '#FFFFD700', isExpanded: true, extra: {} }
]

const starterBadge = (
  id: string,
  groupId: string,
  name: string,
  pattern: string,
  imageFile: string,
  color: string
): EditorBadge => ({
  id,
  groupId,
  name,
  pattern,
  imageURL: `${NARD_IMAGE_BASE}${imageFile}`,
  isEnabled: true,
  tagColor: `#33${color.slice(-6)}`,
  tagStyle: 'filled',
  textColor: '#FFFFFFFF',
  borderColor: color,
  type: 'filter',
  extra: {}
})

const starterFilters: EditorBadge[] = [
  starterBadge('r-4k', 'resolution', '4K', '(?i)\\b(?:2160[pi]?|4k|uhd)\\b', 'res-4k.png', '#FFFFBE01'),
  starterBadge('r-fhd', 'resolution', 'FHD', '(?i)\\b(?:1080[pi]?|fhd|full[ ._-]?hd)\\b', 'res-fhd.png', '#FFFFBE01'),
  starterBadge('q-remux', 'source', 'Remux', '(?i)\\b(?:bd|uhd)?remux\\b', 'rel-remux.png', '#FF27C04F'),
  starterBadge('q-webdl', 'source', 'WebDL', '(?i)\\bweb[ ._-]?dl\\b', 'rel-webdl.png', '#FF27C04F'),
  starterBadge('q-webrip', 'source', 'WebRip', '(?i)\\bweb[ ._-]?rip\\b', 'rel-webrip.png', '#FF27C04F'),
  starterBadge('v-dv', 'visual', 'Dolby Vision', '(?i)\\b(?:dv|dovi|dolby[ ._-]?vision)\\b', 'vis-dv.png', '#FFFF6B6B'),
  starterBadge('v-hdr10p', 'visual', 'HDR10+', '(?i)\\bhdr[ ._-]?10[ ._-]?(?:\\+|plus|p)(?!\\w)', 'vis-hdr10plus.png', '#FFFF6B6B'),
  starterBadge('v-hdr10', 'visual', 'HDR10', '(?i)\\bhdr[ ._-]?10\\b(?![ ._-]?(?:\\+|plus|p))', 'vis-hdr10.png', '#FFFF6B6B'),
  starterBadge('a-atmos', 'audio', 'Atmos', '(?i)\\batmos\\b', 'aud-atmos.png', '#FF45B7D1'),
  starterBadge('a-dtsx', 'audio', 'DTS:X', '(?i)\\bdts[ .:_-]?x\\b', 'aud-dtsx.png', '#FF45B7D1'),
  starterBadge('ch-71', 'channels', '7.1', '(?:^|[^0-9])7[ .]1(?![0-9])', 'ch71.png', '#FFFFD700'),
  starterBadge('ch-51', 'channels', '5.1', '(?:^|[^0-9])5[ .]1(?![0-9])', 'ch51.png', '#FFFFD700')
]

const previewSamples = [
  'Movie.2026.2160p.WEB-DL.DV.Atmos.7.1.x265.mkv',
  'Movie_1080P_WEB.DL_HDR10+_DTS-X_5 1.mkv',
  'Movie.1080p.WEBRip.HDR10.DDP5.1.H264.mkv',
  'Movie.2160p.BluRay.REMUX.TrueHD.Atmos.DTS-HD.MA.7.1.mkv',
  'Movie.720p.DVDRip.DD2.0.XviD.avi',
  'Movie.2160p.SDR.AV1.AAC2.0.mkv',
  'Movie 2026'
]

const badges = ref(starterFilters.map(cloneBadge))
const groups = ref(starterGroups.map(cloneGroup))
const documentExtra = ref<Record<string, unknown>>({})
const selectedIndex = ref(0)
const search = ref('')
const groupFilter = ref('all')
const streamTitle = ref(previewSamples[0])
const previewMode = ref<PreviewMode>('apps')
const showImport = ref(false)
const showGroups = ref(false)
const importText = ref('')
const importUrl = ref('')
const importStrategy = ref<ImportStrategy>('replace')
const importError = ref('')
const isImporting = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const failedImages = ref(new Set<string>())
const notice = ref('Changes save locally in this browser.')
const isHydrated = ref(false)
const starterArmed = ref(false)
let noticeTimer: ReturnType<typeof setTimeout> | undefined
let starterTimer: ReturnType<typeof setTimeout> | undefined
let storageTimer: ReturnType<typeof setTimeout> | undefined

const selectedBadge = computed(() => badges.value[selectedIndex.value])
const enabledCount = computed(() => badges.value.filter(badge => badge.isEnabled).length)
const groupOptions = computed(() => {
  const ids = new Set([
    ...groups.value.map(group => group.id.trim()),
    ...badges.value.map(badge => badge.groupId.trim())
  ].filter(Boolean))
  return [...ids].sort((a, b) => a.localeCompare(b))
})
const filteredBadges = computed(() => {
  const term = search.value.trim().toLowerCase()
  return badges.value.filter(badge => {
    const inGroup = groupFilter.value === 'all' || badge.groupId === groupFilter.value
    const inSearch = !term || [badge.name, badge.id, badge.groupId, badge.pattern]
      .some(value => value.toLowerCase().includes(term))
    return inGroup && inSearch
  })
})
const issues = computed(() => validateBadgeDocument(badges.value, groups.value))
const blockingIssues = computed(() => issues.value.filter(issue => issue.severity === 'error'))
const warnings = computed(() => issues.value.filter(issue => issue.severity === 'warning'))
const priorityPreview = computed(() => findWinningBadges(badges.value, streamTitle.value))
const currentAppsPreview = computed(() => findDisplayBadges(badges.value, streamTitle.value))
const previewBadges = computed(() => previewMode.value === 'apps'
  ? currentAppsPreview.value
  : priorityPreview.value.winners.filter(badge => badge.imageURL.trim()))
const selectedPatternTest = computed(() => selectedBadge.value
  ? testBadgePattern(selectedBadge.value.pattern, streamTitle.value)
  : { matches: false, match: '', error: '' })
const jsonOutput = computed(() => serializeBadgeSet(badges.value, groups.value, documentExtra.value))
const visibleEnabled = computed(() => filteredBadges.value.filter(badge => badge.isEnabled).length)

const setNotice = (message: string) => {
  notice.value = message
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    notice.value = 'Changes save locally in this browser.'
  }, 3200)
}

const selectBadge = (badge: EditorBadge) => {
  const index = badges.value.indexOf(badge)
  if (index >= 0) selectedIndex.value = index
}

const slugify = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')

const uniqueId = (requested: string, reserved = new Set(badges.value.map(badge => badge.id))) => {
  const base = slugify(requested) || 'new-badge'
  let candidate = base
  let suffix = 2
  while (reserved.has(candidate)) candidate = `${base}-${suffix++}`
  reserved.add(candidate)
  return candidate
}

const addBadge = () => {
  const groupId = groupFilter.value !== 'all'
    ? groupFilter.value
    : groups.value[0]?.id ?? 'custom'
  const group = groups.value.find(item => item.id === groupId)
  const next = starterBadge(
    uniqueId('new-badge'),
    groupId,
    'New badge',
    '(?i)\\bkeyword\\b',
    '',
    group?.borderColor || '#FF6B16ED'
  )
  const insertAt = Math.min(selectedIndex.value + 1, badges.value.length)
  badges.value.splice(insertAt, 0, next)
  selectedIndex.value = insertAt
  setNotice('New badge added directly after the current priority.')
}

const duplicateSelected = () => {
  if (!selectedBadge.value) return
  const copy = cloneBadge(selectedBadge.value)
  copy.id = uniqueId(`${copy.id || copy.name}-copy`)
  copy.name = `${copy.name || 'Badge'} copy`
  const insertAt = selectedIndex.value + 1
  badges.value.splice(insertAt, 0, copy)
  selectedIndex.value = insertAt
  setNotice('Badge duplicated.')
}

const removeSelected = () => {
  if (!selectedBadge.value) return
  const removedName = selectedBadge.value.name || selectedBadge.value.id || 'Badge'
  badges.value.splice(selectedIndex.value, 1)
  selectedIndex.value = Math.max(0, Math.min(selectedIndex.value, badges.value.length - 1))
  setNotice(`${removedName} removed.`)
}

const moveBadge = (badge: EditorBadge, direction: -1 | 1) => {
  const from = badges.value.indexOf(badge)
  const to = from + direction
  if (from < 0 || to < 0 || to >= badges.value.length) return
  badges.value.splice(from, 1)
  badges.value.splice(to, 0, badge)
  if (selectedBadge.value === badge || selectedIndex.value === from) selectedIndex.value = to
  else if (selectedIndex.value === to) selectedIndex.value = from
  setNotice(`Priority moved to ${to + 1}.`)
}

const setVisibleEnabled = (enabled: boolean) => {
  filteredBadges.value.forEach(badge => { badge.isEnabled = enabled })
  setNotice(`${filteredBadges.value.length} visible badges ${enabled ? 'enabled' : 'disabled'}.`)
}

const fieldIssue = (field: BadgeField) => {
  const id = selectedBadge.value?.id.trim() ?? ''
  return issues.value.find(issue => issue.badgeId === id && issue.field === field)
}

const updateColorHex = (field: ColorField, event: Event) => {
  if (!selectedBadge.value) return
  const value = (event.target as HTMLInputElement).value
  selectedBadge.value[field] = withAndroidColorHex(selectedBadge.value[field], value)
}

const updateColorAlpha = (field: ColorField, event: Event) => {
  if (!selectedBadge.value) return
  const value = Number((event.target as HTMLInputElement).value)
  selectedBadge.value[field] = withAndroidColorAlpha(selectedBadge.value[field], value)
}

const clearImageFailure = (url: string) => {
  if (!failedImages.value.has(url)) return
  const next = new Set(failedImages.value)
  next.delete(url)
  failedImages.value = next
}

const markImageFailed = (url: string) => {
  const next = new Set(failedImages.value)
  next.add(url)
  failedImages.value = next
}

const isImageVisible = (url: string) => Boolean(url.trim() && !failedImages.value.has(url))

const applySample = (event: Event) => {
  const value = (event.target as HTMLSelectElement).value
  if (value) streamTitle.value = value
}

const addGroup = () => {
  const reserved = new Set(groups.value.map(group => group.id))
  let suffix = groups.value.length + 1
  let id = `group-${suffix}`
  while (reserved.has(id)) id = `group-${++suffix}`
  groups.value.push({
    id,
    name: `Group ${suffix}`,
    color: '#FF6B16ED',
    borderColor: '#FF6B16ED',
    isExpanded: true,
    extra: {}
  })
  setNotice('Group added.')
}

const updateGroupId = (group: BadgeGroup, event: Event) => {
  const oldId = group.id
  const nextId = (event.target as HTMLInputElement).value.trim()
  group.id = nextId
  badges.value.forEach(badge => {
    if (badge.groupId === oldId) badge.groupId = nextId
  })
}

const removeGroup = (group: BadgeGroup) => {
  const index = groups.value.indexOf(group)
  if (index >= 0) groups.value.splice(index, 1)
  setNotice('Group removed. Its badges remain available as ungrouped references.')
}

const applyImportedDocument = (payload: string) => {
  const imported = parseBadgeDocument(payload)
  if (!imported.filters.length) throw new Error('The imported file has no filters.')

  if (importStrategy.value === 'replace') {
    badges.value = imported.filters.map(cloneBadge)
    groups.value = imported.groups.map(cloneGroup)
    documentExtra.value = { ...imported.extra }
    selectedIndex.value = 0
  } else {
    const reserved = new Set(badges.value.map(badge => badge.id))
    const incoming = imported.filters.map(filter => {
      const next = cloneBadge(filter)
      next.id = uniqueId(next.id || next.name, reserved)
      return next
    })
    badges.value.push(...incoming)
    const groupIds = new Set(groups.value.map(group => group.id))
    imported.groups.forEach(group => {
      if (!groupIds.has(group.id)) {
        groups.value.push(cloneGroup(group))
        groupIds.add(group.id)
      }
    })
    selectedIndex.value = badges.value.length - incoming.length
  }

  showImport.value = false
  importError.value = ''
  setNotice(`${imported.filters.length} badges imported.`)
}

const importFromText = () => {
  importError.value = ''
  try {
    applyImportedDocument(importText.value)
  } catch (error) {
    importError.value = error instanceof Error ? error.message : 'Could not import this JSON.'
  }
}

const importFromUrl = async () => {
  importError.value = ''
  isImporting.value = true
  try {
    const response = await fetch(importUrl.value.trim(), { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`The URL returned HTTP ${response.status}.`)
    const payload = await response.text()
    importText.value = payload
    applyImportedDocument(payload)
  } catch (error) {
    importError.value = error instanceof Error
      ? `${error.message} Try downloading the file and importing it locally if the host blocks browser access.`
      : 'Could not load this URL.'
  } finally {
    isImporting.value = false
  }
}

const chooseFile = () => fileInput.value?.click()

const importFromFile = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  importError.value = ''
  try {
    importText.value = await file.text()
    applyImportedDocument(importText.value)
  } catch (error) {
    importError.value = error instanceof Error ? error.message : 'Could not read this file.'
    showImport.value = true
  } finally {
    input.value = ''
  }
}

const loadStarter = () => {
  if (!starterArmed.value && badges.value.length) {
    starterArmed.value = true
    setNotice('Press “Replace with starter?” again to confirm.')
    if (starterTimer) clearTimeout(starterTimer)
    starterTimer = setTimeout(() => { starterArmed.value = false }, 4000)
    return
  }

  badges.value = starterFilters.map(cloneBadge)
  groups.value = starterGroups.map(cloneGroup)
  documentExtra.value = {}
  selectedIndex.value = 0
  starterArmed.value = false
  setNotice('Starter badge set loaded.')
}

const copyJson = async () => {
  if (blockingIssues.value.length) return
  try {
    await navigator.clipboard.writeText(jsonOutput.value)
    setNotice('Badge JSON copied to the clipboard.')
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = jsonOutput.value
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
    setNotice('Badge JSON copied to the clipboard.')
  }
}

const downloadJson = () => {
  if (blockingIssues.value.length) return
  const blob = new Blob([jsonOutput.value], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'nuvio-badges.json'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
  setNotice('nuvio-badges.json downloaded.')
}

const selectIssue = (issue: BadgeIssue) => {
  if (!issue.badgeId) return
  const index = badges.value.findIndex(badge => badge.id.trim() === issue.badgeId)
  if (index >= 0) selectedIndex.value = index
}

onMounted(() => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const restored = parseBadgeDocument(stored)
      if (restored.filters.length) {
        badges.value = restored.filters.map(cloneBadge)
        groups.value = restored.groups.map(cloneGroup)
        documentExtra.value = { ...restored.extra }
        selectedIndex.value = 0
        notice.value = 'Your locally saved workspace was restored.'
      }
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY)
  } finally {
    isHydrated.value = true
  }
})

watch([badges, groups, documentExtra], () => {
  if (!isHydrated.value) return
  if (storageTimer) clearTimeout(storageTimer)
  storageTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, jsonOutput.value)
    } catch {
      notice.value = 'This workspace is too large for local autosave. Export a copy before leaving.'
    }
  }, 180)
}, { deep: true })

onUnmounted(() => {
  if (noticeTimer) clearTimeout(noticeTimer)
  if (starterTimer) clearTimeout(starterTimer)
  if (storageTimer) clearTimeout(storageTimer)
})
</script>

<template>
  <div class="badge-studio">
    <header class="studio-header">
      <div class="studio-heading">
        <span class="studio-kicker">
          <span class="studio-kicker-dot" aria-hidden="true"></span>
          Badge Studio
        </span>
        <h2>Build the rules. Test the stream. Ship the JSON.</h2>
        <p>Everything stays in your browser until you copy or download it.</p>
      </div>

      <div class="studio-commands" aria-label="Badge editor actions">
        <button type="button" class="studio-button studio-button--quiet" @click="showGroups = !showGroups">
          {{ showGroups ? 'Close groups' : 'Groups' }}
        </button>
        <button type="button" class="studio-button studio-button--quiet" @click="showImport = !showImport">
          {{ showImport ? 'Close import' : 'Import' }}
        </button>
        <button type="button" class="studio-button studio-button--quiet" @click="loadStarter">
          {{ starterArmed ? 'Replace with starter?' : 'Starter set' }}
        </button>
        <button type="button" class="studio-button studio-button--primary" @click="addBadge">
          <span aria-hidden="true">＋</span> New badge
        </button>
      </div>

      <div class="studio-metrics" aria-label="Workspace summary">
        <span><strong>{{ badges.length }}</strong> filters</span>
        <span><strong>{{ enabledCount }}</strong> enabled</span>
        <span><strong>{{ groups.length }}</strong> groups</span>
        <span :class="{ 'metric-alert': blockingIssues.length }">
          <strong>{{ blockingIssues.length }}</strong> blocking
        </span>
      </div>
    </header>

    <section v-if="showImport" class="studio-drawer" aria-labelledby="import-heading">
      <div class="drawer-heading">
        <div>
          <span class="section-eyebrow">Bring your own set</span>
          <h3 id="import-heading">Import badge JSON</h3>
        </div>
        <label class="compact-field">
          <span>Import behavior</span>
          <select v-model="importStrategy">
            <option value="replace">Replace workspace</option>
            <option value="append">Append and fix duplicate IDs</option>
          </select>
        </label>
      </div>

      <div class="import-grid">
        <label class="field import-paste">
          <span>Paste JSON</span>
          <textarea v-model="importText" rows="7" spellcheck="false" placeholder='{ "filters": [...], "groups": [...] }'></textarea>
        </label>
        <div class="import-sources">
          <label class="field">
            <span>Raw JSON URL</span>
            <input v-model.trim="importUrl" type="url" placeholder="https://raw.githubusercontent.com/.../badges.json">
          </label>
          <button type="button" class="studio-button studio-button--quiet studio-button--wide" :disabled="isImporting || !importUrl" @click="importFromUrl">
            {{ isImporting ? 'Loading…' : 'Load URL' }}
          </button>
          <span class="import-divider">or</span>
          <button type="button" class="studio-button studio-button--quiet studio-button--wide" @click="chooseFile">Choose a JSON file</button>
          <input ref="fileInput" class="visually-hidden" type="file" accept=".json,application/json" @change="importFromFile">
        </div>
      </div>
      <div class="drawer-footer">
        <p v-if="importError" class="drawer-error" role="alert">{{ importError }}</p>
        <p v-else>Unknown fields are kept when the set is exported again.</p>
        <button type="button" class="studio-button studio-button--primary" :disabled="!importText" @click="importFromText">Import pasted JSON</button>
      </div>
    </section>

    <section v-if="showGroups" class="studio-drawer group-drawer" aria-labelledby="groups-heading">
      <div class="drawer-heading">
        <div>
          <span class="section-eyebrow">Organization layer</span>
          <h3 id="groups-heading">Group library</h3>
        </div>
        <button type="button" class="studio-button studio-button--quiet" @click="addGroup">＋ Add group</button>
      </div>
      <div class="group-grid">
        <div v-for="group in groups" :key="group.id" class="group-row">
          <input
            class="group-swatch"
            type="color"
            :value="androidColorToHex(group.color)"
            :aria-label="`${group.name || group.id} color`"
            @input="group.color = withAndroidColorHex(group.color, ($event.target as HTMLInputElement).value)"
          >
          <label>
            <span>Name</span>
            <input v-model.trim="group.name" type="text">
          </label>
          <label>
            <span>ID</span>
            <input :value="group.id" type="text" @change="updateGroupId(group, $event)">
          </label>
          <button type="button" class="icon-button icon-button--danger" :aria-label="`Remove ${group.name || group.id}`" @click="removeGroup(group)">×</button>
        </div>
        <p v-if="!groups.length" class="empty-copy">No groups yet. Filters can still work, but a group library makes a set easier to maintain.</p>
      </div>
    </section>

    <div class="studio-grid">
      <aside class="badge-queue" aria-labelledby="queue-heading">
        <div class="panel-heading queue-heading">
          <div>
            <span class="section-eyebrow">Global order</span>
            <h3 id="queue-heading">Badge stack</h3>
          </div>
          <span class="queue-count">{{ filteredBadges.length }}</span>
        </div>

        <div class="queue-tools">
          <label class="search-field">
            <span class="visually-hidden">Search badges</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg>
            <input v-model="search" type="search" placeholder="Search rules">
          </label>
          <label class="visually-hidden" for="badge-group-filter">Filter by group</label>
          <select id="badge-group-filter" v-model="groupFilter" class="group-filter">
            <option value="all">All groups</option>
            <option v-for="group in groupOptions" :key="group" :value="group">{{ group }}</option>
          </select>
        </div>

        <div class="queue-bulk">
          <span>{{ visibleEnabled }}/{{ filteredBadges.length }} visible enabled</span>
          <div>
            <button type="button" @click="setVisibleEnabled(true)">Enable</button>
            <button type="button" @click="setVisibleEnabled(false)">Disable</button>
          </div>
        </div>

        <ol class="badge-list">
          <li
            v-for="badge in filteredBadges"
            :key="`${badge.id}-${badges.indexOf(badge)}`"
            :class="['badge-row', {
              'is-selected': selectedBadge === badge,
              'is-disabled': !badge.isEnabled,
              'is-matched': priorityPreview.matchedIds.has(badge.id),
              'is-shadowed': previewMode === 'priority' && priorityPreview.shadowedIds.has(badge.id)
            }]"
          >
            <button type="button" class="badge-select" :aria-current="selectedBadge === badge ? 'true' : undefined" @click="selectBadge(badge)">
              <span class="priority-number">{{ badges.indexOf(badge) + 1 }}</span>
              <span class="badge-row-copy">
                <strong>{{ badge.name || 'Untitled badge' }}</strong>
                <small>{{ badge.groupId || 'No group' }} · {{ badge.id || 'No ID' }}</small>
              </span>
              <span class="match-dot" :title="priorityPreview.matchedIds.has(badge.id) ? 'Matches the test stream' : 'No match'" aria-hidden="true"></span>
            </button>
            <div class="badge-row-actions">
              <label class="mini-switch" :title="badge.isEnabled ? 'Disable badge' : 'Enable badge'">
                <input v-model="badge.isEnabled" type="checkbox" :aria-label="`${badge.isEnabled ? 'Disable' : 'Enable'} ${badge.name || badge.id}`">
                <span></span>
              </label>
              <button type="button" :disabled="badges.indexOf(badge) === 0" :aria-label="`Move ${badge.name} up`" @click="moveBadge(badge, -1)">↑</button>
              <button type="button" :disabled="badges.indexOf(badge) === badges.length - 1" :aria-label="`Move ${badge.name} down`" @click="moveBadge(badge, 1)">↓</button>
            </div>
          </li>
        </ol>

        <div v-if="!filteredBadges.length" class="queue-empty">
          <span>⌁</span>
          <p>No rules match these filters.</p>
        </div>
      </aside>

      <main v-if="selectedBadge" class="badge-inspector" aria-labelledby="inspector-heading">
        <div class="panel-heading inspector-heading">
          <div>
            <span class="section-eyebrow">Priority {{ selectedIndex + 1 }}</span>
            <h3 id="inspector-heading">{{ selectedBadge.name || 'Untitled badge' }}</h3>
          </div>
          <div class="inspector-actions">
            <button type="button" @click="duplicateSelected">Duplicate</button>
            <button type="button" class="danger-text" @click="removeSelected">Delete</button>
          </div>
        </div>

        <section class="inspector-section">
          <div class="section-title">
            <span>01</span>
            <div><h4>Identity</h4><p>Names, IDs, and grouping stay portable across clients.</p></div>
          </div>
          <div class="form-grid">
            <label class="field">
              <span>Display name</span>
              <input v-model="selectedBadge.name" type="text" :class="{ 'has-warning': fieldIssue('name')?.severity === 'warning' }">
              <small v-if="fieldIssue('name')" class="field-message field-message--warning">{{ fieldIssue('name')?.message }}</small>
            </label>
            <label class="field">
              <span>Unique ID</span>
              <input v-model.trim="selectedBadge.id" type="text" :class="{ 'has-error': fieldIssue('id')?.severity === 'error' }">
              <small v-if="fieldIssue('id')" class="field-message field-message--warning">{{ fieldIssue('id')?.message }}</small>
            </label>
            <label class="field">
              <span>Group</span>
              <select v-model="selectedBadge.groupId">
                <option value="">No group</option>
                <option v-for="group in groupOptions" :key="group" :value="group">{{ group }}</option>
              </select>
              <small v-if="fieldIssue('groupId')" class="field-message field-message--warning">{{ fieldIssue('groupId')?.message }}</small>
            </label>
            <label class="field">
              <span>Entry type</span>
              <input v-model.trim="selectedBadge.type" type="text" placeholder="filter">
            </label>
          </div>
          <label class="full-switch">
            <span><strong>Enabled</strong><small>Disabled rules stay in the JSON but never match.</small></span>
            <input v-model="selectedBadge.isEnabled" type="checkbox">
            <span class="switch-track" aria-hidden="true"></span>
          </label>
        </section>

        <section class="inspector-section regex-section">
          <div class="section-title">
            <span>02</span>
            <div><h4>Match rule</h4><p>Use the same Java-style inline flags accepted by Nuvio.</p></div>
          </div>
          <label class="field field--wide">
            <span>Regex pattern</span>
            <textarea v-model="selectedBadge.pattern" rows="3" spellcheck="false" :class="{ 'has-error': selectedPatternTest.error }"></textarea>
          </label>
          <div :class="['pattern-result', { 'is-match': selectedPatternTest.matches, 'is-error': selectedPatternTest.error }]" role="status">
            <span class="pattern-result-icon" aria-hidden="true">{{ selectedPatternTest.error ? '!' : selectedPatternTest.matches ? '✓' : '–' }}</span>
            <div>
              <strong v-if="selectedPatternTest.error">Pattern needs attention</strong>
              <strong v-else-if="selectedPatternTest.matches">Matches “{{ selectedPatternTest.match }}”</strong>
              <strong v-else>No match in the test stream</strong>
              <small>{{ selectedPatternTest.error || 'The preview updates as you type.' }}</small>
            </div>
          </div>
        </section>

        <section class="inspector-section">
          <div class="section-title">
            <span>03</span>
            <div><h4>Badge artwork</h4><p>Use a direct PNG, SVG, or GIF URL; raw GitHub links work best.</p></div>
          </div>
          <label class="field field--wide">
            <span>Image URL</span>
            <input v-model.trim="selectedBadge.imageURL" type="url" placeholder="https://.../badge.png" @input="clearImageFailure(selectedBadge.imageURL)">
            <small v-if="fieldIssue('imageURL')" class="field-message field-message--warning">{{ fieldIssue('imageURL')?.message }}</small>
          </label>
          <div class="artwork-preview">
            <div
              class="preview-chip preview-chip--large"
              :style="{ '--badge-fill': androidColorToCss(selectedBadge.tagColor), '--badge-stroke': androidColorToCss(selectedBadge.borderColor) }"
            >
              <img
                v-if="isImageVisible(selectedBadge.imageURL)"
                :key="selectedBadge.imageURL"
                :src="selectedBadge.imageURL"
                :alt="selectedBadge.name"
                @error="markImageFailed(selectedBadge.imageURL)"
              >
              <span v-else>{{ selectedBadge.name || 'Badge' }}</span>
            </div>
            <p>{{ failedImages.has(selectedBadge.imageURL) ? 'The image could not be loaded. The URL is still preserved.' : 'Previewed at a realistic stream-chip height.' }}</p>
          </div>
        </section>

        <section class="inspector-section">
          <div class="section-title">
            <span>04</span>
            <div><h4>Appearance metadata</h4><p>Eight-digit colors use Android ARGB: alpha comes first.</p></div>
          </div>
          <div class="appearance-grid">
            <div v-for="field in (['tagColor', 'borderColor', 'textColor'] as ColorField[])" :key="field" class="color-control">
              <div class="color-control-heading">
                <span>{{ field === 'tagColor' ? 'Fill' : field === 'borderColor' ? 'Border' : 'Text' }}</span>
                <code>{{ selectedBadge[field] || 'Not set' }}</code>
              </div>
              <div class="color-input-row">
                <input type="color" :value="androidColorToHex(selectedBadge[field])" :aria-label="`${field} color`" @input="updateColorHex(field, $event)">
                <input v-model.trim="selectedBadge[field]" type="text" placeholder="#AARRGGBB">
              </div>
              <label class="alpha-control">
                <span>Opacity</span>
                <input type="range" min="0" max="100" :value="androidColorAlpha(selectedBadge[field])" @input="updateColorAlpha(field, $event)">
                <output>{{ androidColorAlpha(selectedBadge[field]) }}%</output>
              </label>
              <small v-if="fieldIssue(field)" class="field-message">{{ fieldIssue(field)?.message }}</small>
            </div>
          </div>
          <label class="field field--wide style-field">
            <span>Fill style</span>
            <input v-model.trim="selectedBadge.tagStyle" list="tag-style-options" type="text" placeholder="filled">
            <datalist id="tag-style-options"><option value="filled"></option><option value="none"></option></datalist>
            <small v-if="fieldIssue('tagStyle')" class="field-message field-message--warning">{{ fieldIssue('tagStyle')?.message }}</small>
          </label>
        </section>
      </main>

      <main v-else class="badge-inspector badge-inspector--empty">
        <span>＋</span>
        <h3>Start a badge stack</h3>
        <p>Import a community set or add your first matching rule.</p>
        <button type="button" class="studio-button studio-button--primary" @click="addBadge">New badge</button>
      </main>

      <aside class="preview-panel" aria-labelledby="preview-heading">
        <div class="panel-heading preview-heading">
          <div>
            <span class="section-eyebrow">Test bench</span>
            <h3 id="preview-heading">Live stream preview</h3>
          </div>
          <span class="live-pill"><span></span>Live</span>
        </div>

        <label class="field preview-title-field">
          <span>Stream metadata</span>
          <textarea v-model="streamTitle" rows="4" spellcheck="false"></textarea>
        </label>
        <label class="sample-select">
          <span>Try a sample</span>
          <select @change="applySample">
            <option value="">Choose a test title…</option>
            <option v-for="sample in previewSamples" :key="sample" :value="sample">{{ sample }}</option>
          </select>
        </label>

        <div class="preview-mode" aria-label="Preview matching mode">
          <button type="button" :class="{ active: previewMode === 'apps' }" :aria-pressed="previewMode === 'apps'" @click="previewMode = 'apps'">Current apps</button>
          <button type="button" :class="{ active: previewMode === 'priority' }" :aria-pressed="previewMode === 'priority'" @click="previewMode = 'priority'">Wiki priority</button>
        </div>

        <div class="stream-card">
          <div class="stream-card-art" aria-hidden="true"><span>N</span></div>
          <div class="stream-card-copy">
            <span class="stream-card-label">Test stream</span>
            <strong>{{ streamTitle || 'Untitled stream' }}</strong>
            <div v-if="previewBadges.length" class="preview-badges">
              <div
                v-for="badge in previewBadges"
                :key="`${badge.id}-${badge.imageURL}`"
                class="preview-chip"
                :title="badge.name"
                :style="{ '--badge-fill': androidColorToCss(badge.tagColor), '--badge-stroke': androidColorToCss(badge.borderColor) }"
              >
                <img
                  v-if="isImageVisible(badge.imageURL)"
                  :src="badge.imageURL"
                  :alt="badge.name"
                  @error="markImageFailed(badge.imageURL)"
                >
                <span v-else>{{ badge.name }}</span>
              </div>
            </div>
            <span v-else class="no-matches">No visible badges matched</span>
          </div>
        </div>

        <p class="preview-explainer">
          <template v-if="previewMode === 'apps'">Shows up to nine image badges in global order, matching current clients.</template>
          <template v-else>Shows only the first matching image badge per group, matching the wiki priority guide.</template>
        </p>

        <section class="validation-panel" aria-labelledby="validation-heading">
          <div class="validation-heading">
            <div>
              <span class="section-eyebrow">Preflight</span>
              <h4 id="validation-heading">Validation</h4>
            </div>
            <span :class="['validation-total', { ready: !blockingIssues.length }]">
              {{ blockingIssues.length ? `${blockingIssues.length} blocking` : 'Export ready' }}
            </span>
          </div>
          <ul v-if="issues.length" class="issue-list">
            <li v-for="(issue, index) in issues.slice(0, 6)" :key="`${issue.badgeId}-${issue.field}-${index}`" :class="issue.severity">
              <button type="button" @click="selectIssue(issue)">
                <span aria-hidden="true">{{ issue.severity === 'error' ? '!' : '·' }}</span>
                <span><strong>{{ issue.badgeId || 'Workspace' }}</strong>{{ issue.message }}</span>
              </button>
            </li>
          </ul>
          <p v-else class="validation-empty"><span aria-hidden="true">✓</span> No schema or compatibility issues found.</p>
          <p v-if="issues.length > 6" class="more-issues">+ {{ issues.length - 6 }} more checks in the affected badges</p>
        </section>

        <section class="export-panel" aria-labelledby="export-heading">
          <div class="export-heading">
            <div>
              <span class="section-eyebrow">Output</span>
              <h4 id="export-heading">Badge JSON</h4>
            </div>
            <span>{{ jsonOutput.split('\n').length }} lines</span>
          </div>
          <div class="export-actions">
            <button type="button" class="studio-button studio-button--primary" :disabled="blockingIssues.length > 0" @click="copyJson">Copy JSON</button>
            <button type="button" class="studio-button studio-button--quiet" :disabled="blockingIssues.length > 0" @click="downloadJson">Download</button>
          </div>
          <details class="raw-json">
            <summary>Inspect formatted output</summary>
            <textarea :value="jsonOutput" rows="12" readonly spellcheck="false"></textarea>
          </details>
        </section>
      </aside>
    </div>

    <footer class="studio-footer" aria-live="polite">
      <span class="save-indicator"><span aria-hidden="true"></span>{{ notice }}</span>
      <span>{{ warnings.length }} compatibility {{ warnings.length === 1 ? 'warning' : 'warnings' }}</span>
    </footer>
  </div>
</template>

<style scoped>
.badge-studio {
  --studio-line: color-mix(in srgb, var(--vp-c-divider) 88%, transparent);
  --studio-muted: color-mix(in srgb, var(--vp-c-text-3) 88%, transparent);
  container-type: inline-size;
  overflow: hidden;
  border: 1px solid var(--studio-line);
  border-radius: 18px;
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-text-1);
}

button,
input,
select,
textarea {
  font: inherit;
}

button:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.studio-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 22px;
  padding: 28px 30px 22px;
  border-bottom: 1px solid var(--studio-line);
  background:
    radial-gradient(circle at 88% 0%, color-mix(in srgb, var(--vp-c-brand-1) 13%, transparent), transparent 34%),
    var(--vp-c-bg-elv);
}

.studio-heading {
  min-width: 0;
}

.studio-kicker,
.section-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--vp-c-text-3);
  font-size: 10px;
  font-weight: 760;
  letter-spacing: 0.13em;
  line-height: 1;
  text-transform: uppercase;
}

.studio-kicker-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
  box-shadow: 0 0 0 4px var(--vp-c-brand-soft);
}

.studio-heading h2 {
  margin: 12px 0 7px !important;
  border: 0 !important;
  font-size: clamp(21px, 2.4cqi, 29px) !important;
  font-weight: 720;
  letter-spacing: -0.035em;
  line-height: 1.15;
}

.studio-heading p {
  margin: 0 !important;
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.5;
}

.studio-commands {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.studio-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 8px 13px;
  border: 1px solid var(--studio-line);
  border-radius: 9px;
  color: var(--vp-c-text-1);
  font-size: 12px;
  font-weight: 690;
  line-height: 1;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.studio-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.studio-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.studio-button--quiet {
  background: color-mix(in srgb, var(--vp-c-bg-soft) 68%, transparent);
}

.studio-button--quiet:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 36%, var(--studio-line));
  background: var(--vp-c-bg-soft);
}

.studio-button--primary {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  color: var(--vp-c-bg);
}

.dark .studio-button--primary {
  color: #17121e;
}

.studio-button--wide {
  width: 100%;
}

.studio-metrics {
  grid-column: 1 / -1;
  display: flex;
  gap: 20px;
  padding-top: 18px;
  border-top: 1px solid var(--studio-line);
  color: var(--vp-c-text-3);
  font-size: 11px;
}

.studio-metrics span {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
}

.studio-metrics strong {
  color: var(--vp-c-text-1);
  font-size: 14px;
}

.studio-metrics .metric-alert strong {
  color: #e45353;
}

.studio-drawer {
  padding: 24px 30px;
  border-bottom: 1px solid var(--studio-line);
  background: color-mix(in srgb, var(--vp-c-bg-soft) 45%, var(--vp-c-bg-elv));
}

.drawer-heading,
.drawer-footer,
.panel-heading,
.validation-heading,
.export-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.drawer-heading h3,
.panel-heading h3,
.validation-heading h4,
.export-heading h4 {
  margin: 6px 0 0 !important;
  font-size: 16px !important;
  line-height: 1.2;
}

.compact-field,
.field,
.sample-select {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.compact-field > span,
.field > span,
.sample-select > span {
  color: var(--vp-c-text-2);
  font-size: 11px;
  font-weight: 660;
}

.field input,
.field select,
.field textarea,
.compact-field select,
.sample-select select,
.group-filter,
.group-row input[type='text'] {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--studio-line);
  border-radius: 8px;
  background: color-mix(in srgb, var(--vp-c-bg) 72%, var(--vp-c-bg-elv));
  color: var(--vp-c-text-1);
  font-size: 12px;
  line-height: 1.4;
}

.field input,
.field select,
.compact-field select,
.sample-select select,
.group-filter,
.group-row input[type='text'] {
  min-height: 38px;
  padding: 8px 10px;
}

.field textarea {
  resize: vertical;
  padding: 10px;
  font-family: var(--vp-font-family-mono);
}

.field input::placeholder,
.field textarea::placeholder {
  color: var(--vp-c-text-3);
}

.field .has-error {
  border-color: #d95555;
}

.field .has-warning {
  border-color: #b58028;
}

.import-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(210px, 0.65fr);
  gap: 22px;
  margin-top: 20px;
}

.import-sources {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.import-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--vp-c-text-3);
  font-size: 10px;
  text-transform: uppercase;
}

.import-divider::before,
.import-divider::after {
  flex: 1;
  height: 1px;
  background: var(--studio-line);
  content: '';
}

.drawer-footer {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--studio-line);
}

.drawer-footer p {
  margin: 0 !important;
  color: var(--vp-c-text-3);
  font-size: 11px;
}

.drawer-footer .drawer-error {
  color: #db5f5f;
}

.group-grid {
  display: grid;
  gap: 8px;
  margin-top: 20px;
}

.group-row {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) minmax(0, 1fr) 34px;
  align-items: end;
  gap: 10px;
}

.group-row label {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.group-row label span {
  color: var(--vp-c-text-3);
  font-size: 10px;
}

.group-swatch {
  width: 40px;
  height: 38px;
  padding: 3px;
  border: 1px solid var(--studio-line);
  border-radius: 8px;
  background: var(--vp-c-bg);
}

.icon-button {
  width: 34px;
  height: 38px;
  border: 1px solid var(--studio-line);
  border-radius: 8px;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
}

.icon-button--danger:hover {
  border-color: color-mix(in srgb, #db5f5f 54%, var(--studio-line));
  color: #db5f5f;
}

.studio-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}

.badge-queue,
.badge-inspector,
.preview-panel {
  min-width: 0;
}

.badge-queue {
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--studio-line);
  background: color-mix(in srgb, var(--vp-c-bg-soft) 32%, var(--vp-c-bg-elv));
}

.queue-heading,
.inspector-heading,
.preview-heading {
  min-height: 74px;
  padding: 20px 22px;
  border-bottom: 1px solid var(--studio-line);
}

.queue-count,
.live-pill,
.validation-total {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 4px 8px;
  border: 1px solid var(--studio-line);
  border-radius: 999px;
  color: var(--vp-c-text-2);
  font-size: 10px;
  font-weight: 690;
}

.queue-tools {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 112px;
  gap: 8px;
  padding: 14px 14px 8px;
}

.search-field {
  position: relative;
  min-width: 0;
}

.search-field svg {
  position: absolute;
  top: 50%;
  left: 11px;
  width: 15px;
  height: 15px;
  transform: translateY(-50%);
  fill: none;
  stroke: var(--vp-c-text-3);
  stroke-linecap: round;
  stroke-width: 1.8;
}

.search-field input {
  width: 100%;
  min-width: 0;
  height: 36px;
  padding: 8px 8px 8px 34px;
  border: 1px solid var(--studio-line);
  border-radius: 8px;
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-text-1);
  font-size: 11px;
}

.group-filter {
  min-height: 36px;
  padding: 6px 8px;
  font-size: 10px;
}

.queue-bulk {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 15px 10px;
  color: var(--vp-c-text-3);
  font-size: 9px;
}

.queue-bulk div {
  display: flex;
  gap: 7px;
}

.queue-bulk button,
.inspector-actions button {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--vp-c-text-2);
  font-size: 10px;
  font-weight: 670;
  cursor: pointer;
}

.queue-bulk button:hover,
.inspector-actions button:hover {
  color: var(--vp-c-brand-1);
}

.badge-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-height: 650px;
  margin: 0 !important;
  padding: 4px 10px 14px !important;
  overflow-y: auto;
  list-style: none !important;
}

.badge-row {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  transition: background 0.16s ease, border-color 0.16s ease, opacity 0.16s ease;
}

.badge-row:hover {
  background: color-mix(in srgb, var(--vp-c-bg-elv) 76%, transparent);
}

.badge-row.is-selected {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 32%, var(--studio-line));
  background: color-mix(in srgb, var(--vp-c-brand-soft) 70%, var(--vp-c-bg-elv));
}

.badge-row.is-disabled {
  opacity: 0.55;
}

.badge-select {
  display: grid;
  grid-template-columns: 25px minmax(0, 1fr) 7px;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 10px 5px 10px 9px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.priority-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 25px;
  height: 25px;
  border: 1px solid var(--studio-line);
  border-radius: 7px;
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono);
  font-size: 9px;
}

.is-selected .priority-number {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 42%, transparent);
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

.badge-row-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.badge-row-copy strong,
.badge-row-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge-row-copy strong {
  font-size: 11px;
  font-weight: 690;
}

.badge-row-copy small {
  color: var(--vp-c-text-3);
  font-size: 9px;
}

.match-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--studio-line);
}

.badge-row.is-matched .match-dot {
  background: #41b883;
  box-shadow: 0 0 0 3px color-mix(in srgb, #41b883 15%, transparent);
}

.badge-row.is-shadowed .match-dot {
  background: #d7a63d;
}

.badge-row-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  padding-right: 6px;
}

.badge-row-actions > button {
  width: 24px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--vp-c-text-3);
  font-size: 11px;
  cursor: pointer;
}

.badge-row-actions > button:hover:not(:disabled) {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
}

.badge-row-actions > button:disabled {
  opacity: 0.25;
  cursor: not-allowed;
}

.mini-switch {
  position: relative;
  display: inline-flex;
  margin-right: 2px;
}

.mini-switch input,
.full-switch input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.mini-switch span {
  position: relative;
  width: 25px;
  height: 15px;
  border-radius: 99px;
  background: var(--vp-c-bg-soft);
  cursor: pointer;
}

.mini-switch span::after {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--vp-c-text-3);
  content: '';
  transition: transform 0.16s ease, background 0.16s ease;
}

.mini-switch input:checked + span {
  background: var(--vp-c-brand-soft);
}

.mini-switch input:checked + span::after {
  transform: translateX(10px);
  background: var(--vp-c-brand-1);
}

.mini-switch input:focus-visible + span {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.queue-empty,
.badge-inspector--empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 250px;
  padding: 28px;
  color: var(--vp-c-text-3);
  text-align: center;
}

.queue-empty span,
.badge-inspector--empty > span {
  color: var(--vp-c-brand-1);
  font-size: 26px;
}

.queue-empty p,
.badge-inspector--empty p {
  margin: 8px 0 16px !important;
  font-size: 12px;
}

.badge-inspector {
  border-bottom: 1px solid var(--studio-line);
  background: var(--vp-c-bg-elv);
}

.inspector-heading h3 {
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspector-actions {
  display: flex;
  gap: 12px;
}

.inspector-actions .danger-text:hover {
  color: #db5f5f;
}

.inspector-section {
  padding: 24px 26px 28px;
  border-bottom: 1px solid var(--studio-line);
}

.inspector-section:last-child {
  border-bottom: 0;
}

.section-title {
  display: grid;
  grid-template-columns: 27px minmax(0, 1fr);
  gap: 11px;
  margin-bottom: 20px;
}

.section-title > span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 27px;
  height: 27px;
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 25%, var(--studio-line));
  border-radius: 8px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-family: var(--vp-font-family-mono);
  font-size: 8px;
}

.section-title h4 {
  margin: 0 !important;
  font-size: 13px;
}

.section-title p {
  margin: 3px 0 0 !important;
  color: var(--vp-c-text-3);
  font-size: 10px;
  line-height: 1.45;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 15px;
}

.field-message {
  color: #dc5d5d;
  font-size: 9px;
  line-height: 1.35;
}

.field-message--warning {
  color: #b58028;
}

.full-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--studio-line);
  cursor: pointer;
}

.full-switch > span:first-child {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.full-switch strong {
  font-size: 11px;
}

.full-switch small {
  color: var(--vp-c-text-3);
  font-size: 9px;
}

.switch-track {
  position: relative;
  flex: 0 0 auto;
  width: 36px;
  height: 20px;
  border-radius: 99px;
  background: var(--vp-c-bg-soft);
  transition: background 0.16s ease;
}

.switch-track::after {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--vp-c-text-3);
  content: '';
  transition: transform 0.16s ease, background 0.16s ease;
}

.full-switch input:checked + .switch-track {
  background: var(--vp-c-brand-soft);
}

.full-switch input:checked + .switch-track::after {
  transform: translateX(16px);
  background: var(--vp-c-brand-1);
}

.full-switch input:focus-visible + .switch-track {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.pattern-result {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid var(--studio-line);
  border-radius: 9px;
  background: color-mix(in srgb, var(--vp-c-bg-soft) 48%, transparent);
}

.pattern-result-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-3);
  font-size: 11px;
  font-weight: 800;
}

.pattern-result div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.pattern-result strong,
.pattern-result small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pattern-result strong {
  font-size: 10px;
}

.pattern-result small {
  color: var(--vp-c-text-3);
  font-size: 9px;
}

.pattern-result.is-match {
  border-color: color-mix(in srgb, #41b883 36%, var(--studio-line));
  background: color-mix(in srgb, #41b883 8%, transparent);
}

.pattern-result.is-match .pattern-result-icon {
  background: color-mix(in srgb, #41b883 14%, transparent);
  color: #41b883;
}

.pattern-result.is-error {
  border-color: color-mix(in srgb, #db5f5f 36%, var(--studio-line));
}

.pattern-result.is-error .pattern-result-icon {
  color: #db5f5f;
}

.artwork-preview {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 12px;
  padding: 16px;
  border: 1px dashed var(--studio-line);
  border-radius: 10px;
  background: color-mix(in srgb, #11141a 92%, var(--vp-c-bg));
}

.artwork-preview p {
  margin: 0 !important;
  color: #8f97a3;
  font-size: 9px;
  line-height: 1.45;
}

.preview-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-width: 34px;
  max-width: 92px;
  height: 20px;
  padding: 1px 4px;
  overflow: hidden;
  border: 1px solid var(--badge-stroke, rgba(255, 255, 255, 0.32));
  border-radius: 5px;
  background: var(--badge-fill, rgba(255, 255, 255, 0.08));
  color: white;
}

.preview-chip img {
  display: block;
  width: auto;
  max-width: 84px;
  height: 16px;
  border-radius: 2px;
  object-fit: contain;
}

.preview-chip span {
  overflow: hidden;
  font-size: 7px;
  font-weight: 760;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-chip--large {
  min-width: 54px;
  max-width: 112px;
  height: 26px;
}

.preview-chip--large img {
  max-width: 102px;
  height: 20px;
}

.preview-chip--large span {
  font-size: 9px;
}

.appearance-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.color-control {
  min-width: 0;
  padding: 11px;
  border: 1px solid var(--studio-line);
  border-radius: 10px;
  background: color-mix(in srgb, var(--vp-c-bg-soft) 35%, transparent);
}

.color-control-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 9px;
}

.color-control-heading span {
  font-size: 10px;
  font-weight: 690;
}

.color-control-heading code {
  padding: 0;
  overflow: hidden;
  border: 0 !important;
  background: transparent !important;
  color: var(--vp-c-text-3) !important;
  font-size: 8px;
  text-overflow: ellipsis;
}

.color-input-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 6px;
}

.color-input-row input[type='color'] {
  width: 34px;
  height: 32px;
  padding: 3px;
  border: 1px solid var(--studio-line);
  border-radius: 7px;
  background: var(--vp-c-bg);
}

.color-input-row input[type='text'] {
  width: 100%;
  min-width: 0;
  height: 32px;
  padding: 6px 7px;
  border: 1px solid var(--studio-line);
  border-radius: 7px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-family: var(--vp-font-family-mono);
  font-size: 8px;
}

.alpha-control {
  display: grid;
  grid-template-columns: auto minmax(30px, 1fr) auto;
  align-items: center;
  gap: 5px;
  margin-top: 9px;
  color: var(--vp-c-text-3);
  font-size: 8px;
}

.alpha-control input {
  min-width: 0;
  accent-color: var(--vp-c-brand-1);
}

.alpha-control output {
  min-width: 25px;
  text-align: right;
}

.style-field {
  margin-top: 14px;
}

.preview-panel {
  padding: 0 20px 22px;
  background: color-mix(in srgb, var(--vp-c-bg-soft) 26%, var(--vp-c-bg-elv));
}

.preview-heading {
  margin: 0 -20px 18px;
}

.live-pill {
  gap: 5px;
  color: #41b883;
}

.live-pill span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px color-mix(in srgb, #41b883 15%, transparent);
}

.preview-title-field textarea {
  min-height: 82px;
  font-size: 10px;
}

.sample-select {
  margin-top: 9px;
}

.sample-select select {
  font-size: 10px;
}

.preview-mode {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 3px;
  margin: 16px 0 10px;
  padding: 3px;
  border: 1px solid var(--studio-line);
  border-radius: 9px;
  background: var(--vp-c-bg-soft);
}

.preview-mode button {
  min-height: 31px;
  padding: 5px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--vp-c-text-3);
  font-size: 9px;
  font-weight: 680;
  cursor: pointer;
}

.preview-mode button.active {
  background: var(--vp-c-bg-elv);
  color: var(--vp-c-text-1);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.stream-card {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr);
  gap: 11px;
  padding: 12px;
  border: 1px solid #2b2f37;
  border-radius: 12px;
  background: #14171d;
  color: #f6f7f9;
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.025);
}

.stream-card-art {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 58px;
  border-radius: 8px;
  background:
    linear-gradient(145deg, rgba(192, 132, 252, 0.9), rgba(88, 15, 212, 0.65)),
    #6b16ed;
}

.stream-card-art span {
  color: white;
  font-size: 20px;
  font-weight: 820;
  letter-spacing: -0.08em;
}

.stream-card-copy {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.stream-card-label {
  color: #777f8b;
  font-size: 7px;
  font-weight: 720;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.stream-card-copy > strong {
  display: -webkit-box;
  overflow: hidden;
  color: #f5f7fa;
  font-size: 9px;
  font-weight: 620;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.preview-badges {
  display: flex;
  gap: 3px;
  min-width: 0;
  overflow: hidden;
}

.no-matches {
  color: #6e7682;
  font-size: 8px;
}

.preview-explainer {
  margin: 8px 2px 0 !important;
  color: var(--vp-c-text-3);
  font-size: 9px;
  line-height: 1.5;
}

.validation-panel,
.export-panel {
  margin-top: 22px;
  padding-top: 20px;
  border-top: 1px solid var(--studio-line);
}

.validation-total.ready {
  border-color: color-mix(in srgb, #41b883 35%, var(--studio-line));
  color: #41a675;
}

.issue-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 12px 0 0 !important;
  padding: 0 !important;
  list-style: none !important;
}

.issue-list button {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 7px;
  width: 100%;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--vp-c-text-2);
  text-align: left;
  cursor: pointer;
}

.issue-list button:hover {
  background: var(--vp-c-bg-soft);
}

.issue-list button > span:first-child {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: 9px;
  font-weight: 800;
}

.issue-list .error button > span:first-child {
  background: color-mix(in srgb, #db5f5f 14%, transparent);
  color: #db5f5f;
}

.issue-list .warning button > span:first-child {
  background: color-mix(in srgb, #d4a33d 14%, transparent);
  color: #b88724;
}

.issue-list button > span:last-child {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: 9px;
  line-height: 1.35;
}

.issue-list strong {
  overflow: hidden;
  color: var(--vp-c-text-1);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.validation-empty {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 12px 0 0 !important;
  color: #3f9f70;
  font-size: 9px;
}

.validation-empty span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: color-mix(in srgb, #41b883 14%, transparent);
}

.more-issues {
  margin: 8px 0 0 !important;
  color: var(--vp-c-text-3);
  font-size: 8px;
  text-align: center;
}

.export-heading > span {
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono);
  font-size: 9px;
}

.export-actions {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 7px;
  margin-top: 13px;
}

.raw-json {
  margin-top: 10px;
}

.raw-json summary {
  color: var(--vp-c-text-3);
  font-size: 9px;
  cursor: pointer;
}

.raw-json textarea {
  width: 100%;
  margin-top: 9px;
  padding: 10px;
  resize: vertical;
  border: 1px solid var(--studio-line);
  border-radius: 8px;
  background: #14171d;
  color: #c7ccd5;
  font-family: var(--vp-font-family-mono);
  font-size: 8px;
  line-height: 1.55;
}

.studio-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 11px 16px;
  border-top: 1px solid var(--studio-line);
  background: color-mix(in srgb, var(--vp-c-bg-soft) 46%, var(--vp-c-bg-elv));
  color: var(--vp-c-text-3);
  font-size: 9px;
}

.save-indicator {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.save-indicator > span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #41b883;
}

.empty-copy {
  margin: 0 !important;
  color: var(--vp-c-text-3);
  font-size: 11px;
}

.visually-hidden {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  padding: 0 !important;
  margin: -1px !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  white-space: nowrap !important;
  border: 0 !important;
}

@container (min-width: 720px) {
  .studio-grid {
    grid-template-columns: 270px minmax(0, 1fr);
  }

  .badge-queue {
    border-right: 1px solid var(--studio-line);
    border-bottom: 0;
  }

  .badge-inspector {
    border-bottom: 0;
  }

  .preview-panel {
    grid-column: 1 / -1;
    border-top: 1px solid var(--studio-line);
  }
}

@container (min-width: 1040px) {
  .studio-grid {
    grid-template-columns: 280px minmax(420px, 1fr) 310px;
    align-items: start;
  }

  .badge-queue,
  .badge-inspector {
    min-height: 100%;
  }

  .badge-inspector {
    border-right: 1px solid var(--studio-line);
  }

  .preview-panel {
    position: sticky;
    top: 16px;
    grid-column: auto;
    border-top: 0;
  }
}

@container (max-width: 719px) {
  .studio-header {
    grid-template-columns: minmax(0, 1fr);
    padding: 22px 18px 18px;
  }

  .studio-commands {
    justify-content: flex-start;
  }

  .studio-metrics {
    gap: 12px;
    overflow-x: auto;
  }

  .studio-metrics span {
    white-space: nowrap;
  }

  .studio-drawer {
    padding: 20px 18px;
  }

  .drawer-heading,
  .drawer-footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .import-grid,
  .form-grid,
  .appearance-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .group-row {
    grid-template-columns: 40px minmax(0, 1fr) 34px;
  }

  .group-row label:nth-of-type(2) {
    grid-column: 2 / 3;
  }

  .badge-list {
    max-height: 430px;
  }

  .inspector-section {
    padding: 22px 18px 25px;
  }

  .preview-panel {
    padding-right: 18px;
    padding-left: 18px;
  }

  .preview-heading {
    margin-right: -18px;
    margin-left: -18px;
  }

  .studio-footer {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
