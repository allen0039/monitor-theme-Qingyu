<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MonitorNode, ThemeConfig } from '../types'
import { selectPingNetworks, useNodePing } from '../lib/ping'
import { historyBuckets, latencyLabel, lossLabel, networkLatency, pingTone, windowSummary } from '../lib/ping-display'
import PingHistoryBars from './PingHistoryBars.vue'
const props = defineProps<{ node: MonitorNode; details: boolean; config: ThemeConfig }>()
const element = ref<HTMLElement | null>(null)
const snapshot = useNodePing(element, () => props.node.id, () => props.node.online && props.node.metrics !== null, () => props.config.ping_refresh_interval)
const networks = computed(() => selectPingNetworks(snapshot.value?.networks ?? [], props.config.ping_tasks, props.config.ping_max_lines))
const summary = computed(() => windowSummary(networks.value))
const buckets = computed(() => historyBuckets(networks.value.flatMap(network => network.rows)))
const hasRows = computed(() => networks.value.some(network => network.rows.length))
const emptyTitle = computed(() => !props.node.online ? '节点离线' : !props.node.metrics ? '等待指标上报'
  : !snapshot.value || snapshot.value.state === 'loading' ? '正在采集网络监控'
  : snapshot.value.state === 'error' ? '延迟数据暂时不可用' : !networks.value.length ? '未配置网络探针' : !hasRows.value ? '暂无网络采样' : '暂无记录')
const placeholderNetworkCount = computed(() => Math.max(1, Math.min(3, Math.floor(props.config.ping_max_lines || 3))))
const placeholderLatency = computed(() => Array.from({ length: placeholderNetworkCount.value }, () => '—').join(' · '))
const placeholderLoss = computed(() => Array.from({ length: placeholderNetworkCount.value }, () => '—%').join(' · '))
const networkLabel = computed(() => (networks.value.length || placeholderNetworkCount.value) === 3 ? '三网' : '线路')
</script>
<template>
  <div ref="element" class="ping-panel">
    <template v-if="!details">
      <div class="fact-row ping-summary"><span :title="emptyTitle">{{ networkLabel }}</span><i /><div class="ping-summary-values">
        <template v-if="networks.length">
          <span v-for="(network, index) in networks" :key="network.id" :class="`ping-text-${pingTone(networkLatency(network), 'latency')}`" :title="`${network.name} · 近 1 小时返回采样的平均延迟`">{{ latencyLabel(networkLatency(network), !!network.rows.length, true) }}<b v-if="index < networks.length - 1">·</b></span>
        </template>
        <span v-else class="ping-text-unknown ping-placeholder" :title="emptyTitle">{{ placeholderLatency }}</span>
      </div></div>
      <div class="fact-row ping-summary"><span :title="emptyTitle">丢包</span><i /><div class="ping-summary-values">
        <template v-if="networks.length">
          <span v-for="(network, index) in networks" :key="network.id" :class="`ping-text-${pingTone(network.loss, 'loss')}`" :title="`${network.name} · 近 1 小时整段窗口丢包率`">{{ lossLabel(network.loss) }}<b v-if="index < networks.length - 1">·</b></span>
        </template>
        <span v-else class="ping-text-unknown ping-placeholder" :title="emptyTitle">{{ placeholderLoss }}</span>
      </div></div>
      <div class="ping-panels">
        <div title="近 1 小时各有效线路的采样平均延迟，再取线路平均">
          <div class="fact-row"><span>延迟</span><i /><strong :class="{ 'ping-placeholder': !hasRows }">{{ latencyLabel(summary.latency, hasRows) }}</strong></div>
          <PingHistoryBars :buckets="buckets" metric="latency" label="近期延迟分段" :empty-title="emptyTitle" />
        </div>
        <div title="所选线路整段窗口丢包率的平均值；包含未知线路时显示 —">
          <div class="fact-row"><span>丢包</span><i /><strong :class="{ 'ping-placeholder': summary.loss === null }">{{ lossLabel(summary.loss) }}</strong></div>
          <PingHistoryBars :buckets="buckets" metric="loss" label="近期丢包分段" :empty-title="emptyTitle" />
        </div>
      </div>
    </template>
    <div v-else class="ping-details">
      <div class="ping-heading"><span>网络明细</span><span>近 1 小时</span></div>
      <div v-if="!networks.length" class="ping-detail-network ping-detail-empty" :title="emptyTitle">
        <div class="ping-detail-heading"><span>{{ emptyTitle }}</span><span>延迟 — · 丢包 —</span></div>
        <div class="ping-panels">
          <PingHistoryBars :buckets="[]" metric="latency" label="近期延迟分段" :empty-title="emptyTitle" />
          <PingHistoryBars :buckets="[]" metric="loss" label="近期丢包分段" :empty-title="emptyTitle" />
        </div>
      </div>
      <div v-for="network in networks" :key="network.id" class="ping-detail-network">
        <div class="ping-detail-heading"><span :title="network.name">{{ network.name }}</span><span>{{ latencyLabel(networkLatency(network), !!network.rows.length) }} · {{ lossLabel(network.loss) }}</span></div>
        <div class="ping-panels">
          <PingHistoryBars :buckets="historyBuckets(network.rows)" metric="latency" :label="`${network.name} 延迟分段`" :empty-title="emptyTitle" />
          <PingHistoryBars :buckets="historyBuckets(network.rows)" metric="loss" :label="`${network.name} 丢包分段`" :empty-title="emptyTitle" />
        </div>
      </div>
    </div>
  </div>
</template>
