<script setup lang="ts">
import { computed } from 'vue'
import { ArrowDown, ArrowUp } from '@lucide/vue'
import type { MonitorNode, ThemeConfig } from '../types'
import { flagUrl } from '../lib/assets'
import { nodeState, regionName } from '../lib/data'
import { duration, expiryLabel, formatBytes, percentage, priceLabel } from '../lib/format'
import OsIcon from './OsIcon.vue'
import ResourceMeter from './ResourceMeter.vue'
import PingPanel from './PingPanel.vue'
const props = defineProps<{ node: MonitorNode; config: ThemeConfig; showPing: boolean; pingDetails: boolean; showPrice: boolean }>()
const mem = computed(() => percentage(props.node.metrics?.mem_used, props.node.mem_total))
const disk = computed(() => percentage(props.node.metrics?.disk_used, props.node.disk_total))
const traffic = computed(() => percentage(props.node.month_used, props.node.traffic_limit))
const cost = computed(() => priceLabel(props.node.price, props.node.currency, props.node.billing_cycle))
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
        <ResourceMeter v-if="config.show_cpu" label="CPU" :value="node.metrics?.cpu ?? null" :detail="node.metrics ? node.metrics.load.map(n => n.toFixed(2)).join(', ') : '暂无指标'" />
        <ResourceMeter v-if="config.show_memory" label="内存" :value="mem" :detail="`${formatBytes(node.metrics?.mem_used)} / ${formatBytes(node.mem_total)}`" />
        <ResourceMeter v-if="config.show_disk" label="硬盘" :value="disk" :detail="`${formatBytes(node.metrics?.disk_used)} / ${formatBytes(node.disk_total)}`" />
        <ResourceMeter v-if="config.show_traffic" label="流量" :value="traffic" :detail="`${formatBytes(node.month_used)} / ${node.traffic_limit ? formatBytes(node.traffic_limit) : '∞'}`" color="var(--emerald)" />
      </div>
      <div v-if="config.show_speed || config.show_uptime || showPrice || config.show_total_traffic" class="node-facts">
        <div v-if="config.show_speed" class="fact-row"><span>速率</span><i /><div class="rates"><span class="up"><ArrowUp />{{ formatBytes(node.metrics?.net_tx, true) }}</span><span class="down"><ArrowDown />{{ formatBytes(node.metrics?.net_rx, true) }}</span></div></div>
        <div v-if="config.show_uptime" class="fact-row"><span>在线</span><i /><span :class="{ danger: !node.online, warning: node.online && !node.metrics }">{{ node.metrics ? duration(node.metrics.uptime) : nodeState(node) }}</span></div>
        <div v-if="showPrice" class="fact-row"><span>费用</span><i /><span :title="cost">{{ cost }}</span></div>
        <div v-if="config.show_total_traffic" class="fact-row" :title="`上传 ${formatBytes(node.total_tx)} / 下载 ${formatBytes(node.total_rx)}`"><span>累计</span><i /><span>{{ formatBytes(node.total_rx + node.total_tx) }}</span></div>
      </div>
      <PingPanel v-if="showPing" :node="node" :details="pingDetails" :config="config" />
      <div v-if="(config.show_node_metadata && (node.cpu_cores || node.arch)) || (config.show_expiry && node.expires_in !== null)" class="node-tags">
        <span v-if="config.show_node_metadata && node.cpu_cores" :title="node.cpu_name">{{ node.cpu_cores }} 核</span><span v-if="config.show_node_metadata && node.arch">{{ node.arch }}</span>
        <span v-if="config.show_expiry && node.expires_in !== null" class="expiry-tag" :class="{ 'expiring': node.expires_in <= config.expiry_warning_days, 'expired': node.expires_in < 0 }" :title="node.expires_at || ''">{{ expiryLabel(node.expires_in) }}</span>
      </div>
      <p v-if="config.show_remark && node.public_remark" class="node-remark" :title="node.public_remark">{{ node.public_remark }}</p>
    </div>
  </article>
</template>
