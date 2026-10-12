<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Activity, CircleAlert, Clock3, ExternalLink, Globe2, LayoutGrid, LoaderCircle, Megaphone, Monitor, Moon, RotateCcw, Search, Server, Settings, SlidersHorizontal, Sun, Table2, Wallet, X } from '@lucide/vue'
import type { ConnectionState, MonitorNode, SiteInfo, ThemeConfig } from './types'
import manifest from '../theme.json'
import { api } from './lib/api'
import { defaultConfig, loadConfig, summaryKeys } from './lib/config'
import { filterNodes, groupsOf, inGroup, mergeNodes, record } from './lib/data'
import { safeImageUrl, safeUrl } from './lib/format'
import { usePreferences } from './lib/preferences'
import { startStream } from './lib/stream'
import GeoMap from './components/GeoMap.vue'
import NodeGlobe from './components/NodeGlobe.vue'
import NodeCard from './components/NodeCard.vue'
import NodeList from './components/NodeList.vue'
import NodeDetail from './components/NodeDetail.vue'
import { nodeFromHash, nodeHref } from './lib/navigation'
import SummaryCards from './components/SummaryCards.vue'
import VisitorInfoCard from './components/VisitorInfoCard.vue'
import NodeStatusBadges from './components/NodeStatusBadges.vue'
import PersonalFinanceDialog from './components/PersonalFinanceDialog.vue'
import DisplaySettingsDialog from './components/DisplaySettingsDialog.vue'
import { exchangeRateLabel, useExchangeRates } from './lib/exchange-rates'
import { resolveFinanceCurrency } from './lib/finance'

