<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import type { MonitorNode } from '../types'
import worldPaths from '../assets/world-map.json'
import worldCountryIndex from '../assets/world-map-countries.json'
import { clustersOf, layoutMapMarkers, MAP_VIEWBOX, sortClusters, type RegionCluster } from '../lib/geo'
import { flagUrl } from '../lib/assets'
import { bytes, formatBytes } from '../lib/format'
import { summarizeNodesLatency } from '../lib/ping'
import { latencyLabel, latencyTier, latencyTone } from '../lib/ping-display'

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
const pointerCode = ref<string | null>(null)
const focusedCode = ref<string | null>(null)
const hoveredCode = computed(() => pointerCode.value ?? focusedCode.value)
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
    return `当前分组平均延迟 — · ${coverage}`
  }
  const tier = latencyTier(avg)
  return `当前分组平均延迟 ${latencyLabel(avg, false)}（${tier.label}）· ${coverage}`
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
    return `${cluster.name} · 平均延迟 — · ${coverage}`
  }
  const tier = latencyTier(avg)
  return `${cluster.name} · 平均延迟 ${latencyLabel(avg, false)}（${tier.label}）· ${coverage}`
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

const listRef = ref<HTMLElement | null>(null)
const scrollTopFade = ref(false)
const scrollBottomFade = ref(false)

function updateScrollState() {
  const el = listRef.value
  if (!el) {
    scrollTopFade.value = false
    scrollBottomFade.value = false
    return
  }
  scrollTopFade.value = el.scrollTop > 4
  scrollBottomFade.value = el.scrollHeight - el.clientHeight - el.scrollTop > 4
}

watch(() => clusters.value.length, updateScrollState, { flush: 'post' })
watch(listRef, (el, _, onCleanup) => {
  updateScrollState()
  if (!el || typeof ResizeObserver === 'undefined') return
  const observer = new ResizeObserver(updateScrollState)
  observer.observe(el)
  onCleanup(() => observer.disconnect())
}, { flush: 'post' })
onMounted(() => window.addEventListener('resize', updateScrollState))
onBeforeUnmount(() => window.removeEventListener('resize', updateScrollState))

