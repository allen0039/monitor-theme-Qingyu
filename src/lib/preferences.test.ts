import { createRenderer, nextTick, ref, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConfig, parseConfig } from './config'
import { isDarkTheme, usePreferences } from './preferences'
import { applyDisplaySettings, normalizeDisplaySettings } from './display-settings'

const renderer = createRenderer<Record<string, unknown>, Record<string, unknown>>({
  patchProp: () => {}, insert: () => {}, remove: () => {},
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  setText: () => {}, setElementText: () => {}, parentNode: () => null, nextSibling: () => null,
})
let app: App | undefined
let stored: string | null
beforeEach(() => {
  vi.useFakeTimers()
  stored = null
  vi.stubGlobal('localStorage', { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value } })
  vi.stubGlobal('matchMedia', () => Object.assign(new EventTarget(), { matches: false }))
  vi.stubGlobal('document', { documentElement: { classList: { toggle: vi.fn() } }, querySelector: () => null })
})
afterEach(() => { app?.unmount(); app = undefined; vi.useRealTimers(); vi.unstubAllGlobals() })

function mountPreferences() {
  const config = ref(defaultConfig())
  let prefs!: ReturnType<typeof usePreferences>
  app = renderer.createApp({ setup() { prefs = usePreferences(config); return () => null } })
  app.mount({})
  return { config, prefs }
}

