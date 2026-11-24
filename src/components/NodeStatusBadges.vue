<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { MonitorNode } from '../types'
import { summarize } from '../lib/data'
const props = defineProps<{ nodes: MonitorNode[]; group: string | null; mode?: 'count' | 'rate' }>()
const totals = computed(() => summarize(props.nodes))
const offline = computed(() => totals.value.total - totals.value.online)
const onlineRate = computed(() => !totals.value.total ? '—' : `${((totals.value.online / totals.value.total) * 100).toFixed(1)}%`)
const expanded = ref(false)
const label = computed(() => `${props.group === null ? '全部节点' : props.group || '未分组'} · 在线 ${totals.value.online} 台，离线 ${offline.value} 台，共 ${totals.value.total} 台`)
watch(() => props.group, () => { expanded.value = false })
</script>
<template>
  <div class="node-status-badges" role="group" aria-label="节点在线状态" @keydown.esc="expanded = false">
    <button type="button" class="node-status-toggle" :aria-label="label" :aria-expanded="expanded" :title="label" @click="expanded = !expanded">
      <span v-if="mode === 'rate'" class="node-status-badge node-status-rate" :class="{ 'is-partial': offline > 0 && totals.online > 0, 'is-offline': totals.total > 0 && totals.online === 0 }">在线率 <strong>{{ onlineRate }}</strong><small v-if="offline > 0">· {{ offline }} 离线</small></span>
      <template v-else>
        <span class="node-status-badge up"><span class="status-dot" aria-hidden="true" /><strong>{{ totals.online }}</strong></span>
        <span v-if="offline > 0" class="node-status-badge node-status-offline"><span class="status-dot" aria-hidden="true" /><strong>{{ offline }}</strong><span class="node-status-word">离线</span></span>
      </template>
    </button>
    <span v-if="expanded" class="node-status-detail" role="status">{{ label }}</span>
  </div>
</template>
