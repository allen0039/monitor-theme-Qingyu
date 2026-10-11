<script setup lang="ts">
import { computed, useId } from 'vue'
import type { MonitorNode } from '../types'
import worldPaths from '../assets/world-map.json'
import { clustersOf } from '../lib/geo'
import { flagUrl } from '../lib/assets'
import { formatBytes } from '../lib/format'
const props = defineProps<{ nodes: MonitorNode[] }>()
const clusters = computed(() => clustersOf(props.nodes))
const uid = useId().replaceAll(':', '')
const position = (lat: number, lng: number) => [400 + lng * 800 / 360, 200 - lat * 800 / 360]
</script>
<template>
  <div class="geo-map" aria-label="节点所在国家和地区">
    <svg viewBox="0 0 800 400" role="img" aria-label="世界节点分布">
      <defs>
        <pattern :id="`dots-${uid}`" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1" fill="currentColor" /></pattern>
        <clipPath :id="`land-${uid}`"><path v-for="(path, i) in worldPaths" :key="i" :d="path" /></clipPath>
      </defs>
      <rect width="800" height="400" :fill="`url(#dots-${uid})`" :clip-path="`url(#land-${uid})`" class="map-land" />
      <g v-for="cluster in clusters" :key="cluster.code" :transform="`translate(${position(cluster.lat, cluster.lng).join(',')})`" class="map-marker">
        <title>{{ cluster.name }} · {{ cluster.online }}/{{ cluster.total }} 在线 · ↑ {{ formatBytes(cluster.tx, true) }} ↓ {{ formatBytes(cluster.rx, true) }}</title>
        <circle r="9" :fill="cluster.online ? 'var(--emerald)' : 'var(--warning)'" opacity=".15" />
        <circle r="3" :fill="cluster.online ? 'var(--emerald)' : 'var(--warning)'" />
        <image v-if="flagUrl(cluster.code)" :href="flagUrl(cluster.code)" x="5" y="-18" width="20" height="14" />
      </g>
    </svg>
    <span class="visual-caption">{{ clusters.length }} 个国家和地区</span>
  </div>
</template>
