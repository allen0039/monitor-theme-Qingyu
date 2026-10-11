import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import NodeCard from '../components/NodeCard.vue'
import { defaultConfig } from './config'
import { normalizeNodes } from './data'
import type { ThemeConfig } from '../types'

const GB = 1024 ** 3
function render(changes: Record<string, unknown> = {}, config: Partial<ThemeConfig> = {}, showPrice = true) {
  const node = normalizeNodes([{ id: 1, name: '东京', online: true, price: 29.9, currency: 'CNY', billing_cycle: 'monthly', expires_in: 12, month_tx: 316 * GB, month_rx: 632 * GB, total_tx: 1896 * GB, total_rx: 3792 * GB, traffic_reset_day: 1, ...changes }])[0]!
  return renderToString(createSSRApp(NodeCard, { node, config: { ...defaultConfig(), ...config }, showPing: false, pingDetails: false, showPrice }))
}
describe('节点信息带与费用隐私', () => {
  it('月上传下载使用独立方向，付款标价与剩余金额分别展示', async () => {
    const html = await render()
    expect(html).toContain('当月流量 · 上传 316.00 GB')
    expect(html).toContain('当月流量 · 下载 632.00 GB')
    expect(html).toContain('¥29.90 / 月')
    expect(html).toContain('剩余价值 ¥11.96 CNY')
  })
  it('隐藏费用同时隐藏标价、剩余金额、币种和金额 tooltip，保留到期', async () => {
    const html = await render({}, {}, false)
    expect(html).not.toContain('¥')
    expect(html).not.toContain('29.90')
    expect(html).not.toContain('CNY')
    expect(html).toContain('剩余12天')
  })
  it('离线仍计算剩余价值，缺到期信息显示未知并说明原因', async () => {
    expect(await render({ online: false })).toContain('剩余价值 ¥11.96 CNY')
    const html = await render({ expires_in: null })
    expect(html).toContain('缺少到期信息')
    expect(html).not.toContain('¥0.00')
  })
  it('完整在线时长与累计上下行直接展示，关闭硬件信息不影响数据，显隐开关仍生效', async () => {
    const changes = { metrics: { cpu: 1, load: [0, 0, 0], mem_total: GB, mem_used: 0, disk_total: GB, disk_used: 0, net_tx: 0, net_rx: 0, uptime: 14 * 86400 + 5 * 3600 } }
    const html = await render(changes, { show_node_metadata: false })
    expect(html).toContain('14 天 5 小时')
    expect(html).toContain('<span>累计</span>')
    expect(html).toContain('累计上传 1.85 TB')
    expect(html).toContain('累计下载 3.70 TB')
    expect(html).not.toContain('<details')
    expect(await render(changes, { show_uptime: false })).not.toContain('14 天 5 小时')
    expect(await render({}, { show_node_metadata: false, show_total_traffic: false })).not.toContain('累计上传')
  })
  it('自定义重置日使用当期文案，非法重置日按旧协议回退', async () => {
    expect(await render({ traffic_reset_day: 15 })).toContain('当期流量 · 上传')
    expect(await render({ traffic_reset_day: 33 })).toContain('当月流量 · 上传')
  })
})
