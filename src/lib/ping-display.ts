import type { PingNetwork, PingRow } from '../types'

export interface PingBucket { start: number; end: number; latency: number | null; peak: number | null; loss: number | null; timeout: boolean; anyLoss?: boolean; maxLoss?: number | null }
export interface PingStats { avg: number | null; jitter: number | null; last: number | null; jitterEstimated: boolean }
export type PingHealthLevel = 'ok' | 'warn' | 'alert' | 'unknown'
export function mean(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null
}
export function networkLatency(network: PingNetwork): number | null { return mean(network.rows.map(row => row.latency)) }
export function networkStats(network: PingNetwork): PingStats {
  const rows = [...network.rows].sort((a, b) => a.ts - b.ts)
  const values = rows.map(row => row.latency)
  const deltas: number[] = []
  for (let i = 1; i < rows.length; i++) {
    const previous = rows[i - 1]!.latency, current = rows[i]!.latency
    if (previous !== null && current !== null && Number.isFinite(previous) && Number.isFinite(current)) deltas.push(Math.abs(current - previous))
  }
  const latest = rows.at(-1)?.latency ?? null
  return { avg: mean(values), jitter: mean(deltas), last: latest, jitterEstimated: true }
}
export function windowSummary(networks: PingNetwork[]): { latency: number | null; loss: number | null } {
  const complete = networks.length > 0 && networks.every(network => network.loss !== null)
  return { latency: mean(networks.map(networkLatency)), loss: complete ? mean(networks.map(network => network.loss)) : null }
}

export function historyBuckets(rows: PingRow[]): PingBucket[] {
  if (!rows.length) return []
  const sorted = [...rows].sort((a, b) => a.ts - b.ts)
  const first = sorted[0]!.ts, last = sorted.at(-1)!.ts
  const count = Math.min(10, new Set(sorted.map(row => row.ts)).size)
  const width = Math.max(1, (last - first + 1) / count)
  return Array.from({ length: count }, (_, index) => {
    const start = first + width * index, end = index === count - 1 ? last + 1 : start + width
    const samples = sorted.filter(row => row.ts >= start && row.ts < end)
    const validLatencies = samples.map(row => row.latency).filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    const knownLosses = samples.map(row => row.loss).filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    const hasTimeout = samples.some(row => row.latency === null)
    return {
      start, end, latency: mean(samples.map(row => row.latency)),
      peak: validLatencies.length ? Math.max(...validLatencies) : null,
      // Summary of returned buckets, not reconstructed window loss.
      loss: samples.length && samples.every(row => row.loss !== undefined) ? mean(samples.map(row => row.loss)) : null,
      timeout: samples.length > 0 && samples.every(row => row.latency === null),
      anyLoss: hasTimeout || knownLosses.some(value => value > 0),
      maxLoss: hasTimeout ? 100 : (knownLosses.length ? Math.max(...knownLosses) : null),
    }
  })
}

export function qualityBuckets(rows: PingRow[], max = 96): PingBucket[] {
  if (!rows.length) return []
  const sorted = [...rows].sort((a, b) => a.ts - b.ts)
  const timestamps = [...new Set(sorted.map(row => row.ts))]
  const count = Math.min(max, timestamps.length)
  const width = Math.max(1, (timestamps.at(-1)! - timestamps[0]! + 1) / count)
  return Array.from({ length: count }, (_, index) => {
    const start = timestamps[0]! + width * index, end = index === count - 1 ? timestamps.at(-1)! + 1 : start + width
    const samples = sorted.filter(row => row.ts >= start && row.ts < end)
    const values = samples.map(row => row.latency), valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    return { start, end, latency: mean(values), peak: valid.length ? Math.max(...valid) : null, loss: samples.length && samples.every(row => row.loss !== undefined) ? mean(samples.map(row => row.loss)) : null, timeout: samples.some(row => row.latency === null) }
  })
}

