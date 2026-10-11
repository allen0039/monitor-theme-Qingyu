import { createRenderer, nextTick, ref, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConfig, parseConfig } from './config'
import { isDarkTheme, usePreferences } from './preferences'

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
})
