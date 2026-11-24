<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch, type Component } from 'vue'
import { Activity, ArrowDown, ArrowUp, ChartNoAxesColumn, Cpu, Download, Globe2, HardDrive, MemoryStick, Server, ServerOff, Upload, Wallet } from '@lucide/vue'
import type { MonitorNode, SummaryKey } from '../types'
import { summarize } from '../lib/data'
import { bytes, formatBytes, percentage } from '../lib/format'
import { financeAmount, financeCoverage, resolveFinanceCurrency, summarizeFinance, type ExchangeRates } from '../lib/finance'
import { formatCompactRenewalAmount, nodeStatusPillTone, summarizeNodeStatus, summarizeUpcomingRenewals } from '../lib/summary-insights'
import PublicFinancePopover from './PublicFinancePopover.vue'
import SummaryStatusPopover from './SummaryStatusPopover.vue'
import SummaryRealtimePopover from './SummaryRealtimePopover.vue'
import SummaryTrafficPopover from './SummaryTrafficPopover.vue'

const props = withDefaults(defineProps<{
  nodes: MonitorNode[]
  cards: SummaryKey[]
  scope: 'group' | 'all'
  group?: string | null
  showPrice: boolean
  currency: string
  rates: ExchangeRates
  rateLabel: string
  ratesLoading: boolean
  expiryWarningDays?: number
}>(), {
  expiryWarningDays: 7,
})

const emit = defineEmits<{ 'update:currency': [currency: string]; publicOpenChange: [open: boolean]; open: [id: number] }>()
const uid = useId().replaceAll(':', '')
const statusPopoverId = `summary-status-${uid}`
const realtimePopoverId = `summary-realtime-${uid}`
const financePopoverId = `public-finance-${uid}`
const trafficPopoverId = `summary-traffic-${uid}`

const statusAnchor = ref<HTMLElement | null>(null)
const realtimeAnchor = ref<HTMLElement | null>(null)
const financeAnchor = ref<HTMLElement | null>(null)
const trafficAnchor = ref<HTMLElement | null>(null)

const statusOpen = ref(false)
const realtimeOpen = ref(false)
const publicOpen = ref(false)
const trafficOpen = ref(false)

function setPublicOpen(open: boolean) { publicOpen.value = open; emit('publicOpenChange', open) }
watch(() => props.cards, cards => {
  if (!cards.includes('online')) statusOpen.value = false
  if (!cards.includes('realtime')) realtimeOpen.value = false
  if (!cards.includes('traffic')) trafficOpen.value = false
})
watch(() => props.showPrice && props.cards.includes('remaining_value'), visible => { if (!visible) setPublicOpen(false) })
onBeforeUnmount(() => setPublicOpen(false))

const finance = computed(() => props.showPrice ? summarizeFinance(props.nodes, props.currency, props.rates) : null)
const remaining = computed(() => finance.value?.remaining ?? null)
const converts = computed(() => props.nodes.some(node => node.price && resolveFinanceCurrency(node.currency) !== resolveFinanceCurrency(props.currency)))
const upcomingRenewals = computed(() => props.showPrice ? summarizeUpcomingRenewals(props.nodes, props.currency, props.rates, 30) : null)
const totals = computed(() => summarize(props.nodes))
const memory = computed(() => bytes(totals.value.reporting ? totals.value.memUsed : null, false, 'overview'))
const disk = computed(() => bytes(totals.value.reporting ? totals.value.diskUsed : null, false, 'overview'))
const monthTotal = computed(() => totals.value.monthTx + totals.value.monthRx)
const monthTraffic = computed(() => bytes(monthTotal.value, false, 'overview'))
const totalTx = computed(() => bytes(totals.value.totalTx, false, 'overview'))
const totalRx = computed(() => bytes(totals.value.totalRx, false, 'overview'))
const tx = computed(() => bytes(totals.value.reporting ? totals.value.tx : null, true, 'overview'))
const rx = computed(() => bytes(totals.value.reporting ? totals.value.rx : null, true, 'overview'))
const realtimeTotal = computed(() => bytes(totals.value.reporting ? totals.value.tx + totals.value.rx : null, true, 'overview'))
const hasDailyTraffic = computed(() => totals.value.dayTx !== null && totals.value.dayRx !== null)
const dayTotal = computed(() => hasDailyTraffic.value ? totals.value.dayTx! + totals.value.dayRx! : null)

