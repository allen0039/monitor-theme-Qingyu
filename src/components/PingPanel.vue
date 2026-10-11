<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MonitorNode, ThemeConfig } from '../types'
import { selectPingNetworks, useNodePing } from '../lib/ping'
import { historyBuckets, latencyLabel, lossLabel, networkLatency, pingTone } from '../lib/ping-display'
import PingHistoryBars from './PingHistoryBars.vue'
const props = defineProps<{ node: MonitorNode; details: boolean; config: ThemeConfig }>()
const element = ref<HTMLElement | null>(null)
const snapshot = useNodePing(element, () => props.node.id, () => props.node.online && props.node.metrics !== null, () => props.config.ping_refresh_interval)
const networks = computed(() => selectPingNetworks(snapshot.value?.networks ?? [], props.config.ping_tasks, props.config.ping_max_lines))
const lines = computed(() => networks.value.map(network => ({ network, buckets: historyBuckets(network.rows) })))
const message = computed(() => !props.node.online ? '节点离线' : !props.node.metrics ? '等待指标上报'
  : !snapshot.value || snapshot.value.state === 'loading' ? '读取延迟…'
  : snapshot.value.state === 'error' ? '延迟暂时不可用' : !networks.value.length ? '暂无延迟监控' : '')
</script>
<template>
  <div ref="element" class="ping-panel">
    <div v-if="message" class="ping-empty" :title="snapshot?.error">{{ message }}</div>
    <template v-else-if="!details">
      <div class="ping-heading"><span>{{ lines.length === 3 ? '三网质量' : '线路质量' }}</span><span>近 1 小时 · 延迟 / 丢包</span></div>
      <div v-for="{ network, buckets: lineBuckets } in lines" :key="network.id" class="ping-compact-network">
        <div>
          <div class="ping-compact-heading"><span :title="network.name">{{ network.name }}</span><strong :class="`ping-text-${pingTone(networkLatency(network), 'latency')}`">{{ latencyLabel(networkLatency(network), !!network.rows.length) }}</strong></div>
          <PingHistoryBars :buckets="lineBuckets" metric="latency" :label="`${network.name} 延迟分段`" />
        </div>
        <div>
          <div class="ping-compact-heading"><span>丢包</span><strong :class="`ping-text-${pingTone(network.loss, 'loss')}`">{{ lossLabel(network.loss) }}</strong></div>
          <PingHistoryBars :buckets="lineBuckets" metric="loss" :label="`${network.name} 丢包分段`" />
        </div>
      </div>
    </template>
    <div v-else class="ping-details">
      <div class="ping-heading"><span>网络明细</span><span>近 1 小时</span></div>
      <div v-for="network in networks" :key="network.id" class="ping-detail-network">
        <div class="ping-detail-heading"><span :title="network.name">{{ network.name }}</span><span>{{ latencyLabel(networkLatency(network), !!network.rows.length) }} · {{ lossLabel(network.loss) }}</span></div>
        <div class="ping-panels">
          <PingHistoryBars :buckets="historyBuckets(network.rows)" metric="latency" :label="`${network.name} 延迟分段`" />
          <PingHistoryBars :buckets="historyBuckets(network.rows)" metric="loss" :label="`${network.name} 丢包分段`" />
        </div>
      </div>
    </div>
  </div>
</template>
