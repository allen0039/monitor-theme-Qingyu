<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { MonitorNode, ThemeConfig } from '../types'
import { ApiError } from '../lib/api'
import { fetchHistory, historyRanges, type HistoryResult } from '../lib/history'
import MetricChart, { type ChartLine } from './MetricChart.vue'
const props = defineProps<{ node: MonitorNode; config: ThemeConfig; historyDays?: number }>()
const options = computed(() => historyRanges(props.historyDays))
const hours = ref(1)
const peak = ref(false)
const data = ref<HistoryResult | null>(null)
const busy = ref(false), error = ref(''), updated = ref(0)
const cursor = ref<number | null>(null)
let controller: AbortController | null = null, timer: ReturnType<typeof setInterval> | null = null, generation = 0
let cooldown = 0
const visible = computed(() => props.config.show_cpu || props.config.show_memory || props.config.show_disk || props.config.show_speed)
function refresh(force = false) {
  controller?.abort()
  controller = null
  const gen = ++generation
  if (!visible.value || document.hidden || Date.now() < cooldown && !force) return
  const current = new AbortController()
  controller = current
  busy.value = true
  error.value = ''
  void fetchHistory(props.node.id, hours.value, 'metrics', current.signal).then(result => {
    if (gen !== generation || current.signal.aborted) return
    data.value = result
    updated.value = Date.now()
  }).catch((failure: unknown) => {
    if (gen !== generation || current.signal.aborted) return
    if (failure instanceof ApiError && failure.status === 429) cooldown = Date.now() + 120_000
    error.value = failure instanceof Error ? failure.message : '历史资源暂时不可用'
    if (failure instanceof ApiError && [401, 404].includes(failure.status)) data.value = null
  }).finally(() => { if (gen === generation) busy.value = false })
}
function onVisible() { if (!document.hidden) refresh() ; else { controller?.abort(); ++generation } }
onMounted(() => { document.addEventListener('visibilitychange', onVisible); timer = setInterval(() => refresh(), 60_000) })
onBeforeUnmount(() => { ++generation; controller?.abort(); if (timer) clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) })
watch([() => props.node.id, hours, visible], () => { data.value = null; cursor.value = null; refresh() }, { immediate: true })
watch(options, list => { if (!list.some(item => item.hours === hours.value)) hours.value = list[0]!.hours })
const points = computed(() => data.value?.points ?? [])
const cpuLines = computed<ChartLine[]>(() => [{ key: 'cpu', label: '平均 CPU', color: '#0fbd85' }, ...(peak.value ? [{ key: 'cpu_max', label: '峰值', color: '#e9a151', dashed: true }] : [])])
const networkLines = computed<ChartLine[]>(() => [{ key: 'net_rx', label: '下载', color: '#3898e6' }, { key: 'net_tx', label: '上传', color: '#08a882' }, ...(peak.value ? [{ key: 'net_rx_max', label: '下载峰值', color: '#9ab7f5', dashed: true }, { key: 'net_tx_max', label: '上传峰值', color: '#75bea7', dashed: true }] : [])])
const memory = computed(() => points.value.map(row => ({ ...row, mem_total: props.node.mem_total > 0 ? props.node.mem_total : null })))
const disk = computed(() => points.value.map(row => ({ ...row, disk_total: props.node.disk_total > 0 ? props.node.disk_total : null })))
</script>
<template>
  <section v-if="visible" class="detail-section detail-history" aria-labelledby="resource-history-title">
    <div class="detail-section-head">
      <div><h2 id="resource-history-title">资源趋势</h2><p>历史平均值 · {{ updated ? '更新于 ' + new Date(updated).toLocaleTimeString('zh-CN') : '正在读取历史' }}</p></div>
      <div class="detail-controls">
        <label>时间范围 <select v-model.number="hours" aria-label="资源趋势时间范围"><option v-for="r in options" :key="r.hours" :value="r.hours">{{ r.label }}</option></select></label>
        <label v-if="config.show_cpu || config.show_speed" class="detail-check"><input v-model="peak" type="checkbox" /> 显示峰值</label>
        <button type="button" class="detail-control-button" :disabled="busy" @click="refresh(true)">刷新</button>
      </div>
    </div>
    <div v-if="error" class="detail-fetch-error" role="status">{{ error }}<span v-if="data"> · 保留上次成功的历史</span><button type="button" @click="refresh(true)">重试</button></div>
    <div v-if="busy && !data" class="chart-empty">正在加载资源历史…</div>
    <div v-else class="detail-chart-grid">
      <MetricChart v-if="config.show_cpu" title="CPU 使用率" :points="points" :lines="cpuLines" :step="data?.step ?? 60" unit="percent" :cap="100" :cursor="cursor" @cursor="cursor = $event" />
      <MetricChart v-if="config.show_memory" title="内存用量" :points="memory" :lines="[{ key: 'mem_used', label: '使用量', color: '#08ae84' }, { key: 'mem_total', label: '当前总容量', color: '#8bacc4', dashed: true }]" :step="data?.step ?? 60" unit="bytes" :cursor="cursor" @cursor="cursor = $event" />
      <MetricChart v-if="config.show_disk" title="磁盘用量" :points="disk" :lines="[{ key: 'disk_used', label: '使用量', color: '#dc9140' }, { key: 'disk_total', label: '当前总容量', color: '#8bacc4', dashed: true }]" :step="data?.step ?? 60" unit="bytes" :cursor="cursor" @cursor="cursor = $event" />
      <MetricChart v-if="config.show_speed" title="网络速率" :points="points" :lines="networkLines" :step="data?.step ?? 60" unit="rate" :cursor="cursor" @cursor="cursor = $event" />
    </div>
    <p v-if="(config.show_memory || config.show_disk) && points.length" class="chart-footnote">容量虚线使用当前总容量参考；若历史期间扩容，虚线不代表历史容量。</p>
  </section>
</template>