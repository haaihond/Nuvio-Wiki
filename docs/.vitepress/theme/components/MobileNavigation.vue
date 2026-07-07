<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useData, useRoute, withBase } from 'vitepress'
import NuvioSearch from './NuvioSearch.vue'

type SidebarItem = {
  text: string
  link?: string
  items?: SidebarItem[]
}

type MobileSection = {
  key: string
  text: string
  link?: string
  items: SidebarItem[]
}

const route = useRoute()
const { isDark, site, theme, page } = useData()
const drawerOpen = ref(false)
const searchOpen = ref(false)
const expanded = reactive(new Set<string>())
const drawer = ref<HTMLElement>()
const menuButton = ref<HTMLButtonElement>()
const searchInitialTab = ref<'search' | 'ai'>('search')
const isDutch = computed(() => route.path.startsWith('/nl/'))

function normalizePath(path = '') {
  const withoutBase = path.replace(site.value.base, '/')
  return withoutBase
    .replace(/index\.html$/, '')
    .replace(/\.html$/, '')
    .replace(/\/$/, '') || '/'
}

function isCurrent(link?: string) {
  return Boolean(link) && normalizePath(route.path) === normalizePath(link)
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

const sections = computed<MobileSection[]>(() => {
  const source = rawItems.value
  const firstFolder = source.findIndex((item) => item.items?.length)
  const lastFolder = source.reduce(
    (last, item, index) => item.items?.length ? index : last,
    -1
  )
  const result: MobileSection[] = []

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

function syncScrollLock() {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('mobile-drawer-open', drawerOpen.value)
}

function openDrawer() {
  searchOpen.value = false
  drawerOpen.value = true
  syncScrollLock()
  nextTick(() => drawer.value?.focus())
}

function closeDrawer(restoreFocus = true) {
  drawerOpen.value = false
  syncScrollLock()
  if (restoreFocus) nextTick(() => menuButton.value?.focus())
}

function openSearch(tab: 'search' | 'ai' = 'search') {
  closeDrawer(false)
  searchInitialTab.value = tab
  searchOpen.value = true
}

function toggleSection(key: string) {
  expanded.has(key) ? expanded.delete(key) : expanded.add(key)
}

function toggleAppearance() {
  isDark.value = !isDark.value
}

function onKeydown(event: KeyboardEvent) {
  if (!drawerOpen.value) return

  if (event.key === 'Escape') {
    closeDrawer()
    return
  }

  if (event.key !== 'Tab' || !drawer.value) return

  const focusable = Array.from(
    drawer.value.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex="0"]')
  ).filter((element) => element.offsetParent !== null)
  if (!focusable.length) return

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement

  if (event.shiftKey && (active === first || !drawer.value.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || !drawer.value.contains(active))) {
    event.preventDefault()
    first.focus()
  }
}

watch(
  sections,
  (next) => {
    next.forEach((section) => {
      if (containsCurrent(section.items)) expanded.add(section.key)
    })
  },
  { immediate: true }
)

const outlineOpen = ref(false)
const scrollProgress = ref(0)
const activeHeading = ref<{ title: string; link: string; level: number } | null>(null)

const flatHeadings = computed(() => {
  const result: Array<{ title: string; link: string; level: number }> = []
  function recurse(headers: any[]) {
    for (const h of headers) {
      if (h.level >= 2 && h.level <= 3) {
        result.push({
          title: h.title,
          link: h.link || `#${h.slug}`,
          level: h.level
        })
      }
      if (h.children && h.children.length) {
        recurse(h.children)
      }
    }
  }
  if (page.value && page.value.headers) {
    recurse(page.value.headers)
  }
  return result
})

function updateScroll() {
  if (typeof window === 'undefined') return

  // Calculate scroll progress
  const scrollTop = window.scrollY
  const docHeight = document.documentElement.scrollHeight - window.innerHeight
  scrollProgress.value = docHeight > 0 ? scrollTop / docHeight : 0

  // Find active heading
  const headingsWithElements = flatHeadings.value.map(h => {
    const el = document.querySelector(h.link)
    return { ...h, element: el }
  }).filter(h => h.element !== null)

  if (!headingsWithElements.length) {
    activeHeading.value = null
    return
  }

  const threshold = scrollTop + 96 + 20 // 56 mobile header + 40 outline bar + 20 offset
  let found = null
  for (const h of headingsWithElements) {
    const rect = h.element!.getBoundingClientRect()
    const absoluteTop = rect.top + scrollTop
    if (absoluteTop <= threshold) {
      found = h
    } else {
      break
    }
  }
  activeHeading.value = found
}

function handleHeadingClick(event: MouseEvent, link: string) {
  event.preventDefault()
  outlineOpen.value = false
  const target = document.querySelector(link)
  if (target) {
    const targetTop = target.getBoundingClientRect().top + window.scrollY - 96 - 10
    window.scrollTo({
      top: targetTop,
      behavior: 'smooth'
    })
    history.pushState(null, '', link)
  }
}

watch(() => route.path, () => {
  closeDrawer(false)
  outlineOpen.value = false
  nextTick(() => {
    updateScroll()
  })
  sections.value.forEach((section) => {
    if (isCurrent(section.link) || containsCurrent(section.items)) {
      expanded.add(section.key)
    }
  })
})

watch(flatHeadings, (newHeadings) => {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('has-mobile-outline', newHeadings.length > 0)
  }
  nextTick(() => {
    updateScroll()
  })
}, { immediate: true })

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('scroll', updateScroll, { passive: true })
  updateScroll()
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.documentElement.classList.remove('mobile-drawer-open')
  document.documentElement.classList.remove('has-mobile-outline')
  window.removeEventListener('scroll', updateScroll)
})
</script>

