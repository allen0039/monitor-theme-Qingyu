import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { detectClient, fetchVisitorGeo, parseVisitorGeo } from './visitor'
const geo = { ip: '203.0.113.7', country: 'Japan', country_code: 'jp', city: 'Tokyo', isp: 'Example ISP' }

beforeEach(() => {
  const cache = new Map<string, string>()
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => cache.get(key) ?? null, setItem: (key: string, value: string) => cache.set(key, value) })
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('访客气泡', () => {
  it('优先识别 Edge 和 Opera，覆盖 iOS 浏览器和 iPad 桌面 UA', () => {
    expect(detectClient('Chrome/125 Safari/537 Edg/125').browser).toBe('Edge')
    expect(detectClient('Chrome/125 OPR/110').browser).toBe('Opera')
    expect(detectClient('iPhone CriOS/125 Safari/604')).toEqual({ device: 'iPhone', browser: 'Chrome' })
    expect(detectClient('iPhone FxiOS/126 Safari/604').browser).toBe('Firefox')
    expect(detectClient('Macintosh Mobile/15 Safari/604')).toEqual({ device: 'iPad', browser: 'Safari' })
    expect(detectClient('Android Tablet Chrome/125').device).toBe('Android 平板')
  })
  it('校验定位响应，不从错误响应或无地区数据中拼出访客位置', () => {
    expect(parseVisitorGeo(geo)).toEqual({ ip: geo.ip, location: 'Japan · Tokyo', countryCode: 'JP', isp: geo.isp })
    expect(parseVisitorGeo({ ...geo, success: false })).toBeNull()
    expect(parseVisitorGeo({ ip: geo.ip })).toBeNull()
    expect(parseVisitorGeo({ ...geo, ip: '<script>' })).toBeNull()
    expect(parseVisitorGeo({ ...geo, country_code: 'Japan' })?.countryCode).toBe('')
  })
  it('首选服务失败后只回退一次；缓存刷新不再发请求，手动重试跳过缓存', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('CORS')).mockResolvedValue(new Response(JSON.stringify(geo)))
    vi.stubGlobal('fetch', fetcher)
    expect((await fetchVisitorGeo())?.location).toBe('Japan · Tokyo')
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(['https://api.ip.sb/geoip', 'https://ipwho.is/'])
    expect((await fetchVisitorGeo())?.countryCode).toBe('JP')
    expect(fetcher).toHaveBeenCalledTimes(2)
    fetcher.mockResolvedValue(new Response(JSON.stringify(geo)))
    await fetchVisitorGeo({ force: true })
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it('两家服务均失败返回空位置，供界面保留网络访客与浏览器', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })))
    expect(await fetchVisitorGeo()).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('定位最多等待七秒；卸载取消请求后不请求下一家服务', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }))
    vi.stubGlobal('fetch', fetcher)
    const slow = fetchVisitorGeo()
    await vi.advanceTimersByTimeAsync(7000)
    expect(await slow).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(2)
    const controller = new AbortController()
    const canceled = fetchVisitorGeo({ signal: controller.signal })
    controller.abort()
    expect(await canceled).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it('缓存过期或存储被禁用仍正常定位', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(geo))))
    vi.stubGlobal('fetch', fetcher)
    await fetchVisitorGeo()
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000)
    await fetchVisitorGeo()
    expect(fetcher).toHaveBeenCalledTimes(2)
    vi.stubGlobal('sessionStorage', { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } })
    expect((await fetchVisitorGeo())?.countryCode).toBe('JP')
  })
})
