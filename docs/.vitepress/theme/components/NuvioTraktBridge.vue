<script setup lang="ts">
import MediaSyncBridge from './MediaSyncBridge.vue'

withDefaults(defineProps<{
  defaultExpanded?: boolean
  hideTip?: boolean
  hideHeader?: boolean
}>(), {
  defaultExpanded: false,
  hideTip: false,
  hideHeader: false
})
</script>

<template>
  <MediaSyncBridge
    :default-expanded="defaultExpanded"
    :hide-tip="hideTip"
    :hide-header="hideHeader"
  />
</template>
