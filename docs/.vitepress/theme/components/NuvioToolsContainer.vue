<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const activeTab = ref('quickstart')

const tabs = [
  {
    id: 'quickstart',
    label: 'Quickstart Tool',
    description: 'Configure AIOStreams & TorBox in minutes.',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="tab-icon-svg"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`
  },
  {
    id: 'p2p',
    label: 'P2P Setup Generator',
    description: 'Generate keyless P2P configurations for AIOStreams.',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="tab-icon-svg"><path d="M18 8A3 3 0 1 0 15 5a3 3 0 0 0 3 3ZM6 15a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm12 6a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm-3.5-3.5-8-4M8.5 11l8-4"/></svg>`
  },
  {
    id: 'trakt',
    label: 'Trakt Bridge',
    description: 'Import history and progress from Trakt.',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="tab-icon-svg"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`
  },
  {
    id: 'profile-transfer',
    label: 'Profile Backup',
    description: 'Download or restore a Nuvio profile backup.',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="tab-icon-svg"><path d="M7 7h11l-3-3m3 3-3 3M17 17H6l3 3m-3-3 3-3"/></svg>`
  }
]

const updateTabFromHash = () => {
  if (typeof window !== 'undefined') {
    const hash = window.location.hash.replace('#', '')
    if (tabs.some(tab => tab.id === hash)) {
      activeTab.value = hash
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

const selectTab = (id: string) => {
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
        @click="selectTab(tab.id)"
      >
        <span class="tab-icon-wrap" v-html="tab.icon"></span>
        <div class="tab-text-wrap">
          <span class="tab-label">{{ tab.label }}</span>
          <span class="tab-description">{{ tab.description }}</span>
        </div>
      </button>
    </div>

    <div class="tools-content">
      <!-- Quickstart Tool -->
      <div v-show="activeTab === 'quickstart'" class="tool-wrapper">
        <div class="tool-info-header">
          <h2>Nuvio Quickstart Tool (TorBox &amp; AIOStreams)</h2>
          <p>This tool automates setting up Nuvio addons for you. It installs <strong>AIOStreams</strong> using Tam-Taro's configuration template and links your <strong>TorBox</strong> account.</p>
        </div>
        <NuvioQuickstart :default-expanded="true" :hide-tip="true" :hide-header="true" />
      </div>

      <!-- P2P Generator -->
      <div v-show="activeTab === 'p2p'" class="tool-wrapper">
        <div class="tool-info-header">
          <h2>P2P Setup Generator (P2P &amp; AIOStreams)</h2>
          <p>Generate keyless P2P configurations for AIOStreams. It resolves the full <strong>Tam-Taro Complete SEL (TAMS)</strong> template for P2P mode with no debrid keys required.</p>
        </div>
        <P2PGenerator />
      </div>

      <!-- Trakt Bridge -->
      <div v-show="activeTab === 'trakt'" class="tool-wrapper">
        <div class="tool-info-header">
          <h2>Nuvio Trakt Bridge</h2>
          <p>Synchronize your watched history, continue watching progress, and library between Trakt and Nuvio Sync.</p>
        </div>
        <NuvioTraktBridge :default-expanded="true" :hide-tip="true" :hide-header="true" />
      </div>

      <!-- Profile Backup -->
      <div v-show="activeTab === 'profile-transfer'" class="tool-wrapper">
        <div class="tool-info-header">
          <h2>Nuvio Profile Backup</h2>
          <p>Download a private backup of one Nuvio profile, or restore a backup into the profile you choose.</p>
        </div>
        <NuvioProfileTransfer />
      </div>
    </div>
  </div>
</template>

<style scoped>
.tools-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin: 24px 0;
}

.tools-tabs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
  background: var(--vp-c-bg-soft);
  padding: 8px;
  border-radius: 12px;
  border: 1px solid var(--vp-c-divider);
}

.tools-tab-btn {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.tools-tab-btn:hover {
  background: var(--vp-c-bg-alt);
  transform: translateY(-2px);
}

.tools-tab-btn.active {
  background: var(--vp-c-bg-elv);
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

.dark .tools-tab-btn.active {
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}

.tab-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  background: var(--vp-c-bg-soft);
  border-radius: 8px;
  color: var(--vp-c-text-2);
  transition: all 0.25s ease;
}

.tools-tab-btn.active .tab-icon-wrap {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  transform: scale(1.05);
}

:deep(.tab-icon-svg) {
  width: 20px;
  height: 20px;
}

.tab-text-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tab-label {
  font-weight: 600;
  font-size: 14px;
  color: var(--vp-c-text-1);
}

.tab-description {
  font-size: 11px;
  color: var(--vp-c-text-3);
  line-height: 1.3;
}

.tools-content {
  background: var(--vp-c-bg-elv);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 24px;
  min-height: 400px;
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

@media (max-width: 768px) {
  .tools-tabs {
    grid-template-columns: 1fr;
  }
}
</style>
