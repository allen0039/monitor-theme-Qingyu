<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Search, X } from '@lucide/vue'
import type { MonitorNode } from '../types'
import type { ExchangeRateSnapshot } from '../lib/exchange-rates'
import { exchangeRateLabel } from '../lib/exchange-rates'
import { FINANCE_CURRENCIES, FINANCE_LABELS, calculateNodeFinance, financeAmount, financeCoverage, financeIssueText, summarizeFinance, type FinanceMetricKey } from '../lib/finance'
import { useFinancePreferences } from '../lib/finance-preferences'
import { filterNodes, groupsOf, inGroup, regionName } from '../lib/data'
import { flagUrl } from '../lib/assets'

const props = defineProps<{ nodes: MonitorNode[]; exchange: ExchangeRateSnapshot; ratesLoading: boolean }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement | null>(null)
const search = ref(''), group = ref<string | null>(null)
const { selectedIds, currency, storageAvailable } = useFinancePreferences(() => props.nodes.map(node => node.id))
const selectedSet = computed(() => new Set(selectedIds.value))
const selectedNodes = computed(() => props.nodes.filter(node => selectedSet.value.has(node.id)))
const groups = computed(() => groupsOf(props.nodes))
const filtered = computed(() => filterNodes(inGroup(props.nodes, group.value), search.value, 'default', false))
const hasFilter = computed(() => group.value !== null || !!search.value.trim())
const allFilteredSelected = computed(() => filtered.value.length > 0 && filtered.value.every(node => selectedSet.value.has(node.id)))
const values = computed(() => new Map(props.nodes.map(node => [node.id, calculateNodeFinance(node, currency.value, props.exchange.rates)])))
const summary = computed(() => summarizeFinance(selectedNodes.value, currency.value, props.exchange.rates))
const metricKeys: FinanceMetricKey[] = ['total', 'monthly', 'remaining']
const partialKeys = computed(() => metricKeys.filter(key => summary.value[key].missing > 0))

