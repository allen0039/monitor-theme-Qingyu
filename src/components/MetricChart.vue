<script setup lang="ts">
import { computed } from 'vue'
import { formatBytes } from '../lib/format'
export interface ChartPoint { ts: number; [key: string]: number | null }
export interface ChartLine { key: string; label: string; color: string; dashed?: boolean }
const props = defineProps<{ title: string; points: ChartPoint[]; lines: ChartLine[]; step: number; unit: 'percent' | 'bytes' | 'rate' | 'ms'; cap?: number; cursor?: number | null }>()
const emit = defineEmits<{ cursor: [number | null] }>()
const width = 620, height = 216, left = 52, right = 12, top = 17, bottom = 38
const plotW = width - left - right, plotH = height - top - bottom
const bounds = computed(() => {
  const first = props.points[0]?.ts ?? Math.floor(Date.now() / 1000) - 3600
  const last = props.points.at(-1)?.ts ?? first + 3600
  return { start: first, end: Math.max(first + 1, last) }
})
const max = computed(() => props.cap ?? Math.max(1, ...props.points.flatMap(p => props.lines.map(line => p[line.key] ?? 0))) * 1.13)
const x = (ts: number) => left + (ts - bounds.value.start) / (bounds.value.end - bounds.value.start) * plotW
const y = (value: number) => top + plotH - (Math.max(0, value) / max.value) * plotH
function linePath(key: string) {
  let path = '', previous: number | null = null
  for (const point of props.points) {
    const value = point[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) { previous = null; continue }
    path += (previous !== null && point.ts - previous <= Math.max(1, props.step) * 1.6 ? ' L' : ' M') + x(point.ts).toFixed(2) + ' ' + y(value).toFixed(2)
    previous = point.ts
  }
  return path.trim()
}
const ticks = computed(() => [0, .25, .5, .75, 1].map(f => ({ y: y(f * max.value), label: display(f * max.value, true) })))
const timeTicks = computed(() => [0, .25, .5, .75, 1].map(f => {
  const date = new Date((bounds.value.start + (bounds.value.end - bounds.value.start) * f) * 1000)
  return { x: left + f * plotW, label: date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) }
}))
const focused = computed(() => props.cursor === null || props.cursor === undefined ? null : props.points.reduce<ChartPoint | null>((best, point) =>
  !best || Math.abs(point.ts - props.cursor!) < Math.abs(best.ts - props.cursor!) ? point : best, null))
function display(value: number | null | undefined, short = false) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  if (props.unit === 'bytes') return formatBytes(value)
  if (props.unit === 'rate') return formatBytes(value, true)
  if (props.unit === 'percent') return value.toFixed(short ? 0 : 1) + '%'
  return value.toFixed(short ? 0 : 1) + ' ms'
}
function leave(event: PointerEvent) { if (event.pointerType !== 'touch') emit('cursor', null) }
function move(event: MouseEvent | PointerEvent) {
  if (!props.points.length) return
  const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
  const px = Math.max(0, Math.min(1, ((event.clientX - rect.left) / rect.width * width - left) / plotW))
  emit('cursor', bounds.value.start + px * (bounds.value.end - bounds.value.start))
}
</script>
<template>
  <section class="detail-chart">
    <div class="detail-chart-top"><h3>{{ title }}</h3><div class="detail-legend"><span v-for="line in lines" :key="line.key"><i :style="{ background: line.color }" />{{ line.label }}</span></div></div>
    <div v-if="points.length" class="detail-plot">
      <svg class="chart-svg" :viewBox="'0 0 ' + width + ' ' + height" role="img" :aria-label="title + '历史趋势'" preserveAspectRatio="none" @pointermove="move" @pointerleave="leave" @click="move">
        <g v-for="tick in ticks" :key="tick.y"><path :d="'M' + left + ' ' + tick.y + ' H' + (width - right)" class="chart-gridline" /><text :x="left - 7" :y="tick.y + 4" text-anchor="end" class="chart-axis">{{ tick.label }}</text></g>
        <text v-for="tick in timeTicks" :key="tick.x" :x="tick.x" :y="height - 12" :text-anchor="tick.x === left ? 'start' : tick.x >= width - right - 1 ? 'end' : 'middle'" class="chart-axis">{{ tick.label }}</text>
        <path v-for="line in lines" :key="line.key" :d="linePath(line.key)" fill="none" :stroke="line.color" :stroke-dasharray="line.dashed ? '5 5' : undefined" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
        <path v-if="focused" :d="'M' + x(focused.ts) + ' ' + top + ' V' + (height - bottom)" class="chart-cursor" />
        <circle v-for="line in lines" v-if="focused" :key="line.key" :cx="x(focused.ts)" :cy="focused[line.key] === null ? -100 : y(focused[line.key]!)" r="3.6" :fill="line.color" stroke="var(--surface-solid)" stroke-width="2" vector-effect="non-scaling-stroke" />
      </svg>
      <div v-if="focused" class="chart-values" aria-live="off"><time>{{ new Date(focused.ts * 1000).toLocaleString('zh-CN') }}</time><span v-for="line in lines" :key="line.key" :style="{ color: line.color }">{{ line.label }} {{ display(focused[line.key]) }}</span></div>
    </div>
    <div v-else class="chart-empty">当前时间范围暂无历史数据</div>
  </section>
</template>