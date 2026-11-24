<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MonitorNode } from '../types'
import { CURRENCY_CONFIG, FINANCE_CURRENCIES, FINANCE_LABELS, convertFinanceAmount, financeAmount, financeCoverage, summarizeFinance, type ExchangeRates, type FinanceMetricKey } from '../lib/finance'
import { useSummaryPopoverPosition } from '../lib/popover'
import { summarizeUpcomingRenewals } from '../lib/summary-insights'

const props = defineProps<{ id: string; anchor: HTMLElement | null; nodes: MonitorNode[]; scope: 'group' | 'all'; currency: string; rates: ExchangeRates; rateLabel: string; ratesLoading: boolean }>()
const emit = defineEmits<{ 'update:currency': [currency: string]; openChange: [open: boolean]; open: [id: number] }>()
const panel = ref<HTMLElement | null>(null)
const summary = computed(() => summarizeFinance(props.nodes, props.currency, props.rates))
const renewals = computed(() => summarizeUpcomingRenewals(props.nodes, props.currency, props.rates, 30))
const metricKeys: FinanceMetricKey[] = ['total', 'monthly', 'remaining']
const partialKeys = computed(() => metricKeys.filter(key => summary.value[key].missing > 0))
const rateRows = computed(() => (['CNY', 'USD', 'EUR', 'GBP', 'JPY', 'HKD'] as const).map(currency => {
  const rate = convertFinanceAmount(1, props.currency, currency, props.rates)
  return { currency, amount: rate === null ? '—' : `${CURRENCY_CONFIG[currency][1]}${rate.toFixed(6)}` }
}))

const position = useSummaryPopoverPosition(panel, () => props.anchor)
function selectNode(id: number) {
  panel.value?.hidePopover?.()
  emit('open', id)
}
function onToggle(event: Event) {
  const open = (event as ToggleEvent).newState === 'open'
  if (open) position()
  emit('openChange', open)
}
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
    <div v-if="renewals.count > 0" class="public-finance-renewals">
      <div class="public-finance-renewals-head">
        <span>近 30 天待续费</span>
        <strong>{{ renewals.count }} 台{{ renewals.total !== null ? ` · ${renewals.missingRateCount ? '已折算 ' : ''}${financeAmount(renewals.total, currency, true)}` : '' }}</strong>
      </div>
      <p v-if="renewals.missingRateCount" class="finance-coverage">{{ renewals.missingRateCount }} 台缺少可用币种或汇率，未计入续费金额。</p>
      <div class="public-finance-renewals-chips">
        <button
          v-for="item in renewals.items.slice(0, 4)"
          :key="item.node.id"
          type="button"
          class="public-finance-renewal-chip"
          @click="selectNode(item.node.id)"
        >
          <span>{{ item.node.name }}</span>
          <b>{{ item.label }}</b>
        </button>
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
