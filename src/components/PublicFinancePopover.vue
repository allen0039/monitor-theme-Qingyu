<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { MonitorNode } from '../types'
import { CURRENCY_CONFIG, FINANCE_CURRENCIES, FINANCE_LABELS, convertFinanceAmount, financeAmount, financeCoverage, summarizeFinance, type ExchangeRates, type FinanceMetricKey } from '../lib/finance'

const props = defineProps<{ id: string; anchor: HTMLElement | null; nodes: MonitorNode[]; scope: 'group' | 'all'; currency: string; rates: ExchangeRates; rateLabel: string; ratesLoading: boolean }>()
const emit = defineEmits<{ 'update:currency': [currency: string]; openChange: [open: boolean] }>()
const panel = ref<HTMLElement | null>(null)
const summary = computed(() => summarizeFinance(props.nodes, props.currency, props.rates))
const metricKeys: FinanceMetricKey[] = ['total', 'monthly', 'remaining']
const partialKeys = computed(() => metricKeys.filter(key => summary.value[key].missing > 0))
const rateRows = computed(() => (['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'HKD'] as const).map(currency => {
  const rate = convertFinanceAmount(1, props.currency, currency, props.rates)
  return { currency, amount: rate === null ? '—' : `${CURRENCY_CONFIG[currency][1]}${rate.toFixed(6)}` }
}))

function position() {
  if (!panel.value?.matches(':popover-open') || !props.anchor) return
  const anchor = props.anchor.getBoundingClientRect()
  const { offsetWidth: width, offsetHeight: height } = panel.value
  const left = Math.max(12, Math.min(anchor.left + (anchor.width - width) / 2, window.innerWidth - width - 12))
  const top = Math.max(12, Math.min(anchor.top - 8, window.innerHeight - height - 12))
  panel.value.style.left = `${left}px`
  panel.value.style.top = `${top}px`
}
function onToggle(event: Event) {
  const open = (event as ToggleEvent).newState === 'open'
  if (open) position()
  emit('openChange', open)
}
onMounted(() => {
  window.addEventListener('resize', position)
  window.addEventListener('scroll', position, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', position)
  window.removeEventListener('scroll', position, true)
})
</script>
<template>
  <section :id="id" ref="panel" popover="auto" class="public-finance-popover" role="dialog" :aria-label="scope === 'all' ? '全部节点公开费用汇总' : '当前分组公开费用汇总'" @toggle="onToggle">
    <div class="public-finance-totals" aria-live="polite" aria-atomic="true">
      <div v-for="key in metricKeys" :key="key" class="public-finance-metric" :title="summary[key].missing ? financeCoverage(summary[key]) : undefined">
        <span>{{ FINANCE_LABELS[key] }}</span>
        <strong :title="`${financeAmount(summary[key].value, currency)} ${currency}${key === 'monthly' ? '/月' : ''}`">{{ financeAmount(summary[key].value, currency) }}</strong>
        <small v-if="summary[key].missing">{{ summary[key].missing }} 台未计入</small>
      </div>
    </div>
    <div class="public-finance-rate-heading">
      <span>今日汇率</span>
      <select :value="currency" aria-label="切换公开汇总与汇率基准币种" autofocus @change="emit('update:currency', ($event.target as HTMLSelectElement).value)">
        <option v-for="code in FINANCE_CURRENCIES" :key="code" :value="code">{{ code }}</option>
      </select>
    </div>
    <div class="public-finance-rates" :aria-label="`每 1 ${currency} 可兑换的金额`">
      <div v-for="row in rateRows" :key="row.currency"><span>{{ row.currency }}</span><span>{{ row.amount }}</span></div>
    </div>
    <p class="public-finance-rate-note">{{ ratesLoading ? '正在更新汇率…' : rateLabel }}</p>
    <p v-for="key in partialKeys" :key="key" class="finance-coverage">{{ FINANCE_LABELS[key] }}未计入：{{ financeCoverage(summary[key]) }}。</p>
  </section>
</template>
