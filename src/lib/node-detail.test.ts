import { describe, expect, it } from 'vitest'
import { parseHistory, historyRanges, pointBudget } from './history'
import { nodeFromHash, nodeHref } from './navigation'
import { normalizeNodes, mergeNodes } from './data'
const metrics = { cpu: 0, load: [0, 0, 0], mem_total: 1024, mem_used: 0, disk_total: 2048, disk_used: 0, net_rx: 0, net_tx: 0, uptime: 0 }

describe('节点详情导航', () => {
  it('只接受安全的数值节点 hash，直达可重读', () => {
    expect(nodeHref(12)).toBe('#/node/12')
    expect(nodeFromHash('#/node/12')).toBe(12)
    for (const hash of ['#/', '#/node/0', '#/node/-1', '#/node/1abc', '#/node/9007199254740999', '#/node/1/edit']) expect(nodeFromHash(hash)).toBeNull()
  })
})
describe('资源历史', () => {
  it('缺失、负值及非数字不补零，保留合法零值，按时间排序', () => {
    const result = parseHistory({ step: 300, metrics: [
      { ts: 600, cpu: null, mem_used: -1, net_rx: '3' },
      { ts: 300, cpu: 0, net_rx: 0, disk_used: 2, net_tx_max: 20 },
      { ts: '900', cpu: 23 },
    ] })
    expect(result.step).toBe(300)
    expect(result.points.map(p => p.ts)).toEqual([300, 600])
    expect(result.points[0]).toMatchObject({ cpu: 0, net_rx: 0, net_tx_max: 20 })
    expect(result.points[1]).toMatchObject({ cpu: null, mem_used: null, net_rx: null })
  })
  it('保留期裁剪档位，旧 hub 无 30 天选项，采样限制在 60–1440', () => {
    expect(historyRanges().map(r => r.hours)).toEqual([1, 6])
    expect(historyRanges(1).map(r => r.hours)).toEqual([1, 6, 24])
    expect(historyRanges(10).map(r => r.hours)).toEqual([1, 6, 24, 168, 240])
    expect(pointBudget(1)).toBe(60)
    expect(pointBudget(720)).toBe(1440)
  })
})
describe('节点附加资料', () => {
  it('缺可选字段不影响有效主指标；详情字段在 WS 合并后保持新值', () => {
    const raw = { id: 5, online: true, metrics: { ...metrics, swap_total: 0, swap_used: 0, tcp: 0, udp: 10, procs: null }, kernel: '6.12', agent_version: '1.2', ipv4: '10.0.0.2' }
    const current = normalizeNodes([raw])
    expect(current[0]!.metrics).toMatchObject({ cpu: 0, swap_total: 0, tcp: 0, udp: 10, procs: null })
    expect(current[0]!.kernel).toBe('6.12')
    const next = normalizeNodes([{ ...raw, kernel: '6.13', metrics: { ...metrics, tcp: 7 } }])
    mergeNodes(current, next)
    expect(current[0]!.kernel).toBe('6.13')
    expect(current[0]!.metrics?.tcp).toBe(7)
    expect(current[0]!.metrics?.swap_total).toBeNull()
  })
})
