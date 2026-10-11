import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import { FINANCE_CURRENCIES, REFERENCE_RATES, type ExchangeRates } from './finance'
import { record } from './data'

const KEY = 'boxpro.finance.rates.v1'
export interface ExchangeRateSnapshot {
  rates: ExchangeRates
  date: string | null
  source: 'network' | 'cache' | 'stale-cache' | 'reference'
}
const APIS = ['https://api.frankfurter.app/latest?from=CNY', 'https://open.er-api.com/v6/latest/CNY']
let pending: Promise<ExchangeRateSnapshot> | null = null
let requestController: AbortController | null = null

export function beijingDateKey(date = new Date()): string {
  return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10)
}
export function sanitizeRates(value: unknown): ExchangeRates {
  const raw = record(value), rates: ExchangeRates = { CNY: 1 }
  for (const code of FINANCE_CURRENCIES) {
    if (code !== 'CNY' && typeof raw[code] === 'number' && Number.isFinite(raw[code]) && raw[code] > 0) rates[code] = raw[code]
  }
  return rates
}
function cachedRates(): (ExchangeRateSnapshot & { fetchedDay: string }) | null {
  try {
    const cached = record(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
    if (cached.base !== 'CNY' || typeof cached.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(cached.date)) return null
    const rates = sanitizeRates(cached.rates)
    const quotedDate = typeof cached.quotedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cached.quotedDate) ? cached.quotedDate : cached.date
    return Object.keys(rates).length > 1 ? { rates, date: quotedDate, fetchedDay: cached.date, source: 'cache' } : null
  } catch { return null }
}
export function exchangeRateLabel(snapshot: ExchangeRateSnapshot): string {
  if (snapshot.source === 'reference') return '参考汇率 · 估算'
  return `${snapshot.source === 'stale-cache' ? '缓存汇率' : '汇率'} ${snapshot.date}`
}

export function cancelExchangeRates() { requestController?.abort() }

export function getExchangeRates(now = new Date()): Promise<ExchangeRateSnapshot> {
  if (pending && !requestController?.signal.aborted) return pending
  const today = beijingDateKey(now), cache = cachedRates()
  if (cache?.fetchedDay === today) return Promise.resolve(cache)
  const controller = new AbortController()
  requestController = controller
  const request = (async (): Promise<ExchangeRateSnapshot> => {
    let rates: ExchangeRates = { CNY: 1 }
    let date: string | null = null
    for (const url of APIS) {
      if (controller.signal.aborted) break
      const timeout = new AbortController()
      const cancel = () => timeout.abort()
      controller.signal.addEventListener('abort', cancel, { once: true })
      const timer = setTimeout(cancel, 5000)
      try {
        const response = await fetch(url, { signal: timeout.signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
        if (!response.ok) continue
        const data = record(await response.json())
        if (data.base !== 'CNY' && data.base_code !== 'CNY') continue
        const incoming = sanitizeRates(data.rates)
        if (Object.keys(incoming).length <= 1) continue
        // Do not blend quotes from different dates. Partial sources remain usable.
        const quotedDate = typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date
          : typeof data.time_last_update_unix === 'number' && Number.isFinite(data.time_last_update_unix) && data.time_last_update_unix > 0
            ? beijingDateKey(new Date(data.time_last_update_unix * 1000)) : today
        if (!date || quotedDate > date) { rates = incoming; date = quotedDate }
        else if (date === quotedDate) rates = { ...rates, ...incoming }
        if (FINANCE_CURRENCIES.every(code => rates[code] !== undefined)) break
      } catch { /* Continue to the fallback source; monitoring is independent. */ }
      finally { clearTimeout(timer); controller.signal.removeEventListener('abort', cancel) }
    }
    if (controller.signal.aborted) throw new DOMException('汇率请求已取消', 'AbortError')
    if (date) {
      try { localStorage.setItem(KEY, JSON.stringify({ base: 'CNY', date: today, quotedDate: date, rates })) } catch { /* Optional cache. */ }
      return { rates, date, source: 'network' }
    }
    return cache ? { ...cache, source: 'stale-cache' } : { rates: { ...REFERENCE_RATES }, date: null, source: 'reference' }
  })()
  pending = request
  void request.finally(() => {
    if (pending === request) { pending = null; requestController = null }
  }).catch(() => {})
  return request
}

export function useExchangeRates(enabled: Ref<boolean>) {
  const snapshot = ref<ExchangeRateSnapshot>({ rates: { CNY: 1 }, date: null, source: 'reference' })
  const loading = ref(false)
  let generation = 0, lastAttemptDay = '', retryAfter = 0
  async function refresh() {
    if (!enabled.value || document.hidden || loading.value) return
    const today = beijingDateKey()
    if (lastAttemptDay === today && Date.now() < retryAfter) return
    const token = ++generation
    loading.value = true
    lastAttemptDay = today
    try {
      const result = await getExchangeRates()
      if (token !== generation || !enabled.value) return
      snapshot.value = result
      retryAfter = Date.now() + (result.source === 'stale-cache' || result.source === 'reference' ? 15 * 60000 : 24 * 3600000)
    } catch { /* Aborted when costs are hidden or the page unmounts. */ }
    finally { if (token === generation) loading.value = false }
  }
  watch(enabled, value => {
    if (value) void refresh()
    else { generation++; loading.value = false; cancelExchangeRates() }
  }, { immediate: true })
  let clock: ReturnType<typeof setInterval> | undefined
  onMounted(() => {
    document.addEventListener('visibilitychange', refresh)
    clock = setInterval(refresh, 60000)
  })
  onBeforeUnmount(() => { generation++; cancelExchangeRates(); clearInterval(clock); document.removeEventListener('visibilitychange', refresh) })
  return { snapshot, loading }
}
