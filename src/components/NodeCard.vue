<script setup lang="ts">
import { computed } from 'vue'
import { CalendarDays, ChevronDown, ChevronUp, Coins, Ellipsis } from '@lucide/vue'
import type { MonitorNode, ThemeConfig } from '../types'
import { flagUrl } from '../lib/assets'
import { nodeState, regionName } from '../lib/data'
import { cardBytes, cardPrice, duration, expiryLabel, formatBytes, percentage, priceLabel, remarkParts } from '../lib/format'
import OsIcon from './OsIcon.vue'
import ResourceMeter from './ResourceMeter.vue'
import PingPanel from './PingPanel.vue'
const props = defineProps<{ node: MonitorNode; config: ThemeConfig; showPing: boolean; pingDetails: boolean; showPrice: boolean }>()
const mem = computed(() => percentage(props.node.metrics?.mem_used, props.node.mem_total))
const disk = computed(() => percentage(props.node.metrics?.disk_used, props.node.disk_total))
const traffic = computed(() => percentage(props.node.month_used, props.node.traffic_limit))
const cost = computed(() => cardPrice(props.node.price, props.node.currency, props.node.billing_cycle))
const costParts = computed(() => {
  const slash = cost.value.indexOf('/')
  return slash < 0 ? [cost.value, ''] : [cost.value.slice(0, slash), cost.value.slice(slash + 1)]
})
const longCost = computed(() => costParts.value[0].length >= 8 || costParts.value[1].length >= 4)
const costTitle = computed(() => `${priceLabel(props.node.price, props.node.currency, props.node.billing_cycle)} (${props.node.currency})`)
const hasExpiry = computed(() => props.config.show_expiry && props.node.expires_in !== null)
const hasBilling = computed(() => props.showPrice || hasExpiry.value)
const highlightCount = computed(() => Number(props.config.show_speed) + Number(hasBilling.value))
const expiryText = computed(() => props.node.expires_in === null ? '' : props.node.expires_in < 0
  ? `已过期 ${Math.abs(props.node.expires_in)} 天` : props.node.expires_in === 0 ? '今天到期' : `剩余 ${props.node.expires_in} 天`)
