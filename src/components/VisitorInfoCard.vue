<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Building2, Clock3, Globe2, Monitor, Network, PanelsTopLeft, RotateCcw } from '@lucide/vue'
import { flagUrl } from '../lib/assets'
import { detectClient, fetchVisitorGeo, type VisitorGeo } from '../lib/visitor'

const emit = defineEmits<{ height: [value: number] }>()
const client = detectClient(navigator.userAgent)
const expanded = ref(false), loading = ref(true), flagFailed = ref(false)
const geo = ref<VisitorGeo | null>(null)
const shell = ref<HTMLElement | null>(null)
const visitTime = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short', hour12: false }).format(new Date())
const location = computed(() => loading.value ? '正在定位…' : geo.value?.location || '网络访客')
const flag = computed(() => geo.value?.countryCode ? flagUrl(geo.value.countryCode) : undefined)
let request: AbortController | null = null
let observer: ResizeObserver | null = null
let alive = true

async function locate(force = false) {
  request?.abort()
  const current = new AbortController()
  request = current
  loading.value = true
  const result = await fetchVisitorGeo({ force, signal: current.signal })
  if (!alive || current.signal.aborted) return
  geo.value = result
  flagFailed.value = false
  loading.value = false
}
onMounted(() => {
  void locate()
  if (typeof ResizeObserver === 'function' && shell.value) {
    observer = new ResizeObserver(([entry]) => { if (entry) emit('height', Math.ceil(entry.contentRect.height)) })
    observer.observe(shell.value)
  }
})
onBeforeUnmount(() => { alive = false; request?.abort(); observer?.disconnect(); emit('height', 0) })
</script>
<template>
  <aside ref="shell" class="visitor-shell" aria-label="访客信息">
    <div id="visitor-info-card" class="visitor-card" :class="{ 'visitor-expanded': expanded }">
      <button class="visitor-summary" type="button" :aria-expanded="expanded" aria-controls="visitor-info-details" :aria-label="expanded ? '收起访客详细信息' : '展开访客详细信息'" @click="expanded = !expanded" @keydown.esc="expanded = false">
        <span class="visitor-item" :title="`${location}（网络出口地区）`">
          <img v-if="flag && !flagFailed" :src="flag" :alt="geo?.countryCode" class="visitor-flag" @error="flagFailed = true" />
          <span v-else class="visitor-icon"><Globe2 /></span>
          <span aria-live="polite">{{ location }}</span>
        </span>
        <span class="visitor-item" :title="client.browser"><span class="visitor-icon"><PanelsTopLeft /></span><span>{{ client.browser }}</span></span>
      </button>
      <div v-if="expanded" id="visitor-info-details" class="visitor-details">
        <div class="visitor-item"><span class="visitor-icon"><Monitor /></span><span>{{ client.device }}</span></div>
        <div class="visitor-item visitor-ip"><span class="visitor-icon"><Network /></span><span>{{ geo?.ip || (loading ? '获取中…' : '暂无法获取') }}</span></div>
        <div class="visitor-item"><span class="visitor-icon"><Building2 /></span><span>{{ geo?.isp || (loading ? '获取中…' : '网络信息不可用') }}</span></div>
        <div class="visitor-item"><span class="visitor-icon"><Clock3 /></span><span>{{ visitTime }}</span></div>
        <button type="button" class="visitor-retry" :disabled="loading" @click="locate(true)"><RotateCcw />{{ loading ? '正在定位…' : '重新定位' }}</button>
      </div>
    </div>
  </aside>
</template>