const nodes = ref<MonitorNode[] | null>(null)
const routeNode = ref<number | null>(typeof location !== 'undefined' ? nodeFromHash(location.hash) : null)
const entryOrder = ref<number[]>([])
const restore = { scroll: 0, focus: null as number | null, fromHome: false }
const site = ref<SiteInfo>({ site_name: 'Monitor', authed: false, public_page: true })
const siteConfig = ref<ThemeConfig>(defaultConfig())
const { config, theme, layout, earth, sort, group, offlineLast, pingDetails, dark, reduceMotion, storageAvailable, setPreference, cycleTheme, resetPreferences } = usePreferences(siteConfig)
const configLoaded = ref(false)
const visitorHeight = ref(36)
const visitorCountry = ref('')
const scrolled = ref(false)
const showVisitor = computed(() => configLoaded.value && config.value.visitor_info_enabled)
const connection = ref<ConnectionState>('connecting'), error = ref<string | null>(null), closed = ref(false)
const infoError = ref<string | null>(null), search = ref(''), iconFailed = ref(false)
const settingsOpen = ref(false)
const financeOpen = ref(false)
const publicFinanceOpen = ref(false)
const summaryCurrency = ref(config.value.finance_currency)
watch(() => config.value.finance_currency, currency => { summaryCurrency.value = currency })
const lastUpdated = ref<Date | null>(null)
const groups = computed(() => groupsOf(nodes.value ?? []))
const effectiveGroup = computed(() => config.value.show_group_tabs ? group.value : null)
const effectiveSearch = computed(() => config.value.show_search ? search.value : '')
const grouped = computed(() => inGroup(nodes.value ?? [], effectiveGroup.value))
const filtered = computed(() => filterNodes(grouped.value, effectiveSearch.value, config.value.show_sort ? sort.value : config.value.default_sort, offlineLast.value))
const selectedNode = computed(() => nodes.value?.find(node => node.id === routeNode.value) ?? null)
const detailSiblings = computed(() => {
  const list = nodes.value ?? []
  const ordered = entryOrder.value.map(id => list.find(n => n.id === id)).filter((n): n is MonitorNode => !!n)
  return selectedNode.value && ordered.some(n => n.id === selectedNode.value!.id) ? ordered : filterNodes(list, '', config.value.show_sort ? sort.value : config.value.default_sort, offlineLast.value)
})
const detailScope = computed(() => selectedNode.value && filtered.value.some(n => n.id === selectedNode.value!.id) && effectiveGroup.value !== null ? effectiveGroup.value || '未分组' : '全部节点')
function openNode(id: number) {
  if (routeNode.value === null) { restore.scroll = window.scrollY; restore.fromHome = true; restore.focus = id; entryOrder.value = filtered.value.map(n => n.id) }
  window.location.hash = nodeHref(id)
  syncRoute()
}
function syncRoute() {
  const next = nodeFromHash(window.location.hash)
  const previous = routeNode.value
  if (next !== null && previous === null && !restore.fromHome) { restore.scroll = window.scrollY; entryOrder.value = filtered.value.map(n => n.id) }
  routeNode.value = next
  if (next !== null) { void nextTick(() => window.scrollTo(0, 0)) }
  else if (previous !== null && restore.fromHome) {
    void nextTick(() => requestAnimationFrame(() => { window.scrollTo(0, restore.scroll); document.querySelector<HTMLElement>(`[data-node-entry="${restore.focus}"]`)?.focus({ preventScroll: true }); restore.fromHome = false }))
  }
}
function backToList() { window.location.hash = ''; syncRoute() }
const hasVisual = computed(() => ['earth', 'earth-stop', 'map'].includes(earth.value))
const cards = computed(() => summaryKeys(config.value))
const showSummary = computed(() => config.value.show_summary && cards.value.length > 0)
const showOverview = computed(() => earth.value !== 'hide' && (hasVisual.value || showSummary.value))
const summaryNodes = computed(() => config.value.summary_scope === 'all' ? nodes.value ?? [] : grouped.value)
const priceAllowed = computed(() => configLoaded.value && !closed.value && siteConfig.value.show_price && (!siteConfig.value.hide_price_logged_out || (site.value.authed && !infoError.value)))
const showPrice = computed(() => priceAllowed.value && config.value.show_price)
const canCalculate = computed(() => showPrice.value && config.value.show_personal_finance && nodes.value !== null)
const needsExchangeRates = computed(() => showPrice.value && nodes.value !== null && ((financeOpen.value && canCalculate.value) || (showOverview.value && showSummary.value && cards.value.includes('remaining_value') && (publicFinanceOpen.value || summaryNodes.value.some(node => node.price && resolveFinanceCurrency(node.currency) && resolveFinanceCurrency(node.currency) !== summaryCurrency.value)))))
const { snapshot: exchange, loading: ratesLoading } = useExchangeRates(needsExchangeRates)
watch(canCalculate, allowed => { if (!allowed) financeOpen.value = false })
const connectionLabel = computed(() => error.value ? '更新中断' : {
  connecting: '连接中', live: '实时更新', polling: '轮询更新', reconnecting: '重新连接', paused: '已暂停', closed: '需要登录',
}[connection.value])
const backgroundUrl = computed(() => config.value.background_enabled ? safeImageUrl(dark.value ? config.value.background_dark : config.value.background_light) : '')
const iconUrl = computed(() => safeImageUrl(config.value.site_icon) || '/favicon.svg')
const footerUrl = computed(() => safeUrl(config.value.footer_url))
const themeLabel = computed(() => ({ auto: '跟随系统', beijing: '北京时间自动', light: '浅色主题', dark: '深色主题' }[theme.value]))
const themeIcon = computed(() => theme.value === 'auto' ? Monitor : theme.value === 'beijing' ? Clock3 : theme.value === 'light' ? Sun : Moon)
let stopStream: () => void = () => {}
let alive = true, streamStarted = false