// Maintain a bounded ring buffer of live throughput snapshots for the sparkline.
const speedHistory = ref<{ tx: number; rx: number }[]>([])
watch([
  () => props.scope, () => props.group,
  () => totals.value.tx, () => totals.value.rx, () => totals.value.reporting > 0,
], ([scope, group, nextTx, nextRx, reporting], [previousScope, previousGroup]) => {
  if (!reporting) {
    speedHistory.value = []
    return
  }
  const history = scope === previousScope && group === previousGroup ? speedHistory.value.slice(-15) : []
  speedHistory.value = [...history, { tx: nextTx, rx: nextRx }]
}, { immediate: true })

const realtimePeak = computed(() => speedHistory.value.reduce((peak, point) => Math.max(peak, point.tx + point.rx), 0))

const sparkline = computed(() => {
  const w = 180, top = 3, bottom = 25
  const raw = speedHistory.value
  const pts = raw.length >= 2 ? raw : raw.length === 1 ? [raw[0]!, raw[0]!] : [{ tx: 0, rx: 0 }, { tx: 0, rx: 0 }]
  const maxVal = Math.max(1, ...pts.map(p => Math.max(p.tx, p.rx)))
  const toXY = (val: number, index: number) => {
    const x = Number(((index / (pts.length - 1)) * w).toFixed(2))
    const y = Number((bottom - (Math.max(0, val) / maxVal) * (bottom - top)).toFixed(2))
    return `${x} ${y}`
  }
  const rxLine = 'M' + pts.map((p, i) => toXY(p.rx, i)).join(' L')
  const txLine = 'M' + pts.map((p, i) => toXY(p.tx, i)).join(' L')
  const rxArea = `${rxLine} L${w} ${bottom + 2} L0 ${bottom + 2} Z`
  return { rxLine, txLine, rxArea }
})

const statusSummary = computed(() => summarizeNodeStatus(props.nodes, props.expiryWarningDays))

const statusPills = computed(() => {
  const list = props.nodes
  const sample = list.length <= 48
    ? list
    : Array.from({ length: 48 }, (_, i) => list[Math.floor((i * list.length) / 48)]!)
  return sample.map(node => ({
    id: node.id,
    tone: nodeStatusPillTone(node, props.expiryWarningDays),
    title: `${node.name} · ${node.online ? '在线' : '离线'}`,
  }))
})

const statusMeta = computed(() => {
  const total = props.nodes.length
  const { offline, alerts, expiredCount, expiringOnlyCount } = statusSummary.value
  const onlineRate = total ? ((totals.value.online / total) * 100).toFixed(1) + '%' : '—'
  const rateTone = total === 0 ? 'muted' : totals.value.online === total ? 'ok' : totals.value.online > 0 ? 'warn' : 'danger'
  const issues = [
    offline.length ? `${offline.length} 离线` : '',
    alerts.length ? `${alerts.length} 告警` : '',
    expiredCount ? `${expiredCount} 已到期` : '',
    expiringOnlyCount ? `${expiringOnlyCount} 临期` : '',
  ].filter(Boolean)
  const issueText = total === 0 ? '暂无节点' : issues.length ? issues.join(' · ') : '全部在线'
  const issueTone = total === 0 ? 'muted' : (offline.length || expiredCount) ? 'danger' : (alerts.length || expiringOnlyCount) ? 'warn' : 'ok'
  return { onlineRate, rateTone, issueText, issueTone }
})

const trafficRatio = computed(() => {
  const up = totals.value.monthTx
  const down = totals.value.monthRx
  const total = up + down
  if (total <= 0) return Array.from({ length: 8 }, () => 'is-empty')
  const upCount = up <= 0 ? 0 : down <= 0 ? 8 : Math.min(7, Math.max(1, Math.round((up / total) * 8)))
  return Array.from({ length: 8 }, (_, index) => index < upCount ? 'is-up' : 'is-down')
})

const remainingRatio = computed(() => {
  if (!props.showPrice || !remaining.value || !finance.value) return 0
  const totalPurchase = finance.value.total.value
  if (totalPurchase && totalPurchase > 0 && remaining.value.value !== null) {
    return Math.min(100, Math.max(0, (remaining.value.value / totalPurchase) * 100))
  }
  return props.nodes.length ? Math.min(100, (remaining.value.included / props.nodes.length) * 100) : 0
})

