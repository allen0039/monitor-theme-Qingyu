<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeft, ChevronLeft, ChevronRight, Cpu, MemoryStick, HardDrive, ArrowDownToLine, ArrowUpFromLine, Server, Clock3 } from '@lucide/vue'
import type { MonitorNode, ThemeConfig } from '../types'
import { flagUrl } from '../lib/assets'
import { nodeState, regionName } from '../lib/data'
import { calculateNodeFinance, financeAmount, financeIssueText } from '../lib/finance'
import { duration, expiryLabel, formatBytes, percentage, priceLabel } from '../lib/format'
import NodeHistoryCharts from './NodeHistoryCharts.vue'
import NodePingHistory from './NodePingHistory.vue'
const props = defineProps<{ node: MonitorNode; siblings: MonitorNode[]; config: ThemeConfig; showPrice: boolean; authed: boolean; historyDays?: number; scopeLabel: string }>()
const emit = defineEmits<{ back: []; navigate: [number] }>()
const index = computed(() => props.siblings.findIndex(n => n.id === props.node.id))
const previous = computed(() => props.siblings[index.value - 1])
const next = computed(() => props.siblings[index.value + 1])
const m = computed(() => props.node.metrics)
const cpu = computed(() => m.value ? m.value.cpu.toFixed(1) + '%' : '—')
const mem = computed(() => percentage(m.value?.mem_used, props.node.mem_total))
const disk = computed(() => percentage(m.value?.disk_used, props.node.disk_total))
const p = (value: number | null) => value === null ? '—' : value.toFixed(1) + '%'
const number = (value?: number | null) => value === null || value === undefined ? '—' : value.toLocaleString('zh-CN')
const known = (value?: string | null) => value || '—'
const finance = computed(() => calculateNodeFinance(props.node, props.node.currency, {}))
const cost = computed(() => priceLabel(props.node.price, props.node.currency, props.node.billing_cycle))
const showNet = computed(() => props.config.show_speed)
const hasTraffic = computed(() => props.config.show_traffic || props.config.show_total_traffic || props.config.show_expiry || props.showPrice)
const monthLabel = computed(() => props.node.traffic_reset_day && props.node.traffic_reset_day !== 1 ? '当期' : '当月')
const mode = computed(() => ({ sum: '上下行合计', up: '仅上传', down: '仅下载', max: '取较大值', min: '取较小值' } as Record<string, string>)[props.node.traffic_mode] || known(props.node.traffic_mode))
</script>
<template>
  <div class="node-detail-page">
    <div class="detail-navigation">
      <button type="button" class="detail-back" @click="emit('back')"><ArrowLeft />返回列表</button>
      <div class="detail-page-switch">
        <span>{{ scopeLabel }} · {{ siblings.length }} 台</span>
        <button type="button" :disabled="!previous" :title="previous?.name || '没有上一台'" aria-label="上一台节点" @click="previous && emit('navigate', previous.id)"><ChevronLeft /></button>
        <select :value="node.id" aria-label="选择节点" @change="emit('navigate', Number(($event.target as HTMLSelectElement).value))"><option v-for="n in siblings" :key="n.id" :value="n.id">{{ n.name }}</option></select>
        <button type="button" :disabled="!next" :title="next?.name || '没有下一台'" aria-label="下一台节点" @click="next && emit('navigate', next.id)"><ChevronRight /></button>
      </div>
    </div>
    <div class="detail-identity">
      <img v-if="flagUrl(node.country)" :src="flagUrl(node.country)" :alt="regionName(node.country)" class="detail-country-flag" />
      <div><div class="detail-title-line"><h1>{{ node.name }}</h1><span class="detail-state" :class="{ offline: !node.online, waiting: node.online && !m }"><i class="status-dot" :class="{ offline: !node.online, waiting: node.online && !m }" />{{ nodeState(node) }}</span></div><p>{{ node.group || '未分组' }} · {{ regionName(node.country) }} <span v-if="node.last_seen_ago !== null"> · 最近上报 {{ duration(node.last_seen_ago) }} 前</span></p></div>
    </div>
    <div class="detail-kpis">
      <div v-if="config.show_cpu" class="detail-kpi"><div class="detail-kpi-label"><Cpu />CPU</div><strong>{{ cpu }}</strong><div class="detail-kpi-progress"><span :style="{ width: m ? Math.min(100, m.cpu) + '%' : '0%' }" /></div></div>
      <div v-if="config.show_memory" class="detail-kpi"><div class="detail-kpi-label"><MemoryStick />内存</div><strong>{{ p(mem) }}</strong><small>{{ formatBytes(m?.mem_used) }} / {{ formatBytes(node.mem_total) }}</small><div class="detail-kpi-progress"><span :style="{ width: mem === null ? '0%' : Math.min(100, mem) + '%' }" /></div></div>
      <div v-if="config.show_disk" class="detail-kpi"><div class="detail-kpi-label"><HardDrive />磁盘</div><strong>{{ p(disk) }}</strong><small>{{ formatBytes(m?.disk_used) }} / {{ formatBytes(node.disk_total) }}</small><div class="detail-kpi-progress"><span :style="{ width: disk === null ? '0%' : Math.min(100, disk) + '%' }" /></div></div>
      <div v-if="showNet" class="detail-kpi detail-speed-kpi"><div class="detail-kpi-label"><ArrowDownToLine />网络速率</div><strong><ArrowDownToLine />{{ formatBytes(m?.net_rx, true) }}</strong><strong class="detail-speed-up"><ArrowUpFromLine />{{ formatBytes(m?.net_tx, true) }}</strong></div>
    </div>
    <div v-if="config.show_cpu || config.show_memory || config.show_uptime" class="detail-info-strip">
      <span v-if="config.show_cpu"><b>负载 1 / 5 / 15m</b>{{ m ? m.load.map(v => v.toFixed(2)).join(' / ') : '—' }}</span>
      <span v-if="config.show_memory"><b>Swap</b>{{ m?.swap_used == null ? '—' : formatBytes(m.swap_used) }} / {{ formatBytes(m?.swap_total ?? node.swap_total) }}</span>
      <span v-if="config.show_cpu"><b>进程</b>{{ number(m?.procs) }}</span>
      <span v-if="config.show_cpu"><b>TCP / UDP</b>{{ number(m?.tcp) }} / {{ number(m?.udp) }}</span>
      <span v-if="config.show_uptime"><b>系统运行</b>{{ duration(m?.uptime) }}</span>
    </div>
    <NodeHistoryCharts :node="node" :config="config" :history-days="historyDays" />
    <NodePingHistory v-if="config.show_ping" :node="node" :config="config" :history-days="historyDays" />
    <div class="detail-bottom-grid">
      <section v-if="config.show_node_metadata || (config.show_remark && node.public_remark) || (authed && (node.ipv4 || node.ipv6))" class="detail-section detail-info-card">
        <div class="detail-section-head"><div><h2><Server />硬件与系统</h2><p>主控提供的节点资料</p></div></div>
        <dl class="detail-definition">
          <template v-if="config.show_node_metadata">
            <div><dt>CPU 型号</dt><dd>{{ known(node.cpu_name) }}</dd></div>
            <div><dt>CPU 核心</dt><dd>{{ node.cpu_cores > 0 ? number(node.cpu_cores) + ' 核' : '—' }}</dd></div>
            <div><dt>系统</dt><dd>{{ known(node.os) }}</dd></div>
            <div><dt>内核</dt><dd>{{ known(node.kernel) }}</dd></div>
            <div><dt>架构 / 虚拟化</dt><dd>{{ known(node.arch) }} / {{ known(node.virt) }}</dd></div>
            <div><dt>Agent 版本</dt><dd>{{ known(node.agent_version) }}</dd></div>
            <div><dt>物理内存 / Swap</dt><dd>{{ formatBytes(node.mem_total) }} / {{ formatBytes(node.swap_total ?? m?.swap_total) }}</dd></div>
            <div><dt>磁盘总容量</dt><dd>{{ formatBytes(node.disk_total) }}</dd></div>
          </template>
          <div v-if="authed && node.ipv4"><dt>IPv4</dt><dd>{{ node.ipv4 }}</dd></div>
          <div v-if="authed && node.ipv6"><dt>IPv6</dt><dd>{{ node.ipv6 }}</dd></div>
          <div v-if="config.show_remark && node.public_remark"><dt>备注</dt><dd class="detail-remark">{{ node.public_remark }}</dd></div>
        </dl>
      </section>
      <section v-if="hasTraffic" class="detail-section detail-info-card">
        <div class="detail-section-head"><div><h2><Clock3 />流量与费用</h2><p>按主控计费规则与当前节点配置展示</p></div></div>
        <dl class="detail-definition">
          <template v-if="config.show_traffic || config.show_total_traffic">
            <div v-if="config.show_traffic"><dt>{{ monthLabel }}上传 / 下载</dt><dd>{{ formatBytes(node.month_tx) }} / {{ formatBytes(node.month_rx) }}</dd></div>
            <div v-if="config.show_traffic"><dt>{{ monthLabel }}计费流量</dt><dd>{{ formatBytes(node.month_used) }} / {{ node.traffic_limit ? formatBytes(node.traffic_limit) : '无限制' }}</dd></div>
            <div v-if="config.show_traffic"><dt>计费方向 / 重置日</dt><dd>{{ mode }} · {{ node.traffic_reset_day ? '每月 ' + node.traffic_reset_day + ' 日' : '—' }}</dd></div>
            <div v-if="config.show_total_traffic"><dt>累计上传 / 下载</dt><dd>{{ formatBytes(node.total_tx) }} / {{ formatBytes(node.total_rx) }}</dd></div>
          </template>
          <div v-if="showPrice"><dt>录入标价</dt><dd>{{ cost }}</dd></div>
          <div v-if="showPrice"><dt>月均折算</dt><dd>{{ financeAmount(finance.monthly, node.currency) }} <small v-if="finance.issues.monthly">{{ financeIssueText(finance.issues.monthly) }}</small></dd></div>
          <div v-if="config.show_expiry"><dt>到期时间</dt><dd>{{ known(node.expires_at) }} <small v-if="node.expires_in !== null">({{ expiryLabel(node.expires_in) }})</small></dd></div>
          <div v-if="showPrice"><dt>剩余价值估算</dt><dd>{{ financeAmount(finance.remaining, node.currency) }} <small v-if="finance.issues.remaining">{{ financeIssueText(finance.issues.remaining) }}</small></dd></div>
        </dl>
      </section>
    </div>
  </div>
</template>