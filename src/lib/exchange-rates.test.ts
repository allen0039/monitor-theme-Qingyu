import { createRenderer, nextTick, ref, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REFERENCE_RATES } from './finance'

let stored: string | null, app: App | undefined
beforeEach(() => {
  vi.resetModules()
  stored = null
  vi.stubGlobal('localStorage', { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value } })
})
afterEach(() => { app?.unmount(); app = undefined; vi.useRealTimers(); vi.unstubAllGlobals() })
const today = new Date('2026-10-11T12:00:00Z')
const quote = (rates = REFERENCE_RATES, date = '2026-10-11') => new Response(JSON.stringify({ base: 'CNY', date, rates }))

describe('每日汇率', () => {
  it('北京时间跨日正确，只接受有效的逐币种汇率', async () => {
    const { beijingDateKey, sanitizeRates } = await import('./exchange-rates')
    expect(beijingDateKey(new Date('2026-10-11T16:00:00Z'))).toBe('2026-10-12')
    expect(sanitizeRates({ USD: 0.125, CNY: 99, EUR: 0, GBP: '1', JPY: Infinity })).toEqual({ CNY: 1, USD: 0.125 })
  })
  it('共享并发请求，保留报价日期，同一天从缓存读取', async () => {
    const fetcher = vi.fn().mockResolvedValue(quote(REFERENCE_RATES, '2026-10-09'))
    vi.stubGlobal('fetch', fetcher)
    const { getExchangeRates } = await import('./exchange-rates')
    const first = getExchangeRates(today), second = getExchangeRates(today)
    expect(first).toBe(second)
    expect(await first).toMatchObject({ source: 'network', date: '2026-10-09' })
    expect(await getExchangeRates(today)).toMatchObject({ source: 'cache', date: '2026-10-09' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('部分币种源可以合并同日的后备源，不要求所有币种齐全', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(quote({ CNY: 1, USD: 0.125 })).mockResolvedValueOnce(quote({ CNY: 1, KRW: 200 })))
    const { getExchangeRates } = await import('./exchange-rates')
    expect(await getExchangeRates(today)).toMatchObject({ rates: { CNY: 1, USD: 0.125, KRW: 200 }, source: 'network' })
  })
  it('拒绝错误基准，网络失败回退旧缓存而不混入参考值', async () => {
    stored = JSON.stringify({ base: 'CNY', date: '2026-10-10', rates: { CNY: 1, USD: 0.125 } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ base: 'USD', rates: REFERENCE_RATES }))).mockRejectedValueOnce(new Error('offline')))
    const { getExchangeRates } = await import('./exchange-rates')
    expect(await getExchangeRates(today)).toEqual({ rates: { CNY: 1, USD: 0.125 }, date: '2026-10-10', fetchedDay: '2026-10-10', source: 'stale-cache' })
  })
  it('每个来源超时后继续回退，并明确标注参考估算', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => options.signal!.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError'))))))
    const { getExchangeRates } = await import('./exchange-rates')
    const result = getExchangeRates(today)
    await vi.advanceTimersByTimeAsync(10000)
    expect(await result).toMatchObject({ source: 'reference', date: null, rates: REFERENCE_RATES })
  })
  it('费用不可见时不请求；隐藏费用会中止正在进行的请求', async () => {
    vi.useFakeTimers()
    const doc = Object.assign(new EventTarget(), { hidden: false })
    vi.stubGlobal('document', doc)
    const fetcher = vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => options.signal!.addEventListener('abort', () => reject(new DOMException('cancel', 'AbortError')))))
    vi.stubGlobal('fetch', fetcher)
    const { useExchangeRates } = await import('./exchange-rates')
    const renderer = createRenderer<Record<string, unknown>, Record<string, unknown>>({ patchProp: () => {}, insert: () => {}, remove: () => {}, createElement: () => ({}), createText: () => ({}), createComment: () => ({}), setText: () => {}, setElementText: () => {}, parentNode: () => null, nextSibling: () => null })
    const enabled = ref(false)
    app = renderer.createApp({ setup() { useExchangeRates(enabled); return () => null } })
    app.mount({})
    await vi.advanceTimersByTimeAsync(60000)
    expect(fetcher).not.toHaveBeenCalled()
    enabled.value = true
    await nextTick()
    expect(fetcher).toHaveBeenCalledTimes(1)
    enabled.value = false
    await nextTick()
    expect(fetcher.mock.calls[0]![1].signal!.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(60000)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