interface CardValue {
  label: string
  icon: Component
  value: string | number
  unit: string
  title?: string
  note?: string
  tone?: string
  iconTone?: 'emerald' | 'gold' | 'blue' | 'amber' | 'purple' | 'danger'
  percent?: number | null
  badge?: string
  badgeTone?: 'ok' | 'warn' | 'danger' | 'info' | 'muted'
}

const regionCount = computed(() => new Set(props.nodes.map((node) => node.country).filter(Boolean)).size)

const values = computed<Record<SummaryKey, CardValue>>(() => {
  const reporting = props.nodes.filter((node) => node.metrics !== null)
  const avgCpu = reporting.length ? reporting.reduce((sum, node) => sum + node.metrics!.cpu, 0) / reporting.length : null
  const fin = finance.value
  const rem = remaining.value
  return {
    online: {
      label: '服务器状态',
      icon: Server,
      iconTone: 'emerald',
      value: totals.value.online,
      unit: `/ ${totals.value.total} 台`,
      badge: statusMeta.value.onlineRate,
      badgeTone: statusMeta.value.rateTone as 'ok' | 'warn' | 'danger' | 'muted',
      title: `点击查看节点状态明细\n在线 ${totals.value.online}/${totals.value.total} 台（${statusMeta.value.onlineRate}）\n${statusMeta.value.issueText} · ${regionCount.value} 个地区`,
    },
    realtime: {
      label: '实时吞吐',
      icon: Activity,
      iconTone: 'emerald',
      ...realtimeTotal.value,
      badge: totals.value.reporting ? '实时' : '等待',
      badgeTone: totals.value.reporting ? 'ok' : 'muted',
      title: `点击查看实时吞吐分布\n实时总吞吐 ${formatBytes(totals.value.reporting ? totals.value.tx + totals.value.rx : null, true)}\n实时上行 ${formatBytes(totals.value.reporting ? totals.value.tx : null, true)}\n实时下行 ${formatBytes(totals.value.reporting ? totals.value.rx : null, true)}`,
    },
    remaining_value: {
      label: '剩余价值',
      icon: Wallet,
      iconTone: 'gold',
      value: props.showPrice ? financeAmount(rem!.value, props.currency, true) : '—',
      unit: props.showPrice ? props.currency : '',
      badge: !props.showPrice ? '已隐藏' : props.nodes.length ? `${rem!.included}/${props.nodes.length} 台` : '—',
      badgeTone: !props.showPrice ? 'muted' : rem!.missing ? 'warn' : 'ok',
      title: props.showPrice ? `${props.scope === 'all' ? '全部节点' : '当前分组'} · 按剩余天数折算\n${financeAmount(rem!.value, props.currency)} ${props.currency}\n已计入 ${rem!.included}/${props.nodes.length} 台${rem!.missing ? `\n${financeCoverage(rem!)}` : ''}${converts.value ? `\n${props.rateLabel}` : ''}` : '费用已隐藏',
      note: !props.showPrice ? '费用已隐藏' : rem!.missing ? `${rem!.value === null ? '暂不可计算' : '部分计入'} · ${rem!.missing} 台未计入` : fin?.monthly.value !== null && fin?.monthly.value !== undefined ? `月均 ${financeAmount(fin.monthly.value, props.currency, true)}` : '按剩余天数折算',
    },
    traffic: {
      label: '本月流量',
      icon: ChartNoAxesColumn,
      iconTone: 'purple',
      ...monthTraffic.value,
      badge: dayTotal.value !== null ? `今日 ${formatBytes(dayTotal.value, false, 'overview')}` : '本月',
      badgeTone: dayTotal.value !== null ? 'info' : 'muted',
      title: `点击查看本月与今日流量排行\n本月上传 ${formatBytes(totals.value.monthTx)}\n本月下载 ${formatBytes(totals.value.monthRx)}${dayTotal.value !== null ? `\n今日总计 ${formatBytes(dayTotal.value)}（↑ ${formatBytes(totals.value.dayTx)} · ↓ ${formatBytes(totals.value.dayRx)}）` : ''}`,
    },
    memory: { label: '内存用量', icon: MemoryStick, iconTone: 'emerald', percent: totals.value.reporting ? percentage(totals.value.memUsed, totals.value.memTotal) : null, ...memory.value, unit: `${memory.value.unit} / ${formatBytes(totals.value.memTotal, false, 'overview')}`, title: `已上报的在线节点用量 / 统计范围内全部节点容量\n${formatBytes(totals.value.reporting ? totals.value.memUsed : null)} / ${formatBytes(totals.value.memTotal)}` },
    disk: { label: '硬盘用量', icon: HardDrive, iconTone: 'amber', percent: totals.value.reporting ? percentage(totals.value.diskUsed, totals.value.diskTotal) : null, ...disk.value, unit: `${disk.value.unit} / ${formatBytes(totals.value.diskTotal, false, 'overview')}`, title: `已上报的在线节点用量 / 统计范围内全部节点容量\n${formatBytes(totals.value.reporting ? totals.value.diskUsed : null)} / ${formatBytes(totals.value.diskTotal)}` },
    offline: { label: '离线节点', icon: ServerOff, iconTone: 'danger', value: totals.value.total - totals.value.online, unit: `/ ${totals.value.total} 台`, tone: totals.value.total > totals.value.online ? 'danger' : undefined },
    upload: { label: '实时上行', icon: ArrowUp, iconTone: 'emerald', ...tx.value, note: `本月上行 ${formatBytes(totals.value.monthTx, false, 'overview')}`, title: `实时上行速率\n本月上行 ${formatBytes(totals.value.monthTx)}` },
    download: { label: '实时下行', icon: ArrowDown, iconTone: 'blue', ...rx.value, note: `本月下行 ${formatBytes(totals.value.monthRx, false, 'overview')}`, title: `实时下行速率\n本月下行 ${formatBytes(totals.value.monthRx)}` },
    total_upload: { label: '累计上行', icon: Upload, iconTone: 'emerald', ...totalTx.value, note: totals.value.dayTx !== null ? `今日上行 ${formatBytes(totals.value.dayTx, false, 'overview')}` : `本月上行 ${formatBytes(totals.value.monthTx, false, 'overview')}`, title: `累计上传 ${formatBytes(totals.value.totalTx)}${totals.value.dayTx !== null ? `\n今日上行 ${formatBytes(totals.value.dayTx)}` : ''}\n本月上行 ${formatBytes(totals.value.monthTx)}` },
    total_download: { label: '累计下行', icon: Download, iconTone: 'blue', ...totalRx.value, note: totals.value.dayRx !== null ? `今日下行 ${formatBytes(totals.value.dayRx, false, 'overview')}` : `本月下行 ${formatBytes(totals.value.monthRx, false, 'overview')}`, title: `累计下载 ${formatBytes(totals.value.totalRx)}${totals.value.dayRx !== null ? `\n今日下行 ${formatBytes(totals.value.dayRx)}` : ''}\n本月下行 ${formatBytes(totals.value.monthRx)}` },
    cpu: { label: '平均 CPU', icon: Cpu, iconTone: 'blue', percent: avgCpu, value: avgCpu === null ? '—' : avgCpu.toFixed(1), unit: avgCpu === null ? '' : '%', title: '已有有效指标的在线节点 CPU 使用率的算术平均值' },
    regions: { label: '国家和地区', icon: Globe2, iconTone: 'emerald', value: regionCount.value, unit: '个', title: '按节点国家代码去重，包含离线节点，不计未知地区' },
  }
})

