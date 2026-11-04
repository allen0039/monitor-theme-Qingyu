<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { formatBytes } from '../lib/format'
import { chartLineGeometry } from '../lib/chart-lines'
export interface ChartPoint { ts: number; [key: string]: number | null }
export interface ChartLine { key: string; label: string; color: string; dashed?: boolean }
const props = defineProps<{ title: string; points: ChartPoint[]; lines: ChartLine[]; step: number; unit: 'percent' | 'bytes' | 'rate' | 'ms'; cap?: number; cursor?: number | null; smooth?: boolean; scale?: 'full' | 'adaptive' }>()
const emit = defineEmits<{ cursor: [number | null] }>()
// Keep SVG drawing units in physical CSS pixels. A fixed 620-wide viewBox scaled
// text along with the lines on desktop, producing oversized axis labels.
const svgElement = ref<SVGSVGElement | null>(null)
const width = ref(620), height = ref(245)
const left = computed(() => props.unit === 'bytes' || props.unit === 'rate' ? 66 : 52)
const right = 14, top = 18, bottom = 34
const plotW = computed(() => Math.max(1, width.value - left.value - right))
const plotH = computed(() => Math.max(1, height.value - top - bottom))
let sizeObserver: ResizeObserver | undefined
watch(svgElement, element => {
  sizeObserver?.disconnect()
  if (!element) return
  const measure = () => {
    const rect = element.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      width.value = Math.round(rect.width * 100) / 100
      height.value = Math.round(rect.height * 100) / 100
    }
  }
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    sizeObserver = new ResizeObserver(measure)
    sizeObserver.observe(element)
  }
}, { flush: 'post' })
onBeforeUnmount(() => sizeObserver?.disconnect())
const bounds = computed(() => {
  const first = props.points[0]?.ts ?? Math.floor(Date.now() / 1000) - 3600
  const last = props.points.at(-1)?.ts ?? first + 3600
  return { start: first, end: Math.max(first + 1, last) }
})
const values = computed(() => props.points.flatMap(point => props.lines.map(line => point[line.key]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value))))
function percentile(sorted: number[], fraction: number): number {
  if (!sorted.length) return 0
  const position = (sorted.length - 1) * fraction, lower = Math.floor(position), upper = Math.ceil(position)
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower)
}
function niceStep(value: number): number {
  const exponent = Math.floor(Math.log10(Math.max(1, value)))
  const base = 10 ** exponent
  const unit = value / base
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * base
}
const domain = computed(() => {
  const sorted = [...values.value].sort((a, b) => a - b)
  const fullMax = props.cap ?? Math.max(1, ...sorted, 1) * 1.13
  if (props.scale !== 'adaptive' || props.unit !== 'ms' || !sorted.length) return { min: 0, max: fullMax, clipped: 0 }
  const low = percentile(sorted, .05), high = Math.max(...sorted), span = Math.max(100, high - low)
  const step = niceStep(span / 4), min = Math.max(0, Math.floor(Math.max(0, low - step * .35) / step) * step)
  const max = Math.max(min + step * 4, Math.ceil((high + step * .2) / step) * step)
  return { min, max, clipped: sorted.filter(value => value < min || value > max).length }
})
const x = (ts: number) => left.value + (ts - bounds.value.start) / (bounds.value.end - bounds.value.start) * plotW.value
const y = (value: number) => {
  const fraction = Math.max(0, Math.min(1, (value - domain.value.min) / (domain.value.max - domain.value.min)))
  return top + plotH.value - fraction * plotH.value
}
const geometry = computed(() => Object.fromEntries(
  props.lines.map(line => [line.key, chartLineGeometry(props.points, line.key, props.step, x, y, props.smooth === true)])
) as Record<string, ReturnType<typeof chartLineGeometry>>)
const ticks = computed(() => [0, .25, .5, .75, 1].map(f => {
  const value = domain.value.min + f * (domain.value.max - domain.value.min)
  return { y: y(value), label: display(value, true) }
}))
const timeTicks = computed(() => {
  const count = width.value < 600 ? 3 : width.value < 980 ? 4 : 5
  const sameDay = new Date(bounds.value.start * 1000).toDateString() === new Date(bounds.value.end * 1000).toDateString()
  return Array.from({ length: count }, (_, i) => {
    const fraction = i / (count - 1)
    const date = new Date((bounds.value.start + (bounds.value.end - bounds.value.start) * fraction) * 1000)
    return {
      x: left.value + fraction * plotW.value,
      label: date.toLocaleString('zh-CN', { ...(sameDay ? {} : { month: 'numeric' as const, day: 'numeric' as const }), hour: '2-digit', minute: '2-digit', hour12: false }),
    }
  })
})
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
  const px = Math.max(0, Math.min(1, ((event.clientX - rect.left) / rect.width * width.value - left.value) / plotW.value))
  emit('cursor', bounds.value.start + px * (bounds.value.end - bounds.value.start))
}
</script>
<template>
  <section class="detail-chart">
    <div class="detail-chart-top"><div class="detail-chart-title"><h3>{{ title }}</h3><span v-if="props.scale === 'adaptive' && domain.clipped" class="chart-scale-note">{{ domain.clipped }} 个尖峰超出当前范围</span></div><div class="detail-legend"><span v-for="line in lines" :key="line.key"><i :style="{ background: line.color }" />{{ line.label }}</span></div></div>
    <div v-if="points.length" class="detail-plot">
      <svg ref="svgElement" class="chart-svg" :viewBox="'0 0 ' + width + ' ' + height" role="img" :aria-label="title + '历史趋势'" preserveAspectRatio="none" @pointermove="move" @pointerleave="leave" @click="move">
        <g v-for="tick in ticks" :key="tick.y"><path :d="'M' + left + ' ' + tick.y + ' H' + (width - right)" class="chart-gridline" /><text :x="left - 7" :y="tick.y + 4" text-anchor="end" class="chart-axis chart-axis-y">{{ tick.label }}</text></g>
        <text v-for="tick in timeTicks" :key="tick.x" :x="tick.x" :y="height - 12" :text-anchor="tick.x === left ? 'start' : tick.x >= width - right - 1 ? 'end' : 'middle'" class="chart-axis chart-axis-x">{{ tick.label }}</text>
        <path v-for="line in lines" :key="line.key" :d="geometry[line.key]?.solid ?? ''" fill="none" :stroke="line.color" :stroke-dasharray="line.dashed ? '5 5' : undefined" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
        <path v-if="focused" :d="'M' + x(focused.ts) + ' ' + top + ' V' + (height - bottom)" class="chart-cursor" />
        <circle v-for="line in lines" v-if="focused" :key="line.key" :cx="x(focused.ts)" :cy="focused[line.key] === null ? -100 : y(focused[line.key]!)" r="3.6" :fill="line.color" stroke="var(--surface-solid)" stroke-width="2" vector-effect="non-scaling-stroke" />
      </svg>
      <div v-if="focused" class="chart-values" aria-live="off"><time>{{ new Date(focused.ts * 1000).toLocaleString('zh-CN') }}</time><span v-for="line in lines" :key="line.key" :style="{ color: line.color }">{{ line.label }} {{ display(focused[line.key]) }}</span></div>
    </div>
    <div v-else class="chart-empty">当前时间范围暂无历史数据</div>
  </section>
</template>
