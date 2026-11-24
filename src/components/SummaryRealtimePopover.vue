<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MonitorNode } from '../types'
import { flagUrl } from '../lib/assets'
import { regionName } from '../lib/data'
import { formatBytes } from '../lib/format'
import { useSummaryPopoverPosition } from '../lib/popover'
import { rankRealtimeNodes } from '../lib/summary-insights'

const props = defineProps<{
  id: string
  anchor: HTMLElement | null
  nodes: MonitorNode[]
  scope: 'group' | 'all'
  tx: number
  rx: number
  reporting: number
  peak: number
}>()

const emit = defineEmits<{ open: [id: number]; openChange: [open: boolean] }>()
const panel = ref<HTMLElement | null>(null)
const mode = ref<'total' | 'up' | 'down'>('total')

const totalSpeed = computed(() => props.tx + props.rx)
const upPct = computed(() => totalSpeed.value > 0 ? Math.round((props.tx / totalSpeed.value) * 100) : 0)
const downPct = computed(() => totalSpeed.value > 0 ? Math.max(0, 100 - upPct.value) : 0)
const ranked = computed(() => rankRealtimeNodes(props.nodes, mode.value, 5))

const position = useSummaryPopoverPosition(panel, () => props.anchor)
function selectNode(id: number) {
  panel.value?.hidePopover?.()
  emit('open', id)
}
function onToggle(event: Event) {
  const open = (event as ToggleEvent).newState === 'open'
  if (open) position()
  emit('openChange', open)
}
</script>

<template>
  <section
    :id="id"
    ref="panel"
    popover="auto"
    class="summary-popover summary-realtime-popover"
    role="dialog"
    :aria-label="scope === 'all' ? '全部节点实时吞吐分布' : '当前分组实时吞吐分布'"
    @toggle="onToggle"
  >
    <div class="summary-pop-head">
      <strong class="summary-pop-title">实时吞吐分布</strong>
      <div class="summary-pop-tabs" role="tablist" aria-label="排序方向">
        <button type="button" role="tab" :aria-selected="mode === 'total'" class="summary-pop-tab" :class="{ active: mode === 'total' }" @click="mode = 'total'">总计</button>
        <button type="button" role="tab" :aria-selected="mode === 'up'" class="summary-pop-tab" :class="{ active: mode === 'up' }" @click="mode = 'up'">上行</button>
        <button type="button" role="tab" :aria-selected="mode === 'down'" class="summary-pop-tab" :class="{ active: mode === 'down' }" @click="mode = 'down'">下行</button>
      </div>
    </div>

    <div class="summary-pop-metrics">
      <div class="summary-pop-metric">
        <span>实时上行</span>
        <strong class="summary-dir-up">↑ {{ formatBytes(reporting ? tx : null, true, 'overview') }}</strong>
        <small>{{ totalSpeed > 0 ? `占比 ${upPct}%` : '暂无速率' }}</small>
      </div>
      <div class="summary-pop-metric">
        <span>实时下行</span>
        <strong class="summary-dir-down">↓ {{ formatBytes(reporting ? rx : null, true, 'overview') }}</strong>
        <small>{{ totalSpeed > 0 ? `占比 ${downPct}%` : '暂无速率' }}</small>
      </div>
    </div>

    <div class="summary-pop-split-bar" aria-hidden="true">
      <span v-if="totalSpeed > 0" class="is-up" :style="{ width: `${upPct}%` }" />
      <span v-if="totalSpeed > 0" class="is-down" :style="{ width: `${downPct}%` }" />
    </div>

    <div class="summary-pop-body">
      <div class="summary-pop-section-head">
        <span>活跃节点 Top {{ ranked.length || 5 }}</span>
      </div>
      <div v-if="!ranked.length" class="summary-pop-empty">
        <strong>暂无正在上报吞吐的节点</strong>
        <span>节点上线并上报指标后将显示实时排行</span>
      </div>
      <button
        v-for="item in ranked"
        :key="`rt-${item.node.id}`"
        type="button"
        class="summary-popover-row summary-popover-row-ranked"
        @click="selectNode(item.node.id)"
      >
        <div class="summary-pop-row-top">
          <span class="summary-pop-node">
            <img v-if="flagUrl(item.node.country)" :src="flagUrl(item.node.country)!" :alt="regionName(item.node.country)" class="country-flag" />
            <strong>{{ item.node.name }}</strong>
          </span>
          <span class="summary-pop-speeds">
            <span class="summary-dir-up">↑ {{ formatBytes(item.tx, true, 'overview') }}</span>
            <span class="summary-dir-sep">·</span>
            <span class="summary-dir-down">↓ {{ formatBytes(item.rx, true, 'overview') }}</span>
          </span>
          <span class="summary-pop-chevron" aria-hidden="true">›</span>
        </div>
        <div class="summary-pop-progress" aria-hidden="true">
          <span :class="mode === 'down' ? 'is-down' : 'is-up'" :style="{ width: `${item.ratio}%` }" />
        </div>
      </button>
    </div>

    <div class="summary-pop-foot">
      <span>活跃上报 {{ reporting }}/{{ nodes.length }} 台</span>
      <span>窗口峰值 {{ formatBytes(reporting ? peak : null, true, 'overview') }}</span>
    </div>
  </section>
</template>
