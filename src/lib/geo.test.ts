import { afterEach, describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { normalizeNodes } from './data'
import { arcsToCountry, clustersOf, COORD_MAP, layoutMapMarkers, sortClusters } from './geo'
import { clearPingCacheForTest, parsePing, seedPingCacheForTest } from './ping'
import worldCountryIndex from '../assets/world-map-countries.json'
import worldPaths from '../assets/world-map.json'
import GeoMap from '../components/GeoMap.vue'

describe('地球访客连线', () => {
  const nodes = normalizeNodes([
    { id: 1, name: '东京 1', country: 'JP', online: true },
    { id: 2, name: '东京 2', country: 'JP', online: true },
    { id: 3, name: '洛杉矶', country: 'US', online: false },
    { id: 4, name: '上海', country: 'CN', online: true },
    { id: 5, name: '未知地区', country: 'ZZ', online: true },
  ])

  it('同一国家只绘制一条连线，离线地区仍保留位置，跳过未知地区和同国路径', () => {
    expect(arcsToCountry(clustersOf(nodes), 'CN')).toEqual([
      { fromLat: COORD_MAP.JP[0], fromLng: COORD_MAP.JP[1], toLat: COORD_MAP.CN[0], toLng: COORD_MAP.CN[1] },
      { fromLat: COORD_MAP.US[0], fromLng: COORD_MAP.US[1], toLat: COORD_MAP.CN[0], toLng: COORD_MAP.CN[1] },
    ])
  })

  it('未定位、关闭访客信息或不支持的访客地区都不生成虚构目的地', () => {
    const clusters = clustersOf(nodes)
    expect(arcsToCountry(clusters, '')).toEqual([])
    expect(arcsToCountry(clusters, 'ZZ')).toEqual([])
    expect(arcsToCountry([], 'CN')).toEqual([])
  })

  it('切换分组和重新定位后，只连接当前分组与新的访客国家', () => {
    const grouped = clustersOf(nodes.filter(node => node.country === 'US'))
    expect(arcsToCountry(grouped, 'JP')).toEqual([
      { fromLat: COORD_MAP.US[0], fromLng: COORD_MAP.US[1], toLat: COORD_MAP.JP[0], toLng: COORD_MAP.JP[1] },
    ])
    expect(arcsToCountry(grouped, 'US')).toEqual([])
  })

  it('区域列表按在线数、总数和实时吞吐排序，近邻胶囊自动避让不重叠', () => {
    const ranked = sortClusters(clustersOf(normalizeNodes([
      { id: 1, country: 'DE', online: true, metrics: { cpu: 1, load: [0, 0, 0], mem_total: 1, mem_used: 0, disk_total: 1, disk_used: 0, net_tx: 100, net_rx: 100, uptime: 10 } },
      { id: 2, country: 'FR', online: false },
      { id: 3, country: 'NL', online: true, metrics: { cpu: 1, load: [0, 0, 0], mem_total: 1, mem_used: 0, disk_total: 1, disk_used: 0, net_tx: 500, net_rx: 500, uptime: 10 } },
      { id: 4, country: 'CN', online: true, metrics: { cpu: 1, load: [0, 0, 0], mem_total: 1, mem_used: 0, disk_total: 1, disk_used: 0, net_tx: 200, net_rx: 200, uptime: 10 } },
      { id: 5, country: 'CN', online: true, metrics: { cpu: 1, load: [0, 0, 0], mem_total: 1, mem_used: 0, disk_total: 1, disk_used: 0, net_tx: 300, net_rx: 300, uptime: 10 } },
    ])))
    expect(ranked.map(c => c.code)).toEqual(['CN', 'NL', 'DE', 'FR'])

    const markers = layoutMapMarkers(ranked)
    const cn = markers.find(m => m.cluster.code === 'CN')!
    const de = markers.find(m => m.cluster.code === 'DE')!
    const nl = markers.find(m => m.cluster.code === 'NL')!
    expect(cn.x).toBe(cn.anchorX)
    expect(cn.y).toBe(cn.anchorY)
    expect(Math.abs(de.x - nl.x) >= 40 || Math.abs(de.y - nl.y) >= 24).toBe(true)
    for (const m of markers) {
      expect(m.leftPct).toBeGreaterThan(0)
      expect(m.leftPct).toBeLessThan(100)
      expect(m.topPct).toBeGreaterThan(0)
      expect(m.topPct).toBeLessThan(100)
    }
  })

  afterEach(() => {
    clearPingCacheForTest()
  })

  it('地图高亮分档点阵、渲染紧凑数字标点、微图例与地区列表，微区不误亮邻国', async () => {
    const metrics = { cpu: 1, load: [0, 0, 0], mem_total: 1, mem_used: 0, disk_total: 1, disk_used: 0, net_tx: 435 * 1024, net_rx: 912 * 1024, uptime: 10 }
    const sgOnly = normalizeNodes([{ id: 1, name: '新加坡', country: 'SG', online: true, metrics }])
    const sgHtml = await renderToString(createSSRApp(GeoMap, { nodes: sgOnly, showLabels: true }))
    expect(sgHtml).not.toContain('land-online-')
    expect(sgHtml).toContain('geo-marker-pill')
    expect(sgHtml).toContain('geo-map-legend')
    expect(sgHtml).toContain('geo-region-row')
    expect(sgHtml).toContain('↑435KB/s')
    expect(sgHtml).toContain('↓912KB/s')

    const mixed = normalizeNodes([
      { id: 1, name: '中国', country: 'CN', online: true, metrics },
      { id: 2, name: '美国 1', country: 'US', online: true, metrics },
      { id: 3, name: '美国 2', country: 'US', online: true, metrics },
      { id: 4, name: '日本', country: 'JP', online: false },
    ])
    const html = await renderToString(createSSRApp(GeoMap, { nodes: mixed, showLabels: true }))
    const index = worldCountryIndex as Record<string, number>
    expect(html).toContain((worldPaths as string[])[index.CN!]!)
    expect(html).toContain((worldPaths as string[])[index.US!]!)
    expect(html).toContain('land-online-1-')
    expect(html).toContain('land-online-2-')
    expect(html).toContain('1/1')
    expect(html).toContain('2/2')
    expect(html).toContain('0/1')

    const noLabels = await renderToString(createSSRApp(GeoMap, { nodes: mixed, showLabels: false }))
    expect(noLabels).not.toContain('geo-marker-pill')
    expect(noLabels).toContain('geo-region-list')

    const emptyHtml = await renderToString(createSSRApp(GeoMap, { nodes: [], showLabels: true }))
    expect(emptyHtml).not.toContain('geo-region-list')
    expect(emptyHtml).toContain('geo-map-body-full')

    const sixCodes = ['US', 'JP', 'HK', 'CN', 'SG', 'DE']
    const sixNodes = normalizeNodes(sixCodes.map((country, id) => ({ id: id + 1, name: country, country, online: true, metrics })))
    const sixHtml = await renderToString(createSSRApp(GeoMap, { nodes: sixNodes, showLabels: true }))
    expect(sixHtml.match(/geo-region-row/g)).toHaveLength(6)
    expect(sixHtml).not.toContain('geo-more-btn')

    const eightCodes = [...sixCodes, 'GB', 'AU']
    const eightNodes = normalizeNodes(eightCodes.map((country, id) => ({ id: id + 1, name: country, country, online: true, metrics })))
    const eightHtml = await renderToString(createSSRApp(GeoMap, { nodes: eightNodes, showLabels: true }))
    expect(eightHtml.match(/geo-region-row/g)).toHaveLength(8)
    expect(eightHtml.match(/geo-marker-pill/g)).toHaveLength(8)
    expect(eightHtml).not.toContain('geo-more-btn')
  })

  it('开启延迟监控后直接复用卡片缓存展示全局与分地区平均延迟，未缓存地区保持占位', async () => {
    const metrics = { cpu: 1, load: [0, 0, 0], mem_total: 1, mem_used: 0, disk_total: 1, disk_used: 0, net_tx: 1024, net_rx: 2048, uptime: 10 }
    const nodes = normalizeNodes([
      { id: 101, name: '日本 1', country: 'JP', online: true, metrics },
      { id: 102, name: '日本 2', country: 'JP', online: true, metrics },
      { id: 103, name: '美国 1', country: 'US', online: true, metrics },
      { id: 104, name: '日本 3', country: 'JP', online: false },
      { id: 105, name: '日本 4', country: 'JP', online: true },
    ])

    const coldHtml = await renderToString(createSSRApp(GeoMap, { nodes, showLabels: true, pingEnabled: true }))
    expect(coldHtml).toContain('平均延迟')
    expect(coldHtml).toContain('latency-badge-unknown geo-region-latency')
    expect(coldHtml).not.toMatch(/\d+ms/)

    seedPingCacheForTest(101, parsePing({ probes: { 1: '电信' }, ping: [{ task_id: 1, ts: 60, latency: 60 }], loss: { 1: 0 } }))
    seedPingCacheForTest(102, parsePing({ probes: { 1: '电信' }, ping: [{ task_id: 1, ts: 60, latency: 80 }], loss: { 1: 0 } }))
    for (const id of [104, 105]) {
      seedPingCacheForTest(id, parsePing({ ping: [{ task_id: 1, ts: 60, latency: 500 }] }))
    }
    const warmHtml = await renderToString(createSSRApp(GeoMap, { nodes, showLabels: true, pingEnabled: true }))
    expect(warmHtml).toContain('70 ms')
    expect(warmHtml).toContain('70ms')
    expect(warmHtml).toContain('latency-badge-green geo-region-latency')
    expect(warmHtml).toContain('latency-badge-unknown geo-region-latency')
    expect(warmHtml).not.toContain('500ms')

    seedPingCacheForTest(103, parsePing({ ping: [{ task_id: 1, ts: 60, latency: 200 }] }))
    const fullHtml = await renderToString(createSSRApp(GeoMap, { nodes, showLabels: true, pingEnabled: true }))
    expect(fullHtml).toContain('113 ms')
    expect(fullHtml).toContain('70ms')
    expect(fullHtml).toContain('200ms')
    expect(fullHtml).toContain('latency-badge-orange')
    expect(fullHtml).toContain('latency-pill-yellow')
    expect(fullHtml).toContain('latency-text-yellow')
    expect(fullHtml).not.toContain('latency-badge-unknown geo-region-latency')
  })

  it('地区 5 台在线仅 3 台有延迟读数时按 3 台求均值并显示 3/5 覆盖，无读数地区显示灰色占位，156 ms 与首页详情同为黄色', async () => {
    const metrics = { cpu: 1, load: [0, 0, 0], mem_total: 1, mem_used: 0, disk_total: 1, disk_used: 0, net_tx: 1024, net_rx: 2048, uptime: 10 }
    const nodes = normalizeNodes([
      { id: 201, name: '日本 1', country: 'JP', group: '亚太', online: true, metrics },
      { id: 202, name: '日本 2', country: 'JP', group: '亚太', online: true, metrics },
      { id: 203, name: '日本 3', country: 'JP', group: '亚太', online: true, metrics },
      { id: 204, name: '日本 4', country: 'JP', group: '亚太', online: true, metrics }, // 全超时，无可用读数
      { id: 205, name: '日本 5', country: 'JP', group: '亚太', online: true }, // 等待指标上报
      { id: 206, name: '日本 6', country: 'JP', group: '亚太', online: false }, // 离线
      { id: 207, name: '新加坡 1', country: 'SG', group: '亚太', online: true, metrics },
      { id: 208, name: '美国 1', country: 'US', group: '美洲', online: true, metrics },
    ])
    seedPingCacheForTest(201, parsePing({ ping: [{ task_id: 1, ts: 60, latency: 100 }] }))
    seedPingCacheForTest(202, parsePing({ ping: [{ task_id: 1, ts: 60, latency: 140 }] }))
    seedPingCacheForTest(203, parsePing({ ping: [{ task_id: 1, ts: 60, latency: 228 }] }))
    seedPingCacheForTest(204, parsePing({ ping: [{ task_id: 1, ts: 60, latency: null, loss: 100 }], loss: { 1: 100 } }))
    seedPingCacheForTest(208, parsePing({ ping: [{ task_id: 1, ts: 60, latency: 300 }] }))

    const asiaNodes = nodes.filter(n => n.group === '亚太')
    const html = await renderToString(createSSRApp(GeoMap, { nodes: asiaNodes, showLabels: true, pingEnabled: true }))
    // 顶部统计当前分组（亚太）：6 台在线，3 台有读数，均值 (100+140+228)/3 = 156 ms（黄色）
    expect(html).toContain('latency-pill-yellow')
    expect(html).toContain('latency-text-yellow')
    expect(html).toContain('156 ms')
    expect(html).toContain('6 台在线，3 台有延迟读数（3/6）')
    // 日本地区：5 台在线，3 台有延迟读数，均值 156ms（黄色）
    expect(html).toContain('latency-badge-yellow')
    expect(html).toContain('156ms')
    expect(html).toContain('5 台在线，3 台有延迟读数（3/5）')
    expect(html).not.toContain('延迟分档：')
    // 新加坡地区：1 台在线，0 台有延迟读数，显示灰色 —
    expect(html).toContain('latency-badge-unknown')
    expect(html).toContain('1 台在线，0 台有延迟读数（0/1）')
    // 地图标记仍保留在线/部分在线状态
    expect(html).toContain('is-tier2 is-partial geo-marker-pill')
    // 当前分组不含美洲 300 ms 节点
    expect(html).not.toContain('300ms')
  })

  it.each([
    [90.49, '90', 'green'],
    [90.5, '91', 'yellow'],
    [180.49, '180', 'yellow'],
    [180.5, '181', 'orange'],
    [260.49, '260', 'orange'],
    [260.5, '261', 'red'],
  ])('地图顶部与地区行对边界值 %s ms 取整为 %s ms 并着色为 %s', async (raw, rounded, tone) => {
    const metrics = { cpu: 1, load: [0, 0, 0], mem_total: 1, mem_used: 0, disk_total: 1, disk_used: 0, net_tx: 1024, net_rx: 2048, uptime: 10 }
    const nodes = normalizeNodes([{ id: 301, name: '德国', country: 'DE', online: true, metrics }])
    seedPingCacheForTest(301, parsePing({ ping: [{ task_id: 1, ts: 60, latency: raw }] }))
    const html = await renderToString(createSSRApp(GeoMap, { nodes, showLabels: true, pingEnabled: true }))
    expect(html).toContain(`latency-pill-${tone}`)
    expect(html).toContain(`latency-text-${tone}`)
    expect(html).toContain(`latency-badge-${tone}`)
    expect(html).toContain(`${rounded} ms`)
    expect(html).toContain(`${rounded}ms`)
  })
})
