<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MonitorNode } from '../types'
import { flagUrl } from '../lib/assets'
import { regionName } from '../lib/data'
import { formatBytes } from '../lib/format'
import { useSummaryPopoverPosition } from '../lib/popover'
import { summarizeNodeStatus } from '../lib/summary-insights'

const props = defineProps<{
  id: string
  anchor: HTMLElement | null
  nodes: MonitorNode[]
  scope: 'group' | 'all'
  expiryWarningDays: number
}>()

const emit = defineEmits<{ open: [id: number]; openChange: [open: boolean] }>()
const panel = ref<HTMLElement | null>(null)
const filter = ref<'all' | 'alerts' | 'expiring' | 'offline'>('all')

const summary = computed(() => summarizeNodeStatus(props.nodes, props.expiryWarningDays))
const onlineCount = computed(() => props.nodes.filter((node) => node.online).length)
const regionCount = computed(() => new Set(props.nodes.map((node) => node.country).filter(Boolean)).size)

const showOffline = computed(() => (filter.value === 'all' || filter.value === 'offline') && summary.value.offline.length > 0)
const showAlerts = computed(() => (filter.value === 'all' || filter.value === 'alerts') && summary.value.alerts.length > 0)
const showExpiring = computed(() => (filter.value === 'all' || filter.value === 'expiring') && summary.value.expiring.length > 0)
const isEmptyView = computed(() => !showOffline.value && !showAlerts.value && !showExpiring.value)

const position = useSummaryPopoverPosition(panel, () => props.anchor)
function selectNode(id: number) {
  panel.value?.hidePopover?.()
  emit('open', id)
}
function onToggle(event: Event) {
  const open = (event as ToggleEvent).newState === 'open'
  if (open) {
    filter.value = 'all'
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
    class="summary-popover summary-status-popover"
    role="dialog"
    :aria-label="scope === 'all' ? '全部节点状态明细' : '当前分组节点状态明细'"
    @toggle="onToggle"
  >
    <div class="summary-pop-head">
      <strong class="summary-pop-title">节点状态明细</strong>
      <div class="summary-pop-tabs" role="tablist" aria-label="状态筛选">
        <button type="button" role="tab" :aria-selected="filter === 'all'" class="summary-pop-tab" :class="{ active: filter === 'all' }" @click="filter = 'all'">全部 {{ summary.issueCount }}</button>
        <button type="button" role="tab" :aria-selected="filter === 'alerts'" class="summary-pop-tab" :class="{ active: filter === 'alerts' }" @click="filter = 'alerts'">告警 {{ summary.alerts.length }}</button>
        <button type="button" role="tab" :aria-selected="filter === 'expiring'" class="summary-pop-tab" :class="{ active: filter === 'expiring' }" @click="filter = 'expiring'">临期 {{ summary.expiring.length }}</button>
        <button type="button" role="tab" :aria-selected="filter === 'offline'" class="summary-pop-tab" :class="{ active: filter === 'offline' }" @click="filter = 'offline'">离线 {{ summary.offline.length }}</button>
      </div>
    </div>

    <div class="summary-pop-body">
      <div v-if="isEmptyView" class="summary-pop-empty" :class="{ 'is-healthy': summary.issueCount === 0 && nodes.length > 0 }">
        <strong>{{ nodes.length === 0 ? '当前范围暂无节点' : summary.issueCount === 0 ? `全部 ${nodes.length} 台节点运行正常` : '当前分类暂无异常节点' }}</strong>
        <span>{{ nodes.length > 0 ? `覆盖 ${regionCount} 个地区 · 总 ${summary.totalCores} 核 / ${formatBytes(summary.totalMem, false, 'overview')}` : '接入节点后会在这里汇总状态' }}</span>
      </div>

      <template v-else>
        <div v-if="showOffline" class="summary-pop-section">
          <div class="summary-pop-section-head">
            <span class="summary-pop-dot is-danger" aria-hidden="true" />
            <span>离线节点 · {{ summary.offline.length }}</span>
          </div>
          <button
            v-for="item in summary.offline"
            :key="`off-${item.node.id}`"
            type="button"
            class="summary-popover-row"
            @click="selectNode(item.node.id)"
          >
            <img v-if="flagUrl(item.node.country)" :src="flagUrl(item.node.country)!" :alt="regionName(item.node.country)" class="country-flag" />
            <div class="summary-pop-row-main">
              <strong>{{ item.node.name }}</strong>
              <span>{{ regionName(item.node.country) }}{{ item.node.group ? ` · ${item.node.group}` : '' }}</span>
            </div>
            <span class="summary-pop-tag is-danger">{{ item.label }}</span>
            <span class="summary-pop-chevron" aria-hidden="true">›</span>
          </button>
        </div>

        <div v-if="showAlerts" class="summary-pop-section">
          <div class="summary-pop-section-head">
            <span class="summary-pop-dot is-warn" aria-hidden="true" />
            <span>资源告警 · {{ summary.alerts.length }}</span>
          </div>
          <button
            v-for="item in summary.alerts"
            :key="`alert-${item.node.id}`"
            type="button"
            class="summary-popover-row"
            @click="selectNode(item.node.id)"
          >
            <img v-if="flagUrl(item.node.country)" :src="flagUrl(item.node.country)!" :alt="regionName(item.node.country)" class="country-flag" />
            <div class="summary-pop-row-main">
              <strong>{{ item.node.name }}</strong>
              <span>{{ regionName(item.node.country) }}{{ item.node.group ? ` · ${item.node.group}` : '' }}</span>
            </div>
            <span class="summary-pop-tag is-warn">{{ item.reasons.join(' · ') }}</span>
            <span class="summary-pop-chevron" aria-hidden="true">›</span>
          </button>
        </div>

        <div v-if="showExpiring" class="summary-pop-section">
          <div class="summary-pop-section-head">
            <span class="summary-pop-dot is-expiring" aria-hidden="true" />
            <span>到期 / 临期 · {{ summary.expiring.length }}</span>
          </div>
          <button
            v-for="item in summary.expiring"
            :key="`exp-${item.node.id}`"
            type="button"
            class="summary-popover-row"
            @click="selectNode(item.node.id)"
          >
            <img v-if="flagUrl(item.node.country)" :src="flagUrl(item.node.country)!" :alt="regionName(item.node.country)" class="country-flag" />
            <div class="summary-pop-row-main">
              <strong>{{ item.node.name }}</strong>
              <span>{{ regionName(item.node.country) }}{{ item.node.expires_at ? ` · ${item.node.expires_at}` : '' }}</span>
            </div>
            <span class="summary-pop-tag" :class="item.expired ? 'is-danger' : 'is-warn'">{{ item.label }}</span>
            <span class="summary-pop-chevron" aria-hidden="true">›</span>
          </button>
        </div>
      </template>
    </div>

    <div class="summary-pop-foot">
      <span>在线 {{ onlineCount }}/{{ nodes.length }} · {{ regionCount }} 地区 · {{ summary.totalCores }} 核 / {{ formatBytes(summary.totalMem, false, 'overview') }}</span>
      <span class="summary-pop-hint">点击节点跳转详情</span>
    </div>
  </section>
</template>
