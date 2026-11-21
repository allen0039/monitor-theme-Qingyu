<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertTriangle } from '@lucide/vue'
import type { MonitorNode, ThemeConfig } from '../types'
import { selectPingNetworks, useNodePing } from '../lib/ping'
import { historyBuckets, latencyLabel, lossLabel, networkLatency, networkTone, pingHealth, pingTone, shortProbeName, windowSummary } from '../lib/ping-display'
import PingHistoryBars from './PingHistoryBars.vue'
const props = defineProps<{ node: MonitorNode; details: boolean; config: ThemeConfig }>()
const element = ref<HTMLElement | null>(null)
const canRead = computed(() => props.node.online && props.node.metrics !== null)
const snapshot = useNodePing(element, () => props.node.id, () => canRead.value, () => props.config.ping_refresh_interval)
const networks = computed(() => canRead.value ? selectPingNetworks(snapshot.value?.networks ?? [], props.config.ping_tasks, props.config.ping_max_lines) : [])
const summary = computed(() => windowSummary(networks.value))
const buckets = computed(() => historyBuckets(networks.value.flatMap(network => network.rows)))
const detailBuckets = computed(() => new Map(networks.value.map(network => [network.id, historyBuckets(network.rows)])))
const hasRows = computed(() => networks.value.some(network => network.rows.length))
const emptyTitle = computed(() => !props.node.online ? '节点离线' : !props.node.metrics ? '等待指标上报'
  : !snapshot.value || snapshot.value.state === 'loading' ? '正在采集网络监控'
  : snapshot.value.state === 'error' ? '延迟数据暂时不可用' : !networks.value.length ? '未配置网络探针' : !hasRows.value ? '暂无网络采样' : '暂无记录')
const placeholderNetworkCount = computed(() => Math.max(1, Math.min(3, Math.floor(props.config.ping_max_lines || 3))))
const networkLabel = computed(() => (networks.value.length || placeholderNetworkCount.value) === 3 ? '三网' : (networks.value.length || placeholderNetworkCount.value) === 2 ? '双线' : '线路')
const ispColumns = computed(() => Math.min(3, Math.max(1, networks.value.length || placeholderNetworkCount.value)))
const health = computed(() => pingHealth(networks.value))
const statusText = computed(() => !props.node.online ? '节点离线' : !props.node.metrics ? '等待指标'
  : snapshot.value?.state === 'error' ? '数据不可用' : health.value.label)
</script>
<template>
  <div ref="element" class="ping-panel">
    <div class="ping-panel-head">
      <span class="ping-panel-title" :title="emptyTitle">{{ details ? '网络明细 · 近 1h' : `${networkLabel}监控 · 近 1h` }}</span>
      <span class="ping-health-badge" :class="`is-${health.level}`" :title="emptyTitle">
        <AlertTriangle v-if="health.level === 'alert' || health.level === 'warn'" />
        <i v-else class="ping-health-dot" />
        <span>{{ statusText }}</span>
      </span>
    </div>
    <template v-if="!details">
      <div class="ping-isp-grid" :style="{ '--isp-cols': ispColumns }">
        <template v-if="networks.length">
          <div v-for="network in networks" :key="network.id" class="ping-isp-card" :title="`${network.name} · 近 1 小时平均延迟 ${latencyLabel(networkLatency(network), !!network.rows.length)} · 丢包 ${lossLabel(network.loss)}`">
            <div class="ping-isp-top">
              <span class="ping-isp-name">{{ shortProbeName(network.name) }}</span>
              <span class="ping-loss-pill" :class="`ping-pill-${pingTone(network.loss, 'loss')}`">{{ lossLabel(network.loss) }}</span>
            </div>
            <strong class="ping-isp-latency" :class="`ping-text-${pingTone(networkLatency(network), 'latency')}`">{{ latencyLabel(networkLatency(network), !!network.rows.length) }}</strong>
          </div>
        </template>
        <template v-else>
          <div v-for="idx in placeholderNetworkCount" :key="`ph-${idx}`" class="ping-isp-card is-placeholder" :title="emptyTitle">
            <div class="ping-isp-top"><span class="ping-isp-name">线路 {{ idx }}</span><span class="ping-loss-pill ping-pill-unknown">—%</span></div>
            <strong class="ping-isp-latency ping-text-unknown">—</strong>
          </div>
        </template>
      </div>
      <div class="ping-panels">
        <div title="近 1 小时各有效线路的采样平均延迟，再取线路平均">
          <div class="fact-row"><span>平均延迟</span><i /><strong :class="[!hasRows ? 'ping-placeholder' : `ping-text-${pingTone(summary.latency, 'latency')}`]">{{ latencyLabel(summary.latency, hasRows) }}</strong></div>
          <PingHistoryBars :buckets="buckets" metric="latency" label="近期延迟分段" :empty-title="emptyTitle" />
        </div>
        <div title="所选线路整段窗口丢包率的平均值；包含未知线路时显示 —">
          <div class="fact-row"><span>整体丢包</span><i /><strong :class="[summary.loss === null ? 'ping-placeholder' : `ping-text-${pingTone(summary.loss, 'loss')}`]">{{ lossLabel(summary.loss) }}</strong></div>
          <PingHistoryBars :buckets="buckets" metric="loss" label="近期丢包分段" :empty-title="emptyTitle" />
        </div>
      </div>
    </template>
    <div v-else class="ping-details">
      <div v-if="!networks.length" class="ping-detail-network ping-detail-empty" :title="emptyTitle">
        <div class="ping-detail-heading">
          <span class="ping-detail-name"><i class="ping-line-dot is-unknown" /><span>{{ emptyTitle }}</span></span>
          <span class="ping-detail-metrics"><span class="ping-metric-pill ping-pill-unknown">—</span><span class="ping-metric-pill ping-pill-unknown">丢包 —</span></span>
        </div>
        <div class="ping-panels">
          <PingHistoryBars :buckets="[]" metric="latency" label="近期延迟分段" :empty-title="emptyTitle" />
          <PingHistoryBars :buckets="[]" metric="loss" label="近期丢包分段" :empty-title="emptyTitle" />
        </div>
      </div>
      <div v-for="network in networks" :key="network.id" class="ping-detail-network">
        <div class="ping-detail-heading">
          <span class="ping-detail-name" :title="network.name"><i class="ping-line-dot" :class="`is-${networkTone(network)}`" /><span>{{ network.name }}</span></span>
          <span class="ping-detail-metrics">
            <span class="ping-metric-pill" :class="`ping-pill-${pingTone(networkLatency(network), 'latency')}`">{{ latencyLabel(networkLatency(network), !!network.rows.length) }}</span>
            <span class="ping-metric-pill" :class="`ping-pill-${pingTone(network.loss, 'loss')}`">丢包 {{ lossLabel(network.loss) }}</span>
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
