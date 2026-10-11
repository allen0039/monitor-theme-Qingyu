import { createRenderer, nextTick, ref, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFinancePreferences, useFinancePreferences } from './finance-preferences'

const renderer = createRenderer<Record<string, unknown>, Record<string, unknown>>({ patchProp: () => {}, insert: () => {}, remove: () => {}, createElement: () => ({}), createText: () => ({}), createComment: () => ({}), setText: () => {}, setElementText: () => {}, parentNode: () => null, nextSibling: () => null })
let app: App | undefined, stored: string | null
beforeEach(() => { stored = null; vi.stubGlobal('localStorage', { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value } }) })
afterEach(() => { app?.unmount(); app = undefined; vi.unstubAllGlobals() })
function mount(ids = [1, 2]) {
  const available = ref(ids)
  let prefs!: ReturnType<typeof useFinancePreferences>
  app = renderer.createApp({ setup() { prefs = useFinancePreferences(() => available.value); return () => null } })
  app.mount({})
  return { available, prefs }
}
describe('个人机器选择', () => {
  it('首次全选，之后新增节点不擅自加入，删除节点才清理', async () => {
    const { available, prefs } = mount()
    expect(prefs.selectedIds.value).toEqual([1, 2])
    available.value = [1, 2, 3]
    await nextTick()
    expect(prefs.selectedIds.value).toEqual([1, 2])
    available.value = [2, 3]
    await nextTick()
    expect(prefs.selectedIds.value).toEqual([2])
  })
  it('空选择与首次使用不同，刷新恢复空选和个人币种', () => {
    stored = JSON.stringify({ selectedIds: [], currency: 'USD' })
    const { prefs } = mount()
    expect(prefs.selectedIds.value).toEqual([])
    expect(prefs.currency.value).toBe('USD')
    prefs.currency.value = 'EUR'
    expect(readFinancePreferences()).toEqual({ selectedIds: [], currency: 'EUR' })
  })
  it('读取损坏或重复 ID 不会破坏节点选择', () => {
    stored = JSON.stringify({ selectedIds: [1, 1, 2], currency: 'RMB' })
    expect(readFinancePreferences()).toEqual({ selectedIds: [1, 2], currency: 'CNY' })
    stored = JSON.stringify({ selectedIds: ['1'], currency: 'unknown' })
    expect(readFinancePreferences()).toEqual({ selectedIds: null, currency: 'CNY' })
  })
  it('浏览器存储不可用仍能修改当前页面选择', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('disabled') }, setItem: () => { throw new Error('disabled') } })
    const { prefs } = mount()
    prefs.selectedIds.value = [2]
    expect(prefs.selectedIds.value).toEqual([2])
    expect(prefs.storageAvailable.value).toBe(false)
  })
})
