<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import type { MonitorNode } from '../types'
import worldPaths from '../assets/world-map.json'
import worldCountryIndex from '../assets/world-map-countries.json'
import { clustersOf, layoutMapMarkers, MAP_VIEWBOX, sortClusters, type RegionCluster } from '../lib/geo'
import { flagUrl } from '../lib/assets'
import { bytes, formatBytes } from '../lib/format'
import { summarizeNodesLatency } from '../lib/ping'
import { LATENCY_LEGEND_TEXT, latencyLabel, latencyTier, latencyTone } from '../lib/ping-display'

const props = withDefaults(defineProps<{
  nodes: MonitorNode[]
  showLabels?: boolean
  pingEnabled?: boolean
  pingTasks?: string
  pingMaxLines?: number
}>(), {
  showLabels: true,
  pingEnabled: false,
  pingTasks: '',
  pingMaxLines: 3,
})

const clusters = computed(() => sortClusters(clustersOf(props.nodes)))
const markers = computed(() => layoutMapMarkers(clusters.value))
const hoveredCode = ref<string | null>(null)
const uid = useId().replaceAll(':', '')
const allPaths = worldPaths as string[]
const basePaths = allPaths.filter((_, index) => index !== MAP_VIEWBOX.antarcticaIndex)
const countryPaths = worldCountryIndex as Record<string, number>

const onlineTier1Paths = computed(() => clusters.value
  .filter(cluster => cluster.online > 0 && cluster.total === 1)
  .map(cluster => countryPaths[cluster.code])
  .filter((index): index is number => index !== undefined)
  .map(index => allPaths[index]!))
const onlineTier2Paths = computed(() => clusters.value
  .filter(cluster => cluster.online > 0 && cluster.total >= 2)
  .map(cluster => countryPaths[cluster.code])
  .filter((index): index is number => index !== undefined)
  .map(index => allPaths[index]!))
const offlinePaths = computed(() => clusters.value
  .filter(cluster => cluster.online === 0)
  .map(cluster => countryPaths[cluster.code])
  .filter((index): index is number => index !== undefined)
  .map(index => allPaths[index]!))
const hoveredPath = computed(() => {
  if (!hoveredCode.value) return ''
  const index = countryPaths[hoveredCode.value]
  return index !== undefined ? allPaths[index] ?? '' : ''
})

const onlineNodeCount = computed(() => props.nodes.filter(node => node.online).length)
const eligibleNodeIds = computed(() => new Set(props.nodes.filter(node => node.online && node.metrics !== null).map(node => node.id)))
const globalLatency = computed(() => props.pingEnabled
  ? summarizeNodesLatency([...eligibleNodeIds.value], props.pingTasks, props.pingMaxLines)
  : { avg: null, sampled: 0 })
const globalLatencyTone = computed(() => latencyTone(globalLatency.value.avg))
const globalLatencyTitle = computed(() => {
  const online = onlineNodeCount.value
  const { avg, sampled } = globalLatency.value
  const coverage = online > 0 ? `${online} 台在线，${sampled} 台有延迟读数（${sampled}/${online}）` : '暂无在线节点'
  if (avg === null) {
    return `当前分组平均延迟 — · ${coverage}\n等待卡片网络监控采样；${LATENCY_LEGEND_TEXT}`
  }
  const tier = latencyTier(avg)
  return `当前分组平均延迟 ${latencyLabel(avg, false)}（${tier.label}）· ${coverage}\n按节点等权聚合近 1 小时采样；${LATENCY_LEGEND_TEXT}`
})

const regionLatencies = computed(() => new Map(clusters.value.map(cluster => [
  cluster.code,
  props.pingEnabled && cluster.online > 0
    ? summarizeNodesLatency(cluster.nodeIds.filter(id => eligibleNodeIds.value.has(id)), props.pingTasks, props.pingMaxLines)
    : { avg: null, sampled: 0 },
])))

function regionLatencySummary(code: string) {
  return regionLatencies.value.get(code) ?? { avg: null, sampled: 0 }
}

function regionLatencyTone(code: string) {
  return latencyTone(regionLatencySummary(code).avg)
}

