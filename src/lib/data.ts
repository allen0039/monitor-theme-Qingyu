import type { Metrics, MonitorNode, SortKey } from '../types'
import { percentage } from './format'

export const record = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown): string => typeof value === 'string' ? value : ''
export const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const number = (value: unknown) => finite(value) ? value : 0
const CORE = ['cpu', 'mem_total', 'mem_used', 'disk_total', 'disk_used', 'net_rx', 'net_tx', 'uptime'] as const

export function monthlyUsed(node: Record<string, unknown>): number {
  if (finite(node.month_used)) return node.month_used
  const rx = number(node.month_rx), tx = number(node.month_tx)
  switch (node.traffic_mode) {
    case 'up': return tx
    case 'down': return rx
    case 'max': return Math.max(rx, tx)
    case 'min': return Math.min(rx, tx)
    default: return rx + tx
  }
}

export function normalizeNodes(value: unknown): MonitorNode[] {
  if (!Array.isArray(value)) throw new Error('收到的节点列表格式不正确')
  const seen = new Set<number>()
  return value.flatMap((entry) => {
    const n = record(entry)
    if (!Number.isSafeInteger(n.id) || !finite(n.id) || seen.has(n.id)) return []
    seen.add(n.id)
    const raw = record(n.metrics)
    const valid = n.metrics != null && CORE.every((key) => finite(raw[key])) && Array.isArray(raw.load) && raw.load.length === 3 && raw.load.every(finite)
    const online = n.online === true
    const m = online && valid ? { ...Object.fromEntries([...CORE, 'load'].map((key) => [key, raw[key]])), ...Object.fromEntries(['swap_total', 'swap_used', 'tcp', 'udp', 'procs'].map((key) => [key, finite(raw[key]) ? raw[key] : null])) } as unknown as Metrics : null
    // Older hubs lack these keys. Null on a current hub has a separate meaning.
    const expires = n.expires_in !== undefined ? n.expires_in
      : typeof n.expires_at === 'string' && !Number.isNaN(Date.parse(n.expires_at))
        ? Math.ceil((Date.parse(n.expires_at + 'T00:00:00') - new Date().setHours(0, 0, 0, 0)) / 86400000) : null
    const ago = n.last_seen_ago !== undefined ? n.last_seen_ago
      : finite(n.last_seen) && n.last_seen > 0 ? Math.max(0, Math.floor(Date.now() / 1000) - n.last_seen) : null
    return [{
      id: n.id, name: text(n.name) || `节点 ${n.id}`, country: /^[A-Z]{2}$/.test(text(n.country).toUpperCase()) ? text(n.country).toUpperCase() : '',
      group: text(n.group), online, metrics: m, metrics_invalid: online && n.metrics != null && !valid,
      os: text(n.os), arch: text(n.arch), virt: text(n.virt), cpu_name: text(n.cpu_name), cpu_cores: number(n.cpu_cores),
      kernel: text(n.kernel), agent_version: text(n.agent_version), ipv4: text(n.ipv4), ipv6: text(n.ipv6), swap_total: finite(n.swap_total) ? n.swap_total : null,
      mem_total: m?.mem_total ?? number(n.mem_total), disk_total: m?.disk_total ?? number(n.disk_total),
      total_rx: number(n.total_rx), total_tx: number(n.total_tx), month_rx: number(n.month_rx), month_tx: number(n.month_tx),
      month_used: monthlyUsed(n), traffic_limit: number(n.traffic_limit), traffic_mode: text(n.traffic_mode),
      traffic_reset_day: Number.isInteger(n.traffic_reset_day) && finite(n.traffic_reset_day) && n.traffic_reset_day >= 1 && n.traffic_reset_day <= 31 ? n.traffic_reset_day : null,
      price: finite(n.price) ? n.price : null, currency: text(n.currency) || 'CNY', billing_cycle: text(n.billing_cycle),
      expires_at: typeof n.expires_at === 'string' ? n.expires_at : null,
      expires_in: typeof expires === 'number' && Number.isFinite(expires) ? expires : null,
      last_seen_ago: finite(ago) ? ago : null, public_remark: text(n.public_remark),
    }]
  })
}

/**
 * 将新的节点快照合并到现有列表中，并尽量保持节点及指标对象的引用。
 *
 * WebSocket/轮询快照会为每个节点创建普通的新对象。如果直接替换整个列表，
 * 会让所有 NodeCard 都进入一次完整的更新路径，即使只有一个指标发生变化，也
 * 可能让所有卡片同时重绘。就地更新可以让 Vue 只处理真正变化的字段。
 */
export function mergeNodes(current: MonitorNode[] | null, incoming: MonitorNode[]): MonitorNode[] {
  if (!current) return incoming

  const byId = new Map(current.map((node) => [node.id, node]))
  const merged: MonitorNode[] = []
  for (const next of incoming) {
    const existing = byId.get(next.id)
    if (existing) {
      mergeNode(existing, next)
      merged.push(existing)
    } else {
      merged.push(next)
    }
  }

  // 保留当前数组引用；仅在节点增删或顺序变化时改动数组，避免每个快照都触发列表更新。
  if (current.length !== merged.length || current.some((node, index) => node !== merged[index])) {
    current.splice(0, current.length, ...merged)
  }
  return current
}