function connect() {
  streamStarted = true
  stopStream()
  stopStream = startStream({
    nodes: (value) => { nodes.value = mergeNodes(nodes.value, value); lastUpdated.value = new Date() },
    state: (value) => { connection.value = value },
    error: (message, privatePage) => {
      error.value = message
      closed.value = privatePage === true
      if (privatePage) nodes.value = null
    },
  }, config.value.poll_interval * 1000)
}
async function loadSite() {
  try {
    const value = record(await api<unknown>('/me'))
    if (!alive) return
    site.value = { site_name: typeof value.site_name === 'string' && value.site_name ? value.site_name : 'Monitor', authed: value.authed === true, public_page: value.public_page !== false, history_days: typeof value.history_days === 'number' && Number.isFinite(value.history_days) ? value.history_days : undefined }
    document.title = site.value.site_name
    infoError.value = null
  } catch (failure) {
    if (alive) infoError.value = failure instanceof Error ? failure.message : '站点信息读取失败'
  }
}
function retry() { connect(); void loadSite() }
function resetFilters() { search.value = ''; group.value = null }
function syncScroll() { scrolled.value = window.scrollY > 8 }
watch([nodes, group], ([list, selected]) => {
  if (list && selected !== null && !list.some((node) => node.group === selected)) group.value = null
})
watch(() => config.value.poll_interval, () => { if (streamStarted) connect() })
watch(iconUrl, (value) => {
  iconFailed.value = false
  const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (favicon) {
    favicon.href = value
    if (value === '/favicon.svg') favicon.type = 'image/svg+xml'
    else favicon.removeAttribute('type')
  }
  document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute('href', value === '/favicon.svg' ? '/apple-touch-icon.png' : value)
}, { immediate: true })
onMounted(() => {
  void loadSite()
  void loadConfig().then((value) => { if (alive) { siteConfig.value = value; configLoaded.value = true } })
  connect()
  syncScroll()
  window.addEventListener('scroll', syncScroll, { passive: true })
  window.addEventListener('hashchange', syncRoute)
})
onBeforeUnmount(() => { alive = false; stopStream(); window.removeEventListener('scroll', syncScroll); window.removeEventListener('hashchange', syncRoute) })
</script>
<template>
  <div class="app-shell" :class="{ 'reduced-motion': reduceMotion, 'visitor-safe-area': showVisitor }" :style="{ '--visitor-height': `${visitorHeight}px` }">
    <div class="page-background" aria-hidden="true">
      <div class="emerald-wash">
        <svg v-if="config.background_show_grid" class="perspective-grid" aria-hidden="true">
          <defs><pattern id="monitor-emerald-grid" width="72" height="56" patternUnits="userSpaceOnUse" x="-12" y="4"><path d="M.5 56V.5H72" fill="none" /></pattern></defs>
          <rect width="100%" height="100%" stroke-width="0" fill="url(#monitor-emerald-grid)" />
          <svg x="-12" y="4" class="grid-tiles"><rect stroke-width="0" width="73" height="57" x="288" y="168" /><rect stroke-width="0" width="73" height="57" x="144" y="56" /><rect stroke-width="0" width="73" height="57" x="504" y="168" /><rect stroke-width="0" width="73" height="57" x="720" y="336" /></svg>
        </svg>
      </div>
    </div>
    <div v-if="backgroundUrl" class="custom-background" aria-hidden="true" :style="{ backgroundImage: `url(${JSON.stringify(backgroundUrl)})`, filter: `blur(${config.background_blur}px)`, opacity: config.background_opacity / 100 }" />
    <header class="masthead" :class="{ 'masthead-scrolled': scrolled }">
      <div class="masthead-inner">
        <a class="brand" href="/" :aria-label="`${site.site_name} 首页`"><img v-if="!iconFailed" :src="iconUrl" :alt="site.site_name" @error="iconFailed = true" /><span v-else class="brand-fallback"><Globe2 /></span><h1>{{ site.site_name }}</h1></a>
        <div class="header-actions">
          <span class="connection" :class="{ 'connection-warning': error || connection === 'reconnecting' }" :title="lastUpdated ? `最后更新 ${lastUpdated.toLocaleTimeString()}` : '正在获取状态'"><span class="status-dot" />{{ connectionLabel }}</span>
          <button v-if="canCalculate" class="icon-button" type="button" aria-label="个人价值计算" title="个人价值计算" @click="financeOpen = true"><Wallet /></button>
          <button class="icon-button theme-toggle" type="button" :aria-label="`切换配色，当前${themeLabel}`" :title="themeLabel" @click="cycleTheme"><component :is="themeIcon" /></button>
          <button class="icon-button" type="button" aria-label="显示设置" title="显示设置" aria-haspopup="dialog" :aria-expanded="settingsOpen" @click="settingsOpen = true"><SlidersHorizontal /></button>
          <a v-if="site.authed || !config.hide_admin" class="icon-button" href="/admin" aria-label="后台管理" title="后台管理"><Settings /></a>
        </div>
      </div>
    </header>
    <main class="main-content">
      <div v-if="config.notice_enabled && (config.notice_title || config.notice)" class="notice"><Megaphone /><div><strong v-if="config.notice_title">{{ config.notice_title }}</strong><p v-if="config.notice">{{ config.notice }}</p></div></div>
      <div v-if="(error || infoError) && nodes !== null" class="error-banner" role="status"><CircleAlert /><span>{{ error || infoError }}；页面保留最近一次数据。</span><button type="button" @click="retry"><RotateCcw />重试</button></div>
      <template v-if="routeNode !== null && nodes !== null && selectedNode"><NodeDetail :node="selectedNode" :siblings="detailSiblings" :scope-label="detailScope" :config="config" :show-price="showPrice" :authed="site.authed && !infoError" :history-days="site.history_days" @back="backToList" @navigate="openNode" /></template>
      <div v-else-if="routeNode !== null && nodes !== null" class="empty-state" role="alert"><Server /><h2>节点不存在或无权查看</h2><button type="button" class="primary-button" @click="backToList">返回节点列表</button></div>
      <template v-else-if="nodes !== null">
        <section v-if="showOverview" class="overview" :class="{ 'overview-compact': !hasVisual, 'overview-visual-only': !showSummary }" aria-label="节点概况">
          <SummaryCards v-if="showSummary" :nodes="summaryNodes" :cards="cards" :scope="config.summary_scope" :show-price="showPrice" v-model:currency="summaryCurrency" :rates="exchange.rates" :rate-label="exchangeRateLabel(exchange)" :rates-loading="ratesLoading" @public-open-change="publicFinanceOpen = $event" />
          <div v-if="hasVisual" class="overview-visual">
            <NodeStatusBadges v-if="config.show_node_status" class="visual-node-status" :nodes="grouped" :group="effectiveGroup" />
            <GeoMap v-if="earth === 'map'" :nodes="grouped" :show-labels="config.earth_show_labels" />
            <NodeGlobe v-else :nodes="grouped" :rotate="earth === 'earth'" :dark="dark" :reduce-motion="reduceMotion" :rotation-speed="config.earth_rotation_speed" :show-labels="config.earth_show_labels" :show-rates="config.earth_show_rates" :visitor-country="showVisitor ? visitorCountry : ''" />
          </div>
        </section>
        <div class="node-toolbar" :class="{ 'toolbar-without-overview': !showOverview }">
          <div v-if="config.show_group_tabs" class="group-tabs" role="group" aria-label="节点分组">
            <button type="button" :aria-pressed="group === null" :class="{ active: group === null }" @click="group = null">全部<span>{{ nodes.length }}</span></button>
            <button v-for="name in groups" :key="name" type="button" :aria-label="`分组 ${name}`" :aria-pressed="group === name" :class="{ active: group === name }" @click="group = name">{{ name }}<span>{{ inGroup(nodes, name).length }}</span></button>
            <button v-if="groups.length && nodes.some(n => n.group === '')" type="button" :aria-pressed="group === ''" :class="{ active: group === '' }" @click="group = ''">未分组<span>{{ inGroup(nodes, '').length }}</span></button>
          </div>
          <div class="toolbar-actions">
            <NodeStatusBadges v-if="config.show_node_status && (!hasVisual || !showOverview)" class="toolbar-node-status" :nodes="grouped" :group="effectiveGroup" />
            <button v-if="config.show_ping && layout === 'card'" class="ping-toggle" type="button" :aria-pressed="pingDetails" :title="pingDetails ? '切换为网络摘要' : '展开网络明细'" @click="pingDetails = !pingDetails"><Activity />{{ pingDetails ? '明细' : '摘要' }}</button>
            <div class="view-switch" role="group" aria-label="节点视图"><button type="button" class="icon-button" :class="{ active: layout === 'card' }" :aria-pressed="layout === 'card'" aria-label="卡片视图" title="卡片视图" @click="layout = 'card'"><LayoutGrid /></button><button type="button" class="icon-button" :class="{ active: layout === 'list' }" :aria-pressed="layout === 'list'" aria-label="列表视图" title="列表视图" @click="layout = 'list'"><Table2 /></button></div>
            <select v-if="config.show_sort" v-model="sort" class="sort-select" aria-label="节点排序"><option value="default">默认排序</option><option value="name">名称 A → Z</option><option value="cpu">CPU ↓</option><option value="memory">内存用量 ↓</option><option value="disk">硬盘用量 ↓</option><option value="traffic">本期流量 ↓</option><option value="upload">上传速率 ↓</option><option value="download">下载速率 ↓</option></select>
            <div v-if="config.show_search" class="search-field"><Search /><input v-model="search" type="search" placeholder="搜索名称、地区、系统" aria-label="搜索节点" /><button v-if="search" class="search-clear" aria-label="清空搜索" type="button" @click="search = ''"><X /></button></div>
          </div>
        </div>
        <div v-if="filtered.length && layout === 'card'" class="nodes-grid" :class="`card-size-${config.card_size}`">
          <NodeCard v-for="node in filtered" :key="node.id" :node="node" :config="config" :show-ping="configLoaded && config.show_ping" :ping-details="pingDetails" :show-price="showPrice" @open="openNode" />
        </div>
        <NodeList v-else-if="filtered.length" :nodes="filtered" :config="config" :show-price="showPrice" @open="openNode" />
        <div v-else class="empty-state"><Search v-if="effectiveSearch || effectiveGroup !== null" /><Server v-else /><h2>{{ nodes.length ? '没有匹配的节点' : '暂无节点' }}</h2><p>{{ nodes.length ? '试试其它关键词或节点分组。' : '节点接入 Monitor 后会显示在这里。' }}</p><button v-if="nodes.length" type="button" class="text-button" @click="resetFilters">清除筛选</button><a v-else-if="site.authed" href="/admin">前往后台接入节点<ExternalLink /></a></div>
        <p v-if="filtered.length && effectiveSearch.trim()" class="search-count">找到 {{ filtered.length }} 个节点</p>
      </template>
      <div v-else-if="error || closed" class="empty-state load-error" role="alert"><CircleAlert /><h2>{{ closed ? '需要登录后查看' : '暂时无法获取节点' }}</h2><p>{{ error }}</p><a v-if="closed" href="/admin" class="primary-button">前往登录<ExternalLink /></a><button v-else class="primary-button" type="button" @click="retry"><RotateCcw />重新连接</button></div>
      <div v-else class="loading-state" aria-busy="true" aria-label="正在读取节点"><div class="loading-label"><LoaderCircle />正在连接 Monitor…</div><div class="skeleton-overview" /><div class="nodes-grid"><div v-for="n in 8" :key="n" class="skeleton-card" /></div></div>
    </main>
    <DisplaySettingsDialog v-if="settingsOpen" :config="config" :site-config="siteConfig" :price-allowed="priceAllowed" :storage-available="storageAvailable" @change="setPreference" @reset="resetPreferences" @close="settingsOpen = false" />
    <PersonalFinanceDialog v-if="financeOpen && canCalculate && nodes !== null" :nodes="nodes" :exchange="exchange" :rates-loading="ratesLoading" @close="financeOpen = false" />
    <VisitorInfoCard v-if="showVisitor" @height="visitorHeight = $event" @country="visitorCountry = $event" />
    <footer class="site-footer"><div><span>Powered by <a href="https://github.com/monitor-probe/monitor" target="_blank" rel="noopener noreferrer">Monitor</a></span><span>Theme by <a :href="manifest.url" target="_blank" rel="noopener noreferrer" :title="`${manifest.name} v${manifest.version}`">{{ manifest.name }}</a></span></div><p v-if="config.footer_text"><a v-if="footerUrl" :href="footerUrl" target="_blank" rel="noopener noreferrer">{{ config.footer_text }}</a><span v-else>{{ config.footer_text }}</span></p></footer>
  </div>
</template>
