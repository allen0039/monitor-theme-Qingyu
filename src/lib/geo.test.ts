import { describe, expect, it } from 'vitest'
import { normalizeNodes } from './data'
import { arcsToCountry, clustersOf, COORD_MAP } from './geo'

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
})