const hoveredMarker = computed(() => hoveredCode.value ? markers.value.find(m => m.cluster.code === hoveredCode.value) ?? null : null)
const hoverCardStyle = computed(() => {
  const marker = hoveredMarker.value
  if (!marker) return {}
  return {
    ...(marker.leftPct > 52 ? { left: '10px' } : { right: '10px' }),
    ...(marker.topPct > 58 ? { bottom: '10px' } : { top: '10px' }),
  }
})
function markerFill(cluster: RegionCluster): string {
  if (!cluster.online) return '#94a3b8'
  if (cluster.online < cluster.total) return '#d97706'
  return 'var(--emerald)'
}
</script>
<template>
  <div class="geo-map" aria-label="节点所在国家和地区">
    <div class="geo-map-body" :class="{ 'geo-map-body-full': !clusters.length }">
      <div class="geo-map-main">
        <div class="geo-map-stats">
          <span class="geo-stat-pill geo-stat-regions"><strong>{{ clusters.length }}</strong> 个地区</span>
          <div class="geo-map-status"><slot name="status" /></div>
          <span v-if="pingEnabled" class="geo-stat-pill geo-stat-latency" :class="`latency-pill-${globalLatencyTone}`" :title="globalLatencyTitle">平均延迟 <strong :class="`latency-text-${globalLatencyTone}`">{{ latencyLabel(globalLatency.avg, false) }}</strong></span>
        </div>
        <div class="geo-map-stage">
          <div class="geo-map-canvas">
            <svg :viewBox="`0 ${MAP_VIEWBOX.yMin} ${MAP_VIEWBOX.width} ${MAP_VIEWBOX.height}`" role="img" aria-label="世界节点分布">
              <defs>
                <pattern :id="`dots-base-${uid}`" width="4.2" height="4.2" patternUnits="userSpaceOnUse"><circle cx="2.1" cy="2.1" r="1.3" class="map-dot-base" /></pattern>
                <pattern :id="`dots-online-1-${uid}`" width="4.2" height="4.2" patternUnits="userSpaceOnUse"><circle cx="2.1" cy="2.1" r="1.3" class="map-dot-online-1" /></pattern>
                <pattern :id="`dots-online-2-${uid}`" width="4.2" height="4.2" patternUnits="userSpaceOnUse"><circle cx="2.1" cy="2.1" r="1.3" class="map-dot-online-2" /></pattern>
                <pattern :id="`dots-offline-${uid}`" width="4.2" height="4.2" patternUnits="userSpaceOnUse"><circle cx="2.1" cy="2.1" r="1.3" class="map-dot-offline" /></pattern>
                <pattern :id="`dots-hover-${uid}`" width="4.2" height="4.2" patternUnits="userSpaceOnUse"><circle cx="2.1" cy="2.1" r="1.3" class="map-dot-hover" /></pattern>
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
              <g v-if="showLabels" class="map-marker-links" aria-hidden="true">
                <line
                  v-for="marker in markers"
                  v-show="Math.hypot(marker.x - marker.anchorX, marker.y - marker.anchorY) > 6"
                  :key="`link-${marker.cluster.code}`"
                  :x1="marker.anchorX"
                  :y1="marker.anchorY"
                  :x2="marker.x"
                  :y2="marker.y"
                  class="map-marker-link"
                  :class="{ 'is-hovered': hoveredCode === marker.cluster.code }"
                />
              </g>
              <g v-for="marker in markers" :key="marker.cluster.code" :transform="`translate(${marker.anchorX},${marker.anchorY})`" class="map-marker" @mouseenter="pointerCode = marker.cluster.code" @mouseleave="pointerCode = null">
                <title>{{ clusterTitle(marker.cluster) }}</title>
                <circle :r="hoveredCode === marker.cluster.code ? 8.5 : showLabels ? 5.5 : 8" :fill="markerFill(marker.cluster)" :opacity="hoveredCode === marker.cluster.code ? 0.28 : showLabels ? 0.14 : 0.2" />
                <circle :r="showLabels ? 2.6 : 3.4" :fill="markerFill(marker.cluster)" stroke="var(--surface-solid)" stroke-width="1.2" />
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
                :aria-label="clusterTitle(marker.cluster)"
                tabindex="0"
                @focus="focusedCode = marker.cluster.code"
                @blur="focusedCode = null"
                @keydown.esc="focusedCode = pointerCode = null"
                @mouseenter="pointerCode = marker.cluster.code"
                @mouseleave="pointerCode = null"
              >
                <i class="geo-marker-dot" aria-hidden="true" />
                <span class="geo-marker-count">{{ marker.cluster.total }}</span>
              </span>
            </div>
          </div>
          <div v-if="hoveredMarker" class="geo-hover-card" :style="hoverCardStyle" role="status" aria-live="polite">
            <div class="geo-hover-head">
              <span class="geo-hover-title">
                <img v-if="flagUrl(hoveredMarker.cluster.code)" :src="flagUrl(hoveredMarker.cluster.code)" :alt="hoveredMarker.cluster.name" class="geo-region-flag" />
                <strong>{{ hoveredMarker.cluster.name }}</strong>
              </span>
              <span class="geo-hover-count" :class="{ 'is-partial': hoveredMarker.cluster.online > 0 && hoveredMarker.cluster.online < hoveredMarker.cluster.total, 'is-offline': !hoveredMarker.cluster.online }">{{ hoveredMarker.cluster.online }}/{{ hoveredMarker.cluster.total }}</span>
            </div>
            <div class="geo-hover-rows">
              <div><span>实时上行</span><strong class="geo-region-up">↑ {{ formatBytes(hoveredMarker.cluster.tx, true) }}</strong></div>
              <div><span>实时下行</span><strong class="geo-region-down">↓ {{ formatBytes(hoveredMarker.cluster.rx, true) }}</strong></div>
              <div v-if="pingEnabled">
                <span>平均延迟</span>
                <strong :class="`latency-text-${regionLatencyTone(hoveredMarker.cluster.code)}`">{{ latencyLabel(regionLatencySummary(hoveredMarker.cluster.code).avg, false) }}</strong>
              </div>
              <div v-if="pingEnabled && hoveredMarker.cluster.online > 0" class="geo-hover-cov">
                <span>采样覆盖</span>
                <span>{{ regionLatencySummary(hoveredMarker.cluster.code).sampled }}/{{ hoveredMarker.cluster.online }} 台</span>
              </div>
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
      <div v-if="clusters.length" class="geo-region-panel" :class="{ 'has-scroll-top': scrollTopFade, 'has-scroll-bottom': scrollBottomFade }">
        <div ref="listRef" class="geo-region-list" role="list" tabindex="0" :aria-label="pingEnabled ? '各地区在线状态、实时速率与平均延迟' : '各地区在线状态与实时速率'" @scroll="updateScrollState">
          <div
            v-for="cluster in clusters"
            :key="cluster.code"
            class="geo-region-row"
            :class="{ 'is-offline': !cluster.online, 'is-hovered': hoveredCode === cluster.code }"
            role="listitem"
            :title="clusterTitle(cluster)"
            @mouseenter="pointerCode = cluster.code"
            @mouseleave="pointerCode = null"
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
      </div>
    </div>
  </div>
</template>
