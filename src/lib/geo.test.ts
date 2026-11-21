import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { normalizeNodes } from './data'
import { arcsToCountry, clustersOf, COORD_MAP, layoutMapMarkers, sortClusters } from './geo'
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

  it('地图高亮激活国家点阵并渲染胶囊和右侧地区列表，微区不误亮邻国', async () => {
    const metrics = { cpu: 1, load: [0, 0, 0], mem_total: 1, mem_used: 0, disk_total: 1, disk_used: 0, net_tx: 435 * 1024, net_rx: 912 * 1024, uptime: 10 }
    const sgOnly = normalizeNodes([{ id: 1, name: '新加坡', country: 'SG', online: true, metrics }])
    const sgHtml = await renderToString(createSSRApp(GeoMap, { nodes: sgOnly, showLabels: true }))
    expect(sgHtml).not.toContain('land-online-')
    expect(sgHtml).toContain('geo-marker-pill')
    expect(sgHtml).toContain('geo-region-row')
    expect(sgHtml).toContain('↑ 435 KB/s')
    expect(sgHtml).toContain('↓ 912 KB/s')

    const mixed = normalizeNodes([
      { id: 1, name: '中国', country: 'CN', online: true, metrics },
      { id: 2, name: '美国', country: 'US', online: false },
    ])
    const html = await renderToString(createSSRApp(GeoMap, { nodes: mixed, showLabels: true }))
    const index = worldCountryIndex as Record<string, number>
    expect(html).toContain((worldPaths as string[])[index.CN!]!)
    expect(html).toContain((worldPaths as string[])[index.US!]!)
    expect(html).toContain('1/1')
    expect(html).toContain('0/1')

    const noLabels = await renderToString(createSSRApp(GeoMap, { nodes: mixed, showLabels: false }))
    expect(noLabels).not.toContain('geo-marker-pill')
    expect(noLabels).toContain('geo-region-list')

    const emptyHtml = await renderToString(createSSRApp(GeoMap, { nodes: [], showLabels: true }))
    expect(emptyHtml).not.toContain('geo-region-list')
    expect(emptyHtml).toContain('geo-map-body-full')
  })
})
