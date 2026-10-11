<script setup lang="ts">
import { computed } from 'vue'
import { Terminal } from '@lucide/vue'
import { siAlpinelinux, siArchlinux, siDebian, siFedora, siRedhat, siUbuntu } from 'simple-icons'
const props = defineProps<{ os: string }>()
const icon = computed(() => {
  const name = props.os.toLowerCase()
  if (name.includes('debian')) return siDebian
  if (name.includes('ubuntu')) return siUbuntu
  if (name.includes('alpine')) return siAlpinelinux
  if (name.includes('arch')) return siArchlinux
  if (name.includes('fedora')) return siFedora
  if (name.includes('red hat') || name.includes('rhel')) return siRedhat
  return null
})
</script>
<template>
  <svg v-if="icon" class="os-icon" role="img" :aria-label="props.os" :title="props.os" viewBox="0 0 24 24" :fill="`#${icon.hex}`"><path :d="icon.path" /></svg>
  <Terminal v-else class="os-icon" :aria-label="props.os || '未知系统'" :title="props.os || '未知系统'" />
</template>
