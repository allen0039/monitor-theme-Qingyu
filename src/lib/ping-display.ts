import type { PingNetwork, PingRow } from '../types'

export type LatencyTone = 'green' | 'yellow' | 'orange' | 'red' | 'unknown'
export type BucketLatencyState = 'empty' | 'timeout' | 'partial-timeout' | 'ok'

export interface LatencyTierInfo {
  tone: LatencyTone
  rank: number
  label: string
  range: string
}

export const LATENCY_TIERS: readonly LatencyTierInfo[] = [
  { tone: 'green', rank: 0, label: '低延迟', range: '0–90 ms' },
  { tone: 'yellow', rank: 1, label: '延迟偏高', range: '91–180 ms' },
  { tone: 'orange', rank: 2, label: '高延迟', range: '181–260 ms' },
  { tone: 'red', rank: 3, label: '很高延迟/超时', range: '≥261 ms' },
  { tone: 'unknown', rank: -1, label: '暂无采样', range: '—' },
]

export const LATENCY_LEGEND_TEXT = '延迟分档：绿 0–90 ms（低延迟）· 黄 91–180 ms（延迟偏高）· 橙 181–260 ms（高延迟）· 红 ≥261 ms 或超时 · 灰 无有效采样'

export interface PingBucket {
  start: number
  end: number
  latency: number | null
  peak: number | null
  loss: number | null
  timeout: boolean
  hasTimeout?: boolean
  sampleCount?: number
  successCount?: number
  timeoutCount?: number
  anyLoss?: boolean
  maxLoss?: number | null
}

export interface PingStats {
  avg: number | null
  jitter: number | null
  last: number | null
  jitterEstimated: boolean
  hasSamples: boolean
  allTimeout: boolean
  lastTimeout: boolean
}

export type PingHealthLevel = 'ok' | 'warn' | 'alert' | 'unknown'

export function mean(values: (number | null | undefined)[]): number | null {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null
}

export function roundLatency(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null
}

export function latencyTier(value: number | null | undefined, timeout = false): LatencyTierInfo {
  const rounded = roundLatency(value)
  if (rounded === null) {
    return timeout
      ? { tone: 'red', rank: 3, label: '超时', range: '超时' }
      : { tone: 'unknown', rank: -1, label: '暂无采样', range: '暂无有效采样' }
  }
  if (rounded <= 90) return { tone: 'green', rank: 0, label: '低延迟', range: '0–90 ms' }
  if (rounded <= 180) return { tone: 'yellow', rank: 1, label: '延迟偏高', range: '91–180 ms' }
  if (rounded <= 260) return { tone: 'orange', rank: 2, label: '高延迟', range: '181–260 ms' }
  return { tone: 'red', rank: 3, label: '很高延迟', range: '261 ms 及以上' }
}

export function latencyTone(value: number | null | undefined, timeout = false): LatencyTone {
  return latencyTier(value, timeout).tone
}

export function latencyTierRank(value: number | null | undefined, timeout = false): number {
  return latencyTier(value, timeout).rank
}

export function networkLatency(network: PingNetwork): number | null {
  return mean(network.rows.map(row => row.latency))
}

export function networkStats(network: PingNetwork): PingStats {
  const rows = [...network.rows].sort((a, b) => a.ts - b.ts)
  const values = rows.map(row => row.latency)
  const avg = mean(values)
  const deltas: number[] = []
  for (let i = 1; i < rows.length; i++) {
    const previous = rows[i - 1]!.latency, current = rows[i]!.latency
    if (previous !== null && current !== null && Number.isFinite(previous) && Number.isFinite(current)) deltas.push(Math.abs(current - previous))
  }
  const latestRow = rows.at(-1) ?? network.latest
  const last = latestRow?.latency ?? null
  const hasSamples = rows.length > 0
  const allTimeout = hasSamples && avg === null && rows.some(row => row.latency === null)
  const lastTimeout = latestRow !== null && last === null
  return { avg, jitter: mean(deltas), last, jitterEstimated: true, hasSamples, allTimeout, lastTimeout }
}

export function windowSummary(networks: PingNetwork[]): { latency: number | null; loss: number | null } {
  const complete = networks.length > 0 && networks.every(network => network.loss !== null)
  return { latency: mean(networks.map(networkLatency)), loss: complete ? mean(networks.map(network => network.loss)) : null }
}