describe('站点默认与浏览器偏好', () => {
  it('没有手动选择的项目会跟随异步加载和后续更新的站点默认', async () => {
    const { config, prefs } = mountPreferences()
    prefs.group.value = '亚洲'
    await nextTick()
    expect(JSON.parse(stored!)).toMatchObject({ theme: null, sort: null, pingDetails: null })
    config.value = parseConfig({ theme_mode: 'dark', layout: 'list', earth_mode: 'map', default_sort: 'cpu', ping_mode: 'details', offline_last: true })
    expect([prefs.theme.value, prefs.layout.value, prefs.earth.value, prefs.sort.value, prefs.pingDetails.value, prefs.offlineLast.value]).toEqual(['dark', 'list', 'map', 'cpu', true, true])
    expect(prefs.dark.value).toBe(true)
  })

  it('保留旧浏览器偏好，恢复默认后继续跟随主控设置', async () => {
    stored = JSON.stringify({ theme: 'light', layout: 'list', earth: 'hide', sort: 'name', pingDetails: false, offlineLast: false, group: '欧洲' })
    const { config, prefs } = mountPreferences()
    config.value = parseConfig({ theme_mode: 'dark', layout: 'card', earth_mode: 'map', default_sort: 'cpu', ping_mode: 'details', offline_last: true })
    expect([prefs.theme.value, prefs.layout.value, prefs.earth.value, prefs.sort.value, prefs.pingDetails.value, prefs.offlineLast.value]).toEqual(['light', 'list', 'hide', 'name', false, false])
    prefs.resetPreferences()
    await nextTick()
    expect([prefs.theme.value, prefs.layout.value, prefs.earth.value, prefs.sort.value, prefs.pingDetails.value, prefs.offlineLast.value]).toEqual(['dark', 'card', 'map', 'cpu', true, true])
    expect(prefs.group.value).toBeNull()
    expect(JSON.parse(stored!)).toMatchObject({ theme: null, layout: null, earth: null, sort: null, pingDetails: null, offlineLast: null })
  })

  it('北京时间自动在六点与十八点切换，不受访问者时区或系统配色影响', () => {
    for (const [utc, dark] of [['2026-10-10T21:59:59Z', true], ['2026-10-10T22:00:00Z', false], ['2026-10-11T09:59:59Z', false], ['2026-10-11T10:00:00Z', true]] as const) {
      expect(isDarkTheme('beijing', false, new Date(utc))).toBe(dark)
      expect(isDarkTheme('beijing', true, new Date(utc))).toBe(dark)
    }
    expect(isDarkTheme('auto', true)).toBe(true)
    expect(isDarkTheme('light', true)).toBe(false)
  })

  it('新增显示偏好立即生效并保存，其余选项继续跟随站点默认', async () => {
    const { config, prefs } = mountPreferences()
    prefs.setPreference('card_size', 'large')
    prefs.setPreference('show_cpu', false)
    prefs.setPreference('summary_preset', 'custom')
    prefs.setPreference('summary_cards', 'disk memory')
    prefs.setPreference('earth_rotation_speed', 2.5)
    await nextTick()
    expect(prefs.config.value).toMatchObject({ card_size: 'large', show_cpu: false, summary_preset: 'custom', summary_cards: 'disk memory', earth_rotation_speed: 2.5 })
    expect(JSON.parse(stored!).display).toMatchObject({ card_size: 'large', show_cpu: false, earth_rotation_speed: 2.5 })
    config.value = parseConfig({ card_size: 'mini', show_cpu: true, show_memory: false, summary_scope: 'all' })
    expect(prefs.config.value).toMatchObject({ card_size: 'large', show_cpu: false, show_memory: false, summary_scope: 'all' })
    prefs.resetPreferences()
    await nextTick()
    expect(prefs.config.value).toEqual(config.value)
    expect(JSON.parse(stored!).display).toEqual({})
  })

  it('分类面板与首页快捷入口双向同步，保留旧存储格式', async () => {
    const { prefs } = mountPreferences()
    prefs.setPreference('theme_mode', 'dark')
    prefs.setPreference('layout', 'list')
    prefs.setPreference('earth_mode', 'map')
    prefs.setPreference('default_sort', 'cpu')
    prefs.setPreference('ping_mode', 'details')
    prefs.setPreference('offline_last', true)
    expect([prefs.theme.value, prefs.layout.value, prefs.earth.value, prefs.sort.value, prefs.pingDetails.value, prefs.offlineLast.value]).toEqual(['dark', 'list', 'map', 'cpu', true, true])
    prefs.layout.value = 'card'
    prefs.pingDetails.value = false
    await nextTick()
    expect(prefs.config.value).toMatchObject({ layout: 'card', ping_mode: 'summary' })
    expect(JSON.parse(stored!)).toMatchObject({ theme: 'dark', layout: 'card', earth: 'map', sort: 'cpu', pingDetails: false, offlineLast: true })
  })

  it('恢复新偏好时过滤坏值与站点专属字段，无法绕过关闭费用和延迟的规则', () => {
    stored = JSON.stringify({ display: { card_size: 'large', show_price: true, show_personal_finance: true, show_ping: true, hide_price_logged_out: false, hide_admin: false, site_icon: 'https://example.com/other.png', poll_interval: 0, earth_rotation_speed: 9, ping_max_lines: 3.5 } })
    const { config, prefs } = mountPreferences()
    config.value = parseConfig({ show_price: false, show_personal_finance: false, show_ping: false, hide_price_logged_out: true, hide_admin: true, site_icon: '/site.png' })
    expect(prefs.config.value).toMatchObject({ card_size: 'large', show_price: false, show_personal_finance: false, show_ping: false, hide_price_logged_out: true, hide_admin: true, site_icon: '/site.png', poll_interval: 5, earth_rotation_speed: 1.6, ping_max_lines: 3 })
  })

  it('有效零值和关闭状态会保留，非法数字与未知字段不会覆盖站点设置', () => {
    expect(normalizeDisplaySettings({ background_opacity: 0, show_cpu: false, poll_interval: Infinity, ping_refresh_interval: 10, layout: 'grid', unknown: true })).toEqual({ background_opacity: 0, show_cpu: false })
    expect(applyDisplaySettings(parseConfig({ hide_price_logged_out: true, footer_text: '站点页脚' }), { hide_price_logged_out: false, footer_text: '其它文字', background_opacity: 0 })).toMatchObject({ hide_price_logged_out: true, footer_text: '站点页脚', background_opacity: 0 })
  })

  it('存储不可用时仍能在当前页面调整显示，并报告未保存', async () => {
    const { prefs } = mountPreferences()
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('blocked') } })
    prefs.setPreference('card_size', 'large')
    await nextTick()
    expect(prefs.config.value.card_size).toBe('large')
    expect(prefs.storageAvailable.value).toBe(false)
  })

  it('系统减少动态效果优先于个人动画选项', () => {
    vi.stubGlobal('matchMedia', (query: string) => Object.assign(new EventTarget(), { matches: query.includes('reduced-motion') }))
    const { prefs } = mountPreferences()
    prefs.setPreference('reduce_motion', false)
    expect(prefs.reduceMotion.value).toBe(true)
  })
})