function regionLatencyText(code: string): string {
  return latencyLabel(regionLatencySummary(code).avg, false, true)
}

function regionLatencyTitle(cluster: RegionCluster): string {
  const { avg, sampled } = regionLatencySummary(cluster.code)
  const coverage = cluster.online > 0 ? `${cluster.online} 台在线，${sampled} 台有延迟读数（${sampled}/${cluster.online}）` : '暂无在线节点'
  if (avg === null) {
    return `${cluster.name} · 平均延迟 — · ${coverage}\n${LATENCY_LEGEND_TEXT}`
  }
  const tier = latencyTier(avg)
  return `${cluster.name} · 平均延迟 ${latencyLabel(avg, false)}（${tier.label}）· ${coverage}\n按地区节点等权聚合近 1 小时采样；${LATENCY_LEGEND_TEXT}`
}

function clusterTitle(cluster: RegionCluster): string {
  const { avg, sampled } = regionLatencySummary(cluster.code)
  const coverage = cluster.online > 0 ? `（${cluster.online} 台在线，${sampled} 台有延迟读数，${sampled}/${cluster.online}）` : ''
  const latPart = props.pingEnabled
    ? ` · 平均延迟 ${latencyLabel(avg, false)}${coverage}`
    : ''
  return `${cluster.name} · ${cluster.online}/${cluster.total} 在线${latPart} · ↑ ${formatBytes(cluster.tx, true)} ↓ ${formatBytes(cluster.rx, true)}`
}

function compactRate(value: number): string {
  const part = bytes(value, true)
  if (!part.unit) return part.value
  const n = Number(part.value)
  if (part.unit === 'B/s' || n >= 100) return `${Math.round(n)}${part.unit}`
  return `${Number(n.toFixed(1))}${part.unit}`
}

const page = ref(0)
const needsPager = computed(() => clusters.value.length > 6)
const pageSize = computed(() => (needsPager.value ? 5 : 6))
const totalPages = computed(() => Math.max(1, Math.ceil(clusters.value.length / pageSize.value)))
const currentPage = computed(() => Math.min(page.value, totalPages.value - 1))
const pagedClusters = computed(() => clusters.value.slice(currentPage.value * pageSize.value, (currentPage.value + 1) * pageSize.value))
const hiddenAfterFirst = computed(() => Math.max(0, clusters.value.length - pageSize.value))
const moreLabel = computed(() => {
  if (currentPage.value === 0) return `另外 ${hiddenAfterFirst.value} 个地区`
  const remaining = clusters.value.length - (currentPage.value + 1) * pageSize.value
  return remaining > 0 ? `下一页 · 还有 ${remaining} 个地区` : `返回前 ${pageSize.value} 个地区`
})

function setPage(next: number) {
  page.value = Math.min(totalPages.value - 1, Math.max(0, next))
}

function cyclePage() {
  setPage((currentPage.value + 1) % totalPages.value)
}

