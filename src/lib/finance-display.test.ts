import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import NodeStatusBadges from '../components/NodeStatusBadges.vue'
import SummaryCards from '../components/SummaryCards.vue'
import PublicFinancePopover from '../components/PublicFinancePopover.vue'
import PersonalFinanceDialog from '../components/PersonalFinanceDialog.vue'
import { normalizeNodes } from './data'

describe('费用和在线状态展示', () => {
  it('全部在线时没有离线徽章，未上报指标的在线节点仍计入', async () => {
    const html = await renderToString(createSSRApp(NodeStatusBadges, { nodes: normalizeNodes([{ id: 1, online: true, metrics: null }]), group: null }))
    expect(html).toContain('在线 1 台，离线 0 台，共 1 台')
    expect(html).toContain('<strong>1</strong>')
    expect(html).not.toContain('node-status-offline')
  })
  it('有离线时显示离线数量，空范围仅显示在线零', async () => {
    const html = await renderToString(createSSRApp(NodeStatusBadges, { nodes: normalizeNodes([{ id: 1, online: true }, { id: 2, online: false }]), group: '亚洲' }))
    expect(html).toContain('亚洲 · 在线 1 台，离线 1 台，共 2 台')
    expect(html).toContain('node-status-offline')
    const empty = await renderToString(createSSRApp(NodeStatusBadges, { nodes: [], group: null }))
    expect(empty).toContain('在线 0 台，离线 0 台，共 0 台')
    expect(empty).toContain('<strong>0</strong>')
    expect(empty).not.toContain('node-status-offline')
  })
  it('关闭费用时不在金额卡片或 tooltip 输出金额和计入详情', async () => {
    const html = await renderToString(createSSRApp(SummaryCards, { nodes: normalizeNodes([{ id: 1, price: 1200, currency: 'CNY', billing_cycle: 'yearly', expires_in: 100 }]), cards: ['remaining_value'], scope: 'all', showPrice: false, currency: 'CNY', rates: {}, rateLabel: '', ratesLoading: false }))
    expect(html).toContain('费用已隐藏')
    expect(html).not.toContain('¥')
    expect(html).not.toContain('已计入')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('今日汇率')
  })
  it('首页金额卡片提供公开汇总与汇率入口，不提供个人计算入口', async () => {
    const html = await renderToString(createSSRApp(SummaryCards, { nodes: normalizeNodes([{ id: 1, price: 1200, currency: 'CNY', billing_cycle: 'yearly', expires_in: 100 }]), cards: ['remaining_value'], scope: 'all', showPrice: true, currency: 'CNY', rates: {}, rateLabel: '参考汇率 · 估算', ratesLoading: false }))
    expect(html).toContain('剩余价值，查看公开费用汇总')
    expect(html).toContain('popover="auto"')
    expect(html).toContain('今日汇率')
    expect(html).not.toContain('个人价值计算')
  })
  it('公开浮层按当前范围和币种汇总，汇率以选中币种为基准', async () => {
    const html = await renderToString(createSSRApp(PublicFinancePopover, { id: 'public-finance', anchor: null, nodes: normalizeNodes([{ id: 1, price: 1200, currency: 'CNY', billing_cycle: 'yearly', expires_in: 100 }]), scope: 'group', currency: 'USD', rates: { CNY: 1, USD: .2 }, rateLabel: '汇率 2026-10-12', ratesLoading: false }))
    expect(html).toContain('当前分组公开费用汇总')
    expect(html).toContain('>$240.00</strong>')
    expect(html).toContain('>$20.00</strong>')
    expect(html).toContain('>$65.75</strong>')
    expect(html).toContain('每 1 USD 可兑换的金额')
    expect(html).toContain('¥5.000000')
    expect(html).toContain('$1.000000')
    expect(html).not.toContain('计入服务器')
  })
  it('个人列表区分购入总价、剩余价值和月均续费，保留过期与未知状态', async () => {
    const context: { teleports?: Record<string, string> } = {}
    await renderToString(createSSRApp(PersonalFinanceDialog, { nodes: normalizeNodes([
      { id: 1, name: '年付已过期', price: 1200, currency: 'CNY', billing_cycle: 'yearly', expires_in: -10 },
      { id: 2, name: '季付无到期', price: 600, currency: 'CNY', billing_cycle: 'quarterly' },
      { id: 3, name: '一次性购买', price: 149, currency: 'CNY', billing_cycle: 'once' },
      { id: 4, name: '年付剩余100天', price: 1200, currency: 'CNY', billing_cycle: 'yearly', expires_in: 100 },
    ]), exchange: { rates: { CNY: 1 }, date: null, source: 'reference' }, ratesLoading: false }), context)
    const html = context.teleports!.body!
    const rows = [...html.matchAll(/class="finance-node-amounts"[^>]*>(.*?)<\/label>/g)].map(match => match[1])
    expect(rows).toHaveLength(4)
    expect(rows[0]).toContain('>¥1,200.00</strong>')
    expect(rows[0]).toContain('>¥0.00</strong>')
    expect(rows[0]).toContain('>¥100.00/月</strong>')
    expect(rows[1]).toContain('>¥600.00</strong>')
    expect(rows[1]).toContain('>—</strong>')
    expect(rows[1]).toContain('缺少到期信息')
    expect(rows[1]).toContain('>¥200.00/月</strong>')
    expect(rows[2]).toContain('>¥149.00</strong>')
    expect(rows[2]).toContain('>—</strong>')
    expect(rows[2]).toContain('一次性费用无折算周期')
    expect(rows[2]).toContain('>¥0.00/月</strong>')
    expect(rows[3]).toContain('>¥1,200.00</strong>')
    expect(rows[3]).toContain('>¥328.77</strong>')
    expect(rows[3]).toContain('>¥100.00/月</strong>')
    for (const row of rows) {
      expect(row).toContain('购入总价')
      expect(row).toContain('剩余价值')
      expect(row).toContain('月均续费')
    }
    expect(html).toContain('购入总价按录入标价，续费按付款周期折算为月均价格。')
    expect(html).not.toContain('class="finance-row-issue"')
  })
})
