import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { parsePing } from './ping'
import { historyBuckets, latencyLabel, networkLatency, networkStats, networkTone, pingHealth, pingTone, qualityBuckets, shortProbeName, windowSummary } from './ping-display'
import { cardBytes, cardExpiry, cardPrice, remarkParts } from './format'
import PingHistoryBars from '../components/PingHistoryBars.vue'

describe('原版式网络摘要', () => {
  it('使用线路平均值再取平均，不让高频线路压过其他线路', () => {
    const networks = parsePing({ ping: [{ task_id: 1, ts: 0, latency: 20 }, { task_id: 1, ts: 60, latency: 40 }, { task_id: 2, ts: 0, latency: 90 }], loss: {} })
    expect(networkLatency(networks[0]!)).toBe(30)
    expect(windowSummary(networks)).toEqual({ latency: 60, loss: 0 })
  })
  it('整段丢包取主控窗口值，不拿逐桶丢包平均数代替', () => {
    const networks = parsePing({ ping: [{ task_id: 1, ts: 0, latency: 20 }, { task_id: 1, ts: 60, latency: null, loss: 100 }], loss: { 1: 100 / 13 } })
    expect(windowSummary(networks).loss).toBeCloseTo(100 / 13)
    expect(historyBuckets(networks[0]!.rows).map(bucket => bucket.loss)).toEqual([0, 100])
  })
  it('现代零丢包省略字段可用，旧协议未知不能显示成 0%', () => {
    const row = { task_id: 1, ts: 60, latency: 20 }
    expect(historyBuckets(parsePing({ ping: [row], loss: {} })[0]!.rows)[0]?.loss).toBe(0)
    const old = parsePing({ ping: [row] })
    expect(windowSummary(old).loss).toBeNull()
    expect(historyBuckets(old[0]!.rows)[0]?.loss).toBeNull()
  })
  it('空数据、全超时及部分未知线路保持真实状态', () => {
    expect(historyBuckets([])).toEqual([])
    expect(windowSummary([])).toEqual({ latency: null, loss: null })
    const timeout = parsePing({ ping: [{ task_id: 1, ts: 60, latency: null, loss: 100 }], loss: { 1: 100 } })
    expect(windowSummary(timeout)).toEqual({ latency: null, loss: 100 })
    expect(historyBuckets(timeout[0]!.rows)[0]?.timeout).toBe(true)
    expect(latencyLabel(null)).toBe('超时')
    expect(latencyLabel(null, false)).toBe('—')
    expect(windowSummary([...timeout, ...parsePing({ probes: { 2: '未接入' }, ping: [], loss: {} })]).loss).toBeNull()
  })
  it('无网络采样时仍保留灰色占位分段条', async () => {
    const html = await renderToString(createSSRApp(PingHistoryBars, { buckets: [], metric: 'latency', label: '近期延迟分段', emptyTitle: '未配置网络探针' }))
    expect(html).toContain('ping-history-empty')
    expect(html.match(/ping-tone-unknown/g)).toHaveLength(10)
    expect(html).toContain('未配置网络探针')
  })
  it('损坏的丢包字段保持未知，不按省略的零丢包处理', () => {
    const broken = parsePing({ ping: [{ task_id: 1, ts: 60, latency: 20, loss: 'wrong' }], loss: { 1: 'wrong' } })
    expect(windowSummary(broken).loss).toBeNull()
    expect(historyBuckets(broken[0]!.rows)[0]?.loss).toBeNull()
  })
  it('保留接口波动范围，并计算相邻采样抖动', () => {
    const network = parsePing({ probes: { 1: '电信' }, ping: [
      { task_id: 1, ts: 0, latency: 20, band: [18, 24] },
      { task_id: 1, ts: 60, latency: 35, band: [30, 40] },
      { task_id: 1, ts: 120, latency: null, loss: 100 },
    ], loss: { 1: 25 } })[0]!
    expect(network.rows[0]!.band).toEqual([18, 24])
    expect(networkStats(network)).toMatchObject({ avg: 27.5, jitter: 15, last: null, jitterEstimated: true })
    expect(qualityBuckets(network.rows, 2)).toHaveLength(2)
  })
  it('最多十段，时间乱序与最后一个样本均正确计入', () => {
    const rows = Array.from({ length: 60 }, (_, index) => ({ ts: index * 60, task_id: 1, latency: index, loss: 0 })).reverse()
    const buckets = historyBuckets(rows)
    expect(buckets).toHaveLength(10)
    expect(buckets[0]?.latency).toBe(2.5)
    expect(buckets.at(-1)?.latency).toBe(56.5)
    const gap = historyBuckets([rows[0]!, rows.at(-1)!])
    expect(gap).toHaveLength(2)
  })
  it('收紧丢包阈值、提炼线路短名并识别单线异常，不被三网平均值稀释', () => {
    expect(pingTone(0, 'loss')).toBe('good')
    expect(pingTone(0.56, 'loss')).toBe('moderate')
    expect(pingTone(1.5, 'loss')).toBe('slow')
    expect(pingTone(2, 'loss')).toBe('bad')
    expect(pingTone(75, 'latency')).toBe('good')
    expect(pingTone(135, 'latency')).toBe('fair')
    expect(pingTone(230, 'latency')).toBe('slow')

    expect(shortProbeName('浙江电信')).toBe('电信')
    expect(shortProbeName('浙江联通')).toBe('联通')
    expect(shortProbeName('RFC HK')).toBe('RFC HK')
    expect(shortProbeName('电信')).toBe('电信')

    const healthy = parsePing({ probes: { 1: '浙江电信', 2: '浙江联通' }, ping: [{ task_id: 1, ts: 60, latency: 30, loss: 0 }, { task_id: 2, ts: 60, latency: 35, loss: 0 }], loss: { 1: 0, 2: 0 } })
    expect(pingHealth(healthy)).toEqual({ level: 'ok', label: '网络稳定' })

    const mild = parsePing({ probes: { 1: '浙江电信', 2: '浙江联通' }, ping: [{ task_id: 1, ts: 60, latency: 136, loss: 0 }, { task_id: 2, ts: 60, latency: 143, loss: 1.7 }], loss: { 1: 0, 2: 1.7 } })
    expect(pingHealth(mild)).toEqual({ level: 'warn', label: '轻度波动' })
    expect(networkTone(mild[1]!)).toBe('warn')

    const singleLineLoss = parsePing({
      probes: { 1: '浙江电信', 2: '浙江联通', 3: '浙江移动' },
      ping: [
        { task_id: 1, ts: 60, latency: 37, loss: 0 },
        { task_id: 2, ts: 60, latency: 43, loss: 100 },
        { task_id: 3, ts: 60, latency: 36, loss: 0 },
      ],
      loss: { 1: 0, 2: 3.3, 3: 0 },
    })
    expect(pingHealth(singleLineLoss)).toEqual({ level: 'alert', label: '联通丢包 3.3%' })
    expect(networkTone(singleLineLoss[0]!)).toBe('ok')
    expect(networkTone(singleLineLoss[1]!)).toBe('alert')

    const partialTimeout = parsePing({ probes: { 1: '浙江电信' }, ping: [{ task_id: 1, ts: 60, latency: 40 }, { task_id: 1, ts: 120, latency: null }] })
    expect(networkTone(partialTimeout[0]!)).toBe('warn')
    expect(pingHealth(partialTimeout)).toEqual({ level: 'warn', label: '轻度波动' })
    const buckets = historyBuckets(singleLineLoss.flatMap(n => n.rows))
    expect(buckets[0]).toMatchObject({ anyLoss: true, maxLoss: 100, peak: 43 })
    expect(pingHealth([])).toEqual({ level: 'unknown', label: '等待采样' })
  })
})

