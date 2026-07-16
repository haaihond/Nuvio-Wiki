<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useData, useRoute, withBase } from 'vitepress'
import NuvioSearch from './NuvioSearch.vue'

type SidebarItem = {
  text: string
  link?: string
  items?: SidebarItem[]
}

type SidebarSection = {
  key: string
  text: string
  link?: string
  items: SidebarItem[]
}

const route = useRoute()
const { isDark, site, theme, frontmatter } = useData()
const collapsed = ref(frontmatter.value?.layout === 'home')
const hovered = ref(false)
const expanded = reactive(new Set<string>())
let leaveTimer: number | undefined
const searchOpen = ref(false)
const searchInitialTab = ref<'search' | 'ai'>('search')

function openSearch(tab: 'search' | 'ai' = 'search') {
  searchInitialTab.value = tab
  searchOpen.value = true
}

function openAI() {
  openSearch('ai')
}

const isDutch = computed(() => route.path.startsWith('/nl/'))

function normalizePath(path = '') {
  const withoutBase = path.replace(site.value.base, '/')
  return withoutBase
    .replace(/index\.html$/, '')
    .replace(/\.html$/, '')
    .replace(/\/$/, '') || '/'
}

function isCurrent(link?: string) {
  if (!link) return false
  return normalizePath(route.path) === normalizePath(link)
}

function containsCurrent(items: SidebarItem[]): boolean {
  return items.some((item) => isCurrent(item.link) || containsCurrent(item.items || []))
}

const rawItems = computed<SidebarItem[]>(() => {
  const sidebar = theme.value.sidebar as SidebarItem[] | Record<string, SidebarItem[]> | undefined
  if (Array.isArray(sidebar)) return sidebar
  if (!sidebar) return []

  const current = normalizePath(route.path)
  const prefix = Object.keys(sidebar)
    .sort((a, b) => b.length - a.length)
    .find((key) => current.startsWith(normalizePath(key)))

  return prefix ? sidebar[prefix] : []
})

const sections = computed<SidebarSection[]>(() => {
  const source = rawItems.value
  const firstFolder = source.findIndex((item) => item.items?.length)
  const lastFolder = source.reduce(
    (last, item, index) => item.items?.length ? index : last,
    -1
  )
  const result: SidebarSection[] = []

  const leading = firstFolder === -1 ? source : source.slice(0, firstFolder)
  if (leading.length) {
    result.push({
      key: 'get-started',
      text: isDutch.value ? 'Aan de slag' : 'Get Started',
      items: leading
    })
  }

  if (firstFolder !== -1) {
    source.slice(firstFolder, lastFolder + 1).forEach((item, index) => {
      if (!item.items?.length) {
        result.push({
          key: `page-${index}-${item.text}`,
          text: item.text,
          link: item.link,
          items: []
        })
        return
      }

      result.push({
        key: `folder-${index}-${item.text}`,
        text: item.text,
        items: [
          ...(item.link ? [{ text: isDutch.value ? 'Overzicht' : 'Overview', link: item.link }] : []),
          ...item.items
        ]
      })
    })
  }

  const trailing = lastFolder === -1 ? [] : source.slice(lastFolder + 1)
  if (trailing.length) {
    result.push({
      key: 'resources',
      text: isDutch.value ? 'Bronnen' : 'Resources',
      items: trailing
    })
  }

  return result
})

watch(
  sections,
  (next) => {
    next.forEach((section, index) => {
      if (isCurrent(section.link) || containsCurrent(section.items) || index === 0) {
        expanded.add(section.key)
      }
    })
  },
  { immediate: true }
)

watch(
  () => route.path,
  () => {
    collapsed.value = frontmatter.value.layout === 'home'
    syncRootState()
    sections.value.forEach((section) => {
      if (isCurrent(section.link) || containsCurrent(section.items)) {
        expanded.add(section.key)
      }
    })
  },
  { immediate: true }
)

function syncRootState() {
  if (typeof window === 'undefined') return
  document.documentElement.classList.toggle('nuvio-sidebar-collapsed', collapsed.value)
  document.documentElement.classList.toggle(
    'nuvio-sidebar-hovered',
    collapsed.value && hovered.value
  )
}