function buildBucket(start: number, end: number, samples: PingRow[]): PingBucket {
  const samplePeaks = samples.flatMap(({ latency, band }) => {
    if (latency === null || !Number.isFinite(latency)) return []
    const upper = band?.[1]
    return [upper !== undefined && Number.isFinite(upper) ? Math.max(latency, upper) : latency]
  })
  const knownLosses = samples.map(row => row.loss).filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const timeoutCount = samples.filter(row => row.latency === null).length
  const hasTimeout = timeoutCount > 0
  const allTimeout = samples.length > 0 && samplePeaks.length === 0 && hasTimeout
  return {
    start,
    end,
    latency: mean(samples.map(row => row.latency)),
    peak: samplePeaks.length ? Math.max(...samplePeaks) : null,
    // Summary of returned buckets, not reconstructed window loss.
    loss: samples.length && samples.every(row => row.loss !== undefined) ? mean(samples.map(row => row.loss)) : null,
    timeout: allTimeout,
    hasTimeout,
    sampleCount: samples.length,
    successCount: samplePeaks.length,
    timeoutCount,
    anyLoss: hasTimeout || knownLosses.some(value => value > 0),
    maxLoss: hasTimeout ? 100 : (knownLosses.length ? Math.max(...knownLosses) : null),
  }
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
    return buildBucket(start, end, samples)
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
    return buildBucket(start, end, samples)
  })
}

export function bucketHasSamples(bucket: PingBucket): boolean {
  if (typeof bucket.sampleCount === 'number') return bucket.sampleCount > 0
  return bucket.latency !== null
    || bucket.peak !== null
    || bucket.timeout
    || Boolean(bucket.hasTimeout)
    || bucket.loss !== null
    || (bucket.maxLoss !== undefined && bucket.maxLoss !== null)
}

export function bucketAllTimeout(bucket: PingBucket): boolean {
  if (!bucketHasSamples(bucket)) return false
  if (typeof bucket.successCount === 'number' && typeof bucket.timeoutCount === 'number') {
    return bucket.successCount === 0 && bucket.timeoutCount > 0
  }
  return bucket.timeout && bucket.latency === null
}

export function bucketHasTimeout(bucket: PingBucket): boolean {
  if (typeof bucket.hasTimeout === 'boolean') return bucket.hasTimeout
  if (typeof bucket.timeoutCount === 'number') return bucket.timeoutCount > 0
  return bucket.timeout
}

export function bucketLatencyState(bucket: PingBucket): BucketLatencyState {
  if (!bucketHasSamples(bucket)) return 'empty'
  if (bucketAllTimeout(bucket)) return 'timeout'
  if (bucketHasTimeout(bucket)) return 'partial-timeout'
  if (bucket.latency === null) return 'empty'
  return 'ok'
}

export function bucketLatencyTone(bucket: PingBucket): LatencyTone {
  const state = bucketLatencyState(bucket)
  if (state === 'empty') return 'unknown'
  if (state === 'timeout') return 'red'
  return latencyTone(bucket.latency)
}

export function bucketPeakElevated(bucket: PingBucket): boolean {
  return bucket.latency !== null && bucket.peak !== null && latencyTierRank(bucket.peak) > latencyTierRank(bucket.latency)
}

export function qualityTone(value: number | null | undefined, timeout = false): LatencyTone {
  return latencyTone(value, timeout)
}

