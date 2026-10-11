<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch, type Component } from 'vue'
import { ArrowDown, ArrowUp, Cpu, Globe2, HardDrive, MemoryStick, Network, Server, ServerOff, Wallet } from '@lucide/vue'
import type { MonitorNode, SummaryKey } from '../types'
import { summarize } from '../lib/data'
import { bytes, formatBytes } from '../lib/format'
import { financeAmount, financeCoverage, resolveFinanceCurrency, summarizeFinance, type ExchangeRates } from '../lib/finance'
import PublicFinancePopover from './PublicFinancePopover.vue'
const props = defineProps<{ nodes: MonitorNode[]; cards: SummaryKey[]; scope: 'group' | 'all'; showPrice: boolean; currency: string; rates: ExchangeRates; rateLabel: string; ratesLoading: boolean }>()
const emit = defineEmits<{ 'update:currency': [currency: string]; publicOpenChange: [open: boolean] }>()
const financePopoverId = `public-finance-${useId()}`
const financeAnchor = ref<HTMLElement | null>(null)
const publicOpen = ref(false)
function setPublicOpen(open: boolean) { publicOpen.value = open; emit('publicOpenChange', open) }
watch(() => props.showPrice && props.cards.includes('remaining_value'), visible => { if (!visible) setPublicOpen(false) })
onBeforeUnmount(() => setPublicOpen(false))
const remaining = computed(() => props.showPrice ? summarizeFinance(props.nodes, props.currency, props.rates).remaining : null)
const converts = computed(() => props.nodes.some(node => node.price && resolveFinanceCurrency(node.currency) !== resolveFinanceCurrency(props.currency)))
const totals = computed(() => summarize(props.nodes))
const memory = computed(() => bytes(totals.value.reporting ? totals.value.memUsed : null, false, 'overview'))
const disk = computed(() => bytes(totals.value.reporting ? totals.value.diskUsed : null, false, 'overview'))
const traffic = computed(() => bytes(totals.value.totalRx + totals.value.totalTx, false, 'overview'))
const tx = computed(() => bytes(totals.value.reporting ? totals.value.tx : null, true, 'overview'))
const rx = computed(() => bytes(totals.value.reporting ? totals.value.rx : null, true, 'overview'))
interface CardValue { label: string; icon: Component; value: string | number; unit: string; title?: string; note?: string; tone?: string }
const values = computed<Record<SummaryKey, CardValue>>(() => {
  const reporting = props.nodes.filter((node) => node.metrics !== null)
  const avgCpu = reporting.length ? reporting.reduce((sum, node) => sum + node.metrics!.cpu, 0) / reporting.length : null
  return {
    remaining_value: {
      label: '剩余价值', icon: Wallet, value: props.showPrice ? financeAmount(remaining.value!.value, props.currency, true) : '—', unit: props.showPrice ? props.currency : '',
      title: props.showPrice ? `${props.scope === 'all' ? '全部节点' : '当前分组'} · 按剩余天数折算\n${financeAmount(remaining.value!.value, props.currency)} ${props.currency}\n已计入 ${remaining.value!.included}/${props.nodes.length} 台${remaining.value!.missing ? `\n${financeCoverage(remaining.value!)}` : ''}${converts.value ? `\n${props.rateLabel}` : ''}` : '费用已隐藏',
      note: !props.showPrice ? '费用已隐藏' : remaining.value!.missing ? `${remaining.value!.value === null ? '暂不可计算' : '部分计入'} · ${remaining.value!.missing} 台未计入` : converts.value ? props.ratesLoading ? '正在更新汇率…' : props.rateLabel : '按剩余天数折算',
    },
    memory: { label: '内存用量', icon: MemoryStick, ...memory.value, unit: `${memory.value.unit} / ${formatBytes(totals.value.memTotal, false, 'overview')}`, title: `已上报的在线节点用量 / 统计范围内全部节点容量\n${formatBytes(totals.value.reporting ? totals.value.memUsed : null)} / ${formatBytes(totals.value.memTotal)}` },
    disk: { label: '硬盘用量', icon: HardDrive, ...disk.value, unit: `${disk.value.unit} / ${formatBytes(totals.value.diskTotal, false, 'overview')}`, title: `已上报的在线节点用量 / 统计范围内全部节点容量\n${formatBytes(totals.value.reporting ? totals.value.diskUsed : null)} / ${formatBytes(totals.value.diskTotal)}` },
    online: { label: '节点在线', icon: Server, value: totals.value.online, unit: `/ ${totals.value.total} 台`, tone: 'up', note: totals.value.total - totals.value.online ? `${totals.value.total - totals.value.online} 台离线` : '全部在线' },
    offline: { label: '离线节点', icon: ServerOff, value: totals.value.total - totals.value.online, unit: `/ ${totals.value.total} 台`, tone: totals.value.total > totals.value.online ? 'danger' : undefined },
    traffic: { label: '累计流量', icon: Network, ...traffic.value, title: `上传 ${formatBytes(totals.value.totalTx)}\n下载 ${formatBytes(totals.value.totalRx)}` },
    upload: { label: '实时上行', icon: ArrowUp, ...tx.value },
    download: { label: '实时下行', icon: ArrowDown, ...rx.value },
    cpu: { label: '平均 CPU', icon: Cpu, value: avgCpu === null ? '—' : avgCpu.toFixed(1), unit: avgCpu === null ? '' : '%', title: '已有有效指标的在线节点 CPU 使用率的算术平均值' },
    regions: { label: '国家和地区', icon: Globe2, value: new Set(props.nodes.map((node) => node.country).filter(Boolean)).size, unit: '个', title: '按节点国家代码去重，包含离线节点，不计未知地区' },
  }
})
</script>
<template>
  <div class="summary-grid" :style="{ '--summary-columns': Math.min(3, cards.length), '--summary-wide-columns': Math.min(6, cards.length) }" :aria-label="scope === 'all' ? '全部节点汇总' : '当前分组汇总'">
    <component :is="key === 'remaining_value' && showPrice ? 'button' : 'div'" v-for="key in cards" :key="key" class="summary-card" :class="{ 'summary-finance': key === 'remaining_value', 'summary-clickable': key === 'remaining_value' && showPrice }" :type="key === 'remaining_value' && showPrice ? 'button' : undefined" :title="values[key].title" :aria-label="key === 'remaining_value' && showPrice ? '剩余价值，查看公开费用汇总' : undefined" :aria-haspopup="key === 'remaining_value' && showPrice ? 'dialog' : undefined" :aria-expanded="key === 'remaining_value' && showPrice ? publicOpen : undefined" :popovertarget="key === 'remaining_value' && showPrice ? financePopoverId : undefined" @click="key === 'remaining_value' && showPrice && (financeAnchor = $event.currentTarget as HTMLElement)">
      <div class="summary-label">{{ values[key].label }}<component :is="values[key].icon" /></div>
      <div class="summary-value"><strong :class="values[key].tone">{{ values[key].value }}</strong><span>{{ values[key].unit }}</span></div>
      <div v-if="values[key].note" class="summary-note"><span v-if="key === 'online'" class="status-dot" />{{ values[key].note }}</div>
    </component>
    <PublicFinancePopover v-if="showPrice && cards.includes('remaining_value')" :id="financePopoverId" :anchor="financeAnchor" :nodes="nodes" :scope="scope" :currency="currency" :rates="rates" :rate-label="rateLabel" :rates-loading="ratesLoading" @update:currency="emit('update:currency', $event)" @open-change="setPublicOpen" />
  </div>
</template>
