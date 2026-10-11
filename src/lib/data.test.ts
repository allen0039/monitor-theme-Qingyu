import { describe, expect, it } from 'vitest'
import { filterNodes, groupsOf, inGroup, monthlyUsed, nodeState, normalizeNodes, summarize } from './data'
import { expiryLabel, percentage, priceLabel, safeUrl } from './format'
import { defaultConfig, parseConfig } from './config'
import { parsePing } from './ping'

export const metrics = { cpu: 16, load: [0.2, 0.1, 0.1], mem_total: 1024, mem_used: 512, disk_total: 4096, disk_used: 1024, net_rx: 400, net_tx: 200, uptime: 3600 }
const sample = (id: number, extra: Record<string, unknown> = {}) => ({ id, name: `节点 ${id}`, online: true, metrics, mem_total: 1024, disk_total: 4096, group: '', country: 'JP', ...extra })

describe('Monitor 节点数据', () => {
  it('离线、刚连上和坏指标保持不同状态，不将缺失指标当作零', () => {
    const nodes = normalizeNodes([sample(1, { online: false, last_seen_ago: 18000 }), sample(2, { metrics: null }), sample(3, { metrics: { ...metrics, cpu: '16' } }), sample(4)])
    expect(nodes.map((n) => n.metrics?.cpu ?? null)).toEqual([null, null, null, 16])
    expect(nodes.map(nodeState)).toEqual(['离线 5 小时', '等待上报', '指标不可用', '在线'])
  })
  it('拒绝坏列表、跳过坏 ID，隔离坏节点', () => {
    expect(() => normalizeNodes({})).toThrow()
    expect(normalizeNodes([null, sample(1), sample(1), { id: '2' }, sample(3, { name: {}, public_remark: {} })]).map((n) => n.id)).toEqual([1, 3])
  })
  it('尊重 hub 的到期天数和离线时长，null 不能回退到浏览器时钟', () => {
    const [node] = normalizeNodes([sample(1, { expires_at: '2000-01-01', expires_in: null, last_seen: 1, last_seen_ago: null })])
    expect(node.expires_in).toBeNull()
    expect(node.last_seen_ago).toBeNull()
    expect(expiryLabel(-3)).toBe('已过期 3 天')
    expect(expiryLabel(0)).toBe('今天到期')
  })
  it('使用实时容量，汇总只计在线指标但保留离线库存和累计流量', () => {
    const nodes = normalizeNodes([sample(1, { mem_total: 999, total_rx: 100 }), sample(2, { online: false, total_tx: 50 })])
    expect(nodes[0].mem_total).toBe(1024)
    expect(summarize(nodes)).toMatchObject({ total: 2, online: 1, memUsed: 512, memTotal: 2048, rx: 400, tx: 200, totalRx: 100, totalTx: 50 })
  })
  it('分组按 hub 顺序，任意名称都不会撞到全部或未分组', () => {
    const nodes = normalizeNodes([sample(1, { group: '全部' }), sample(2, { group: '*' }), sample(3), sample(4, { group: '未分组' })])
    expect(groupsOf(nodes)).toEqual(['全部', '*', '未分组'])
    expect(inGroup(nodes, null)).toHaveLength(4)
    expect(inGroup(nodes, '全部').map((n) => n.id)).toEqual([1])
    expect(inGroup(nodes, '').map((n) => n.id)).toEqual([3])
    expect(summarize(inGroup(nodes, '*')).total).toBe(1)
  })
  it('优先使用 hub 计算的本期流量，旧版按计费方向计算', () => {
    expect(monthlyUsed({ month_used: 0, month_rx: 100, month_tx: 200 })).toBe(0)
    expect(monthlyUsed({ month_rx: 100, month_tx: 200, traffic_mode: 'max' })).toBe(200)
    expect(monthlyUsed({ month_rx: 100, month_tx: 200, traffic_mode: 'up' })).toBe(200)
    expect(monthlyUsed({ month_rx: 100, month_tx: 200, traffic_mode: 'down' })).toBe(100)
    expect(percentage(0, 0)).toBeNull()
  })
  it('搜索包含国家名称和公开备注，降序排序把未知指标放在末尾', () => {
    const nodes = normalizeNodes([sample(1, { online: false }), sample(2, { public_remark: '晚高峰直连' }), sample(3, { metrics: { ...metrics, cpu: 90 } })])
    expect(filterNodes(nodes, '日本', 'default', false)).toHaveLength(3)
    expect(filterNodes(nodes, '晚高峰', 'default', false).map((n) => n.id)).toEqual([2])
    expect(filterNodes(nodes, '', 'cpu', true).map((n) => n.id)).toEqual([3, 2, 1])
  })
})
describe('设置与展示', () => {
  it('只接受配置声明允许的值，缺失项由 manifest 补齐', () => {
    expect(parseConfig({ earth_mode: 'invalid', background_blur: -1, show_ping: 'yes', notice: '<script>x</script>' })).toEqual({ ...defaultConfig(), notice: '<script>x</script>' })
    expect(parseConfig({ show_ping: false }).show_ping).toBe(false)
  })
  it('金额区分币种，支持自定义月份并容忍旧 hub 的无效货币', () => {
    expect(priceLabel(20, 'USD', '60m')).toContain('60 个月')
    expect(priceLabel(20, 'USD', 'monthly')).toContain('US$')
    expect(priceLabel(20, 'bad-code', 'yearly')).toBe('bad-code 20.00 / 年')
    expect(priceLabel(null, 'CNY', 'monthly')).toBe('未设置')
  })
  it('背景和页脚链接只接受 http/https', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('')
    expect(safeUrl('data:text/html,test')).toBe('')
    expect(safeUrl('https://example.com/image.jpg')).toBe('https://example.com/image.jpg')
  })
})
describe('官方延迟协议', () => {
  it('保留监控顺序，超时不能展示为 0 ms，丢包读取窗口字段', () => {
    const parsed = parsePing({ probes: { 1: '电信', 2: '联通' }, ping: [
      { task_id: 2, ts: 60, latency: 40 }, { task_id: 2, ts: 120, latency: null, loss: 100 }, { task_id: 1, ts: 60, latency: 10 },
    ], loss: { 2: 50 } })
    expect(parsed.map((n) => n.id)).toEqual([2, 1])
    expect(parsed[0].latest?.latency).toBeNull()
    expect(parsed[0].loss).toBe(50)
    expect(parsed[1].loss).toBe(0)
  })
  it('无历史数据不编造丢包；旧协议缺少窗口丢包时显示未知', () => {
    expect(parsePing({ probes: { 1: '电信' }, ping: [], loss: {} })[0]).toMatchObject({ latest: null, loss: null })
    expect(parsePing({ probes: { 1: '电信' }, ping: [{ task_id: 1, ts: 60, latency: 20 }] })[0].loss).toBeNull()
  })
})
