export function bytes(value: number | null | undefined, rate = false, precision: 'full' | 'overview' = 'full'): { value: string; unit: string } {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return { value: '—', unit: '' }
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const power = value ? Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1) : 0
  const scaled = value / 1024 ** power
  // Komari's overview uses whole KB, one decimal for MB/GB, two for TB/PB.
  const decimals = precision === 'overview' ? power >= 4 ? 2 : power >= 2 ? 1 : 0 : power === 0 ? 0 : 2
  return { value: scaled.toFixed(decimals), unit: units[power] + (rate ? '/s' : '') }
}

export function formatBytes(value: number | null | undefined, rate = false, precision: 'full' | 'overview' = 'full'): string {
  const part = bytes(value, rate, precision)
  return `${part.value}${part.unit ? ` ${part.unit}` : ''}`
}

// Compact card labels; the shared formatter retains full precision for details.
export function cardBytes(value: number | null | undefined, rate = false): string {
  const part = bytes(value, rate)
  if (!part.unit) return part.value
  const number = Number(part.value)
  const display = rate ? String(Number(number.toFixed(1))) : number.toFixed(part.unit.startsWith('B') ? 0 : 1)
  return `${display} ${part.unit}`
}

export function cardPrice(price: number | null, currency: string, cycle: string): string {
  if (price === null || price === 0) return priceLabel(price, currency, cycle)
  let money: string
  try {
    money = new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(price)
  } catch { money = `${currency} ${price}` }
  const months = /^(\d+)m$/.exec(cycle)?.[1]
  return `${money}${cycle === 'once' ? ' · 一次性' : CYCLES[cycle] ? `/${CYCLES[cycle]}` : months ? `/${months}个月` : ''}`
}

export function cardExpiry(days: number | null): string {
  return days === null ? '' : days === 0 ? '今天到期' : `${days > 0 ? '+' : ''}${days}天`
}

export function remarkParts(remark: string): { tags: string[]; text: string } {
  const parts = remark.split(/[;；]/).map(part => part.trim()).filter(Boolean)
  return parts.length > 0 && parts.every(part => part.length <= 24 && !part.includes('\n'))
    ? { tags: [...new Set(parts)], text: '' }
    : { tags: [], text: remark.trim() }
}

export function percentage(used: number | null | undefined, total: number | null | undefined): number | null {
  return typeof used === 'number' && typeof total === 'number' && Number.isFinite(used) && Number.isFinite(total) && used >= 0 && total > 0
    ? used / total * 100 : null
}

export function duration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—'
  if (seconds < 60) return `${Math.floor(seconds)} 秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时 ${Math.floor(seconds % 3600 / 60)} 分`
  return `${Math.floor(seconds / 86400)} 天 ${Math.floor(seconds % 86400 / 3600)} 小时`
}

const CYCLES: Record<string, string> = {
  monthly: '月', quarterly: '季', semiannual: '半年', yearly: '年', biennial: '2 年', triennial: '3 年',
}
export function priceLabel(price: number | null, currency: string, cycle: string): string {
  if (price == null) return '未设置'
  if (price === 0) return '免费'
  let money: string
  try {
    money = new Intl.NumberFormat('zh-CN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(price)
  } catch { money = `${currency} ${price.toFixed(2)}` }
  const months = /^(\d+)m$/.exec(cycle)?.[1]
  return `${money}${cycle === 'once' ? ' · 一次性' : CYCLES[cycle] ? ` / ${CYCLES[cycle]}` : months ? ` / ${months} 个月` : ''}`
}

export function expiryLabel(days: number | null): string {
  if (days === null) return ''
  if (days < 0) return `已过期 ${Math.abs(days)} 天`
  if (days === 0) return '今天到期'
  return `${days} 天后到期`
}

export function safeUrl(value: string): string {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch { return '' }
}

export function safeImageUrl(value: string): string {
  // A local path stays on the hub; protocol-relative URLs are not local paths.
  if (/^\/(?!\/)/.test(value) && !/[\\\s]/.test(value)) return value
  return safeUrl(value)
}