describe('紧凑卡片格式', () => {
  it('保留周期和币种，剩余天数支持已过期与未设置', () => {
    expect(cardPrice(239.9, 'USD', 'yearly')).toBe('$239.9/年')
    expect(cardPrice(99, 'EUR', '60m')).toBe('€99/60个月')
    expect(cardPrice(99, 'bad-code', 'once')).toBe('bad-code 99 · 一次性')
    expect(cardExpiry(-3)).toBe('-3天')
    expect(cardExpiry(null)).toBe('')
  })
  it('去网速冗余小数，资源保留一位，不把空值格式为零', () => {
    expect(cardBytes(15 * 1024, true)).toBe('15 KB/s')
    expect(cardBytes(261.17 * 1024 ** 3)).toBe('261.2 GB')
    expect(cardBytes(null)).toBe('—')
  })
  it('分号标签去空去重，长说明保留全文，HTML 按文本处理', () => {
    expect(remarkParts('500Mbps;PRO；重置2日;PRO;')).toEqual({ tags: ['500Mbps', 'PRO', '重置2日'], text: '' })
    const text = '这是一条比较长的公开备注，应该完整保留，不能被强制拆成一排小标签。'
    expect(remarkParts(text)).toEqual({ tags: [], text })
    expect(remarkParts('<img src=x>')).toEqual({ tags: ['<img src=x>'], text: '' })
  })
})