function mergeNode(target: MonitorNode, source: MonitorNode): void {
  for (const key of Object.keys(source) as Array<keyof MonitorNode>) {
    if (key === 'metrics') continue
    const previous = target[key]
    const next = source[key]
    if (!Object.is(previous, next)) Reflect.set(target, key, next)
  }

  const currentMetrics = target.metrics
  const nextMetrics = source.metrics
  if (!currentMetrics || !nextMetrics) {
    if (currentMetrics !== nextMetrics) target.metrics = nextMetrics
    return
  }

  if (currentMetrics.cpu !== nextMetrics.cpu) currentMetrics.cpu = nextMetrics.cpu
  if (currentMetrics.mem_total !== nextMetrics.mem_total) currentMetrics.mem_total = nextMetrics.mem_total
  if (currentMetrics.mem_used !== nextMetrics.mem_used) currentMetrics.mem_used = nextMetrics.mem_used
  if (currentMetrics.disk_total !== nextMetrics.disk_total) currentMetrics.disk_total = nextMetrics.disk_total
  if (currentMetrics.disk_used !== nextMetrics.disk_used) currentMetrics.disk_used = nextMetrics.disk_used
  if (currentMetrics.net_rx !== nextMetrics.net_rx) currentMetrics.net_rx = nextMetrics.net_rx
  if (currentMetrics.net_tx !== nextMetrics.net_tx) currentMetrics.net_tx = nextMetrics.net_tx
  if (currentMetrics.uptime !== nextMetrics.uptime) currentMetrics.uptime = nextMetrics.uptime
  for (const key of ['swap_total', 'swap_used', 'tcp', 'udp', 'procs'] as const) if (currentMetrics[key] !== nextMetrics[key]) currentMetrics[key] = nextMetrics[key]
  if (currentMetrics.load.some((value, index) => value !== nextMetrics.load[index])) {
    currentMetrics.load = [...nextMetrics.load] as [number, number, number]
  }
}

export function groupsOf(nodes: MonitorNode[]): string[] {
  return [...new Set(nodes.map((node) => node.group).filter(Boolean))]
}
export function inGroup(nodes: MonitorNode[], group: string | null): MonitorNode[] {
  return group === null ? nodes : nodes.filter((node) => node.group === group)
}

const regionNames = new Intl.DisplayNames(['zh-CN'], { type: 'region' })
export function regionName(country: string): string {
  try { return country ? regionNames.of(country) || country : '未知地区' } catch { return country }
}

export function nodeState(node: MonitorNode): string {
  if (!node.online) return node.last_seen_ago === null ? '尚未上报' : `离线 ${durationShort(node.last_seen_ago)}`
  if (!node.metrics) return node.metrics_invalid ? '指标不可用' : '等待上报'
  return '在线'
}
function durationShort(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)} 秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时`
  return `${Math.floor(seconds / 86400)} 天`
}

export function filterNodes(nodes: MonitorNode[], search: string, sort: SortKey, offlineLast: boolean): MonitorNode[] {
  const needle = search.trim().toLocaleLowerCase()
  const value = (n: MonitorNode): number | null => {
    switch (sort) {
      case 'cpu': return n.metrics?.cpu ?? null
      case 'memory': return percentage(n.metrics?.mem_used, n.mem_total)
      case 'disk': return percentage(n.metrics?.disk_used, n.disk_total)
      case 'traffic': return n.month_used
      case 'upload': return n.metrics?.net_tx ?? null
      case 'download': return n.metrics?.net_rx ?? null
      default: return null
    }
  }
  return nodes.filter((n) => !needle || [n.name, n.country, regionName(n.country), n.os, n.group, n.public_remark].some((part) => part.toLocaleLowerCase().includes(needle)))
    .sort((a, b) => {
      if (offlineLast && a.online !== b.online) return a.online ? -1 : 1
      if (sort === 'default') return 0
      if (sort === 'name') return a.name.localeCompare(b.name, 'zh-CN', { numeric: true })
      const av = value(a), bv = value(b)
      if (av === null) return bv === null ? 0 : 1
      if (bv === null) return -1
      return bv - av
    })
}

export function summarize(nodes: MonitorNode[]) {
  const sum = (fn: (node: MonitorNode) => number) => nodes.reduce((total, node) => total + fn(node), 0)
  return {
    total: nodes.length, online: nodes.filter((n) => n.online).length,
    memUsed: sum((n) => n.metrics?.mem_used ?? 0), memTotal: sum((n) => n.mem_total),
    diskUsed: sum((n) => n.metrics?.disk_used ?? 0), diskTotal: sum((n) => n.disk_total),
    totalRx: sum((n) => n.total_rx), totalTx: sum((n) => n.total_tx),
    rx: sum((n) => n.metrics?.net_rx ?? 0), tx: sum((n) => n.metrics?.net_tx ?? 0),
    reporting: nodes.filter((n) => n.metrics !== null).length,
  }
}
