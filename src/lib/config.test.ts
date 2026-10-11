import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultConfig, loadConfig, parseConfig, summaryKeys } from './config'
import { safeImageUrl } from './format'
import { parsePing, selectPingNetworks } from './ping'

afterEach(() => vi.unstubAllGlobals())

describe('详细主题设置', () => {
  it('兼容旧站点保存的配置，新增项补默认值且保留关闭状态', () => {
    const old = { notice: '维护公告', earth_mode: 'map', layout: 'list', offline_last: true, show_ping: false, show_price: false, hide_admin: true, reduce_motion: true, background_light: 'https://example.com/bg.jpg', background_dark: '', background_blur: 4, footer_text: '备案号', footer_url: 'https://example.com' }
    expect(parseConfig(old)).toEqual({ ...defaultConfig(), ...old })
    expect(parseConfig({ show_summary: false, background_opacity: 0, theme_mode: 'dark' })).toMatchObject({ show_summary: false, background_opacity: 0, theme_mode: 'dark' })
  })

  it('错误类型、越界数值和不支持的选项不会破坏页面', () => {
    const malformed = { card_size: 'giant', summary_preset: 'unknown', ping_mode: 'all', ping_max_lines: 9, ping_refresh_interval: 0, earth_rotation_speed: NaN, poll_interval: '3', background_opacity: 101, show_cpu: 'false' }
    expect(parseConfig(malformed)).toEqual(defaultConfig())
    expect(parseConfig(null)).toEqual(defaultConfig())
    expect(parseConfig([])).toEqual(defaultConfig())
  })

  it('自定义总览保留显示顺序，忽略重复和未知项，允许全部清空', () => {
    expect(summaryKeys(parseConfig({ summary_preset: 'custom', summary_cards: 'regions, cpu\nmemory，cpu unknown online' }))).toEqual(['regions', 'cpu', 'memory', 'online'])
    expect(summaryKeys(parseConfig({ summary_preset: 'custom', summary_cards: '' }))).toEqual([])
    expect(summaryKeys(parseConfig({ summary_preset: 'resources', summary_cards: 'online' }))).toEqual(['cpu', 'memory', 'disk'])
  })

  it('设置接口返回坏数据或不可用时使用主题默认值', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('not json')).mockResolvedValueOnce(new Response('{}', { status: 404 })).mockResolvedValueOnce(new Response(JSON.stringify({ theme_mode: 'dark', show_ping: false }))))
    expect(await loadConfig()).toEqual(defaultConfig())
    expect(await loadConfig()).toEqual(defaultConfig())
    expect(await loadConfig()).toMatchObject({ theme_mode: 'dark', show_ping: false })
  })

  it('线路按完整名称或 ID 排序，同名全部匹配并去重，不匹配时不偷偷回退', () => {
    const networks = parsePing({ probes: { 1: '电信', 2: '联通', 3: '电信', 4: '移动' }, ping: [] })
    expect(selectPingNetworks(networks, '移动, 电信，2\n1', 8).map((network) => network.id)).toEqual([4, 1, 3, 2])
    expect(selectPingNetworks(networks, '', 2.9).map((network) => network.id)).toEqual([1, 2])
    expect(selectPingNetworks(networks, '不存在,电', 3)).toEqual([])
  })

  it('图片支持站内路径，拒绝脚本、协议相对路径和反斜杠路径', () => {
    expect(safeImageUrl('/images/icon.png')).toBe('/images/icon.png')
    expect(safeImageUrl('https://example.com/icon.png')).toBe('https://example.com/icon.png')
    for (const value of ['javascript:alert(1)', 'data:text/html,test', '//example.com/icon.png', '/\\example.com/icon.png', '/\n/example.com/icon.png']) expect(safeImageUrl(value)).toBe('')
  })
})
