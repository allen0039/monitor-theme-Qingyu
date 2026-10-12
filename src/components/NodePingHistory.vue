<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { MonitorNode, PingNetwork, ThemeConfig } from '../types'
import { ApiError } from '../lib/api'
import { fetchHistory, historyRanges } from '../lib/history'
import { readQingyuStorage } from '../lib/storage'
import { selectPingNetworks } from '../lib/ping'
import { latencyLabel, lossLabel } from '../lib/ping-display'
import MetricChart, { type ChartPoint, type ChartLine } from './MetricChart.vue'
const props = defineProps<{ node: MonitorNode; config: ThemeConfig; historyDays?: number }>()
const options = computed(() => historyRanges(props.historyDays))
const hours = ref(1), data = ref<PingNetwork[]>([]), selected = ref<number[]>([])
function initialSmooth(): boolean { try { return readQingyuStorage(localStorage, 'qingyu.ping.smooth') === '1' } catch { return false } }
const smooth = ref(initialSmooth())
watch(smooth, enabled => { try { localStorage.setItem('qingyu.ping.smooth', enabled ? '1' : '0') } catch { /* Browser storage unavailable. */ } })
const busy = ref(false), error = ref(''), updated = ref(0), cursor = ref<number | null>(null)
let timer: ReturnType<typeof setInterval> | null = null, controller: AbortController | null = null, generation = 0, cooldown = 0
function refresh(force = false) {
  controller?.abort()
  const gen = ++generation
  if (document.hidden || Date.now() < cooldown && !force) return
  const ctrl = new AbortController()
  controller = ctrl
  busy.value = true; error.value = ''
  void fetchHistory(props.node.id, hours.value, 'ping', ctrl.signal).then(value => {
    if (gen !== generation || ctrl.signal.aborted) return
    const networks = selectPingNetworks(value, props.config.ping_tasks, Infinity)
    data.value = networks
    const valid = networks.map(n => n.id)
    selected.value = selected.value.filter(id => valid.includes(id))
    if (!selected.value.length) selected.value = valid
    updated.value = Date.now()
  }).catch((failure: unknown) => {
    if (gen !== generation || ctrl.signal.aborted) return
    error.value = failure instanceof Error ? failure.message : '延迟历史暂时不可用'
    if (failure instanceof ApiError && failure.status === 429) cooldown = Date.now() + 120_000
    if (failure instanceof ApiError && [401, 404].includes(failure.status)) data.value = []
  }).finally(() => { if (gen === generation) busy.value = false })
}
function onVisible() { if (!document.hidden) refresh(); else { controller?.abort(); ++generation } }
onMounted(() => { document.addEventListener('visibilitychange', onVisible); timer = setInterval(() => refresh(), 60_000) })
onBeforeUnmount(() => { ++generation; controller?.abort(); if (timer) clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) })
watch([() => props.node.id, hours, () => props.config.ping_tasks], () => { data.value = []; selected.value = []; cursor.value = null; refresh() }, { immediate: true })
watch(options, list => { if (!list.some(r => r.hours === hours.value)) hours.value = list[0]!.hours })
const colors = ['#14aa86', '#3f96d7', '#d68c44', '#9d80d7', '#c45e86', '#3aa0a1', '#b5a148', '#789da7']
const active = computed(() => data.value.filter(n => selected.value.includes(n.id)))
const lines = computed<ChartLine[]>(() => active.value.map(n => ({ key: 'ping_' + n.id, label: n.name, color: colors[data.value.findIndex(p => p.id === n.id) % colors.length]! })))
const rows = computed<ChartPoint[]>(() => {
  const map = new Map<number, ChartPoint>()
  for (const net of active.value) for (const row of net.rows) {
    const point = map.get(row.ts) ?? { ts: row.ts }
    point['ping_' + net.id] = row.latency
    map.set(row.ts, point)
  }
  return [...map.values()].sort((a, b) => a.ts - b.ts)
})
const step = computed(() => {
  const timestamps = rows.value.map(p => p.ts)
  const gaps = timestamps.slice(1).map((ts, i) => ts - timestamps[i]!).filter(g => g > 0).sort((a,b) => a-b)
  return gaps.length ? Math.max(60, gaps[Math.floor((gaps.length - 1) / 2)]!) : Math.max(60, hours.value * 3600 / 60)
})
function toggle(id: number) { selected.value = selected.value.includes(id) ? selected.value.filter(k => k !== id) : [...selected.value, id] }
</script>
<template>
  <section class="detail-section detail-history detail-ping-history" aria-labelledby="ping-history-title">
    <div class="detail-section-head">
      <div><h2 id="ping-history-title">网络质量</h2><p>延迟历史与选定时间范围内的丢包率{{ updated ? ' · ' + new Date(updated).toLocaleTimeString('zh-CN') + ' 更新' : '' }}</p></div>
      <div class="detail-controls"><label>时间范围 <select v-model.number="hours" aria-label="延迟历史时间范围"><option v-for="r in options" :key="r.hours" :value="r.hours">{{ r.label }}</option></select></label><label class="detail-check detail-smooth-toggle" title="平缓尖峰并连续连接短暂缺测或超时；长时间断档仍会断开"><input v-model="smooth" type="checkbox" role="switch" aria-label="平滑显示延迟曲线" /><span>平滑显示</span></label><button type="button" class="detail-control-button" :disabled="busy" @click="refresh(true)">刷新</button></div>
    </div>
    <div v-if="error" class="detail-fetch-error" role="status">{{ error }}<span v-if="data.length"> · 保留上次成功数据</span><button type="button" @click="refresh(true)">重试</button></div>
    <div v-if="busy && !data.length" class="chart-empty">正在加载线路延迟…</div>
    <template v-else>
      <div v-if="data.length" class="detail-ping-networks">
        <label v-for="(network, index) in data" :key="network.id" class="ping-network-option">
          <input type="checkbox" :checked="selected.includes(network.id)" @change="toggle(network.id)" />
          <i :style="{ background: colors[index % colors.length] }" /><span>{{ network.name }}</span>
          <strong>{{ latencyLabel(network.latest?.latency ?? null, !!network.latest) }}</strong>
          <small>丢包 {{ lossLabel(network.loss) }}</small>
        </label>
      </div>
      <MetricChart v-if="active.length" title="多线路延迟历史" :points="rows" :lines="lines" :step="step" unit="ms" :smooth="smooth" :cursor="cursor" @cursor="cursor = $event" />
      <div v-else class="chart-empty">{{ data.length ? '勾选线路以查看延迟趋势' : '当前节点没有配置的线路或历史记录' }}</div>
      <p v-if="smooth && active.length" class="detail-smooth-note">平滑会减轻尖峰，并连续连接短暂缺测或超时（最多两个采样周期）；长时间断档仍会断开。仅影响曲线显示，悬停读数和丢包率仍使用原始数据。</p>
    </template>
  </section>
</template>
