<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import type { MonitorNode } from '../types'
import worldPaths from '../assets/world-map.json'
import worldCountryIndex from '../assets/world-map-countries.json'
import { clustersOf, layoutMapMarkers, MAP_VIEWBOX, sortClusters } from '../lib/geo'
import { flagUrl } from '../lib/assets'
import { bytes, formatBytes } from '../lib/format'
const props = withDefaults(defineProps<{ nodes: MonitorNode[]; showLabels?: boolean }>(), { showLabels: true })
const clusters = computed(() => sortClusters(clustersOf(props.nodes)))
const markers = computed(() => layoutMapMarkers(clusters.value))
const hoveredCode = ref<string | null>(null)
const uid = useId().replaceAll(':', '')
const allPaths = worldPaths as string[]
const basePaths = allPaths.filter((_, index) => index !== MAP_VIEWBOX.antarcticaIndex)
const countryPaths = worldCountryIndex as Record<string, number>
const onlinePaths = computed(() => clusters.value
  .filter(cluster => cluster.online > 0)
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
function compactRate(value: number): string {
  const part = bytes(value, true)
  if (!part.unit) return part.value
  const n = Number(part.value)
  if (part.unit === 'B/s' || n >= 100) return `${Math.round(n)} ${part.unit}`
  return `${Number(n.toFixed(1))} ${part.unit}`
}
const PAGE_SIZE = 6
const page = ref(0)
const totalPages = computed(() => Math.max(1, Math.ceil(clusters.value.length / PAGE_SIZE)))
const currentPage = computed(() => Math.min(page.value, totalPages.value - 1))
const pagedClusters = computed(() => clusters.value.slice(currentPage.value * PAGE_SIZE, (currentPage.value + 1) * PAGE_SIZE))
function setPage(next: number) {
  page.value = Math.min(totalPages.value - 1, Math.max(0, next))
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
    <div class="geo-map-header">
      <div class="geo-map-status"><slot name="status" /></div>
      <div class="geo-map-actions">
        <span class="geo-map-count">{{ clusters.length }} 个国家和地区</span>
        <div v-if="totalPages > 1" class="geo-map-pager" role="group" aria-label="地区列表翻页">
          <button type="button" class="geo-pager-btn" :disabled="currentPage <= 0" aria-label="上一页" title="上一页" @click="setPage(currentPage - 1)">‹</button>
          <span class="geo-pager-index">{{ currentPage + 1 }}/{{ totalPages }}</span>
          <button type="button" class="geo-pager-btn" :disabled="currentPage >= totalPages - 1" aria-label="下一页" title="下一页" @click="setPage(currentPage + 1)">›</button>
        </div>
      </div>
    </div>
    <div class="geo-map-body" :class="{ 'geo-map-body-full': !clusters.length }">
      <div class="geo-map-stage">
        <div class="geo-map-canvas">
          <svg :viewBox="`0 ${MAP_VIEWBOX.yMin} ${MAP_VIEWBOX.width} ${MAP_VIEWBOX.height}`" role="img" aria-label="世界节点分布">
            <defs>
              <pattern :id="`dots-base-${uid}`" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.6" class="map-dot-base" /></pattern>
              <pattern :id="`dots-online-${uid}`" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.6" class="map-dot-online" /></pattern>
              <pattern :id="`dots-offline-${uid}`" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.6" class="map-dot-offline" /></pattern>
              <pattern :id="`dots-hover-${uid}`" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.6" class="map-dot-hover" /></pattern>
              <clipPath :id="`land-${uid}`"><path v-for="(path, i) in basePaths" :key="i" :d="path" /></clipPath>
              <clipPath v-if="onlinePaths.length" :id="`land-online-${uid}`"><path v-for="(path, i) in onlinePaths" :key="i" :d="path" /></clipPath>
              <clipPath v-if="offlinePaths.length" :id="`land-offline-${uid}`"><path v-for="(path, i) in offlinePaths" :key="i" :d="path" /></clipPath>
              <clipPath v-if="hoveredPath" :id="`land-hover-${uid}`"><path :d="hoveredPath" /></clipPath>
            </defs>
            <rect x="0" :y="MAP_VIEWBOX.yMin" :width="MAP_VIEWBOX.width" :height="MAP_VIEWBOX.height" :fill="`url(#dots-base-${uid})`" :clip-path="`url(#land-${uid})`" />
            <rect v-if="onlinePaths.length" x="0" :y="MAP_VIEWBOX.yMin" :width="MAP_VIEWBOX.width" :height="MAP_VIEWBOX.height" :fill="`url(#dots-online-${uid})`" :clip-path="`url(#land-online-${uid})`" />
            <rect v-if="offlinePaths.length" x="0" :y="MAP_VIEWBOX.yMin" :width="MAP_VIEWBOX.width" :height="MAP_VIEWBOX.height" :fill="`url(#dots-offline-${uid})`" :clip-path="`url(#land-offline-${uid})`" />
            <rect v-if="hoveredPath" x="0" :y="MAP_VIEWBOX.yMin" :width="MAP_VIEWBOX.width" :height="MAP_VIEWBOX.height" :fill="`url(#dots-hover-${uid})`" :clip-path="`url(#land-hover-${uid})`" />
            <g v-for="marker in markers" :key="marker.cluster.code" :transform="`translate(${marker.anchorX},${marker.anchorY})`" class="map-marker" @mouseenter="hoveredCode = marker.cluster.code" @mouseleave="hoveredCode = null">
              <title>{{ marker.cluster.name }} · {{ marker.cluster.online }}/{{ marker.cluster.total }} 在线 · ↑ {{ formatBytes(marker.cluster.tx, true) }} ↓ {{ formatBytes(marker.cluster.rx, true) }}</title>
              <circle v-if="!showLabels" r="8.5" :fill="marker.cluster.online ? 'var(--emerald)' : 'var(--warning)'" opacity=".2" />
              <circle :r="showLabels ? 2.2 : 3.4" :fill="marker.cluster.online ? 'var(--emerald)' : 'var(--warning)'" />
            </g>
          </svg>
          <div v-if="showLabels && markers.length" class="geo-map-markers">
            <span v-for="marker in markers" :key="marker.cluster.code" class="geo-marker-pill" :class="{ 'is-offline': !marker.cluster.online, 'is-hovered': hoveredCode === marker.cluster.code }" :style="{ left: `${marker.leftPct}%`, top: `${marker.topPct}%` }" :title="`${marker.cluster.name} · ${marker.cluster.online}/${marker.cluster.total} 在线 · ↑ ${formatBytes(marker.cluster.tx, true)} ↓ ${formatBytes(marker.cluster.rx, true)}`" @mouseenter="hoveredCode = marker.cluster.code" @mouseleave="hoveredCode = null">
              <span class="geo-marker-count">{{ marker.cluster.total }}</span>
              <img v-if="flagUrl(marker.cluster.code)" :src="flagUrl(marker.cluster.code)" :alt="marker.cluster.name" class="geo-marker-flag" />
              <span v-else class="geo-marker-code">{{ marker.cluster.code }}</span>
            </span>
          </div>
        </div>
      </div>
      <div v-if="clusters.length" class="geo-region-list" role="list" aria-label="各地区在线与实时速率" @wheel="onListWheel">
        <div v-for="cluster in pagedClusters" :key="cluster.code" class="geo-region-row" :class="{ 'is-offline': !cluster.online, 'is-hovered': hoveredCode === cluster.code }" role="listitem" :title="`${cluster.name} · ${cluster.online}/${cluster.total} 在线 · ↑ ${formatBytes(cluster.tx, true)} ↓ ${formatBytes(cluster.rx, true)}`" @mouseenter="hoveredCode = cluster.code" @mouseleave="hoveredCode = null">
          <span class="geo-region-name">
            <img v-if="flagUrl(cluster.code)" :src="flagUrl(cluster.code)" :alt="cluster.name" class="geo-region-flag" />
            <span>{{ cluster.name }}</span>
          </span>
          <span class="geo-region-meta">
            <span class="geo-region-count" :class="{ 'is-partial': cluster.online > 0 && cluster.online < cluster.total, 'is-offline': !cluster.online }">{{ cluster.online }}/{{ cluster.total }}</span>
            <template v-if="cluster.online > 0">
              <span class="geo-region-up">↑ {{ compactRate(cluster.tx) }}</span>
              <span class="geo-region-down">↓ {{ compactRate(cluster.rx) }}</span>
            </template>
            <span v-else class="geo-region-offline-label">离线</span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
