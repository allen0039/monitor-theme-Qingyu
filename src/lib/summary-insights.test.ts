import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { normalizeNodes } from './data'
import {
  formatCompactRenewalAmount,
  getNodeAlertReasons,
  nodeStatusPillTone,
  rankRealtimeNodes,
  rankTrafficNodes,
  summarizeNodeStatus,
  summarizeUpcomingRenewals,
} from './summary-insights'
import SummaryStatusPopover from '../components/SummaryStatusPopover.vue'
import SummaryRealtimePopover from '../components/SummaryRealtimePopover.vue'
import SummaryTrafficPopover from '../components/SummaryTrafficPopover.vue'
import PublicFinancePopover from '../components/PublicFinancePopover.vue'

describe('首页总览四卡洞察与明细浮层', () => {
  const GiB = 1024 ** 3

  it('区分离线、CPU/内存/硬盘/等待上报资源告警，以及临期与已到期节点', () => {
    const nodes = normalizeNodes([
      {
        id: 1, name: '东京告警', country: 'JP', group: '亚太', online: true, cpu_cores: 4, expires_in: 60,
        metrics: { cpu: 92.4, load: [1, 1, 1], mem_total: 4 * GiB, mem_used: 3.6 * GiB, disk_total: 40 * GiB, disk_used: 10 * GiB, net_rx: 100, net_tx: 100, uptime: 60 },
      },
      {
        id: 2, name: '洛杉矶临期', country: 'US', group: '美西', online: true, cpu_cores: 2, expires_in: 5, expires_at: '2026-11-29',
        metrics: { cpu: 15, load: [0.1, 0.1, 0.1], mem_total: 2 * GiB, mem_used: 0.5 * GiB, disk_total: 20 * GiB, disk_used: 4 * GiB, net_rx: 50, net_tx: 50, uptime: 120 },
      },
      {
        id: 3, name: '德国已过期', country: 'DE', group: '欧洲', online: true, cpu_cores: 2, expires_in: -2, expires_at: '2026-11-22',
        metrics: { cpu: 10, load: [0.1, 0.1, 0.1], mem_total: 2 * GiB, mem_used: 0.4 * GiB, disk_total: 20 * GiB, disk_used: 4 * GiB, net_rx: 20, net_tx: 20, uptime: 120 },
      },
      {
        id: 4, name: '新加坡离线', country: 'SG', group: '亚太', online: false, cpu_cores: 1, last_seen_ago: 7200,
      },
      {
        id: 5, name: '香港健康', country: 'HK', group: '亚太', online: true, cpu_cores: 4, expires_in: 90,
        metrics: { cpu: 20, load: [0.2, 0.2, 0.2], mem_total: 4 * GiB, mem_used: GiB, disk_total: 40 * GiB, disk_used: 8 * GiB, net_rx: 500, net_tx: 300, uptime: 300 },
      },
    ])

    expect(getNodeAlertReasons(nodes[0]!)).toEqual(['CPU 92%', '内存 90%'])
    expect(getNodeAlertReasons(nodes[3]!)).toEqual([])
    expect(nodeStatusPillTone(nodes[0]!, 7)).toBe('is-warn')
    expect(nodeStatusPillTone(nodes[1]!, 7)).toBe('is-expiring')
    expect(nodeStatusPillTone(nodes[2]!, 7)).toBe('is-danger')
    expect(nodeStatusPillTone(nodes[3]!, 7)).toBe('is-offline')
    expect(nodeStatusPillTone(nodes[4]!, 7)).toBe('is-ok')

    const status = summarizeNodeStatus(nodes, 7)
    expect(status.offline.map(i => i.node.name)).toEqual(['新加坡离线'])
    expect(status.alerts.map(i => i.node.name)).toEqual(['东京告警'])
    expect(status.expiring.map(i => [i.node.name, i.expired, i.label])).toEqual([
      ['德国已过期', true, '已过期 2 天'],
      ['洛杉矶临期', false, '剩 5 天'],
    ])
    expect(status.expiredCount).toBe(1)
    expect(status.expiringOnlyCount).toBe(1)
    expect(status.issueCount).toBe(4)
    expect(status.totalCores).toBe(13)
  })

  it('统计近 30 天待续费总额并格式化紧凑续费标签', () => {
    const nodes = normalizeNodes([
      { id: 1, name: 'A', price: 100, currency: 'CNY', billing_cycle: 'yearly', expires_in: 5 },
      { id: 2, name: 'B', price: 10, currency: 'USD', billing_cycle: 'monthly', expires_in: 20 },
      { id: 3, name: 'C', price: 99, currency: 'CNY', billing_cycle: 'once', expires_in: 3 },
      { id: 4, name: 'D', price: 50, currency: 'CNY', billing_cycle: 'monthly', expires_in: 45 },
      { id: 5, name: 'E', price: 80, currency: 'CNY', billing_cycle: 'monthly', expires_in: -1 },
      { id: 6, name: 'F', price: 60, currency: 'CNY', billing_cycle: '', expires_in: 15 },
    ])
    const summary = summarizeUpcomingRenewals(nodes, 'CNY', { CNY: 1, USD: 0.14799 }, 30)
    expect(summary.items.map(i => i.node.name)).toEqual(['A', 'B'])
    expect(summary.count).toBe(2)
    expect(summary.expiredCount).toBe(1)
    expect(summary.total).toBeCloseTo(100 + 10 / 0.14799, 2)
    expect(summarizeUpcomingRenewals(nodes, 'CNY', {}).missingRateCount).toBe(1)
    expect(formatCompactRenewalAmount(167.57, 'CNY')).toBe('¥168')
    expect(formatCompactRenewalAmount(24.5, 'USD')).toBe('$24.5')
  })

  it('按总计、上行和下行排行实时吞吐节点，过滤离线节点', () => {
    const nodes = normalizeNodes([
      { id: 1, name: '上传王', online: true, metrics: { cpu: 1, load: [0, 0, 0], mem_total: GiB, mem_used: 0, disk_total: GiB, disk_used: 0, net_tx: 5000, net_rx: 1000, uptime: 10 } },
      { id: 2, name: '下载王', online: true, metrics: { cpu: 1, load: [0, 0, 0], mem_total: GiB, mem_used: 0, disk_total: GiB, disk_used: 0, net_tx: 2000, net_rx: 8000, uptime: 10 } },
      { id: 3, name: '离线点', online: false },
    ])
    expect(rankRealtimeNodes(nodes, 'total', 5).map(i => i.node.name)).toEqual(['下载王', '上传王'])
    expect(rankRealtimeNodes(nodes, 'up', 5).map(i => i.node.name)).toEqual(['上传王', '下载王'])
    expect(rankRealtimeNodes(nodes, 'down', 5).map(i => i.node.name)).toEqual(['下载王', '上传王'])
  })

  it('按配额占比、本月与今日统计流量排行并识别超 80% 配额', () => {
    const nodes = normalizeNodes([
      { id: 1, name: '高配额', month_used: 850 * GiB, traffic_limit: 1000 * GiB, traffic_reset_day: 2, month_tx: 400 * GiB, month_rx: 450 * GiB, day_tx: 10 * GiB, day_rx: 20 * GiB },
      { id: 2, name: '低配额大户', month_used: 500 * GiB, traffic_limit: 2000 * GiB, traffic_reset_day: 15, month_tx: 500 * GiB, month_rx: 500 * GiB, day_tx: 30 * GiB, day_rx: 40 * GiB },
    ])
    const quota = rankTrafficNodes(nodes, 'quota', 5)
    expect(quota.hasQuota).toBe(true)
    expect(quota.hasDaily).toBe(true)
    expect(quota.highQuotaCount).toBe(1)
    expect(quota.items[0]!.node.name).toBe('高配额')
    expect(rankTrafficNodes(nodes, 'month', 5).items[0]!.node.name).toBe('低配额大户')
    expect(rankTrafficNodes(nodes, 'day', 5).items[0]!.node.name).toBe('低配额大户')
  })

  it('SSR 渲染四个概览明细浮层并展示核心信息', async () => {
    const nodes = normalizeNodes([
      {
        id: 1, name: '东京 · 软银', country: 'JP', group: '亚太', online: true, cpu_cores: 4, expires_in: 5, expires_at: '2026-11-29', price: 120, currency: 'CNY', billing_cycle: 'monthly',
        metrics: { cpu: 91, load: [1, 1, 1], mem_total: 4 * GiB, mem_used: GiB, disk_total: 40 * GiB, disk_used: 10 * GiB, net_rx: 4 * 1024 ** 2, net_tx: 2 * 1024 ** 2, uptime: 60 },
        month_tx: 300 * GiB, month_rx: 550 * GiB, month_used: 850 * GiB, traffic_limit: 1000 * GiB, traffic_reset_day: 2, day_tx: 10 * GiB, day_rx: 20 * GiB,
      },
    ])

    const statusHtml = await renderToString(createSSRApp(SummaryStatusPopover, { id: 'p-status', anchor: null, nodes, scope: 'all', expiryWarningDays: 7 }))
    expect(statusHtml).toContain('节点状态明细')
    expect(statusHtml).toContain('东京 · 软银')
    expect(statusHtml).toContain('CPU 91%')
    expect(statusHtml).toContain('剩 5 天')

    const realtimeHtml = await renderToString(createSSRApp(SummaryRealtimePopover, { id: 'p-rt', anchor: null, nodes, scope: 'all', tx: 2 * 1024 ** 2, rx: 4 * 1024 ** 2, reporting: 1, peak: 8 * 1024 ** 2 }))
    expect(realtimeHtml).toContain('实时吞吐分布')
    expect(realtimeHtml).toContain('东京 · 软银')
    expect(realtimeHtml).toContain('窗口峰值 8.0 MB/s')

    const financeHtml = await renderToString(createSSRApp(PublicFinancePopover, { id: 'p-fin', anchor: null, nodes, scope: 'all', currency: 'CNY', rates: { CNY: 1 }, rateLabel: '汇率 2026-11-23', ratesLoading: false }))
    expect(financeHtml).toContain('近 30 天待续费')
    expect(financeHtml).toContain('东京 · 软银')
    expect(financeHtml).toContain('剩 5 天')

    const trafficHtml = await renderToString(createSSRApp(SummaryTrafficPopover, { id: 'p-tr', anchor: null, nodes, scope: 'all', monthTx: 300 * GiB, monthRx: 550 * GiB, dayTx: 10 * GiB, dayRx: 20 * GiB }))
    expect(trafficHtml).toContain('今日流量')
    expect(trafficHtml).toContain('本月流量')
    expect(trafficHtml).toContain('节点流量排行')
    expect(trafficHtml).toContain('2日重置')
    expect(trafficHtml).toContain('1 台配额已达 80%')
  })
})