function toggleSidebar() {
  collapsed.value = !collapsed.value
  hovered.value = false
  syncRootState()
}

function revealSidebar() {
  if (!collapsed.value) return
  window.clearTimeout(leaveTimer)
  hovered.value = true
  syncRootState()
}

function hideSidebar() {
  if (!collapsed.value) return
  window.clearTimeout(leaveTimer)
  leaveTimer = window.setTimeout(() => {
    hovered.value = false
    syncRootState()
  }, 350)
}

function closeSearch() {
  searchOpen.value = false
}

// Global Ctrl+K / Cmd+K shortcut
function onGlobalKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    openSearch('search')
  }
}

onMounted(() => document.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onGlobalKeydown))

function toggleSection(key: string) {
  expanded.has(key) ? expanded.delete(key) : expanded.add(key)
}

function toggleAppearance() {
  isDark.value = !isDark.value
}

onMounted(syncRootState)

onBeforeUnmount(() => {
  window.clearTimeout(leaveTimer)
  document.documentElement.classList.remove(
    'nuvio-sidebar-collapsed',
    'nuvio-sidebar-hovered'
  )
})
</script>

<template>
  <aside
    class="nuvio-sidebar"
    aria-label="Documentation sidebar"
    @pointerenter="revealSidebar"
    @pointerleave="hideSidebar"
  >
    <header class="nuvio-sidebar__header">
      <div class="nuvio-sidebar__brand-row">
        <a class="nuvio-sidebar__brand" :href="withBase('/')">
          <img :src="withBase('/logo.png')" alt="" />
          <span>{{ site.title }}</span>
        </a>
        <button
          class="nuvio-icon-button nuvio-sidebar__collapse"
          type="button"
          :aria-label="isDutch ? 'Zijbalk inklappen' : 'Collapse sidebar'"
          @click="toggleSidebar"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
            <path d="M9 4v16" />
          </svg>
        </button>
      </div>

      <button class="nuvio-sidebar__search" type="button" @click="openSearch('search')">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
        <span>Search or Ask AI</span>
        <kbd>Ctrl</kbd><kbd>K</kbd>
      </button>
    </header>
 
    <nav class="nuvio-sidebar__nav" aria-label="Documentation">
      <a class="nuvio-sidebar__ask-ai-button" href="https://ko-fi.com/haaihond" target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
          <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
          <line x1="6" y1="1" x2="6" y2="4" />
          <line x1="10" y1="1" x2="10" y2="4" />
          <line x1="14" y1="1" x2="14" y2="4" />
        </svg>
        <span>Support me on Ko-fi</span>
      </a>

      <section v-for="section in sections" :key="section.key" class="nuvio-sidebar__section">
        <a
          v-if="section.link"
          class="nuvio-sidebar__section-trigger"
          :class="{ 'is-active': isCurrent(section.link) }"
          :href="withBase(section.link)"
          :aria-current="isCurrent(section.link) ? 'page' : undefined"
        >
          <span>{{ section.text }}</span>
        </a>
        <button
          v-else
          class="nuvio-sidebar__section-trigger"
          type="button"
          :aria-expanded="expanded.has(section.key)"
          @click="toggleSection(section.key)"
        >
          <span>{{ section.text }}</span>
          <svg :class="{ 'is-open': expanded.has(section.key) }" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>

        <Transition name="expand">
          <div v-show="expanded.has(section.key)" class="nuvio-sidebar__section-items">
            <div class="nuvio-sidebar__section-items-inner">
              <template v-for="item in section.items" :key="item.link || item.text">
                <a
                  v-if="item.link"
                  class="nuvio-sidebar__link"
                  :class="{ 'is-active': isCurrent(item.link) }"
                  :href="withBase(item.link)"
                  :aria-current="isCurrent(item.link) ? 'page' : undefined"
                >
                  {{ item.text }}
                </a>
                <p v-else class="nuvio-sidebar__subheading">{{ item.text }}</p>

                <a
                  v-for="child in item.items || []"
                  :key="child.link || child.text"
                  class="nuvio-sidebar__link nuvio-sidebar__link--nested"
                  :class="{ 'is-active': isCurrent(child.link) }"
                  :href="child.link ? withBase(child.link) : undefined"
                  :aria-current="isCurrent(child.link) ? 'page' : undefined"
                >
                  {{ child.text }}
                </a>
              </template>
            </div>
          </div>
        </Transition>
      </section>
    </nav>

    <footer class="nuvio-sidebar__footer">
      <div class="nuvio-sidebar__socials">
        <a
          class="nuvio-sidebar__social-link"
          href="https://github.com/haaihond/Nuvio-Wiki"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Nuvio Wiki on GitHub"
        >
          <svg class="is-filled" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.3-5.28-1.29-5.28-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.47.11-3.05 0 0 .96-.31 3.16 1.18a10.9 10.9 0 0 1 5.75 0c2.2-1.5 3.16-1.18 3.16-1.18.62 1.58.23 2.76.11 3.05.74.81 1.18 1.83 1.18 3.09 0 4.42-2.71 5.4-5.29 5.68.42.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
          </svg>
        </a>
        <a
          class="nuvio-sidebar__social-link"
          href="https://discord.gg/nuvio"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Nuvio community on Discord"
        >
          <svg class="is-filled" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20.3 4.4A19.8 19.8 0 0 0 15.9 3l-.56 1.18a18.3 18.3 0 0 0-5.3 0A12.6 12.6 0 0 0 9.46 3a19.7 19.7 0 0 0-4.44 1.37C2.22 8.54 1.46 12.6 1.84 16.6a19.9 19.9 0 0 0 5.44 2.72c.44-.6.83-1.23 1.17-1.91-.64-.24-1.26-.54-1.84-.88l.45-.36c3.56 1.64 7.42 1.64 10.93 0l.45.36c-.59.35-1.2.64-1.84.88.34.66.73 1.3 1.17 1.91a19.9 19.9 0 0 0 5.45-2.72c.46-4.64-.78-8.66-3.9-12.23ZM8.02 14.18c-1.07 0-1.94-.98-1.94-2.19 0-1.2.86-2.18 1.94-2.18 1.09 0 1.96.98 1.94 2.18 0 1.21-.86 2.19-1.94 2.19Zm7.14 0c-1.07 0-1.94-.98-1.94-2.19 0-1.2.86-2.18 1.94-2.18 1.09 0 1.96.98 1.94 2.18 0 1.21-.85 2.19-1.94 2.19Z" />
          </svg>
        </a>
      </div>

      <button
        class="nuvio-sidebar__theme-toggle"
        type="button"
        :aria-label="isDark ? 'Use light theme' : 'Use dark theme'"
        @click="toggleAppearance"
      >
        <svg
          class="nuvio-sidebar__theme-icon nuvio-sidebar__theme-icon--sun"
          :class="{ 'is-active': !isDark }"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
        </svg>
        <svg
          class="nuvio-sidebar__theme-icon nuvio-sidebar__theme-icon--moon"
          :class="{ 'is-active': isDark }"
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="none"
          aria-hidden="true"
        >
          <path d="M20.3 15.2A8.5 8.5 0 0 1 8.8 3.7 8.5 8.5 0 1 0 20.3 15.2Z" />
        </svg>
      </button>
    </footer>
  </aside>

  <div class="nuvio-sidebar__edge" aria-hidden="true" @pointerenter="revealSidebar"></div>

  <div class="nuvio-sidebar__rail" aria-label="Sidebar controls">
    <button class="nuvio-icon-button" type="button" :aria-label="isDutch ? 'Zijbalk uitklappen' : 'Expand sidebar'" @click="toggleSidebar">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
        <path d="M9 4v16" />
      </svg>
    </button>
    <button class="nuvio-icon-button" type="button" aria-label="Search or Ask AI" @click="openSearch('search')">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4 4" />
      </svg>
    </button>
  </div>

  <NuvioSearch v-if="searchOpen" :is-dutch="isDutch" :initial-tab="searchInitialTab" @close="closeSearch" />
</template>
