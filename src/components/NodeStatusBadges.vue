<script setup lang="ts">
import { computed } from 'vue'
import type { MonitorNode } from '../types'
import { summarize } from '../lib/data'
const props = defineProps<{ nodes: MonitorNode[]; group: string | null }>()
const totals = computed(() => summarize(props.nodes))
const offline = computed(() => totals.value.total - totals.value.online)
</script>
<template>
  <div class="node-status-badges" role="group" aria-label="节点在线状态" :title="`${group === null ? '全部节点' : group || '未分组'} · 共 ${totals.total} 台`">
    <span class="node-status-badge up"><span class="status-dot" aria-hidden="true" />在线 <strong>{{ totals.online }}</strong></span>
    <span v-if="offline > 0" class="node-status-badge danger"><span class="status-dot offline" aria-hidden="true" />离线 <strong>{{ offline }}</strong></span>
  </div>
</template>
