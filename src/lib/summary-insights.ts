import type { MonitorNode } from '../types'
import { nodeState } from './data'
import { billingPeriod, CURRENCY_CONFIG, convertFinanceAmount, resolveFinanceCurrency, type ExchangeRates } from './finance'
import { percentage } from './format'

export type StatusPillTone = 'is-ok' | 'is-warn' | 'is-expiring' | 'is-danger' | 'is-offline'

export interface StatusOfflineItem {
  node: MonitorNode
  label: string
}

export interface StatusAlertItem {
  node: MonitorNode
  reasons: string[]
  severity: number
}

export interface StatusExpiryItem {
  node: MonitorNode
  days: number
  expired: boolean
  label: string
}

export interface StatusSummary {
  offline: StatusOfflineItem[]
  alerts: StatusAlertItem[]
  expiring: StatusExpiryItem[]
  expiredCount: number
  expiringOnlyCount: number
  issueCount: number
  totalCores: number
  totalMem: number
}

export interface UpcomingRenewalItem {
  node: MonitorNode
  days: number
  convertedPrice: number | null
  label: string
}

export interface UpcomingRenewalSummary {
  items: UpcomingRenewalItem[]
  count: number
  total: number | null
  missingRateCount: number
  expiredCount: number
}

export interface RealtimeRankItem {
  node: MonitorNode
  tx: number
  rx: number
  total: number
  value: number
  ratio: number
}

export interface TrafficRankItem {
  node: MonitorNode
  tx: number
  rx: number
  value: number
  limit: number
  pct: number | null
  resetDay: number | null
  ratio: number
}

export interface TrafficRankSummary {
  items: TrafficRankItem[]
  hasQuota: boolean
  hasDaily: boolean
  highQuotaCount: number
}

/** Return resource alert reasons for an online node (CPU >= 80%, Mem/Disk >= 85%, or missing metrics). */
export function getNodeAlertReasons(node: MonitorNode): string[] {
  if (!node.online) return []
  if (!node.metrics) return [node.metrics_invalid ? '指标不可用' : '等待上报']
  const reasons: string[] = []
  if (node.metrics.cpu >= 80) reasons.push(`CPU ${Math.round(node.metrics.cpu)}%`)
  const memPct = percentage(node.metrics.mem_used, node.mem_total) ?? 0
  if (memPct >= 85) reasons.push(`内存 ${Math.round(memPct)}%`)
  const diskPct = percentage(node.metrics.disk_used, node.disk_total) ?? 0
  if (diskPct >= 85) reasons.push(`硬盘 ${Math.round(diskPct)}%`)
  return reasons
}

function alertSeverity(node: MonitorNode): number {
  if (!node.metrics) return 0
  const memPct = percentage(node.metrics.mem_used, node.mem_total) ?? 0
  const diskPct = percentage(node.metrics.disk_used, node.disk_total) ?? 0
  return Math.max(node.metrics.cpu, memPct, diskPct)
}

/** Determine the status-pill tone for a single node on the overview bar. */
export function nodeStatusPillTone(node: MonitorNode, expiryWarningDays: number): StatusPillTone {
  if (!node.online) return 'is-offline'
  if (getNodeAlertReasons(node).length > 0) return 'is-warn'
  if (node.expires_in !== null && node.expires_in <= 0) return 'is-danger'
  if (node.expires_in !== null && node.expires_in <= expiryWarningDays) return 'is-expiring'
  return 'is-ok'
}

/** Summarize offline, resource-alert, expiring/expired nodes and aggregate capacity. */
export function summarizeNodeStatus(nodes: MonitorNode[], expiryWarningDays: number): StatusSummary {
  const offline: StatusOfflineItem[] = []
  const alerts: StatusAlertItem[] = []
  const expiring: StatusExpiryItem[] = []
  let totalCores = 0
  let totalMem = 0
  let expiredCount = 0
  let expiringOnlyCount = 0

  for (const node of nodes) {
    totalCores += node.cpu_cores || 0
    totalMem += node.mem_total || 0

    if (!node.online) {
      offline.push({ node, label: nodeState(node) })
    } else {
      const reasons = getNodeAlertReasons(node)
      if (reasons.length) {
        alerts.push({ node, reasons, severity: alertSeverity(node) })
      }
    }

    if (node.expires_in !== null && node.expires_in <= expiryWarningDays) {
      const days = node.expires_in
      const expired = days <= 0
      if (expired) expiredCount++
      else expiringOnlyCount++
      const label = days < 0 ? `已过期 ${Math.abs(days)} 天` : days === 0 ? '今天到期' : `剩 ${days} 天`
      expiring.push({ node, days, expired, label })
    }
  }

  offline.sort((a, b) => (b.node.last_seen_ago ?? -1) - (a.node.last_seen_ago ?? -1) || a.node.id - b.node.id)
  alerts.sort((a, b) => b.severity - a.severity || a.node.id - b.node.id)
  expiring.sort((a, b) => a.days - b.days || a.node.id - b.node.id)

  return {
    offline,
    alerts,
    expiring,
    expiredCount,
    expiringOnlyCount,
    issueCount: offline.length + alerts.length + expiring.length,
    totalCores,
    totalMem,
  }
}