function toggleNode(id: number, checked: boolean) {
  const next = new Set(selectedIds.value)
  if (checked) next.add(id)
  else next.delete(id)
  selectedIds.value = [...next]
}
function selectFiltered() { selectedIds.value = [...new Set([...(selectedIds.value ?? []), ...filtered.value.map(node => node.id)])] }
function onBackdrop(event: MouseEvent) {
  if (event.target !== dialog.value) return
  const rect = dialog.value!.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) emit('close')
}
function keepFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  const controls = [...dialog.value!.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)')].filter(element => element.getClientRects().length > 0)
  const first = controls[0], last = controls.at(-1)
  if (event.shiftKey && document.activeElement === first && last) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last && first) { event.preventDefault(); first.focus() }
}
watch(() => props.nodes, nodes => { if (group.value !== null && !nodes.some(node => node.group === group.value)) group.value = null })
let previousOverflow = '', previousPadding = '', returnFocus: HTMLElement | null = null
onMounted(() => {
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  previousOverflow = document.body.style.overflow
  previousPadding = document.body.style.paddingRight
  const scrollbar = window.innerWidth - document.documentElement.clientWidth
  if (scrollbar > 0) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbar}px`
  document.body.style.overflow = 'hidden'
  dialog.value?.showModal()
})
onBeforeUnmount(() => {
  dialog.value?.close()
  document.body.style.overflow = previousOverflow
  document.body.style.paddingRight = previousPadding
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
})
</script>
<template>
  <Teleport to="body">
    <dialog ref="dialog" class="finance-dialog" aria-labelledby="finance-title" aria-describedby="finance-description" @cancel.prevent="emit('close')" @close="emit('close')" @click="onBackdrop" @keydown="keepFocus">
      <header class="finance-header">
        <div><h2 id="finance-title">个人价值计算</h2><p id="finance-description">选择只保存在当前浏览器，不会改变首页公开数据。</p></div>
        <button type="button" class="icon-button finance-close" aria-label="关闭个人价值计算" autofocus @click="emit('close')"><X /></button>
      </header>
      <div class="finance-totals" aria-live="polite" aria-atomic="true">
        <div v-for="key in metricKeys" :key="key" class="finance-metric" :title="key === 'total' ? '所选机器当前一个付款周期的标价合计' : key === 'monthly' ? '按付款月数折算，例如年付金额 ÷ 12' : '按主控剩余天数和付款周期参考天数折算'">
          <span>{{ FINANCE_LABELS[key] }}</span><strong :title="`${financeAmount(summary[key].value, currency)} ${currency}`">{{ financeAmount(summary[key].value, currency) }}</strong>
          <small v-if="summary[key].missing">{{ summary[key].included }} 台计入 · {{ summary[key].missing }} 台未计入</small>
        </div>
      </div>
      <div class="finance-controls">
        <span class="finance-count">已计入 <strong>{{ selectedNodes.length }}</strong> / {{ nodes.length }} 台</span>
        <select v-model="currency" aria-label="个人计算币种"><option v-for="code in FINANCE_CURRENCIES" :key="code" :value="code">{{ code }}</option></select>
        <div class="finance-search"><Search /><input v-model="search" type="search" placeholder="搜索服务器" aria-label="搜索服务器" /></div>
        <select v-model="group" class="finance-group" aria-label="筛选服务器分组"><option :value="null">全部分组</option><option v-for="name in groups" :key="name" :value="name">{{ name }}</option><option v-if="nodes.some(node => !node.group)" value="">未分组</option></select>
        <div class="finance-selection-actions"><button type="button" :disabled="allFilteredSelected || !filtered.length" @click="selectFiltered">{{ hasFilter ? '全选当前结果' : '全选' }}</button><button type="button" :disabled="!selectedNodes.length" @click="selectedIds = []">清空</button></div>
      </div>
      <div class="finance-node-list">
        <label v-for="node in filtered" :key="node.id" class="finance-node-row" :class="{ 'finance-node-selected': selectedSet.has(node.id) }">
          <input type="checkbox" :checked="selectedSet.has(node.id)" :aria-label="`计入 ${node.name}`" @change="toggleNode(node.id, ($event.target as HTMLInputElement).checked)" />
          <span class="finance-node-info"><strong :title="node.name">{{ node.name }}</strong><span class="finance-node-meta"><span class="status-dot" :class="{ offline: !node.online }" :title="node.online ? '在线' : '离线'" /><img v-if="flagUrl(node.country)" :src="flagUrl(node.country)" :alt="regionName(node.country)" class="country-flag" /><span>{{ node.group || regionName(node.country) }}</span><span v-if="values.get(node.id)!.issues.remaining" class="finance-row-issue">{{ financeIssueText(values.get(node.id)!.issues.remaining) }}</span></span></span>
          <span class="finance-node-amounts"><strong :title="values.get(node.id)!.prepaid ? '剩余时间超过一个付款周期，可能包含多周期预付' : financeIssueText(values.get(node.id)!.issues.remaining)">{{ financeAmount(values.get(node.id)!.remaining, currency) }}</strong><span :title="financeIssueText(values.get(node.id)!.issues.monthly)">{{ values.get(node.id)!.once ? '一次性' : `${financeAmount(values.get(node.id)!.monthly, currency)}/月` }}</span></span>
        </label>
        <div v-if="!filtered.length" class="finance-empty">{{ nodes.length ? '没有匹配的服务器' : '暂无可计算的服务器' }}<button v-if="hasFilter" type="button" class="text-button" @click="search = ''; group = null">清除筛选</button></div>
      </div>
      <footer class="finance-footer">
        <div class="finance-rate-note"><span>{{ currency }} · {{ ratesLoading ? '正在更新汇率…' : exchangeRateLabel(exchange) }}</span><span>月均按付款月数折算</span></div>
        <p v-for="key in partialKeys" :key="key" class="finance-coverage">{{ FINANCE_LABELS[key] }}未计入：{{ financeCoverage(summary[key]) }}。</p>
        <p v-if="!storageAvailable" class="finance-coverage" role="status">浏览器存储不可用，本次选择只在当前页面有效。</p>
      </footer>
    </dialog>
  </Teleport>
</template>