export function qualityTone(value: number | null | undefined): 'green' | 'yellow' | 'orange' | 'red' | 'unknown' {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'unknown'
  if (value <= 180) return 'green'
  if (value <= 220) return 'yellow'
  if (value <= 280) return 'orange'
  return 'red'
}

export function pingTone(value: number | null | undefined, metric: 'latency' | 'loss'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'unknown'
  if (metric === 'loss') {
    if (value <= 0) return 'good'
    if (value < 1) return 'moderate'
    if (value < 2) return 'slow'
    return 'bad'
  }
  const thresholds = [90, 180, 240, 300]
  const index = thresholds.findIndex(threshold => value <= threshold)
  return ['good', 'fair', 'moderate', 'slow', 'bad'][index < 0 ? 4 : index]!
}
export function shortProbeName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length > 3) {
    for (const suffix of ['电信', '联通', '移动', '教育网', '广电']) {
      if (trimmed.endsWith(suffix)) return suffix
    }
  }
  return trimmed
}
function inspectNetwork(network: PingNetwork) {
  const latency = networkLatency(network)
  const loss = network.loss
  const hasRows = network.rows.length > 0
  const hasTimeout = hasRows && network.rows.some(row => row.latency === null)
  const allTimeout = hasRows && latency === null
  const hasLossData = loss !== null && Number.isFinite(loss)
  if (!hasRows && !hasLossData) {
    return { level: 'unknown' as PingHealthLevel, reason: 'none' as const, latency, loss }
  }
  if ((hasLossData && loss >= 2) || allTimeout || (latency !== null && latency > 260)) {
    const reason = allTimeout ? 'timeout' : (hasLossData && loss >= 2) ? 'loss' : 'latency'
    return { level: 'alert' as PingHealthLevel, reason, latency, loss }
  }
  if (hasTimeout || (hasLossData && loss > 0) || (latency !== null && latency > 180)) {
    return { level: 'warn' as PingHealthLevel, reason: hasTimeout ? 'timeout' as const : 'warn' as const, latency, loss }
  }
  return { level: 'ok' as PingHealthLevel, reason: 'ok' as const, latency, loss }
}
export function networkTone(network: PingNetwork): PingHealthLevel {
  return inspectNetwork(network).level
}
export function pingHealth(networks: PingNetwork[]): { level: PingHealthLevel; label: string } {
  if (!networks.length) return { level: 'unknown', label: '等待采样' }
  const inspected = networks.map(network => ({ network, ...inspectNetwork(network) }))
  const alerts = inspected.filter(item => item.level === 'alert')
  if (alerts.length) {
    const rank = (reason: string) => reason === 'timeout' ? 3 : reason === 'loss' ? 2 : 1
    const worst = alerts.sort((a, b) => {
      if (rank(b.reason) !== rank(a.reason)) return rank(b.reason) - rank(a.reason)
      if (b.reason === 'loss' && a.reason === 'loss') return (b.loss ?? 0) - (a.loss ?? 0)
      return (b.latency ?? 0) - (a.latency ?? 0)
    })[0]!
    const short = shortProbeName(worst.network.name)
    if (worst.reason === 'timeout') return { level: 'alert', label: `${short}超时` }
    if (worst.reason === 'loss') return { level: 'alert', label: `${short}丢包 ${lossLabel(worst.loss)}` }
    return { level: 'alert', label: `${short}高延迟` }
  }
  if (inspected.some(item => item.level === 'warn')) return { level: 'warn', label: '轻度波动' }
  if (inspected.some(item => item.level === 'ok')) return { level: 'ok', label: '网络稳定' }
  return { level: 'unknown', label: '等待采样' }
}
export function latencyLabel(value: number | null, hasRows = true, compact = false): string {
  return value === null ? (hasRows ? '超时' : '—') : `${Math.round(value)}${compact ? '' : ' '}ms`
}
export function lossLabel(value: number | null): string { return value === null ? '—' : `${value.toFixed(value > 0 && value < 1 ? 2 : 1)}%` }
