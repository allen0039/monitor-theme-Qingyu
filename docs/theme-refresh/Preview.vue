<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Activity, LayoutGrid, Moon, Search, Sun, Wallet } from '@lucide/vue'
import SummaryCards from '../../src/components/SummaryCards.vue'
import NodeGlobe from '../../src/components/NodeGlobe.vue'
import PersonalFinanceDialog from '../../src/components/PersonalFinanceDialog.vue'
import PreviewNode from './PreviewNode.vue'
import { defaultConfig } from '../../src/lib/config'
import { inGroup, normalizeNodes, summarize } from '../../src/lib/data'
import { REFERENCE_RATES } from '../../src/lib/finance'
import type { MonitorNode, SummaryKey } from '../../src/types'

// This entry is a proposal only. Start it with npm run dev:demo.
const dark = ref(false)
const group = ref<string | null>(null)
const search = ref('')
const nodes = ref<MonitorNode[]>([])
const error = ref('')
const financeOpen = ref(false)
const showVisual = ref(true)
const showPrice = ref(true)
const showStatusDetail = ref(false)
const config = { ...defaultConfig(), card_size: 'compact' as const, ping_max_lines: 3, expiry_warning_days: 7 }
const cards: SummaryKey[] = ['memory', 'remaining_value', 'upload', 'disk', 'traffic', 'download']
const grouped = computed(() => inGroup(nodes.value, group.value))
const totals = computed(() => summarize(grouped.value))
const offline = computed(() => totals.value.total - totals.value.online)
const groups = computed(() => [...new Set(nodes.value.map(n => n.group).filter(Boolean))])
const visible = computed(() => grouped.value.filter(n => `${n.name} ${n.country} ${n.os}`.toLowerCase().includes(search.value.toLowerCase())).slice(0, 8))
const statusLabel = computed(() => `${group.value ?? '全部节点'}：在线 ${totals.value.online} 台，离线 ${offline.value} 台，共 ${totals.value.total} 台`)
const exchange = { rates: REFERENCE_RATES, source: 'reference' as const, date: null, stale: false }

watch(dark, value => document.documentElement.classList.toggle('dark', value), { immediate: true })
onMounted(async () => {
  try {
    const response = await fetch('/api/nodes')
    if (!response.ok) throw new Error('请使用 npm run dev:demo 启动设计预览')
    const result = await response.json()
    nodes.value = normalizeNodes(result.nodes)
  } catch (failure) { error.value = failure instanceof Error ? failure.message : '示例数据读取失败' }
})
onBeforeUnmount(() => document.documentElement.classList.remove('dark'))
</script>

<template>
  <div class="design-preview app-shell reduced-motion">
    <div class="page-background" aria-hidden="true"><div class="emerald-wash" /><div class="perspective-grid" /></div>
    <header class="masthead">
      <div class="masthead-inner">
        <div class="brand"><img src="/favicon.svg" alt="" /><h1>Emerald Globe Pro</h1><span class="design-preview-label">设计预览 · 示例数据</span></div>
        <div class="header-actions">
          <button class="icon-button" type="button" :aria-label="showVisual ? '隐藏地球，查看工具栏状态提示' : '显示地球'" :title="showVisual ? '隐藏地球' : '显示地球'" @click="showVisual = !showVisual"><Activity /></button>
          <button class="icon-button" type="button" :aria-label="showPrice ? '隐藏费用，预览隐私状态' : '显示费用'" title="预览费用显隐" @click="showPrice = !showPrice"><Wallet /></button>
          <button class="icon-button" type="button" :aria-label="dark ? '切换浅色' : '切换深色'" :title="dark ? '切换浅色' : '切换深色'" @click="dark = !dark"><Sun v-if="dark" /><Moon v-else /></button>
        </div>
      </div>
    </header>
    <main class="main-content">
      <p v-if="error" class="design-error" role="alert">{{ error }}</p>
      <template v-if="nodes.length">
        <section class="overview" :class="{ 'overview-compact': !showVisual }" aria-label="节点概况">
          <SummaryCards :nodes="grouped" :cards="cards" scope="group" :show-price="showPrice" currency="CNY" :rates="REFERENCE_RATES" rate-label="参考汇率 · 估算" :rates-loading="false" :can-calculate="showPrice" @open-finance="financeOpen = true" />
          <div v-if="showVisual" class="overview-visual">
            <div class="design-status-anchor">
              <button type="button" class="design-status" :aria-label="statusLabel" :aria-expanded="showStatusDetail" @click="showStatusDetail = !showStatusDetail" @keydown.esc="showStatusDetail = false">
                <span class="design-status-online"><i />{{ totals.online }}</span>
                <span v-if="offline" class="design-status-offline"><i />{{ offline }}</span>
              </button>
              <span v-if="showStatusDetail" class="design-status-detail" role="status">{{ statusLabel }}</span>
            </div>
            <NodeGlobe :nodes="grouped" :rotate="false" :dark="dark" :reduce-motion="true" :rotation-speed="0" :show-labels="true" :show-rates="false" />
          </div>
        </section>
        <div class="node-toolbar" :class="{ 'toolbar-without-overview': !showVisual }">
          <div class="group-tabs" role="group" aria-label="节点分组">
            <button type="button" :class="{ active: group === null }" :aria-pressed="group === null" @click="group = null">全部<span>{{ nodes.length }}</span></button>
            <button v-for="name in groups" :key="name" type="button" :class="{ active: group === name }" :aria-pressed="group === name" @click="group = name">{{ name }}<span>{{ inGroup(nodes, name).length }}</span></button>
          </div>
          <div class="toolbar-actions">
            <button v-if="!showVisual" type="button" class="design-status design-status-toolbar" :aria-label="statusLabel" :aria-expanded="showStatusDetail" @click="showStatusDetail = !showStatusDetail">
              <span class="design-status-online"><i />{{ totals.online }}</span><span v-if="offline" class="design-status-offline"><i />{{ offline }}</span>
            </button>
            <span v-if="!showVisual && showStatusDetail" class="design-status-toolbar-detail" role="status">{{ statusLabel }}</span>
            <span class="design-view-label"><LayoutGrid />卡片视图</span>
            <div class="search-field"><Search /><input v-model="search" type="search" placeholder="搜索节点" aria-label="搜索节点" /></div>
          </div>
        </div>
        <div class="design-node-grid nodes-grid">
          <PreviewNode v-for="node in visible" :key="node.id" :node="node" :config="config" :show-price="showPrice" />
        </div>
        <div v-if="!visible.length" class="empty-state"><Search /><h2>没有匹配的节点</h2><p>试试其它名称或分组。</p></div>
        <p class="design-preview-footnote">示例数据 · 最多展示 8 台 · 金额按参考汇率估算</p>
      </template>
    </main>
    <PersonalFinanceDialog v-if="financeOpen && showPrice" :nodes="nodes" :exchange="exchange" :rates-loading="false" @close="financeOpen = false" />
    <footer class="site-footer"><span>Powered by Monitor · Emerald Globe Pro</span></footer>
  </div>
</template>