let lastWheelAt = 0
function onListWheel(event: WheelEvent) {
  if (totalPages.value <= 1 || Math.abs(event.deltaY) < 8) return
  event.preventDefault()
  const now = Date.now()
  if (now - lastWheelAt < 180) return
  lastWheelAt = now
  setPage(currentPage.value + (event.deltaY > 0 ? 1 : -1))
}
</script>
<template>
  <div class="geo-map" aria-label="节点所在国家和地区">
    <div class="geo-map-body" :class="{ 'geo-map-body-full': !clusters.length }">
      <div class="geo-map-main">
        <div class="geo-map-stats">
          <span class="geo-stat-pill geo-stat-regions">{{ clusters.length }} 个地区</span>
          <div class="geo-map-status"><slot name="status" /></div>
          <span v-if="pingEnabled" class="geo-stat-pill geo-stat-latency" :class="`latency-pill-${globalLatencyTone}`" :title="globalLatencyTitle">平均延迟 <strong :class="`latency-text-${globalLatencyTone}`">{{ latencyLabel(globalLatency.avg, false) }}</strong></span>
        </div>
        <div class="geo-map-stage">
          <div class="geo-map-canvas">
            <svg :viewBox="`0 ${MAP_VIEWBOX.yMin} ${MAP_VIEWBOX.width} ${MAP_VIEWBOX.height}`" role="img" aria-label="世界节点分布">
              <defs>
                <pattern :id="`dots-base-${uid}`" width="4.8" height="4.8" patternUnits="userSpaceOnUse"><circle cx="2.4" cy="2.4" r="1.55" class="map-dot-base" /></pattern>
                <pattern :id="`dots-online-1-${uid}`" width="4.8" height="4.8" patternUnits="userSpaceOnUse"><circle cx="2.4" cy="2.4" r="1.55" class="map-dot-online-1" /></pattern>
                <pattern :id="`dots-online-2-${uid}`" width="4.8" height="4.8" patternUnits="userSpaceOnUse"><circle cx="2.4" cy="2.4" r="1.55" class="map-dot-online-2" /></pattern>
                <pattern :id="`dots-offline-${uid}`" width="4.8" height="4.8" patternUnits="userSpaceOnUse"><circle cx="2.4" cy="2.4" r="1.55" class="map-dot-offline" /></pattern>
                <pattern :id="`dots-hover-${uid}`" width="4.8" height="4.8" patternUnits="userSpaceOnUse"><circle cx="2.4" cy="2.4" r="1.55" class="map-dot-hover" /></pattern>
                <clipPath :id="`land-${uid}`"><path v-for="(path, i) in basePaths" :key="i" :d="path" /></clipPath>
                <clipPath v-if="onlineTier1Paths.length" :id="`land-online-1-${uid}`"><path v-for="(path, i) in onlineTier1Paths" :key="i" :d="path" /></clipPath>
                <clipPath v-if="onlineTier2Paths.length" :id="`land-online-2-${uid}`"><path v-for="(path, i) in onlineTier2Paths" :key="i" :d="path" /></clipPath>
                <clipPath v-if="offlinePaths.length" :id="`land-offline-${uid}`"><path v-for="(path, i) in offlinePaths" :key="i" :d="path" /></clipPath>
                <clipPath v-if="hoveredPath" :id="`land-hover-${uid}`"><path :d="hoveredPath" /></clipPath>
              </defs>
              <rect x="0" :y="MAP_VIEWBOX.yMin" :width="MAP_VIEWBOX.width" :height="MAP_VIEWBOX.height" :fill="`url(#dots-base-${uid})`" :clip-path="`url(#land-${uid})`" />
              <rect v-if="onlineTier1Paths.length" x="0" :y="MAP_VIEWBOX.yMin" :width="MAP_VIEWBOX.width" :height="MAP_VIEWBOX.height" :fill="`url(#dots-online-1-${uid})`" :clip-path="`url(#land-online-1-${uid})`" />
              <rect v-if="onlineTier2Paths.length" x="0" :y="MAP_VIEWBOX.yMin" :width="MAP_VIEWBOX.width" :height="MAP_VIEWBOX.height" :fill="`url(#dots-online-2-${uid})`" :clip-path="`url(#land-online-2-${uid})`" />
              <rect v-if="offlinePaths.length" x="0" :y="MAP_VIEWBOX.yMin" :width="MAP_VIEWBOX.width" :height="MAP_VIEWBOX.height" :fill="`url(#dots-offline-${uid})`" :clip-path="`url(#land-offline-${uid})`" />
              <rect v-if="hoveredPath" x="0" :y="MAP_VIEWBOX.yMin" :width="MAP_VIEWBOX.width" :height="MAP_VIEWBOX.height" :fill="`url(#dots-hover-${uid})`" :clip-path="`url(#land-hover-${uid})`" />
              <g v-for="marker in markers" :key="marker.cluster.code" :transform="`translate(${marker.anchorX},${marker.anchorY})`" class="map-marker" @mouseenter="hoveredCode = marker.cluster.code" @mouseleave="hoveredCode = null">
                <title>{{ clusterTitle(marker.cluster) }}</title>
                <circle v-if="!showLabels" r="8" :fill="!marker.cluster.online ? '#94a3b8' : marker.cluster.online < marker.cluster.total ? '#d97706' : 'var(--emerald)'" opacity=".2" />
                <circle :r="showLabels ? 2 : 3.2" :fill="!marker.cluster.online ? '#94a3b8' : marker.cluster.online < marker.cluster.total ? '#d97706' : 'var(--emerald)'" />
              </g>
            </svg>
            <div v-if="showLabels && markers.length" class="geo-map-markers">
              <span
                v-for="marker in markers"
                :key="marker.cluster.code"
                class="geo-marker-pill"
                :class="{
                  'is-tier2': marker.cluster.online > 0 && marker.cluster.total >= 2,
                  'is-partial': marker.cluster.online > 0 && marker.cluster.online < marker.cluster.total,
                  'is-offline': !marker.cluster.online,
                  'is-hovered': hoveredCode === marker.cluster.code,
                }"
                :style="{ left: `${marker.leftPct}%`, top: `${marker.topPct}%` }"
                :title="clusterTitle(marker.cluster)"
                @mouseenter="hoveredCode = marker.cluster.code"
                @mouseleave="hoveredCode = null"
              >
                <span class="geo-marker-count">{{ marker.cluster.total }}</span>
              </span>
            </div>
          </div>
        </div>
        <div class="geo-map-legend" aria-hidden="true">
          <div class="geo-legend-group">
            <span><i class="geo-legend-swatch is-base" />0</span>
            <span><i class="geo-legend-swatch is-tier1" />1台</span>
            <span><i class="geo-legend-swatch is-tier2" />2+台</span>
          </div>
          <div class="geo-legend-group">
            <span><i class="geo-legend-dot is-online" />在线</span>
            <span><i class="geo-legend-dot is-partial" />部分</span>
            <span><i class="geo-legend-dot is-offline" />离线</span>
          </div>
        </div>
      </div>
      <div v-if="clusters.length" class="geo-region-panel" @wheel="onListWheel">
        <div class="geo-region-list" :class="{ 'is-paged': needsPager }" role="list" :aria-label="pingEnabled ? '各地区在线状态、实时速率与平均延迟' : '各地区在线状态与实时速率'">
          <div
            v-for="cluster in pagedClusters"
            :key="cluster.code"
            class="geo-region-row"
            :class="{ 'is-offline': !cluster.online, 'is-hovered': hoveredCode === cluster.code }"
            role="listitem"
            :title="clusterTitle(cluster)"
            @mouseenter="hoveredCode = cluster.code"
            @mouseleave="hoveredCode = null"
          >
            <span class="geo-region-name">
              <img v-if="flagUrl(cluster.code)" :src="flagUrl(cluster.code)" :alt="cluster.name" class="geo-region-flag" />
              <span>{{ cluster.name }}</span>
            </span>
            <span class="geo-region-bar" aria-hidden="true">
              <i :style="{ width: `${cluster.total ? (cluster.online / cluster.total) * 100 : 0}%` }" :class="{ 'is-partial': cluster.online > 0 && cluster.online < cluster.total, 'is-offline': !cluster.online }" />
            </span>
            <span class="geo-region-meta">
              <span class="geo-region-count" :class="{ 'is-partial': cluster.online > 0 && cluster.online < cluster.total, 'is-offline': !cluster.online }">{{ cluster.online }}/{{ cluster.total }}</span>
              <template v-if="cluster.online > 0">
                <span class="geo-region-up">↑{{ compactRate(cluster.tx) }}</span>
                <span class="geo-region-down">↓{{ compactRate(cluster.rx) }}</span>
              </template>
              <span v-else class="geo-region-offline-label">离线</span>
            </span>
            <span v-if="pingEnabled" class="geo-region-latency" :class="`latency-badge-${regionLatencyTone(cluster.code)}`" :title="regionLatencyTitle(cluster)">{{ regionLatencyText(cluster.code) }}</span>
          </div>
        </div>
        <button
          v-if="needsPager"
          type="button"
          class="geo-more-btn"
          :aria-label="`${moreLabel}（第 ${currentPage + 1} / ${totalPages} 页）`"
          @click="cyclePage"
        >
          <span>{{ moreLabel }}</span>
          <small class="geo-more-page">{{ currentPage + 1 }}/{{ totalPages }}</small>
        </button>
      </div>
    </div>
  </div>
</template>
