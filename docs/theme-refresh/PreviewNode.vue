<script setup lang="ts">
import { computed } from 'vue'
import { CalendarDays, ChevronDown, ChevronUp, Coins, Download, Upload } from '@lucide/vue'
import OsIcon from '../../src/components/OsIcon.vue'
import ResourceMeter from '../../src/components/ResourceMeter.vue'
import PingPanel from '../../src/components/PingPanel.vue'
import { flagUrl } from '../../src/lib/assets'
import { nodeState, regionName } from '../../src/lib/data'
import { calculateNodeFinance, financeAmount, financeIssueText, REFERENCE_RATES } from '../../src/lib/finance'
import { bytes, cardBytes, duration, formatBytes, percentage, priceLabel } from '../../src/lib/format'
import type { MonitorNode, ThemeConfig } from '../../src/types'

const props = defineProps<{ node: MonitorNode; config: ThemeConfig; showPrice: boolean }>()
const mem = computed(() => percentage(props.node.metrics?.mem_used, props.node.mem_total))
const disk = computed(() => percentage(props.node.metrics?.disk_used, props.node.disk_total))
const traffic = computed(() => percentage(props.node.month_used, props.node.traffic_limit))
const finance = computed(() => calculateNodeFinance(props.node, props.node.currency, REFERENCE_RATES))
const amount = computed(() => financeAmount(finance.value.remaining, props.node.currency, true))
const financeTitle = computed(() => `剩余价值 ${financeAmount(finance.value.remaining, props.node.currency)} ${props.node.currency}${finance.value.issues.remaining ? ` · ${financeIssueText(finance.value.issues.remaining)}` : ' · 按剩余天数折算'}`)
const days = computed(() => props.node.expires_in === null ? props.node.billing_cycle === 'once' ? '一次性' : '到期未知'
  : props.node.expires_in < 0 ? '已过期' : props.node.expires_in === 0 ? '今天到期' : props.node.expires_in >= 100 ? `剩${props.node.expires_in}天` : `剩余${props.node.expires_in}天`)
const expiryClass = computed(() => ({ expired: props.node.expires_in !== null && props.node.expires_in <= 0, expiring: props.node.expires_in !== null && props.node.expires_in > 0 && props.node.expires_in <= props.config.expiry_warning_days }))
function rate(value: number | null | undefined): string {
  const part = bytes(value, true)
  if (part.unit !== 'KB/s') return cardBytes(value, true)
  return Number(part.value) >= 1000 ? `${Number((Number(part.value) / 1024).toFixed(1))} MB/s` : `${Math.round(Number(part.value))} KB/s`
}
</script>

<template>
  <article class="node-card design-node-card" :class="{ 'node-offline': !node.online, 'node-waiting': node.online && !node.metrics }" :aria-label="`${node.name}，${nodeState(node)}`">
    <div class="node-card-header">
      <span class="status-dot" :class="!node.online ? 'offline' : !node.metrics ? 'waiting' : ''" :title="nodeState(node)" />
      <h2 :title="node.name">{{ node.name }}</h2><OsIcon :os="node.os" />
      <img v-if="flagUrl(node.country)" :src="flagUrl(node.country)" :alt="regionName(node.country)" class="country-flag" />
    </div>
    <div class="design-node-chips">
      <span :class="{ danger: !node.online }">{{ node.metrics ? `在线 ${Math.floor(node.metrics.uptime / 86400)} 天` : nodeState(node) }}</span>
      <span v-if="showPrice && node.price !== null" :title="`${node.currency} · ${priceLabel(node.price, node.currency, node.billing_cycle)}`">{{ priceLabel(node.price, node.currency, node.billing_cycle) }}</span>
    </div>
    <div class="node-card-body">
      <div class="node-resources">
        <ResourceMeter icon="cpu" label="CPU" :value="node.metrics?.cpu ?? null" :detail="node.metrics ? node.metrics.load.map(n => n.toFixed(2)).join(', ') : '暂无指标'" :warning-at="60" :danger-at="80" />
        <ResourceMeter icon="memory" label="内存" :value="mem" :detail="`${cardBytes(node.metrics?.mem_used)} / ${cardBytes(node.mem_total)}`" :warning-at="60" :danger-at="80" />
        <ResourceMeter icon="disk" label="硬盘" :value="disk" :detail="`${cardBytes(node.metrics?.disk_used)} / ${cardBytes(node.disk_total)}`" :warning-at="60" :danger-at="80" />
        <ResourceMeter icon="traffic" label="本期流量" :value="traffic" :detail="`${cardBytes(node.month_used)} / ${cardBytes(node.traffic_limit)}`" :warning-at="80" :danger-at="100" />
      </div>
      <div class="design-node-tiles" aria-label="速率、当月流量及剩余价值">
        <div class="design-node-tile" role="group" aria-label="实时速率">
          <span class="design-tile-label">实时速率</span>
          <span class="design-tile-value up" :title="`实时上传 ${formatBytes(node.metrics?.net_tx, true)}`"><ChevronUp />{{ rate(node.metrics?.net_tx) }}</span>
          <span class="design-tile-value down" :title="`实时下载 ${formatBytes(node.metrics?.net_rx, true)}`"><ChevronDown />{{ rate(node.metrics?.net_rx) }}</span>
        </div>
        <div class="design-node-tile" role="group" aria-label="当月流量">
          <span class="design-tile-label">当月流量</span>
          <span class="design-tile-value" :title="`当月上传 ${formatBytes(node.month_tx)}`"><Upload />{{ cardBytes(node.month_tx) }}</span>
          <span class="design-tile-value" :title="`当月下载 ${formatBytes(node.month_rx)}`"><Download />{{ cardBytes(node.month_rx) }}</span>
        </div>
        <div class="design-node-tile" role="group" aria-label="到期与剩余价值">
          <span class="design-tile-label">到期与价值</span>
          <span class="design-tile-value" :class="expiryClass" :title="node.expires_at ?? '未设置到期日期'"><CalendarDays />{{ days }}</span>
          <span class="design-tile-value" :title="showPrice ? financeTitle : '费用已隐藏'"><Coins />{{ showPrice ? amount : '已隐藏' }}</span>
        </div>
      </div>
      <div class="design-ping-section"><PingPanel :node="node" :details="true" :config="config" /></div>
      <div v-if="node.public_remark" class="remark-tags design-node-remark"><span :title="node.public_remark">{{ node.public_remark }}</span></div>
      <details class="design-extra">
        <summary>更多信息</summary>
        <div>累计上传 {{ formatBytes(node.total_tx) }} · 下载 {{ formatBytes(node.total_rx) }}</div>
        <div>{{ node.cpu_cores }} 核 · {{ node.arch }} · {{ node.metrics ? duration(node.metrics.uptime) : nodeState(node) }}</div>
        <div v-if="showPrice && finance.issues.remaining">剩余价值：{{ financeIssueText(finance.issues.remaining) }}</div>
      </details>
    </div>
  </article>
</template>
