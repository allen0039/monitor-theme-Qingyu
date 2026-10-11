<script setup lang="ts">
import { computed } from 'vue'
import { ArrowDown, ArrowUp, HardDrive, MemoryStick, Network, Server } from '@lucide/vue'
import type { MonitorNode } from '../types'
import { summarize } from '../lib/data'
import { bytes, formatBytes } from '../lib/format'
const props = defineProps<{ nodes: MonitorNode[] }>()
const totals = computed(() => summarize(props.nodes))
const memory = computed(() => bytes(totals.value.reporting ? totals.value.memUsed : null))
const disk = computed(() => bytes(totals.value.reporting ? totals.value.diskUsed : null))
const traffic = computed(() => bytes(totals.value.totalRx + totals.value.totalTx))
const tx = computed(() => bytes(totals.value.reporting ? totals.value.tx : null, true))
const rx = computed(() => bytes(totals.value.reporting ? totals.value.rx : null, true))
</script>
<template>
  <div class="summary-grid" aria-label="当前分组汇总">
    <div class="summary-card" title="已上报的在线节点用量 / 当前分组全部节点容量">
      <div class="summary-label">内存用量<MemoryStick /></div>
      <div class="summary-value"><strong>{{ memory.value }}</strong><span>{{ memory.unit }} / {{ formatBytes(totals.memTotal) }}</span></div>
    </div>
    <div class="summary-card">
      <div class="summary-label">节点在线<Server /></div>
      <div class="summary-value"><strong class="up">{{ totals.online }}</strong><span>/ {{ totals.total }} 台</span></div>
      <div class="summary-note"><span class="status-dot" />{{ totals.total - totals.online ? `${totals.total - totals.online} 台离线` : '全部在线' }}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">上传速率<ArrowUp /></div>
      <div class="summary-value"><strong>{{ tx.value }}</strong><span>{{ tx.unit }}</span></div>
    </div>
    <div class="summary-card" title="已上报的在线节点用量 / 当前分组全部节点容量">
      <div class="summary-label">硬盘用量<HardDrive /></div>
      <div class="summary-value"><strong>{{ disk.value }}</strong><span>{{ disk.unit }} / {{ formatBytes(totals.diskTotal) }}</span></div>
    </div>
    <div class="summary-card" :title="`上传 ${formatBytes(totals.totalTx)}\n下载 ${formatBytes(totals.totalRx)}`">
      <div class="summary-label">累计流量<Network /></div>
      <div class="summary-value"><strong>{{ traffic.value }}</strong><span>{{ traffic.unit }}</span></div>
    </div>
    <div class="summary-card">
      <div class="summary-label">下载速率<ArrowDown /></div>
      <div class="summary-value"><strong>{{ rx.value }}</strong><span>{{ rx.unit }}</span></div>
    </div>
  </div>
</template>
