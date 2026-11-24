import { describe, expect, it, vi } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { clearPingCacheForTest, parsePing, seedPingCacheForTest } from './ping'
import { defaultConfig } from './config'
import { normalizeNodes } from './data'
import {
  bucketLatencyState,
  bucketLatencyTone,
  bucketPeakElevated,
  formatHistoryBucketTooltip,
  formatQualityBucketTooltip,
  historyBuckets,
  latencyLabel,
  latencyTier,
  latencyTone,
  lossDetailLabel,
  networkLatency,
  networkStats,
  networkTone,
  pingHealth,
  pingTone,
  qualityBuckets,
  qualityTone,
  roundLatency,
  shortProbeName,
  windowSummary,
} from './ping-display'
import { cardBytes, cardExpiry, cardPrice, remarkParts } from './format'
import MetricChart from '../components/MetricChart.vue'
import PingHistoryBars from '../components/PingHistoryBars.vue'
import PingPanel from '../components/PingPanel.vue'

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
  it('延迟条按平均延迟着色，丢包条独立反映逐段最高丢包', async () => {
    const buckets = [{ start: 60, end: 120, latency: 80, peak: 320, loss: 1, maxLoss: 5, timeout: false }]
    const latency = await renderToString(createSSRApp(PingHistoryBars, { buckets, metric: 'latency', label: '延迟分段' }))
    const loss = await renderToString(createSSRApp(PingHistoryBars, { buckets, metric: 'loss', label: '丢包分段' }))
    expect(latency).toContain('latency-bar-green')
    expect(latency).toContain('峰值 320 ms')
    expect(loss).toContain('ping-tone-bad')
    expect(loss).toContain('最高丢包 5.0%')
  })
  it.each([[180, 'ok'], [181, 'warn'], [260, 'warn'], [261, 'alert']])('平均延迟 %d ms 时线路健康为 %s', (latency, level) => {
    const [network] = parsePing({ ping: [{ task_id: 1, ts: 60, latency }], loss: { 1: 0 } })
    expect(networkTone(network!)).toBe(level)
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
    expect(pingTone(75, 'latency')).toBe('green')
    expect(pingTone(135, 'latency')).toBe('yellow')
    expect(pingTone(200, 'latency')).toBe('orange')
    expect(pingTone(270, 'latency')).toBe('red')

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
  it('摘要模式在延迟与丢包分段条上方直接展示各线路数值，无采样时展示占位符', async () => {
    vi.stubGlobal('document', { hidden: false })
    try {
      const node = normalizeNodes([{ id: 1, name: '东京', online: true }])[0]!
      const html = await renderToString(createSSRApp(PingPanel, { node, details: false, config: defaultConfig() }))
      expect(html.match(/ping-panel-row/g)).toHaveLength(2)
      expect(html).not.toContain('ping-summary"')
      expect(html).toContain('延迟<small>ms</small>')
      expect(html).toContain('丢包<small>%</small>')
      expect(html.match(/— · — · —/g)).toHaveLength(2)
    } finally {
      clearPingCacheForTest()
      vi.unstubAllGlobals()
    }
  })
  it('摘要模式精简整数丢包率为 0 或 100，非整数保留小数', async () => {
    vi.stubGlobal('document', { hidden: false })
    try {
      const node = normalizeNodes([{ id: 77, name: '香港', online: true, metrics: { cpu: 1, load: [0, 0, 0], mem_total: 1, mem_used: 0, disk_total: 1, disk_used: 0, net_tx: 0, net_rx: 0, uptime: 10 } }])[0]!
      seedPingCacheForTest(77, parsePing({
        probes: { 1: '电信', 2: '联通', 3: '移动' },
        ping: [
          { task_id: 1, ts: 60, latency: 26, loss: 0 },
          { task_id: 2, ts: 60, latency: 27, loss: 0 },
          { task_id: 3, ts: 60, latency: 30, loss: 0 },
        ],
        loss: { 1: 0, 2: 0.56, 3: 100 },
      }))
      const html = await renderToString(createSSRApp(PingPanel, { node, details: false, config: defaultConfig() }))
      expect(html).toContain('>0<b')
      expect(html).toContain('>0.56<b')
      expect(html).toContain('>100<!---->')
      expect(html).not.toContain('>0.0<')
      expect(html).not.toContain('>100.0<')
    } finally {
      clearPingCacheForTest()
      vi.unstubAllGlobals()
    }
  })
})

