import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, type Ref } from 'vue'
import type { PingNetwork, PingRow } from '../types'
import { api } from './api'
import { finite, record } from './data'

export function parsePing(value: unknown): PingNetwork[] {
  const data = record(value), probes = record(data.probes)
  const rows: PingRow[] = Array.isArray(data.ping) ? data.ping.flatMap((entry) => {
    const r = record(entry)
    if (!finite(r.ts) || !Number.isSafeInteger(r.task_id) || !finite(r.task_id) || (r.latency !== null && !finite(r.latency))) return []
    return [{ ts: r.ts, task_id: r.task_id, latency: r.latency, ...(finite(r.loss) ? { loss: Math.min(100, r.loss) } : {}) }]
  }) : []
  const ids = [...new Set([...rows.map((r) => r.task_id), ...Object.keys(probes).map(Number).filter(finite)])]
  const hasLoss = data.loss !== undefined && typeof data.loss === 'object' && data.loss !== null
  const loss = record(data.loss)
  return ids.map((id) => {
    const samples = rows.filter((r) => r.task_id === id).sort((a, b) => a.ts - b.ts)
    const windowLoss = loss[String(id)]
    return { id, name: typeof probes[String(id)] === 'string' ? probes[String(id)] as string : `监控 ${id}`, rows: samples, latest: samples.at(-1) ?? null,
      loss: finite(windowLoss) ? Math.min(100, windowLoss) : hasLoss && samples.length ? 0 : null }
  })
}

interface Snapshot { networks: PingNetwork[]; at: number; state: 'loading' | 'ready' | 'error'; error: string }
const cache = reactive(new Map<number, Snapshot>())
const pending = new Map<number, Promise<void>>()
const queue: { valid: () => boolean; run: () => Promise<void>; resolve: () => void }[] = []
let active = 0
function drain() {
  while (active < 3 && queue.length) {
    const task = queue.shift()!
    if (!task.valid()) { task.resolve(); continue }
    active++
    void task.run().finally(() => { active--; task.resolve(); drain() })
  }
}

function fetchPing(id: number, valid: () => boolean): Promise<void> {
  const existing = cache.get(id)
  if (existing && Date.now() - existing.at < 60000) return Promise.resolve()
  if (pending.has(id)) return pending.get(id)!
  const job = new Promise<void>((resolve) => {
    queue.push({ valid, resolve, run: async () => {
      cache.set(id, { networks: existing?.networks ?? [], at: 0, state: 'loading', error: '' })
      try {
        const result = await api<unknown>(`/nodes/${id}/metrics?hours=1&points=60&series=ping`)
        if (document.hidden) { cache.delete(id); return }
        cache.set(id, { networks: parsePing(result), at: Date.now(), state: 'ready', error: '' })
      } catch (error) {
        if (document.hidden) { cache.delete(id); return }
        cache.set(id, { networks: [], at: Date.now(), state: 'error', error: error instanceof Error ? error.message : '延迟数据暂时不可用' })
      }
    } })
  }).finally(() => pending.delete(id))
  pending.set(id, job)
  drain()
  return job
}

export function useNodePing(element: Ref<HTMLElement | null>, id: () => number, enabled: () => boolean) {
  const visible = ref(false)
  const foreground = ref(!document.hidden)
  let observer: IntersectionObserver | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let generation = 0
  const snapshot = computed(() => cache.get(id()))
  const canRead = () => visible.value && foreground.value && enabled()
  function refresh() {
    const current = ++generation
    if (timer) clearTimeout(timer)
    if (!canRead()) return
    const nodeId = id()
    void fetchPing(nodeId, () => canRead() && nodeId === id()).finally(() => {
      if (current === generation && canRead()) timer = setTimeout(refresh, 60000)
    })
  }
  const onVisibility = () => { foreground.value = !document.hidden }
  onMounted(() => {
    if (typeof IntersectionObserver === 'function' && element.value) {
      observer = new IntersectionObserver(([entry]) => { visible.value = entry.isIntersecting }, { rootMargin: '40px' })
      observer.observe(element.value)
    } else visible.value = true
    document.addEventListener('visibilitychange', onVisibility)
  })
  watch([visible, foreground, enabled, id], refresh, { immediate: true })
  onBeforeUnmount(() => {
    generation++
    observer?.disconnect()
    if (timer) clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisibility)
  })
  return snapshot
}