/** Summarize recurring nodes expiring within `windowDays` and convert their renewal prices. */
export function summarizeUpcomingRenewals(
  nodes: MonitorNode[],
  currency: string,
  rates: ExchangeRates,
  windowDays = 30,
): UpcomingRenewalSummary {
  const items: UpcomingRenewalItem[] = []
  let expiredCount = 0
  let missingRateCount = 0
  let convertedSum = 0
  let convertedCount = 0

  for (const node of nodes) {
    if (node.expires_in !== null && node.expires_in < 0) expiredCount++
    if (node.expires_in === null || node.expires_in < 0 || node.expires_in > windowDays) continue
    if (node.price === null || !Number.isFinite(node.price) || node.price <= 0) continue
    if (!billingPeriod(node.billing_cycle)) continue

    const convertedPrice = convertFinanceAmount(node.price, node.currency, currency, rates)
    if (convertedPrice === null) {
      missingRateCount++
    } else {
      convertedSum += convertedPrice
      convertedCount++
    }

    const days = node.expires_in
    const label = days === 0 ? '今天到期' : `剩 ${days} 天`
    items.push({ node, days, convertedPrice, label })
  }

  items.sort((a, b) => a.days - b.days || a.node.id - b.node.id)

  return {
    items,
    count: items.length,
    total: convertedCount > 0 ? convertedSum : null,
    missingRateCount,
    expiredCount,
  }
}

/** Format a compact renewal amount for the remaining-value card pill (e.g. ¥168, $24.5). */
export function formatCompactRenewalAmount(value: number | null, currency: string): string {
  if (value === null || !Number.isFinite(value)) return ''
  const code = resolveFinanceCurrency(currency) ?? 'CNY'
  const symbol = CURRENCY_CONFIG[code][1]
  const abs = Math.abs(value)
  if (abs >= 10000) {
    const formatted = new Intl.NumberFormat('zh-CN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
      notation: 'compact',
    }).format(value)
    return `${symbol}${formatted}`
  }
  const formatted = abs >= 100
    ? new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(Math.round(value))
    : String(Number(value.toFixed(1)))
  return `${symbol}${formatted}`
}

/** Rank reporting online nodes by real-time throughput (`total`, `up`, or `down`). */
export function rankRealtimeNodes(
  nodes: MonitorNode[],
  mode: 'total' | 'up' | 'down',
  limit = 5,
): RealtimeRankItem[] {
  const candidates = nodes
    .filter((node) => node.online && node.metrics !== null)
    .map((node) => {
      const tx = node.metrics!.net_tx
      const rx = node.metrics!.net_rx
      const total = tx + rx
      const value = mode === 'up' ? tx : mode === 'down' ? rx : total
      return { node, tx, rx, total, value, ratio: 0 }
    })
    .sort((a, b) => b.value - a.value || b.total - a.total || a.node.id - b.node.id)
    .slice(0, limit)

  const maxValue = candidates[0]?.value ?? 0
  return candidates.map((item) => ({
    ...item,
    ratio: maxValue > 0 ? Math.max(4, Math.min(100, (item.value / maxValue) * 100)) : 0,
  }))
}

/** Rank nodes by traffic quota utilization, monthly traffic, or daily traffic. */
export function rankTrafficNodes(
  nodes: MonitorNode[],
  mode: 'quota' | 'month' | 'day',
  limit = 5,
): TrafficRankSummary {
  const hasQuota = nodes.some((node) => node.traffic_limit > 0)
  const hasDaily = nodes.some((node) => node.day_tx !== null && node.day_rx !== null)
  let highQuotaCount = 0

  const entries = nodes.map((node) => {
    const limitBytes = node.traffic_limit
    const pct = limitBytes > 0 ? (node.month_used / limitBytes) * 100 : null
    if (pct !== null && pct >= 80) highQuotaCount++

    if (mode === 'quota') {
      return {
        node,
        tx: node.month_tx,
        rx: node.month_rx,
        value: pct ?? -1,
        limit: limitBytes,
        pct,
        resetDay: node.traffic_reset_day ?? null,
        ratio: pct !== null ? Math.min(100, Math.max(0, pct)) : 0,
      }
    }

    if (mode === 'day') {
      const tx = node.day_tx ?? 0
      const rx = node.day_rx ?? 0
      const hasNodeDaily = node.day_tx !== null && node.day_rx !== null
      return {
        node,
        tx,
        rx,
        value: hasNodeDaily ? tx + rx : -1,
        limit: limitBytes,
        pct,
        resetDay: node.traffic_reset_day ?? null,
        ratio: 0,
      }
    }

    return {
      node,
      tx: node.month_tx,
      rx: node.month_rx,
      value: node.month_tx + node.month_rx,
      limit: limitBytes,
      pct,
      resetDay: node.traffic_reset_day ?? null,
      ratio: 0,
    }
  })

  const filtered = mode === 'quota'
    ? entries.filter((item) => item.limit > 0)
    : mode === 'day'
      ? entries.filter((item) => item.value >= 0)
      : entries

  const sorted = filtered
    .sort((a, b) => b.value - a.value || (b.tx + b.rx) - (a.tx + a.rx) || a.node.id - b.node.id)
    .slice(0, limit)

  const maxValue = sorted[0]?.value ?? 0
  const items = mode === 'quota'
    ? sorted
    : sorted.map((item) => ({
        ...item,
        ratio: maxValue > 0 ? Math.max(4, Math.min(100, (item.value / maxValue) * 100)) : 0,
      }))

  return { items, hasQuota, hasDaily, highQuotaCount }
}