function isInteractive(key: SummaryKey): boolean {
  return key === 'online' || key === 'realtime' || key === 'traffic' || (key === 'remaining_value' && props.showPrice)
}

function popoverTargetId(key: SummaryKey): string | undefined {
  if (key === 'online') return statusPopoverId
  if (key === 'realtime') return realtimePopoverId
  if (key === 'remaining_value' && props.showPrice) return financePopoverId
  if (key === 'traffic') return trafficPopoverId
  return undefined
}

function popoverExpanded(key: SummaryKey): boolean | undefined {
  if (key === 'online') return statusOpen.value
  if (key === 'realtime') return realtimeOpen.value
  if (key === 'remaining_value' && props.showPrice) return publicOpen.value
  if (key === 'traffic') return trafficOpen.value
  return undefined
}

function cardAriaLabel(key: SummaryKey): string | undefined {
  if (key === 'online') return '服务器状态，查看异常与临期节点明细'
  if (key === 'realtime') return '实时吞吐，查看节点实时速率分布'
  if (key === 'remaining_value' && props.showPrice) return '剩余价值，查看公开费用汇总'
  if (key === 'traffic') return '本月流量，查看今日与本月节点流量排行'
  return undefined
}

function onCardClick(key: SummaryKey, event: MouseEvent) {
  const el = event.currentTarget as HTMLElement
  if (key === 'online') statusAnchor.value = el
  else if (key === 'realtime') realtimeAnchor.value = el
  else if (key === 'remaining_value' && props.showPrice) financeAnchor.value = el
  else if (key === 'traffic') trafficAnchor.value = el
}

