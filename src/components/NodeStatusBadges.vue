<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { MonitorNode } from '../types'
import { summarize } from '../lib/data'
const props = defineProps<{ nodes: MonitorNode[]; group: string | null }>()
const totals = computed(() => summarize(props.nodes))
const offline = computed(() => totals.value.total - totals.value.online)
const expanded = ref(false)
const label = computed(() => `${props.group === null ? '全部节点' : props.group || '未分组'} · 在线 ${totals.value.online} 台，离线 ${offline.value} 台，共 ${totals.value.total} 台`)
watch(() => props.group, () => { expanded.value = false })
</script>
<template>
  <div class="node-status-badges" role="group" aria-label="节点在线状态" @keydown.esc="expanded = false">
    <button type="button" class="node-status-toggle" :aria-label="label" :aria-expanded="expanded" :title="label" @click="expanded = !expanded">
      <span class="node-status-badge up"><span class="status-dot" aria-hidden="true" /><strong>{{ totals.online }}</strong></span>
      <span v-if="offline > 0" class="node-status-badge node-status-offline"><span class="status-dot" aria-hidden="true" /><strong>{{ offline }}</strong></span>
    </button>
    <span v-if="expanded" class="node-status-detail" role="status">{{ label }}</span>
  </div>
</template>