<template>
  <div class="nuvio-mobile-shell">
    <header class="nuvio-mobile-header">
      <a class="nuvio-mobile-header__brand" :href="withBase(isDutch ? '/nl/' : '/')">
        <img :src="withBase('/logo.png')" alt="" />
        <span>{{ site.title }}</span>
      </a>

      <div class="nuvio-mobile-header__actions">
        <button
          ref="menuButton"
          class="nuvio-mobile-icon-button"
          type="button"
          aria-label="Search"
          @click="openSearch('search')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
        </button>
        <button
          class="nuvio-mobile-icon-button"
          type="button"
          :aria-label="isDutch ? 'Navigatie openen' : 'Open sidebar'"
          :aria-expanded="drawerOpen"
          aria-controls="mobile-navigation-drawer"
          @click="openDrawer"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
            <path d="M14.5 4v16" />
          </svg>
        </button>
      </div>
    </header>

    <!-- Nuvio scroll progress outline bar -->
    <div v-if="flatHeadings.length > 0" class="nuvio-mobile-outline-bar">
      <button
        class="nuvio-mobile-outline-trigger"
        type="button"
        :aria-expanded="outlineOpen"
        @click="outlineOpen = !outlineOpen"
      >
        <svg role="progressbar" viewBox="0 0 18 18" class="nuvio-mobile-outline-progress">
          <circle cx="9" cy="9" r="7.5" fill="none" stroke-width="1.5" class="outline-progress-bg"></circle>
          <circle cx="9" cy="9" r="7.5" fill="none" stroke-width="1.5" stroke="currentColor" stroke-dasharray="47.12388980384689" :stroke-dashoffset="47.12388980384689 * (1 - scrollProgress)" stroke-linecap="round" transform="rotate(-90 9 9)" class="outline-progress-fg"></circle>
        </svg>

        <span class="nuvio-mobile-outline-text-grid">
          <span class="truncate-text" :class="{ 'is-hidden': activeHeading }">
            {{ page.title }}
          </span>
          <span class="truncate-text" :class="{ 'is-hidden': !activeHeading }">
            {{ activeHeading ? activeHeading.title : '' }}
          </span>
        </span>

        <svg class="nuvio-mobile-outline-chevron" :class="{ 'is-open': outlineOpen }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m6 9 6 6 6-6"></path>
        </svg>
      </button>
    </div>

    <Transition name="nuvio-mobile-outline-backdrop">
      <div
        v-if="outlineOpen"
        class="nuvio-mobile-outline-backdrop"
        @click="outlineOpen = false"
      ></div>
    </Transition>

    <Transition name="nuvio-mobile-outline-dropdown">
      <div v-if="outlineOpen" class="nuvio-mobile-outline-dropdown">
        <div class="nuvio-mobile-outline-dropdown-inner">
          <nav class="nuvio-mobile-outline-nav">
            <a
              v-for="heading in flatHeadings"
              :key="heading.link"
              :href="heading.link"
              class="nuvio-mobile-outline-nav-item"
              :class="[
                `level-${heading.level}`,
                { 'is-active': activeHeading && activeHeading.link === heading.link }
              ]"
              @click="handleHeadingClick($event, heading.link)"
            >
              {{ heading.title }}
            </a>
          </nav>
        </div>
      </div>
    </Transition>

    <Transition name="nuvio-mobile-backdrop">
      <button
        v-if="drawerOpen"
        class="nuvio-mobile-backdrop"
        type="button"
        :aria-label="isDutch ? 'Navigatie sluiten' : 'Close sidebar'"
        @click="closeDrawer"
      ></button>
    </Transition>

    <Transition name="nuvio-mobile-drawer">
      <aside
        v-if="drawerOpen"
        id="mobile-navigation-drawer"
        ref="drawer"
        class="nuvio-mobile-drawer"
        aria-label="Documentation navigation"
        aria-modal="true"
        role="dialog"
        tabindex="-1"
      >
        <div class="nuvio-mobile-drawer__utilities">
          <div class="nuvio-mobile-drawer__socials">
            <a
              href="https://github.com/haaihond/Nuvio-Wiki-Website"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Nuvio Wiki on GitHub"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.3-5.28-1.29-5.28-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.47.11-3.05 0 0 .96-.31 3.16 1.18a10.9 10.9 0 0 1 5.75 0c2.2-1.5 3.16-1.18 3.16-1.18.62 1.58.23 2.76.11 3.05.74.81 1.18 1.83 1.18 3.09 0 4.42-2.71 5.4-5.29 5.68.42.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
              </svg>
            </a>
            <a
              href="https://discord.gg/nuvio"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Nuvio community on Discord"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20.3 4.4A19.8 19.8 0 0 0 15.9 3l-.56 1.18a18.3 18.3 0 0 0-5.3 0A12.6 12.6 0 0 0 9.46 3a19.7 19.7 0 0 0-4.44 1.37C2.22 8.54 1.46 12.6 1.84 16.6a19.9 19.9 0 0 0 5.44 2.72c.44-.6.83-1.23 1.17-1.91-.64-.24-1.26-.54-1.84-.88l.45-.36c3.56 1.64 7.42 1.64 10.93 0l.45.36c-.59.35-1.2.64-1.84.88.34.66.73 1.3 1.17 1.91a19.9 19.9 0 0 0 5.45-2.72c.46-4.64-.78-8.66-3.9-12.23ZM8.02 14.18c-1.07 0-1.94-.98-1.94-2.19 0-1.2.86-2.18 1.94-2.18 1.09 0 1.96.98 1.94 2.18 0 1.21-.86 2.19-1.94 2.19Zm7.14 0c-1.07 0-1.94-.98-1.94-2.19 0-1.2.86-2.18 1.94-2.18 1.09 0 1.96.98 1.94 2.18 0 1.21-.85 2.19-1.94 2.19Z" />
              </svg>
            </a>
          </div>

          <div class="nuvio-mobile-drawer__controls">
            <button
              class="nuvio-mobile-theme"
              type="button"
              :aria-label="isDark ? 'Use light theme' : 'Use dark theme'"
              @click="toggleAppearance"
            >
              <span :class="{ 'is-active': !isDark }">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
                </svg>
              </span>
              <span :class="{ 'is-active': isDark }">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20.3 15.2A8.5 8.5 0 0 1 8.8 3.7 8.5 8.5 0 1 0 20.3 15.2Z" />
                </svg>
              </span>
            </button>
            <button
              class="nuvio-mobile-icon-button"
              type="button"
              :aria-label="isDutch ? 'Navigatie sluiten' : 'Close sidebar'"
              @click="closeDrawer"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
                <path d="M14.5 4v16" />
              </svg>
            </button>
          </div>
        </div>

        <nav class="nuvio-mobile-drawer__nav" aria-label="Documentation">
          <a class="nuvio-sidebar__ask-ai-button" href="https://ko-fi.com/haaihond" target="_blank" rel="noopener noreferrer" style="margin-bottom: 12px; margin-top: 4px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
              <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
              <line x1="6" y1="1" x2="6" y2="4" />
              <line x1="10" y1="1" x2="10" y2="4" />
              <line x1="14" y1="1" x2="14" y2="4" />
            </svg>
            <span>Support me on Ko-fi</span>
          </a>

          <section v-for="section in sections" :key="section.key" class="nuvio-mobile-drawer__section">
            <a
              v-if="section.link"
              class="nuvio-mobile-drawer__section-link"
              :class="{ 'is-active': isCurrent(section.link) }"
              :href="withBase(section.link)"
              :aria-current="isCurrent(section.link) ? 'page' : undefined"
            >
              <span>{{ section.text }}</span>
            </a>
            <button
              v-else
              class="nuvio-mobile-drawer__section-link"
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
                <div class="nuvio-mobile-drawer__items-inner">
                  <template v-for="item in section.items" :key="item.link || item.text">
                    <a
                      v-if="item.link"
                      class="nuvio-mobile-drawer__item"
                      :class="{ 'is-active': isCurrent(item.link) }"
                      :href="withBase(item.link)"
                      :aria-current="isCurrent(item.link) ? 'page' : undefined"
                    >
                      {{ item.text }}
                    </a>
                    <p v-else class="nuvio-mobile-drawer__subheading">{{ item.text }}</p>

                    <a
                      v-for="child in item.items || []"
                      :key="child.link || child.text"
                      class="nuvio-mobile-drawer__item nuvio-mobile-drawer__item--nested"
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
      </aside>
    </Transition>

    <NuvioSearch v-if="searchOpen" :is-dutch="isDutch" :initial-tab="searchInitialTab" @close="searchOpen = false" />
  </div>
</template>