const remark = computed(() => remarkParts(props.node.public_remark))
const hasExtra = computed(() => props.config.show_node_metadata && !!(props.node.cpu_cores || props.node.arch))
const expiryClass = computed(() => ({ expiring: props.node.expires_in !== null && props.node.expires_in <= props.config.expiry_warning_days, expired: props.node.expires_in !== null && props.node.expires_in < 0 }))
</script>
<template>
  <article class="node-card" :class="{ 'node-offline': !node.online, 'node-waiting': node.online && !node.metrics }" :aria-label="`${node.name}，${nodeState(node)}`">
    <div class="node-card-header">
      <span class="status-dot" :class="!node.online ? 'offline' : !node.metrics ? 'waiting' : ''" :title="nodeState(node)" />
      <h2 :title="node.name">{{ node.name }}</h2>
      <OsIcon v-if="config.show_node_metadata" :os="node.os" />
      <img v-if="config.show_node_metadata && flagUrl(node.country)" :src="flagUrl(node.country)" :alt="regionName(node.country)" :title="regionName(node.country)" class="country-flag" />
    </div>
    <div class="node-card-body">
      <div v-if="config.show_cpu || config.show_memory || config.show_disk || config.show_traffic" class="node-resources">
        <ResourceMeter v-if="config.show_cpu" icon="cpu" label="CPU" :value="node.metrics?.cpu ?? null" :detail="node.metrics ? node.metrics.load.map(n => n.toFixed(2)).join(', ') : '暂无指标'" :warning-at="60" :danger-at="80" />
        <ResourceMeter v-if="config.show_memory" icon="memory" label="内存" :value="mem" :detail="`${cardBytes(node.metrics?.mem_used)} / ${cardBytes(node.mem_total)}`" :detail-title="`${formatBytes(node.metrics?.mem_used)} / ${formatBytes(node.mem_total)}`" :warning-at="60" :danger-at="80" />
        <ResourceMeter v-if="config.show_disk" icon="disk" label="硬盘" :value="disk" :detail="`${cardBytes(node.metrics?.disk_used)} / ${cardBytes(node.disk_total)}`" :detail-title="`${formatBytes(node.metrics?.disk_used)} / ${formatBytes(node.disk_total)}`" :warning-at="60" :danger-at="80" />
        <ResourceMeter v-if="config.show_traffic" icon="traffic" label="流量" :value="traffic" :detail="`${cardBytes(node.month_used)} / ${node.traffic_limit ? cardBytes(node.traffic_limit) : '∞'}`" :detail-title="`${formatBytes(node.month_used)} / ${node.traffic_limit ? formatBytes(node.traffic_limit) : '∞'}`" :warning-at="80" :danger-at="100" />
      </div>
      <div v-if="highlightCount" class="node-highlights" :style="{ '--highlight-count': highlightCount }">
        <div v-if="config.show_speed" class="highlight-tile highlight-tile-speed" role="group" aria-label="实时速率">
          <span class="highlight-label">实时速率</span>
          <span class="highlight-value up" :class="{ 'highlight-empty': !node.metrics }" :title="formatBytes(node.metrics?.net_tx, true)"><ChevronUp />{{ cardBytes(node.metrics?.net_tx, true) }}</span>
          <span class="highlight-value down" :class="{ 'highlight-empty': !node.metrics }" :title="formatBytes(node.metrics?.net_rx, true)"><ChevronDown />{{ cardBytes(node.metrics?.net_rx, true) }}</span>
        </div>
        <div v-if="hasBilling" class="highlight-tile highlight-tile-billing" role="group" :aria-label="showPrice && hasExpiry ? '费用与到期' : showPrice ? '费用' : '到期'">
          <span class="highlight-label">{{ showPrice && hasExpiry ? '费用与到期' : showPrice ? '费用' : '到期' }}</span>
          <span v-if="hasExpiry" class="highlight-value highlight-expiry" :class="expiryClass" :title="`${node.expires_at || ''} ${expiryLabel(node.expires_in)}`"><CalendarDays />{{ expiryText }}</span>
          <span v-if="showPrice" class="highlight-value highlight-cost" :title="costTitle"><Coins /><span class="highlight-cost-text">{{ costParts[0] }}<span v-if="costParts[1]" class="highlight-cycle" :class="{ 'highlight-cycle-break': longCost }">/{{ costParts[1] }}</span></span></span>
        </div>
      </div>
      <div v-if="config.show_uptime || config.show_total_traffic" class="node-facts">
        <div v-if="config.show_uptime" class="fact-row"><span>在线</span><i /><span :class="{ danger: !node.online, warning: node.online && !node.metrics }">{{ node.metrics ? duration(node.metrics.uptime) : nodeState(node) }}</span></div>
        <div v-if="config.show_total_traffic" class="fact-row"><span>累计</span><i /><div class="rates cumulative-rates"><span :title="`累计上传 ${formatBytes(node.total_tx)}`"><ChevronUp />{{ cardBytes(node.total_tx) }}</span><span :title="`累计下载 ${formatBytes(node.total_rx)}`"><ChevronDown />{{ cardBytes(node.total_rx) }}</span></div></div>
      </div>
      <PingPanel v-if="showPing" :node="node" :details="pingDetails" :config="config" />
      <div v-if="(config.show_remark && node.public_remark) || hasExtra" class="node-card-footer">
        <div v-if="config.show_remark && remark.tags.length" class="remark-tags"><span v-for="tag in remark.tags" :key="tag" :title="tag">{{ tag }}</span></div>
        <p v-if="config.show_remark && remark.text" class="node-remark" :title="remark.text">{{ remark.text }}</p>
        <details v-if="hasExtra" class="node-extra">
          <summary :aria-label="`${node.name} 附加信息`" title="硬件信息"><Ellipsis /></summary>
          <div class="node-extra-content">
            <div v-if="config.show_node_metadata" class="node-tags"><span v-if="node.cpu_cores" :title="node.cpu_name">{{ node.cpu_cores }} 核</span><span v-if="node.arch">{{ node.arch }}</span></div>
          </div>
        </details>
      </div>
    </div>
  </article>
</template>