describe('统一延迟分档与状态展示', () => {
  it.each([
    [0, 0, 'green', '低延迟'],
    [90, 90, 'green', '低延迟'],
    [90.49, 90, 'green', '低延迟'],
    [90.5, 91, 'yellow', '延迟偏高'],
    [91, 91, 'yellow', '延迟偏高'],
    [156, 156, 'yellow', '延迟偏高'],
    [180, 180, 'yellow', '延迟偏高'],
    [180.49, 180, 'yellow', '延迟偏高'],
    [180.5, 181, 'orange', '高延迟'],
    [181, 181, 'orange', '高延迟'],
    [260, 260, 'orange', '高延迟'],
    [260.49, 260, 'orange', '高延迟'],
    [260.5, 261, 'red', '很高延迟'],
    [261, 261, 'red', '很高延迟'],
  ])('延迟 %s ms 先取整为 %d ms 再按统一规则分档为 %s（%s）', (raw, rounded, tone, label) => {
    expect(roundLatency(raw)).toBe(rounded)
    expect(latencyLabel(raw)).toBe(`${rounded} ms`)
    expect(latencyTone(raw)).toBe(tone)
    expect(qualityTone(raw)).toBe(tone)
    expect(pingTone(raw, 'latency')).toBe(tone)
    expect(latencyTier(raw)).toMatchObject({ tone, label })
  })

  it('明确超时与暂无有效采样严格区分，统计聚合使用原始精度后再取整', () => {
    expect(latencyTone(null, true)).toBe('red')
    expect(latencyLabel(null, true)).toBe('超时')
    expect(latencyTier(null, true)).toMatchObject({ tone: 'red', label: '超时' })

    expect(latencyTone(null, false)).toBe('unknown')
    expect(latencyLabel(null, false)).toBe('—')
    expect(latencyTier(null, false)).toMatchObject({ tone: 'unknown', label: '暂无采样' })

    // 原始均值 90.533... -> 取整后为 91 ms（黄色），不能按样本预先取整
    const [network] = parsePing({
      probes: { 1: '电信' },
      ping: [
        { task_id: 1, ts: 60, latency: 90.4 },
        { task_id: 1, ts: 120, latency: 90.4 },
        { task_id: 1, ts: 180, latency: 90.8 },
      ],
      loss: { 1: 0 },
    })
    const avg = networkLatency(network!)
    expect(avg).toBeCloseTo(90.5333, 3)
    expect(latencyLabel(avg)).toBe('91 ms')
    expect(latencyTone(avg)).toBe('yellow')

    const [warnNet] = parsePing({ ping: [{ task_id: 1, ts: 60, latency: 260.49 }], loss: { 1: 0 } })
    const [alertNet] = parsePing({ ping: [{ task_id: 1, ts: 60, latency: 260.5 }], loss: { 1: 0 } })
    expect(networkTone(warnNet!)).toBe('warn')
    expect(networkTone(alertNet!)).toBe('alert')
  })

  it('同一个 156 ms 在首页摘要、首页明细、分段条和趋势图悬停均显示黄色档，平滑不改悬停原始读数', async () => {
    vi.stubGlobal('document', { hidden: false })
    try {
      const node = normalizeNodes([{
        id: 88,
        name: '东京节点',
        online: true,
        metrics: { cpu: 1, load: [0, 0, 0], mem_total: 1, mem_used: 0, disk_total: 1, disk_used: 0, net_tx: 0, net_rx: 0, uptime: 10 },
      }])[0]!
      seedPingCacheForTest(88, parsePing({
        probes: { 1: '电信' },
        ping: [
          { task_id: 1, ts: 60, latency: 156, loss: 0 },
          { task_id: 1, ts: 120, latency: 156, loss: 0 },
        ],
        loss: { 1: 0 },
      }))

      const summaryHtml = await renderToString(createSSRApp(PingPanel, { node, details: false, config: defaultConfig() }))
      expect(summaryHtml).toContain('latency-text-yellow')
      expect(summaryHtml).toContain('latency-bar-yellow')
      expect(summaryHtml).toContain('>156<!---->')
      expect(summaryHtml).toContain('title="电信"')
      expect(summaryHtml).not.toContain('延迟分档：')
      expect(summaryHtml).not.toContain('近 1 小时平均延迟')
      expect(summaryHtml).toContain('延迟偏高')

      const detailHtml = await renderToString(createSSRApp(PingPanel, { node, details: true, config: defaultConfig() }))
      expect(detailHtml).toContain('latency-text-yellow')
      expect(detailHtml).toContain('latency-bar-yellow')
      expect(detailHtml).toContain('156 ms')
      expect(detailHtml).not.toContain('延迟分档：')

      const points = [
        { ts: 0, ping_1: 10 },
        { ts: 60, ping_1: 156 },
        { ts: 120, ping_1: 12 },
      ]
      const lines = [{ key: 'ping_1', label: '电信', color: '#14aa86' }]
      const rawChart = await renderToString(createSSRApp(MetricChart, {
        title: '多线路延迟历史',
        points,
        lines,
        step: 60,
        unit: 'ms',
        smooth: false,
        cursor: 60,
      }))
      const smoothChart = await renderToString(createSSRApp(MetricChart, {
        title: '多线路延迟历史',
        points,
        lines,
        step: 60,
        unit: 'ms',
        smooth: true,
        cursor: 60,
      }))
      for (const chartHtml of [rawChart, smoothChart]) {
        expect(chartHtml).toContain('color:#14aa86')
        expect(chartHtml).toContain('latency-text-yellow')
        expect(chartHtml).toContain('latency-badge-yellow')
        expect(chartHtml).toContain('156 ms')
        expect(chartHtml).toContain('延迟偏高')
      }

      const boundaryChart = await renderToString(createSSRApp(MetricChart, {
        title: '边界悬停',
        points: [
          { ts: 0, a: 90.49, b: 90.5, c: null },
        ],
        lines: [
          { key: 'a', label: 'A线', color: '#14aa86' },
          { key: 'b', label: 'B线', color: '#3f96d7' },
          { key: 'c', label: 'C线', color: '#d68c44' },
          { key: 'd', label: 'D线', color: '#9d80d7' },
        ],
        step: 60,
        unit: 'ms',
        cursor: 0,
      }))
      expect(boundaryChart).toContain('latency-text-green')
      expect(boundaryChart).toContain('90 ms')
      expect(boundaryChart).toContain('latency-text-yellow')
      expect(boundaryChart).toContain('91 ms')
      expect(boundaryChart).toContain('latency-badge-red')
      expect(boundaryChart).toContain('超时')
      expect(boundaryChart).toContain('latency-text-unknown')
    } finally {
      clearPingCacheForTest()
      vi.unstubAllGlobals()
    }
  })

  it('分段状态区分混合超时、全超时、缺测、峰值跨档及旧协议未知丢包', async () => {
    const elevated = qualityBuckets([
      { ts: 60, task_id: 1, latency: 22, loss: 0 },
      { ts: 61, task_id: 1, latency: 290, loss: 0 },
    ], 1)[0]!
    expect(elevated.latency).toBe(156)
    expect(elevated.peak).toBe(290)
    expect(bucketLatencyTone(elevated)).toBe('yellow')
    expect(bucketPeakElevated(elevated)).toBe(true)
    expect(latencyTone(elevated.peak)).toBe('red')
    const elevatedTip = formatQualityBucketTooltip(elevated, '电信')
    expect(elevatedTip).toContain('156 ms')
    expect(elevatedTip).toContain('290 ms')
    expect(elevatedTip).toContain('高于均值档')
    expect(elevatedTip).toContain('丢包：0.0%')
    expect(elevatedTip).toContain('超时：无')

    const sameTierPeak = qualityBuckets([
      { ts: 60, task_id: 1, latency: 137, loss: 0 },
      { ts: 61, task_id: 1, latency: 175, loss: 0 },
    ], 1)[0]!
    expect(bucketLatencyTone(sameTierPeak)).toBe('yellow')
    expect(bucketPeakElevated(sameTierPeak)).toBe(false)

    const partial = qualityBuckets([
      { ts: 60, task_id: 1, latency: 80, loss: 0 },
      { ts: 61, task_id: 1, latency: null, loss: 100 },
    ], 1)[0]!
    expect(partial.timeout).toBe(false)
    expect(partial.hasTimeout).toBe(true)
    expect(bucketLatencyState(partial)).toBe('partial-timeout')
    expect(bucketLatencyTone(partial)).toBe('green')
    expect(formatQualityBucketTooltip(partial, '电信')).toContain('有超时（1/2）')
    const partialBarHtml = await renderToString(createSSRApp(PingHistoryBars, {
      buckets: [partial],
      metric: 'latency',
      label: '延迟分段',
      scope: '电信 近 1 小时单线',
    }))
    expect(partialBarHtml).toContain('latency-bar-green')
    expect(partialBarHtml).not.toContain('ping-history-timeout-marker')
    expect(partialBarHtml).toContain('80 ms')
    expect(partialBarHtml).toContain('含超时')

    const allTimeout = qualityBuckets([
      { ts: 60, task_id: 1, latency: null, loss: 100 },
    ], 1)[0]!
    expect(allTimeout.timeout).toBe(true)
    expect(bucketLatencyState(allTimeout)).toBe('timeout')
    expect(bucketLatencyTone(allTimeout)).toBe('red')
    expect(formatQualityBucketTooltip(allTimeout, '电信')).toContain('平均：超时')
    expect(formatHistoryBucketTooltip(allTimeout, 'latency')).toContain('超时')

    const gapped = qualityBuckets([
      { ts: 0, task_id: 1, latency: 50, loss: 0 },
      { ts: 60, task_id: 1, latency: 60, loss: 0 },
      { ts: 240, task_id: 1, latency: 70, loss: 0 },
    ], 3)
    const emptyBucket = gapped[1]!
    expect(emptyBucket.sampleCount).toBe(0)
    expect(bucketLatencyState(emptyBucket)).toBe('empty')
    expect(bucketLatencyTone(emptyBucket)).toBe('unknown')
    const emptyTip = formatQualityBucketTooltip(emptyBucket, '电信')
    expect(emptyTip).toContain('无采样/缺测')
    expect(emptyTip).toContain('丢包：未知（缺测）')
    expect(formatHistoryBucketTooltip(emptyBucket, 'latency')).toContain('无采样（缺测）')
    expect(formatHistoryBucketTooltip(emptyBucket, 'loss')).toContain('未知（缺测）')

    // 旧协议未提供丢包字段 vs 缺测
    const [legacyNet] = parsePing({ ping: [{ task_id: 1, ts: 60, latency: 85 }] })
    const legacyBucket = qualityBuckets(legacyNet!.rows, 1)[0]!
    expect(legacyBucket.loss).toBeNull()
    expect(lossDetailLabel(legacyNet!.loss, legacyNet!.rows.length > 0)).toBe('未知（未提供）')
    expect(lossDetailLabel(null, false)).toBe('未知（缺测）')
    expect(formatQualityBucketTooltip(legacyBucket, '电信')).toContain('丢包：未知（未提供）')
    expect(formatHistoryBucketTooltip(legacyBucket, 'loss')).toContain('未知（未提供）')
  })

  it('使用成功采样的主控区间上界作为分段峰值，均值仍按延迟读数计算', () => {
    const [network] = parsePing({ ping: [
      { ts: 60, task_id: 1, latency: 156, band: [22, 290] },
      { ts: 120, task_id: 1, latency: 156 },
      { ts: 180, task_id: 1, latency: null, band: [0, 999] },
    ] })
    const [bucket] = qualityBuckets(network!.rows, 1)

    expect(bucket).toMatchObject({ latency: 156, peak: 290, successCount: 2, timeoutCount: 1 })
    expect(bucketLatencyTone(bucket!)).toBe('yellow')
    expect(bucketPeakElevated(bucket!)).toBe(true)
    expect(formatQualityBucketTooltip(bucket!)).toContain('峰值：290 ms')
    expect(historyBuckets(network!.rows).map(segment => segment.peak)).toEqual([290, 156, null])
  })

  it('延迟缺测时仍显示主控提供的窗口丢包率', () => {
    const [network] = parsePing({ probes: { 1: '电信' }, ping: [], loss: { 1: 12.5 } })
    expect(lossDetailLabel(network!.loss, network!.rows.length > 0)).toBe('12.5%')
    expect(lossDetailLabel(0, false)).toBe('0.0%')
  })

  it('线路统计区分选定范围平均值与最后一条实际采样超时', () => {
    const [trailingTimeout] = parsePing({
      probes: { 1: '电信' },
      ping: [
        { task_id: 1, ts: 60, latency: 80, loss: 0 },
        { task_id: 1, ts: 120, latency: null, loss: 100 },
      ],
      loss: { 1: 50 },
    })
    const trailingStats = networkStats(trailingTimeout!)
    expect(trailingStats).toMatchObject({ avg: 80, last: null, hasSamples: true, allTimeout: false, lastTimeout: true })
    expect(latencyLabel(trailingStats.avg, trailingStats.allTimeout)).toBe('80 ms')
    expect(latencyTone(trailingStats.avg, trailingStats.allTimeout)).toBe('green')
    expect(latencyLabel(trailingStats.last, trailingStats.lastTimeout)).toBe('超时')
    expect(latencyTone(trailingStats.last, trailingStats.lastTimeout)).toBe('red')

    const [allTimedOut] = parsePing({
      probes: { 1: '电信' },
      ping: [{ task_id: 1, ts: 60, latency: null, loss: 100 }],
      loss: { 1: 100 },
    })
    const allTimeoutStats = networkStats(allTimedOut!)
    expect(allTimeoutStats).toMatchObject({ avg: null, last: null, hasSamples: true, allTimeout: true, lastTimeout: true })
    expect(latencyLabel(allTimeoutStats.avg, allTimeoutStats.allTimeout)).toBe('超时')
    expect(latencyTone(allTimeoutStats.avg, allTimeoutStats.allTimeout)).toBe('red')

    const [noSamples] = parsePing({ probes: { 1: '电信' }, ping: [], loss: {} })
    const emptyStats = networkStats(noSamples!)
    expect(emptyStats).toMatchObject({ avg: null, last: null, hasSamples: false, allTimeout: false, lastTimeout: false })
    expect(latencyLabel(emptyStats.avg, emptyStats.allTimeout)).toBe('—')
    expect(latencyTone(emptyStats.avg, emptyStats.allTimeout)).toBe('unknown')
    expect(latencyLabel(emptyStats.last, emptyStats.lastTimeout)).toBe('—')
    expect(latencyTone(emptyStats.last, emptyStats.lastTimeout)).toBe('unknown')
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
