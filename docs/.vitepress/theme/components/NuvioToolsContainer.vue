<script setup lang="ts">
import { computed, defineAsyncComponent, markRaw, ref, onMounted, onUnmounted } from 'vue'

type ToolId = 'quickstart' | 'badge-editor' | 'p2p' | 'sync-bridge' | 'configuration-profiles' | 'profile-transfer'

type ToolTab = {
  id: ToolId
  label: string
  description: string
  title: string
  details: string
  component: ReturnType<typeof defineAsyncComponent>
  props: Record<string, boolean>
  icon: string
  workspace?: boolean
  showHeader?: boolean
}

const activeTab = ref<ToolId>('quickstart')

const tabs: ToolTab[] = [
  {
    id: 'quickstart',
    label: 'Quickstart Tool',
    description: 'Configure AIOStreams & TorBox in minutes.',
    title: 'Nuvio Quickstart Tool (TorBox & AIOStreams)',
    details: 'This tool automates setting up Nuvio addons for you. It installs <strong>AIOStreams</strong> using Tam-Taro\'s configuration template and links your <strong>TorBox</strong> account.',
    component: markRaw(defineAsyncComponent(() => import('./NuvioQuickstart.vue'))),
    props: { defaultExpanded: true, hideTip: true, hideHeader: true },
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="tab-icon-svg"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`
  },
  {
    id: 'badge-editor',
    label: 'Badge Editor',
    description: 'Build, test, import, and export stream badges.',
    title: 'Nuvio Badge Editor',
    details: 'Create and validate a complete badge set with live stream-title matching.',
    component: markRaw(defineAsyncComponent(() => import('./NuvioBadgeEditor.vue'))),
    props: {},
    workspace: true,
    showHeader: false,
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="tab-icon-svg"><path d="M4 5h10l6 7-6 7H4V5Z"/><circle cx="8" cy="12" r="1.5"/></svg>`
  },
  {
    id: 'p2p',
    label: 'P2P Setup Generator',
    description: 'Generate keyless P2P configurations for AIOStreams.',
    title: 'P2P Setup Generator (P2P & AIOStreams)',
    details: 'Generate keyless P2P configurations for AIOStreams. It resolves the full <strong>Tam-Taro Complete SEL (TAMS)</strong> template for P2P mode with no debrid keys required.',
    component: markRaw(defineAsyncComponent(() => import('./P2PGenerator.vue'))),
    props: {},
    workspace: true,
    showHeader: false,
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="tab-icon-svg"><path d="M18 8A3 3 0 1 0 15 5a3 3 0 0 0 3 3ZM6 15a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm12 6a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm-3.5-3.5-8-4M8.5 11l8-4"/></svg>`
  },
  {
    id: 'sync-bridge',
    label: 'Sync Bridge',
    description: 'Sync Simkl, Stremio, Trakt, and Nuvio.',
    title: 'Nuvio Sync Bridge',
    details: 'Preview and transfer watched history, playback progress, watchlists, and collections in any direction between Simkl, Stremio, Trakt, and Nuvio—including different accounts or profiles on the same service.',
    component: markRaw(defineAsyncComponent(() => import('./NuvioTraktBridge.vue'))),
    props: { defaultExpanded: true, hideTip: true, hideHeader: true },
    workspace: true,
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="tab-icon-svg"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`
  },
  {
    id: 'configuration-profiles',
    label: 'Configuration Profiles',
    description: 'Build a safe setup and share it with a short code.',
    title: 'Nuvio Configuration Profiles',
    details: 'Create an editable setup plan for add-ons and non-secret preferences, then share it without exposing credentials.',
    component: markRaw(defineAsyncComponent(() => import('./NuvioConfigurationProfiles.vue'))),
    props: {},
    workspace: true,
    showHeader: false,
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="tab-icon-svg"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="m17 3 4 4-9 9-5 1 1-5 9-9Z"/><path d="M14 5l4 4"/></svg>`
  },
  {
    id: 'profile-transfer',
    label: 'Profile Transfer',
    description: 'Export or import a Nuvio profile.',
    title: 'Nuvio Profile Transfer',
    details: 'Export a Nuvio profile to a file, or import a profile from a saved file.',
    component: markRaw(defineAsyncComponent(() => import('./NuvioProfileTransfer.vue'))),
    props: {},
    workspace: true,
    showHeader: false,
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="tab-icon-svg"><path d="M7 7h11l-3-3m3 3-3 3M17 17H6l3 3m-3-3 3-3"/></svg>`
  }
]

const activeTool = computed(() => tabs.find(tab => tab.id === activeTab.value) ?? tabs[0])