const renewalChipText = computed(() => {
  const remSummary = upcomingRenewals.value
  if (!remSummary) return ''
  if (remSummary.count > 0) {
    if (remSummary.missingRateCount > 0) return `30天到期 ${remSummary.count} 台`
    const amount = formatCompactRenewalAmount(remSummary.total, props.currency)
    return amount ? `30天续费 ${amount}` : `30天到期 ${remSummary.count} 台`
  }
  if (remSummary.expiredCount > 0) return `已到期 ${remSummary.expiredCount} 台`
  return ''
})

const gridColumns = computed(() => props.cards.length === 4 ? 2 : Math.min(3, Math.max(1, props.cards.length)))
const wideColumns = computed(() => Math.min(props.cards.length <= 4 ? 4 : 6, Math.max(1, props.cards.length)))
</script>
<template>
  <div
    class="summary-grid"
    :class="{ 'summary-grid-quad': cards.length === 4 }"
    :style="{ '--summary-columns': gridColumns, '--summary-wide-columns': wideColumns }"
    :aria-label="scope === 'all' ? '全部节点汇总' : '当前分组汇总'"
  >
    <component
      :is="isInteractive(key) ? 'button' : 'div'"
      v-for="key in cards"
      :key="key"
      class="summary-card"
      :class="{
        'summary-finance': key === 'remaining_value',
        'summary-clickable': isInteractive(key),
        'is-popover-open': popoverExpanded(key) === true,
        [`summary-card-${key}`]: true,
      }"
      :type="isInteractive(key) ? 'button' : undefined"
      :title="values[key].title"
      :aria-label="cardAriaLabel(key)"
      :aria-haspopup="isInteractive(key) ? 'dialog' : undefined"
      :aria-expanded="popoverExpanded(key)"
      :popovertarget="popoverTargetId(key)"
      @click="onCardClick(key, $event)"
    >
      <div class="summary-label">
        <span>{{ values[key].label }}</span>
        <span v-if="values[key].badge" class="summary-badge" :class="`is-${values[key].badgeTone ?? 'muted'}`">
          <i v-if="key === 'realtime' && totals.reporting" class="summary-live-dot" aria-hidden="true" />{{ values[key].badge }}
        </span>
        <span v-else class="summary-icon" :class="values[key].iconTone ? `summary-icon-${values[key].iconTone}` : ''"><component :is="values[key].icon" /></span>
      </div>

      <div class="summary-value">
        <strong :class="values[key].tone">{{ values[key].value }}</strong>
        <span>{{ values[key].unit }}</span>
      </div>

      <template v-if="key === 'online'">
        <div class="summary-status-strip" aria-hidden="true">
          <span v-for="pill in statusPills" :key="pill.id" class="summary-status-pill" :class="pill.tone" :title="pill.title" />
          <span v-if="!statusPills.length" class="summary-status-pill is-empty" />
        </div>
        <div class="summary-footer">
          <span class="summary-issue" :class="[`is-${statusMeta.issueTone}`, { 'summary-issue-pill': statusSummary.issueCount > 0 }]">
            <span class="summary-issue-text">{{ statusMeta.issueText }}</span>
            <i v-if="statusSummary.issueCount > 0" class="summary-chevron" aria-hidden="true">›</i>
          </span>
          <span class="summary-footer-meta">{{ regionCount }} 地区</span>
        </div>
      </template>

      <template v-else-if="key === 'realtime'">
        <svg class="summary-sparkline" viewBox="0 0 180 28" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient :id="`spark-${uid}`" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--blue)" stop-opacity="0.18" />
              <stop offset="100%" stop-color="var(--blue)" stop-opacity="0" />
            </linearGradient>
          </defs>
          <path v-if="speedHistory.length" :d="sparkline.rxArea" :fill="`url(#spark-${uid})`" />
          <path v-if="speedHistory.length" :d="sparkline.txLine" fill="none" stroke="var(--emerald)" stroke-width="1.35" stroke-dasharray="2.5 2.5" stroke-linecap="round" vector-effect="non-scaling-stroke" />
          <path v-if="speedHistory.length" :d="sparkline.rxLine" fill="none" stroke="var(--blue)" stroke-width="1.5" stroke-linecap="round" vector-effect="non-scaling-stroke" />
        </svg>
        <div class="summary-footer">
          <span class="summary-dir-up">↑ {{ formatBytes(totals.reporting ? totals.tx : null, true, 'overview') }}</span>
          <span class="summary-dir-down">↓ {{ formatBytes(totals.reporting ? totals.rx : null, true, 'overview') }}</span>
        </div>
      </template>

      <template v-else-if="key === 'remaining_value'">
        <div class="summary-ratio-bar" aria-hidden="true">
          <span :style="{ width: `${remainingRatio}%` }" />
        </div>
        <div class="summary-footer summary-footer-finance">
          <div class="summary-finance-stack">
            <span class="summary-finance-monthly">{{ values[key].note }}</span>
            <span v-if="showPrice" class="summary-finance-rate">{{ ratesLoading ? '正在更新汇率…' : (rateLabel || '按剩余天数折算') }}</span>
          </div>
          <span
            v-if="showPrice && renewalChipText"
            class="summary-renew-pill"
            :class="{ 'is-danger': !upcomingRenewals?.count && !!upcomingRenewals?.expiredCount }"
          >{{ renewalChipText }}</span>
          <span v-else-if="showPrice" class="summary-footer-meta">30天无续费</span>
        </div>
      </template>

      <template v-else-if="key === 'traffic'">
        <div class="summary-traffic-bar" aria-hidden="true">
          <span v-for="(tone, idx) in trafficRatio" :key="idx" class="summary-traffic-seg" :class="tone" />
        </div>
        <div class="summary-footer">
          <span class="summary-dir-up">↑ {{ formatBytes(totals.monthTx, false, 'overview') }}</span>
          <span class="summary-dir-down">↓ {{ formatBytes(totals.monthRx, false, 'overview') }}</span>
        </div>
      </template>

      <template v-else>
        <div v-if="values[key].note" class="summary-note">{{ values[key].note }}</div>
        <div v-if="values[key].percent != null" class="summary-progress"><span :class="values[key].iconTone ? `summary-progress-${values[key].iconTone}` : ''" :style="{ width: `${Math.min(100, Math.max(0, values[key].percent!))}%` }" /></div>
      </template>
    </component>

    <SummaryStatusPopover
      v-if="cards.includes('online')"
      :id="statusPopoverId"
      :anchor="statusAnchor"
      :nodes="nodes"
      :scope="scope"
      :expiry-warning-days="expiryWarningDays"
      @open="emit('open', $event)"
      @open-change="statusOpen = $event"
    />
    <SummaryRealtimePopover
      v-if="cards.includes('realtime')"
      :id="realtimePopoverId"
      :anchor="realtimeAnchor"
      :nodes="nodes"
      :scope="scope"
      :tx="totals.tx"
      :rx="totals.rx"
      :reporting="totals.reporting"
      :peak="realtimePeak"
      @open="emit('open', $event)"
      @open-change="realtimeOpen = $event"
    />
    <PublicFinancePopover
      v-if="showPrice && cards.includes('remaining_value')"
      :id="financePopoverId"
      :anchor="financeAnchor"
      :nodes="nodes"
      :scope="scope"
      :currency="currency"
      :rates="rates"
      :rate-label="rateLabel"
      :rates-loading="ratesLoading"
      @update:currency="emit('update:currency', $event)"
      @open-change="setPublicOpen"
      @open="emit('open', $event)"
    />
    <SummaryTrafficPopover
      v-if="cards.includes('traffic')"
      :id="trafficPopoverId"
      :anchor="trafficAnchor"
      :nodes="nodes"
      :scope="scope"
      :month-tx="totals.monthTx"
      :month-rx="totals.monthRx"
      :day-tx="totals.dayTx"
      :day-rx="totals.dayRx"
      @open="emit('open', $event)"
      @open-change="trafficOpen = $event"
    />
  </div>
</template>
