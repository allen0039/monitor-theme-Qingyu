import type { PingNetwork, PingRow } from '../types'

export interface PingBucket { start: number; end: number; latency: number | null; loss: number | null; timeout: boolean }
export function mean(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null
}
export function networkLatency(network: PingNetwork): number | null { return mean(network.rows.map(row => row.latency)) }
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
    return {
      start, end, latency: mean(samples.map(row => row.latency)),
      // Summary of returned buckets, not reconstructed window loss.
      loss: samples.length && samples.every(row => row.loss !== undefined) ? mean(samples.map(row => row.loss)) : null,
      timeout: samples.length > 0 && samples.every(row => row.latency === null),
    }
  })
}

export function pingTone(value: number | null | undefined, metric: 'latency' | 'loss'): string {
  if (value === null || value === undefined) return 'unknown'
  const thresholds = metric === 'latency' ? [60, 120, 180, 240] : [1, 3, 6, 9]
  const index = thresholds.findIndex(threshold => value <= threshold)
  return ['good', 'fair', 'moderate', 'slow', 'bad'][index < 0 ? 4 : index]!
}
export function latencyLabel(value: number | null, hasRows = true, compact = false): string {
  return value === null ? (hasRows ? '超时' : '—') : `${Math.round(value)}${compact ? '' : ' '}ms`
}
export function lossLabel(value: number | null): string { return value === null ? '—' : `${value.toFixed(value > 0 && value < 1 ? 2 : 1)}%` }
