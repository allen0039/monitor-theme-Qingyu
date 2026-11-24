<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { MonitorNode } from '../types'
import { flagUrl } from '../lib/assets'
import { regionName } from '../lib/data'
import { formatBytes } from '../lib/format'
import { useSummaryPopoverPosition } from '../lib/popover'
import { rankTrafficNodes } from '../lib/summary-insights'

const props = defineProps<{
  id: string
  anchor: HTMLElement | null
  nodes: MonitorNode[]
  scope: 'group' | 'all'
  monthTx: number
  monthRx: number
  dayTx: number | null
  dayRx: number | null
}>()

const emit = defineEmits<{ open: [id: number]; openChange: [open: boolean] }>()
const panel = ref<HTMLElement | null>(null)
const hasQuota = computed(() => props.nodes.some((node) => node.traffic_limit > 0))
const hasDaily = computed(() => props.dayTx !== null && props.dayRx !== null)
const mode = ref<'quota' | 'month' | 'day'>(hasQuota.value ? 'quota' : 'month')

watch([hasQuota, hasDaily], ([quotaAvailable, dailyAvailable]) => {
  if (mode.value === 'quota' && !quotaAvailable) mode.value = 'month'
  if (mode.value === 'day' && !dailyAvailable) mode.value = quotaAvailable ? 'quota' : 'month'
})

const summary = computed(() => rankTrafficNodes(props.nodes, mode.value, 5))
const monthTotal = computed(() => props.monthTx + props.monthRx)
const dayTotal = computed(() => hasDaily.value ? props.dayTx! + props.dayRx! : null)

function quotaTone(pct: number | null): string {
  if (pct === null) return 'is-up'
  if (pct >= 85) return 'is-danger'
  if (pct >= 70) return 'is-warn'
  return 'is-up'
}

const position = useSummaryPopoverPosition(panel, () => props.anchor)
function selectNode(id: number) {
  panel.value?.hidePopover?.()
  emit('open', id)
}
function onToggle(event: Event) {
  const open = (event as ToggleEvent).newState === 'open'
  if (open) {
    mode.value = hasQuota.value ? 'quota' : 'month'
    position()
  }
  emit('openChange', open)
}
</script>

<template>
  <section
    :id="id"
    ref="panel"
    popover="auto"
    class="summary-popover summary-traffic-popover"
    role="dialog"
    :aria-label="scope === 'all' ? '全部节点本月与今日流量明细' : '当前分组本月与今日流量明细'"
    @toggle="onToggle"
  >
    <div class="summary-pop-metrics">
      <div class="summary-pop-metric">
        <span>今日流量</span>
        <strong>{{ dayTotal !== null ? formatBytes(dayTotal, false, 'overview') : '—' }}</strong>
        <small>{{ hasDaily ? `↑ ${formatBytes(dayTx, false, 'overview')} · ↓ ${formatBytes(dayRx, false, 'overview')}` : '暂未上报日统计' }}</small>
      </div>
      <div class="summary-pop-metric">
        <span>本月流量</span>
        <strong>{{ formatBytes(monthTotal, false, 'overview') }}</strong>
        <small>↑ {{ formatBytes(monthTx, false, 'overview') }} · ↓ {{ formatBytes(monthRx, false, 'overview') }}</small>
      </div>
    </div>

    <div class="summary-pop-head summary-pop-head-sub">
      <strong class="summary-pop-title">节点流量排行</strong>
      <div class="summary-pop-tabs" role="tablist" aria-label="流量排行口径">
        <button v-if="hasQuota" type="button" role="tab" :aria-selected="mode === 'quota'" class="summary-pop-tab" :class="{ active: mode === 'quota' }" @click="mode = 'quota'">配额占比</button>
        <button type="button" role="tab" :aria-selected="mode === 'month'" class="summary-pop-tab" :class="{ active: mode === 'month' }" @click="mode = 'month'">本月</button>
        <button v-if="hasDaily" type="button" role="tab" :aria-selected="mode === 'day'" class="summary-pop-tab" :class="{ active: mode === 'day' }" @click="mode = 'day'">今日</button>
      </div>
    </div>

    <div class="summary-pop-body">
      <div v-if="!summary.items.length" class="summary-pop-empty">
        <strong>当前范围暂无流量数据</strong>
        <span>节点连接后将统计本月与今日用量</span>
      </div>
      <button
        v-for="item in summary.items"
        :key="`tr-${item.node.id}`"
        type="button"
        class="summary-popover-row summary-popover-row-ranked"
        @click="selectNode(item.node.id)"
      >
        <div class="summary-pop-row-top">
          <span class="summary-pop-node">
            <img v-if="flagUrl(item.node.country)" :src="flagUrl(item.node.country)!" :alt="regionName(item.node.country)" class="country-flag" />
            <strong>{{ item.node.name }}</strong>
          </span>
          <span v-if="mode === 'quota'" class="summary-pop-quota-meta">
            {{ formatBytes(item.node.month_used, false, 'overview') }} / {{ formatBytes(item.limit, false, 'overview') }}
            <template v-if="item.resetDay !== null"> · {{ item.resetDay }}日重置</template>
          </span>
          <span v-else class="summary-pop-speeds">
            <span class="summary-dir-up">↑ {{ formatBytes(item.tx, false, 'overview') }}</span>
            <span class="summary-dir-sep">·</span>
            <span class="summary-dir-down">↓ {{ formatBytes(item.rx, false, 'overview') }}</span>
          </span>
          <span class="summary-pop-chevron" aria-hidden="true">›</span>
        </div>
        <div class="summary-pop-progress" aria-hidden="true">
          <span :class="mode === 'quota' ? quotaTone(item.pct) : 'is-up'" :style="{ width: `${item.ratio}%` }" />
        </div>
      </button>
    </div>

    <div class="summary-pop-foot">
      <span>{{ summary.highQuotaCount > 0 ? `${summary.highQuotaCount} 台配额已达 80%` : `共统计 ${nodes.length} 台节点` }}</span>
      <span class="summary-pop-hint">点击节点跳转详情</span>
    </div>
  </section>
</template>
