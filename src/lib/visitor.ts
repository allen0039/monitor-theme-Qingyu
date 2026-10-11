export interface VisitorGeo {
  ip: string
  isp: string
  location: string
  countryCode: string
}

const CACHE_KEY = 'boxpro.visitor-geo.v1'
const CACHE_TTL = 15 * 60 * 1000

export function detectClient(ua: string): { device: string; browser: string } {
  const device = /ipad|macintosh.*mobile/i.test(ua) ? 'iPad'
    : /iphone|ipod/i.test(ua) ? 'iPhone'
    : /android/i.test(ua) ? (/mobile/i.test(ua) ? 'Android 手机' : 'Android 平板')
    : /tablet/i.test(ua) ? '平板电脑' : '桌面设备'
  const browser = /edg(?:e|a|ios)?\//i.test(ua) ? 'Edge'
    : /opr\/|opera|opios\//i.test(ua) ? 'Opera'
    : /fxios\/|firefox\//i.test(ua) ? 'Firefox'
    : /crios\/|chrome\//i.test(ua) ? 'Chrome'
    : /safari/i.test(ua) ? 'Safari' : '未知浏览器'
  return { device, browser }
}

function string(value: unknown): string { return typeof value === 'string' ? value.trim().slice(0, 200) : '' }

export function parseVisitorGeo(value: unknown): VisitorGeo | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const data = value as Record<string, unknown>
  const ip = string(data.ip), country = string(data.country), city = string(data.city) || string(data.region)
  if (data.success === false || !/^[\da-f:.]+$/i.test(ip) || !country) return null
  const connection = data.connection && typeof data.connection === 'object' ? data.connection as Record<string, unknown> : {}
  const code = string(data.country_code).toUpperCase()
  return {
    ip, location: [country, city].filter(Boolean).join(' · '),
    isp: string(data.isp) || string(data.organization) || string(data.asn_organization) || string(connection.isp) || string(connection.org) || '未知运营商',
    countryCode: /^[A-Z]{2}$/.test(code) ? code : '',
  }
}

function readCache(): VisitorGeo | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null')
    if (value && typeof value.at === 'number' && Date.now() - value.at >= 0 && Date.now() - value.at < CACHE_TTL) {
      const geo = value.geo
      if (geo && typeof geo.ip === 'string' && typeof geo.isp === 'string' && typeof geo.location === 'string' && typeof geo.countryCode === 'string') return geo
    }
  } catch { /* Storage is optional. */ }
  return null
}

export async function fetchVisitorGeo(options: { force?: boolean; signal?: AbortSignal } = {}): Promise<VisitorGeo | null> {
  if (options.signal?.aborted) return null
  if (!options.force) {
    const cached = readCache()
    if (cached) return cached
  }
  // At most two requests and seven seconds total. Never block monitor updates.
  for (const url of ['https://api.ip.sb/geoip', 'https://ipwho.is/']) {
    if (options.signal?.aborted) return null
    const controller = new AbortController()
    const abort = () => controller.abort()
    options.signal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(abort, 3500)
    try {
      const response = await fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
      const geo = response.ok ? parseVisitorGeo(await response.json()) : null
      if (geo && !controller.signal.aborted) {
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), geo })) } catch {}
        return geo
      }
    } catch { /* Try the fallback; a failed lookup must not hide the pill. */ }
    finally {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
    }
  }
  return null
}
