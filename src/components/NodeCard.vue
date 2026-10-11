<script setup lang="ts">
import { computed } from 'vue'
import { CalendarDays, ChevronDown, ChevronUp, Coins, Download, Ellipsis, Upload } from '@lucide/vue'
import type { MonitorNode, ThemeConfig } from '../types'
import { flagUrl } from '../lib/assets'
import { nodeState, regionName } from '../lib/data'
import { calculateNodeFinance, financeAmount, financeIssueText } from '../lib/finance'
import { bytes, cardBytes, duration, expiryLabel, formatBytes, percentage, priceLabel, remarkParts } from '../lib/format'
import OsIcon from './OsIcon.vue'
import ResourceMeter from './ResourceMeter.vue'
import PingPanel from './PingPanel.vue'
const props = defineProps<{ node: MonitorNode; config: ThemeConfig; showPing: boolean; pingDetails: boolean; showPrice: boolean }>()
const mem = computed(() => percentage(props.node.metrics?.mem_used, props.node.mem_total))
const disk = computed(() => percentage(props.node.metrics?.disk_used, props.node.disk_total))
const traffic = computed(() => percentage(props.node.month_used, props.node.traffic_limit))
const cost = computed(() => priceLabel(props.node.price, props.node.currency, props.node.billing_cycle))
// Original-currency node values do not need an exchange-rate request.
const finance = computed(() => calculateNodeFinance(props.node, props.node.currency, {}))
const remaining = computed(() => financeAmount(finance.value.remaining, props.node.currency, true))
const remainingIssue = computed(() => financeIssueText(finance.value.issues.remaining))
const remainingTitle = computed(() => `剩余价值 ${financeAmount(finance.value.remaining, props.node.currency)} ${props.node.currency} · ${remainingIssue.value || '按剩余天数折算'}`)
const monthLabel = computed(() => props.node.traffic_reset_day && props.node.traffic_reset_day !== 1 ? '当期流量' : '当月流量')
const hasExpiry = computed(() => props.config.show_expiry && props.node.expires_in !== null)
const hasBilling = computed(() => props.showPrice || hasExpiry.value)
const highlightCount = computed(() => Number(props.config.show_speed) + Number(props.config.show_total_traffic) + Number(hasBilling.value))
const expiryTileText = computed(() => {
  const days = props.node.expires_in
  if (days === null) return ''
  if (days < 0) return '已过期'
  if (days === 0) return '今天到期'
  return highlightCount.value === 3 && days >= 100 ? `剩${days}天` : `剩余${days}天`
})
function tileRate(value: number | null | undefined): string {
  const part = bytes(value, true)
  if (highlightCount.value !== 3 || part.unit !== 'KB/s') return cardBytes(value, true)
  return Number(part.value) >= 1000 ? `${Number((Number(part.value) / 1024).toFixed(1))} MB/s` : `${Math.round(Number(part.value))} KB/s`
}
const remark = computed(() => remarkParts(props.node.public_remark))
const hasHardware = computed(() => props.config.show_node_metadata && !!(props.node.cpu_cores || props.node.arch))
const hasExtra = computed(() => hasHardware.value || props.config.show_total_traffic || (props.showPrice && !!remainingIssue.value))
const expiryClass = computed(() => ({ expiring: props.node.expires_in !== null && props.node.expires_in > 0 && props.node.expires_in <= props.config.expiry_warning_days, expired: props.node.expires_in !== null && props.node.expires_in <= 0 }))
</script>
<template>
  <article class="node-card" :class="{ 'node-offline': !node.online, 'node-waiting': node.online && !node.metrics }" :aria-label="`${node.name}，${nodeState(node)}`">
    <div class="node-card-header">
      <span class="status-dot" :class="!node.online ? 'offline' : !node.metrics ? 'waiting' : ''" :title="nodeState(node)" />
      <h2 :title="node.name">{{ node.name }}</h2>
      <OsIcon v-if="config.show_node_metadata" :os="node.os" />
      <img v-if="config.show_node_metadata && flagUrl(node.country)" :src="flagUrl(node.country)" :alt="regionName(node.country)" :title="regionName(node.country)" class="country-flag" />
    </div>
    <div v-if="config.show_uptime || (showPrice && node.price !== null)" class="node-card-chips">
      <span v-if="config.show_uptime" :class="{ danger: !node.online, warning: node.online && !node.metrics }" :title="node.metrics ? duration(node.metrics.uptime) : nodeState(node)">{{ node.metrics ? `在线 ${Math.floor(node.metrics.uptime / 86400)} 天` : nodeState(node) }}</span>
      <span v-if="showPrice && node.price !== null" :title="`${cost} (${node.currency})`">{{ cost }}</span>
    </div>
    <div class="node-card-body">
      <div v-if="config.show_cpu || config.show_memory || config.show_disk || config.show_traffic" class="node-resources">
        <ResourceMeter v-if="config.show_cpu" icon="cpu" label="CPU" :value="node.metrics?.cpu ?? null" :detail="node.metrics ? node.metrics.load.map(n => n.toFixed(2)).join(', ') : '暂无指标'" :warning-at="60" :danger-at="80" />
        <ResourceMeter v-if="config.show_memory" icon="memory" label="内存" :value="mem" :detail="`${cardBytes(node.metrics?.mem_used)} / ${cardBytes(node.mem_total)}`" :detail-title="`${formatBytes(node.metrics?.mem_used)} / ${formatBytes(node.mem_total)}`" :warning-at="60" :danger-at="80" />
        <ResourceMeter v-if="config.show_disk" icon="disk" label="硬盘" :value="disk" :detail="`${cardBytes(node.metrics?.disk_used)} / ${cardBytes(node.disk_total)}`" :detail-title="`${formatBytes(node.metrics?.disk_used)} / ${formatBytes(node.disk_total)}`" :warning-at="60" :danger-at="80" />
        <ResourceMeter v-if="config.show_traffic" icon="traffic" label="本期流量" :value="traffic" :detail="`${cardBytes(node.month_used)} / ${node.traffic_limit ? cardBytes(node.traffic_limit) : '∞'}`" :detail-title="`${formatBytes(node.month_used)} / ${node.traffic_limit ? formatBytes(node.traffic_limit) : '∞'}`" :warning-at="80" :danger-at="100" />
      </div>
      <div v-if="highlightCount" class="node-highlights" :class="{ 'node-highlights-three': highlightCount === 3 }" :style="{ '--highlight-count': highlightCount }">
        <div v-if="config.show_speed" class="highlight-tile highlight-speed" role="group" aria-label="实时速率">
          <span class="highlight-label">实时速率</span>
          <span class="highlight-value up" :class="{ 'highlight-empty': !node.metrics }" :title="`实时上传 ${formatBytes(node.metrics?.net_tx, true)}`"><ChevronUp />{{ tileRate(node.metrics?.net_tx) }}</span>
          <span class="highlight-value down" :class="{ 'highlight-empty': !node.metrics }" :title="`实时下载 ${formatBytes(node.metrics?.net_rx, true)}`"><ChevronDown />{{ tileRate(node.metrics?.net_rx) }}</span>
        </div>
        <div v-if="config.show_total_traffic" class="highlight-tile highlight-month" role="group" :aria-label="monthLabel">
          <span class="highlight-label">{{ monthLabel }}</span>
          <span class="highlight-value" :title="`${monthLabel} · 上传 ${formatBytes(node.month_tx)}`"><Upload />{{ cardBytes(node.month_tx) }}</span>
          <span class="highlight-value" :title="`${monthLabel} · 下载 ${formatBytes(node.month_rx)}`"><Download />{{ cardBytes(node.month_rx) }}</span>
        </div>
        <div v-if="hasBilling" class="highlight-tile highlight-billing" role="group" :aria-label="showPrice && hasExpiry ? '到期与剩余价值' : showPrice ? '剩余价值' : '到期'">
          <span class="highlight-label">{{ showPrice && hasExpiry ? '到期与价值' : showPrice ? '剩余价值' : '到期' }}</span>
          <span v-if="hasExpiry" class="highlight-value highlight-expiry" :class="expiryClass" :title="`${node.expires_at || ''} ${expiryLabel(node.expires_in)}`"><CalendarDays />{{ expiryTileText }}</span>
          <span v-if="showPrice" class="highlight-value highlight-cost" :title="remainingTitle"><Coins /><span class="highlight-cost-text">{{ remaining }}</span></span>
        </div>
      </div>
      <div v-if="showPing" class="node-ping-section"><PingPanel :node="node" :details="pingDetails" :config="config" /></div>
      <div v-if="(config.show_remark && node.public_remark) || hasExtra" class="node-card-footer">
        <div v-if="config.show_remark && remark.tags.length" class="remark-tags"><span v-for="tag in remark.tags" :key="tag" :title="tag">{{ tag }}</span></div>
        <p v-if="config.show_remark && remark.text" class="node-remark" :title="remark.text">{{ remark.text }}</p>
        <details v-if="hasExtra" class="node-extra">
          <summary :aria-label="`${node.name} 附加信息`" title="累计流量与附加信息"><Ellipsis /></summary>
          <div class="node-extra-content">
            <div v-if="config.show_total_traffic" class="node-extra-traffic"><span>累计上传 {{ formatBytes(node.total_tx) }}</span><span>累计下载 {{ formatBytes(node.total_rx) }}</span></div>
            <div v-if="hasHardware" class="node-tags"><span v-if="node.cpu_cores" :title="node.cpu_name">{{ node.cpu_cores }} 核</span><span v-if="node.arch">{{ node.arch }}</span></div>
            <div v-if="showPrice && remainingIssue" class="node-extra-issue">剩余价值：{{ remainingIssue }}</div>
          </div>
        </details>
      </div>
    </div>
  </article>
</template>
