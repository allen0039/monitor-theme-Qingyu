import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import NodeStatusBadges from '../components/NodeStatusBadges.vue'
import SummaryCards from '../components/SummaryCards.vue'
import { normalizeNodes } from './data'

describe('费用和在线状态展示', () => {
  it('全部在线时没有离线徽章，未上报指标的在线节点仍计入', async () => {
    const html = await renderToString(createSSRApp(NodeStatusBadges, { nodes: normalizeNodes([{ id: 1, online: true, metrics: null }]), group: null }))
    expect(html).toContain('在线 <strong>1</strong>')
    expect(html).not.toContain('离线 <strong>')
  })
  it('有离线时显示离线数量，空范围仅显示在线零', async () => {
    const html = await renderToString(createSSRApp(NodeStatusBadges, { nodes: normalizeNodes([{ id: 1, online: true }, { id: 2, online: false }]), group: '亚洲' }))
    expect(html).toContain('离线 <strong>1</strong>')
    const empty = await renderToString(createSSRApp(NodeStatusBadges, { nodes: [], group: null }))
    expect(empty).toContain('在线 <strong>0</strong>')
    expect(empty).not.toContain('离线 <strong>')
  })
  it('关闭费用时不在金额卡片或 tooltip 输出金额和计入详情', async () => {
    const html = await renderToString(createSSRApp(SummaryCards, { nodes: normalizeNodes([{ id: 1, price: 1200, currency: 'CNY', billing_cycle: 'yearly', expires_in: 100 }]), cards: ['remaining_value'], scope: 'all', showPrice: false, currency: 'CNY', rates: {}, rateLabel: '', ratesLoading: false, canCalculate: false }))
    expect(html).toContain('费用已隐藏')
    expect(html).not.toContain('¥')
    expect(html).not.toContain('已计入')
    expect(html).not.toContain('<button')
  })
})
