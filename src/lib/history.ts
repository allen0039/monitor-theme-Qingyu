import { api } from './api'
import { finite, record } from './data'
import { parsePing } from './ping'
import type { PingNetwork } from '../types'

export interface ResourcePoint {
  [key: string]: number | null
  ts: number
  cpu: number | null
  cpu_max: number | null
  mem_used: number | null
  disk_used: number | null
  net_rx: number | null
  net_tx: number | null
  net_rx_max: number | null
  net_tx_max: number | null
}
export interface HistoryResult { points: ResourcePoint[]; step: number }
export const num = (value: unknown): number | null => finite(value) ? value : null
export function parseHistory(value: unknown): HistoryResult {
  const data = record(value)
  const entries = Array.isArray(data.metrics) ? data.metrics : []
  const points = entries.flatMap((entry) => {
    const row = record(entry)
    if (!finite(row.ts)) return []
    return [{
      ts: row.ts, cpu: num(row.cpu), cpu_max: num(row.cpu_max),
      mem_used: num(row.mem_used), disk_used: num(row.disk_used),
      net_rx: num(row.net_rx), net_tx: num(row.net_tx),
      net_rx_max: num(row.net_rx_max), net_tx_max: num(row.net_tx_max),
    }]
  }).sort((a, b) => a.ts - b.ts)
  return { points, step: finite(data.step) && data.step > 0 ? data.step : 60 }
}
export function historyRanges(days?: number): { label: string; hours: number }[] {
  // An old hub not providing retention information must not advertise a 30-day archive.
  const limit = typeof days === 'number' && Number.isFinite(days) && days > 0 ? Math.floor(days * 24) : 6
  const standard = [{ label: '1 小时', hours: 1 }, { label: '6 小时', hours: 6 }, { label: '1 天', hours: 24 }, { label: '7 天', hours: 168 }, { label: '30 天', hours: 720 }]
  const selected = standard.filter((r) => r.hours <= Math.max(1, limit))
  if (limit > 6 && !selected.some((r) => r.hours === limit)) selected.push({ label: limit % 24 === 0 ? (limit / 24) + ' 天' : limit + ' 小时', hours: limit })
  return selected.length ? selected : [{ label: '1 小时', hours: 1 }]
}
export function pointBudget(hours: number): number { return Math.min(1440, Math.max(60, Math.ceil(hours * 12))) }

type Kind = 'metrics' | 'ping'
const cache = new Map<string, { value: HistoryResult | PingNetwork[]; time: number }>()
export async function fetchHistory(id: number, hours: number, kind: 'metrics', signal: AbortSignal): Promise<HistoryResult>
export async function fetchHistory(id: number, hours: number, kind: 'ping', signal: AbortSignal): Promise<PingNetwork[]>
export async function fetchHistory(id: number, hours: number, kind: Kind, signal: AbortSignal): Promise<HistoryResult | PingNetwork[]> {
  const key = [id, hours, kind].join(':')
  const hit = cache.get(key)
  if (hit && Date.now() - hit.time < 60_000) return hit.value
  const payload = await api<unknown>('/nodes/' + id + '/metrics?hours=' + hours + '&points=' + pointBudget(hours) + '&series=' + kind, signal)
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
  const value = kind === 'metrics' ? parseHistory(payload) : parsePing(payload)
  cache.set(key, { value, time: Date.now() })
  if (cache.size > 48) cache.delete(cache.keys().next().value!)
  return value
}
export function clearHistory() { cache.clear() }