const updateTabFromHash = () => {
  if (typeof window !== 'undefined') {
    const hash = window.location.hash.replace('#', '')
    if (tabs.some(tab => tab.id === hash)) {
      activeTab.value = hash as ToolId
    }
  }
}

onMounted(() => {
  updateTabFromHash()
  window.addEventListener('hashchange', updateTabFromHash)
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('hashchange', updateTabFromHash)
  }
})

const selectTab = (id: ToolId) => {
  activeTab.value = id
  if (typeof window !== 'undefined') {
    history.pushState(null, '', '#' + id)
  }
}
</script>

<template>
  <div class="tools-container">
    <div class="tools-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['tools-tab-btn', { active: activeTab === tab.id }]"
        type="button"
        :aria-pressed="activeTab === tab.id"
        @click="selectTab(tab.id)"
      >
        <span class="tab-icon-wrap" aria-hidden="true" v-html="tab.icon"></span>
        <div class="tab-text-wrap">
          <span class="tab-label">{{ tab.label }}</span>
          <span class="tab-description">{{ tab.description }}</span>
        </div>
      </button>
    </div>

    <div :class="['tools-content', { 'tools-content--workspace': activeTool.workspace }]">
      <div class="tool-wrapper">
        <div v-if="activeTool.showHeader !== false" class="tool-info-header">
          <h2>{{ activeTool.title }}</h2>
          <p v-html="activeTool.details"></p>
        </div>
        <KeepAlive>
          <component
            :is="activeTool.component"
            :key="activeTool.id"
            v-bind="activeTool.props"
          />
        </KeepAlive>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tools-container {
  --tool-surface: var(--vp-c-bg);
  --tool-surface-alt: var(--vp-c-bg-alt);
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin: 24px 0;
  container-type: inline-size;
}

.tools-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  background: var(--tool-surface);
  padding: 10px;
  border-radius: 14px;
  border: 1px solid var(--vp-c-divider);
}

.tools-tab-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  min-height: 86px;
  padding: 14px;
  border-radius: 11px;
  border: 1px solid var(--vp-c-divider);
  background: var(--tool-surface-alt);
  text-align: left;
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.tools-tab-btn:hover {
  background: var(--tool-surface-alt);
  border-color: var(--vp-c-text-3);
}

.tools-tab-btn.active {
  background: var(--tool-surface);
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
}

.dark .tools-tab-btn.active {
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}

.tab-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 42px;
  width: 42px;
  height: 42px;
  background: var(--tool-surface);
  border-radius: 10px;
  color: var(--vp-c-text-2);
  transition: background-color 0.2s ease, color 0.2s ease;
}

.tools-tab-btn.active .tab-icon-wrap {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

:deep(.tab-icon-svg) {
  width: 20px;
  height: 20px;
}

.tools-tab-btn:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.tab-text-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.tab-label {
  font-weight: 650;
  font-size: 15px;
  color: var(--vp-c-text-1);
  line-height: 1.2;
}

.tab-description {
  font-size: 12px;
  color: var(--vp-c-text-2);
  line-height: 1.35;
}

.tools-content {
  background: var(--tool-surface);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 24px;
  min-height: 400px;
}

.tools-content--workspace {
  padding: 0;
  border: 0;
  background: transparent;
}

.tool-info-header {
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.tool-info-header h2 {
  margin: 0 0 8px 0 !important;
  border-top: none !important;
  font-size: 20px !important;
  font-weight: 600;
}

.tool-info-header p {
  margin: 0 !important;
  font-size: 14px;
  color: var(--vp-c-text-2);
  line-height: 1.5;
}

@container (max-width: 950px) {
  .tools-tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container (max-width: 680px) {
  .tools-tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    padding: 8px;
  }

  .tools-tab-btn {
    gap: 9px;
    min-height: 72px;
    padding: 10px;
  }

  .tab-icon-wrap {
    flex-basis: 36px;
    width: 36px;
    height: 36px;
  }

  :deep(.tab-icon-svg) {
    width: 18px;
    height: 18px;
  }

  .tab-label {
    font-size: 13px;
  }

  .tab-description {
    display: none;
  }
}

@media (max-width: 680px) {
  .tools-container {
    gap: 16px;
    margin: 20px calc(var(--nuvio-mobile-gutter) * -1) 0;
  }

  .tools-tabs {
    border-inline: 0;
    border-radius: 0;
  }

  .tools-content {
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .tool-info-header {
    margin: 0 var(--nuvio-mobile-gutter) 14px;
    padding-bottom: 14px;
  }
}
</style>
