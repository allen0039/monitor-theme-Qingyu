<script setup lang="ts">
import { ArrowDown, ArrowUp } from '@lucide/vue'
import type { MonitorNode, ThemeConfig } from '../types'
import { nodeState, regionName } from '../lib/data'
import { flagUrl } from '../lib/assets'
import { duration, expiryLabel, formatBytes, percentage, priceLabel } from '../lib/format'
import OsIcon from './OsIcon.vue'
import ResourceMeter from './ResourceMeter.vue'
defineProps<{ nodes: MonitorNode[]; config: ThemeConfig; showPrice: boolean }>()
const emit = defineEmits<{ open: [number] }>()
</script>
<template>
  <div class="node-table-scroll" tabindex="0" aria-label="节点列表，可横向滚动">
    <table class="node-table">
      <thead><tr><th>节点</th><th>状态</th><th v-if="config.show_cpu">CPU</th><th v-if="config.show_memory">内存</th><th v-if="config.show_disk">硬盘</th><th v-if="config.show_traffic">本期流量</th><th v-if="config.show_speed">实时速率</th><th v-if="config.show_uptime">在线时长</th><th v-if="showPrice">费用</th><th v-if="config.show_expiry">到期</th></tr></thead>
      <tbody>
        <tr v-for="node in nodes" :key="node.id" :class="{ 'row-offline': !node.online }">
          <td class="table-node"><div><span class="status-dot" :class="!node.online ? 'offline' : !node.metrics ? 'waiting' : ''" /><strong :title="node.name"><a :href="`#/node/${node.id}`" :data-node-entry="node.id" @click.prevent="emit('open', node.id)">{{ node.name }}</a></strong></div><div v-if="config.show_node_metadata" class="table-node-sub"><OsIcon :os="node.os" /><img v-if="flagUrl(node.country)" :src="flagUrl(node.country)" class="country-flag" :alt="regionName(node.country)" /><span>{{ node.group || '未分组' }}</span></div></td>
          <td><span class="state-label" :class="{ danger: !node.online, warning: node.online && !node.metrics }">{{ nodeState(node) }}</span></td>
          <td v-if="config.show_cpu"><ResourceMeter label="CPU" :value="node.metrics?.cpu ?? null" /></td>
          <td v-if="config.show_memory"><ResourceMeter label="内存" :value="percentage(node.metrics?.mem_used, node.mem_total)" :detail="`${formatBytes(node.metrics?.mem_used)} / ${formatBytes(node.mem_total)}`" /></td>
          <td v-if="config.show_disk"><ResourceMeter label="硬盘" :value="percentage(node.metrics?.disk_used, node.disk_total)" :detail="`${formatBytes(node.metrics?.disk_used)} / ${formatBytes(node.disk_total)}`" /></td>
          <td v-if="config.show_traffic"><ResourceMeter label="流量" :value="percentage(node.month_used, node.traffic_limit)" :detail="`${formatBytes(node.month_used)} / ${node.traffic_limit ? formatBytes(node.traffic_limit) : '∞'}`" /></td>
          <td v-if="config.show_speed" class="table-speed"><div class="up"><ArrowUp />{{ formatBytes(node.metrics?.net_tx, true) }}</div><div class="down"><ArrowDown />{{ formatBytes(node.metrics?.net_rx, true) }}</div></td>
          <td v-if="config.show_uptime">{{ duration(node.metrics?.uptime) }}</td><td v-if="showPrice">{{ priceLabel(node.price, node.currency, node.billing_cycle) }}</td>
          <td v-if="config.show_expiry" :class="{ warning: node.expires_in !== null && node.expires_in >= 0 && node.expires_in <= config.expiry_warning_days, danger: node.expires_in !== null && node.expires_in < 0 }" :title="node.expires_at || ''">{{ expiryLabel(node.expires_in) || '—' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
