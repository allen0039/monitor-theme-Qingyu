<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MonitorNode } from '../types'
import { useNodePing } from '../lib/ping'
const props = defineProps<{ node: MonitorNode; details: boolean }>()
const element = ref<HTMLElement | null>(null)
const snapshot = useNodePing(element, () => props.node.id, () => props.node.online && props.node.metrics !== null)
const networks = computed(() => snapshot.value?.networks.slice(0, props.details ? 3 : 6) ?? [])
const colors = ['var(--emerald)', 'var(--blue)', '#b48cd2', 'var(--warning)', '#ec8f79', '#6c9b99']
function latency(value: number | null | undefined): string { return value === null ? '超时' : value === undefined ? '—' : `${value.toFixed(0)} ms` }
function loss(value: number | null): string { return value === null ? '—' : `${value.toFixed(value > 0 && value < 1 ? 2 : 1)}%` }
</script>
<template>
  <div ref="element" class="ping-panel">
    <div class="ping-heading"><span>网络延迟</span><span>近 1 小时</span></div>
    <div v-if="!node.online || !node.metrics" class="ping-empty">{{ node.online ? '等待指标上报' : '节点离线' }}</div>
    <div v-else-if="!snapshot || snapshot.state === 'loading'" class="ping-empty">读取延迟…</div>
    <div v-else-if="snapshot.state === 'error'" class="ping-empty" :title="snapshot.error">延迟暂时不可用</div>
    <div v-else-if="!networks.length" class="ping-empty">暂无延迟监控</div>
    <div v-else class="ping-networks" :class="{ 'ping-detailed': details }">
      <div v-for="(network, index) in networks" :key="network.id" class="ping-network" :style="{ '--probe-color': colors[index % colors.length] }">
        <div class="ping-network-top"><span class="probe-name" :title="network.name"><i />{{ network.name }}</span><strong>{{ latency(network.latest?.latency) }}</strong></div>
        <div class="ping-loss" :class="{ 'loss-alert': network.loss !== null && network.loss > 0 }">丢包 {{ loss(network.loss) }}</div>
        <div v-if="details && network.rows.length" class="ping-bars" :aria-label="`${network.name} 近期延迟`">
          <span v-for="row in network.rows.slice(-24)" :key="row.ts" :style="{ height: `${row.latency === null ? 100 : Math.max(10, Math.min(100, row.latency / 250 * 100))}%`, background: row.latency === null ? 'var(--danger)' : 'var(--probe-color)' }" :title="`${new Date(row.ts * 1000).toLocaleTimeString()} · ${latency(row.latency)} · 丢包 ${row.loss ?? 0}%`" />
        </div>
      </div>
    </div>
  </div>
</template>