export function pingTone(value: number | null | undefined, metric: 'latency' | 'loss'): string {
  if (metric === 'loss') {
    if (value === null || value === undefined || !Number.isFinite(value)) return 'unknown'
    if (value <= 0) return 'good'
    if (value < 1) return 'moderate'
    if (value < 2) return 'slow'
    return 'bad'
  }
  return latencyTone(value)
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
  const roundedLatency = roundLatency(latency)
  const loss = network.loss
  const hasRows = network.rows.length > 0
  const hasTimeout = hasRows && network.rows.some(row => row.latency === null)
  const allTimeout = hasRows && latency === null
  const hasLossData = loss !== null && Number.isFinite(loss)
  if (!hasRows && !hasLossData) {
    return { level: 'unknown' as PingHealthLevel, reason: 'none' as const, latency, loss }
  }
  if ((hasLossData && loss >= 2) || allTimeout || (roundedLatency !== null && roundedLatency > 260)) {
    const reason = allTimeout ? 'timeout' : (hasLossData && loss >= 2) ? 'loss' : 'latency'
    return { level: 'alert' as PingHealthLevel, reason, latency, loss }
  }
  if (hasTimeout || (hasLossData && loss > 0) || (roundedLatency !== null && roundedLatency > 180)) {
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

export function latencyLabel(value: number | null | undefined, hasRows = true, compact = false): string {
  const rounded = roundLatency(value)
  return rounded === null ? (hasRows ? '超时' : '—') : `${rounded}${compact ? '' : ' '}ms`
}

export function lossLabel(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(value > 0 && value < 1 ? 2 : 1)}%`
}

export function lossDetailLabel(loss: number | null, hasSamples: boolean): string {
  if (loss !== null) return lossLabel(loss)
  return hasSamples ? '未知（未提供）' : '未知（缺测）'
}

function formatBucketRange(bucket: PingBucket): string {
  const formatTime = (ts: number) => new Date(ts * 1000).toLocaleTimeString('zh-CN')
  return `${formatTime(bucket.start)}–${formatTime(bucket.end)}`
}

export function formatHistoryBucketTooltip(bucket: PingBucket, metric: 'latency' | 'loss', scope?: string): string {
  const range = formatBucketRange(bucket)
  const prefix = scope ? `${range} · ${scope}` : range
  if (metric === 'loss') {
    if (!bucketHasSamples(bucket)) {
      return `${prefix}\n无采样（缺测） · 丢包 未知（缺测）`
    }
    if (bucketAllTimeout(bucket)) {
      return `${prefix}\n最高丢包 100.0%（全部超时）`
    }
    const lossValue = bucket.maxLoss ?? bucket.loss
    const lossText = lossValue === null
      ? '最高丢包 未知（未提供）'
      : `最高丢包 ${lossLabel(lossValue)}${bucketHasTimeout(bucket) ? '（含超时）' : ''}`
    return `${prefix}\n${lossText}`
  }

  const state = bucketLatencyState(bucket)
  if (state === 'empty') {
    return `${prefix}\n无采样（缺测）`
  }
  if (state === 'timeout') {
    const countText = typeof bucket.sampleCount === 'number' ? `（${bucket.timeoutCount ?? bucket.sampleCount}/${bucket.sampleCount}）` : ''
    return `${prefix}\n超时${countText}`
  }
  const tier = latencyTier(bucket.latency)
  const peakText = bucket.peak !== null ? `峰值 ${latencyLabel(bucket.peak, false)}` : '峰值 —'
  if (state === 'partial-timeout') {
    const countText = typeof bucket.timeoutCount === 'number' && typeof bucket.sampleCount === 'number'
      ? `（${bucket.timeoutCount}/${bucket.sampleCount}）`
      : ''
    return `${prefix}\n平均 ${latencyLabel(bucket.latency, false)}（${tier.label}） · ${peakText} · 含超时${countText}`
  }
  return `${prefix}\n平均 ${latencyLabel(bucket.latency, false)}（${tier.label}） · ${peakText}`
}

export function formatQualityBucketTooltip(bucket: PingBucket, networkName?: string): string {
  const range = formatBucketRange(bucket)
  const prefix = networkName ? `${range} · ${networkName}` : range
  const state = bucketLatencyState(bucket)
  if (state === 'empty') {
    return `${prefix}\n平均：—（无采样/缺测） · 峰值：—\n丢包：未知（缺测） · 超时：无采样（缺测）`
  }
  if (state === 'timeout') {
    const countText = typeof bucket.sampleCount === 'number' ? `（${bucket.timeoutCount ?? bucket.sampleCount}/${bucket.sampleCount}）` : ''
    return `${prefix}\n平均：超时${countText} · 峰值：—\n丢包：${lossDetailLabel(bucket.loss, true)} · 超时：全部超时`
  }
  const avgTier = latencyTier(bucket.latency)
  const peakText = bucket.peak !== null
    ? `${latencyLabel(bucket.peak, false)}（${latencyTier(bucket.peak).label}${bucketPeakElevated(bucket) ? '，高于均值档' : ''}）`
    : '—'
  const timeoutText = state === 'partial-timeout'
    ? (typeof bucket.timeoutCount === 'number' && typeof bucket.sampleCount === 'number' ? `有超时（${bucket.timeoutCount}/${bucket.sampleCount}）` : '有超时')
    : '无'
  return `${prefix}\n平均：${latencyLabel(bucket.latency, false)}（${avgTier.label}） · 峰值：${peakText}\n丢包：${lossDetailLabel(bucket.loss, true)} · 超时：${timeoutText}`
}
