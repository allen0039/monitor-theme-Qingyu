<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MonitorNode, ThemeConfig } from '../types'
import { selectPingNetworks, useNodePing } from '../lib/ping'
import { historyBuckets, latencyLabel, lossLabel, networkLatency, pingTone } from '../lib/ping-display'
import PingHistoryBars from './PingHistoryBars.vue'
const props = defineProps<{ node: MonitorNode; details: boolean; config: ThemeConfig }>()
const element = ref<HTMLElement | null>(null)
const canRead = computed(() => props.node.online && props.node.metrics !== null)
const snapshot = useNodePing(element, () => props.node.id, () => canRead.value, () => props.config.ping_refresh_interval)
const networks = computed(() => canRead.value ? selectPingNetworks(snapshot.value?.networks ?? [], props.config.ping_tasks, props.config.ping_max_lines) : [])
const buckets = computed(() => historyBuckets(networks.value.flatMap(network => network.rows)))
const detailBuckets = computed(() => new Map(networks.value.map(network => [network.id, historyBuckets(network.rows)])))
const hasRows = computed(() => networks.value.some(network => network.rows.length))
const hasReadings = computed(() => hasRows.value || networks.value.some(network => network.loss !== null))
const emptyTitle = computed(() => !props.node.online ? '节点离线' : !props.node.metrics ? '等待指标上报'
  : !snapshot.value || snapshot.value.state === 'loading' ? '正在采集网络监控'
  : snapshot.value.state === 'error' ? '延迟数据暂时不可用' : !networks.value.length ? '未配置网络探针' : !hasRows.value ? '暂无网络采样' : '暂无记录')
const placeholderNetworkCount = computed(() => Math.max(1, Math.min(3, Math.floor(props.config.ping_max_lines || 3))))
const placeholderValues = computed(() => Array.from({ length: placeholderNetworkCount.value }, () => '—').join(' · '))
function latencyNumber(value: number | null, hasSamples: boolean): string {
  return value === null ? (hasSamples ? '超时' : '—') : String(Math.round(value))
}
function lossNumber(value: number | null): string {
  if (value === null) return '—'
  if (value <= 0) return '0'
  if (value >= 100) return '100'
  return String(Number(value.toFixed(value < 1 ? 2 : 1)))
}
function latencyClass(value: number | null, hasSamples: boolean): string {
  return `ping-text-${value === null && hasSamples ? 'bad' : pingTone(value, 'latency')}`
}
</script>
<template>
  <div ref="element" class="ping-panel">
    <template v-if="!details">
      <div class="ping-panels">
        <div class="ping-panel-col" :title="networks.length ? '近 1 小时各线路平均延迟' : emptyTitle">
          <div class="ping-panel-row">
            <span class="ping-panel-label" :title="emptyTitle">延迟<small>ms</small></span>
            <div class="ping-summary-values">
              <template v-if="networks.length">
                <span v-for="(network, index) in networks" :key="network.id" :class="latencyClass(networkLatency(network), !!network.rows.length)" :title="`${network.name} · 近 1 小时平均延迟 ${latencyLabel(networkLatency(network), !!network.rows.length)} · 丢包 ${lossLabel(network.loss)}`">{{ latencyNumber(networkLatency(network), !!network.rows.length) }}<b v-if="index < networks.length - 1">·</b></span>
              </template>
              <span v-else class="ping-text-unknown ping-placeholder" :title="emptyTitle">{{ placeholderValues }}</span>
            </div>
          </div>
          <PingHistoryBars :buckets="buckets" metric="latency" label="近期延迟分段" :empty-title="emptyTitle" />
        </div>
        <div class="ping-panel-col" :title="networks.length ? '近 1 小时各线路整段窗口丢包率' : emptyTitle">
          <div class="ping-panel-row">
            <span class="ping-panel-label" :title="emptyTitle">丢包<small>%</small></span>
            <div class="ping-summary-values">
              <template v-if="networks.length">
                <span v-for="(network, index) in networks" :key="network.id" :class="`ping-text-${pingTone(network.loss, 'loss')}`" :title="`${network.name} · 近 1 小时整段窗口丢包率 ${lossLabel(network.loss)}`">{{ lossNumber(network.loss) }}<b v-if="index < networks.length - 1">·</b></span>
              </template>
              <span v-else class="ping-text-unknown ping-placeholder" :title="emptyTitle">{{ placeholderValues }}</span>
            </div>
          </div>
          <PingHistoryBars :buckets="buckets" metric="loss" label="近期丢包分段" :empty-title="emptyTitle" />
        </div>
      </div>
    </template>
    <div v-else class="ping-details">
      <div class="ping-panel-head">
        <span class="ping-panel-title">网络明细</span>
        <span v-if="hasReadings || networks.length" class="ping-panel-caption">{{ hasReadings ? '近 1 小时' : emptyTitle }}</span>
      </div>
      <div v-if="!networks.length" class="ping-detail-network ping-detail-empty" :title="emptyTitle">
        <div class="ping-detail-heading">
          <span class="ping-detail-name"><span>{{ emptyTitle }}</span></span>
          <span class="ping-detail-metrics"><span class="ping-text-unknown">—</span><b>·</b><span class="ping-text-unknown">—%</span></span>
        </div>
        <div class="ping-panels">
          <PingHistoryBars :buckets="[]" metric="latency" label="近期延迟分段" :empty-title="emptyTitle" />
          <PingHistoryBars :buckets="[]" metric="loss" label="近期丢包分段" :empty-title="emptyTitle" />
        </div>
      </div>
      <div v-for="network in networks" :key="network.id" class="ping-detail-network">
        <div class="ping-detail-heading">
          <span class="ping-detail-name" :title="network.name"><span>{{ network.name }}</span></span>
          <span class="ping-detail-metrics">
            <span :class="latencyClass(networkLatency(network), !!network.rows.length)"><span class="ping-metric-label">平均延迟 </span>{{ latencyLabel(networkLatency(network), !!network.rows.length) }}</span>
            <b aria-hidden="true">·</b>
            <span :class="`ping-text-${pingTone(network.loss, 'loss')}`"><span class="ping-metric-label">丢包 </span>{{ lossLabel(network.loss) }}</span>
          </span>
        </div>
        <div class="ping-panels">
          <PingHistoryBars :buckets="detailBuckets.get(network.id) ?? []" metric="latency" :label="`${network.name} 延迟分段`" :empty-title="emptyTitle" />
          <PingHistoryBars :buckets="detailBuckets.get(network.id) ?? []" metric="loss" :label="`${network.name} 丢包分段`" :empty-title="emptyTitle" />
        </div>
      </div>
    </div>
  </div>
</template>
