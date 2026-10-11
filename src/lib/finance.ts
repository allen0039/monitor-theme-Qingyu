import type { MonitorNode } from '../types'

// Reference rates and currency symbols adapted from the original Komari theme.
// These are only estimates; fetched rates and dated caches take precedence.
const CURRENCY_CONFIG = {
  CNY: [1, '¥'], USD: [0.14799, '$'], EUR: [0.1275, '€'], GBP: [0.11027, '£'],
  JPY: [23.707, '¥'], HKD: [1.1594, 'HK$'], KRW: [224.11, '₩'], AUD: [0.20941, 'A$'],
  CAD: [0.20691, 'C$'], SGD: [0.18975, 'S$'], CHF: [0.11746, 'CHF'], NZD: [0.2535, 'NZ$'],
  BRL: [0.74734, 'R$'], CZK: [3.0787, 'Kč'], DKK: [0.95296, 'kr'], HUF: [44.688, 'Ft'],
  IDR: [2622.37, 'Rp'], ILS: [0.43085, '₪'], INR: [14.0178, '₹'], ISK: [18.4626, 'kr'],
  KZT: [64, '₸'], MXN: [2.5472, 'Mex$'], MYR: [0.59945, 'RM'], NOK: [1.4096, 'kr'],
  PHP: [8.9288, '₱'], PLN: [0.54138, 'zł'], RON: [0.66769, 'lei'], RUB: [11.9, '₽'],
  SEK: [1.3895, 'kr'], THB: [4.8172, '฿'], TRY: [6.849, '₺'], UAH: [3.6, '₴'],
  VND: [3500, '₫'], ZAR: [2.3995, 'R'],
} as const
export type FinanceCurrency = keyof typeof CURRENCY_CONFIG
export type ExchangeRates = Partial<Record<FinanceCurrency, number>>
export const FINANCE_CURRENCIES = Object.keys(CURRENCY_CONFIG) as FinanceCurrency[]
export const REFERENCE_RATES = Object.fromEntries(FINANCE_CURRENCIES.map(code => [code, CURRENCY_CONFIG[code][0]])) as ExchangeRates
const ALIASES: Record<string, FinanceCurrency> = { '$': 'USD', 'US$': 'USD', 'RMB': 'CNY', 'CN¥': 'CNY', '¥': 'CNY', '￥': 'CNY', 'HK$': 'HKD', 'JP¥': 'JPY', '€': 'EUR', '£': 'GBP', 'CA$': 'CAD', 'A$': 'AUD', 'C$': 'CAD', 'S$': 'SGD', 'NZ$': 'NZD' }

export function resolveFinanceCurrency(value: string): FinanceCurrency | null {
  const code = value.trim().toUpperCase()
  return Object.hasOwn(CURRENCY_CONFIG, code) ? code as FinanceCurrency : ALIASES[code] ?? null
}

export function billingPeriod(cycle: string): { months: number; days: number } | null {
  const periods: Record<string, [number, number]> = { monthly: [1, 30], quarterly: [3, 90], semiannual: [6, 180], yearly: [12, 365], biennial: [24, 730], triennial: [36, 1095] }
  const key = cycle.trim().toLowerCase()
  const period = Object.hasOwn(periods, key) ? periods[key] : undefined
  if (period) return { months: period[0], days: period[1] }
  const months = /^(\d+)m$/.test(key) ? Number(key.slice(0, -1)) : NaN
  return Number.isSafeInteger(months) && months > 0 && Number.isSafeInteger(months * 30) ? { months, days: months * 30 } : null
}

export function convertFinanceAmount(amount: number, from: string, to: string, rates: ExchangeRates): number | null {
  const source = resolveFinanceCurrency(from), target = resolveFinanceCurrency(to)
  if (!source || !target || !Number.isFinite(amount) || amount < 0) return null
  if (source === target || amount === 0) return amount
  const sourceRate = source === 'CNY' ? 1 : rates[source], targetRate = target === 'CNY' ? 1 : rates[target]
  if (!sourceRate || !targetRate || !Number.isFinite(sourceRate) || !Number.isFinite(targetRate) || sourceRate <= 0 || targetRate <= 0) return null
  const result = amount / sourceRate * targetRate
  return Number.isFinite(result) ? result : null
}

export type FinanceMetricKey = 'total' | 'monthly' | 'remaining'
export type FinanceIssue = 'price' | 'currency' | 'rate' | 'cycle' | 'expiry' | 'once'
export const FINANCE_LABELS: Record<FinanceMetricKey, string> = { total: '总价值', monthly: '月均支出', remaining: '剩余价值' }
const ISSUE_LABELS: Record<FinanceIssue, string> = { price: '未设置价格', currency: '不支持的币种', rate: '缺少可用汇率', cycle: '付款周期未知', expiry: '缺少到期信息', once: '一次性费用无折算周期' }
export interface NodeFinance {
  total: number | null
  monthly: number | null
  remaining: number | null
  issues: Partial<Record<FinanceMetricKey, FinanceIssue>>
  prepaid: boolean
  once: boolean
}

export function calculateNodeFinance(node: MonitorNode, currency: string, rates: ExchangeRates): NodeFinance {
  const result: NodeFinance = { total: null, monthly: null, remaining: null, issues: {}, prepaid: false, once: node.billing_cycle.trim().toLowerCase() === 'once' }
  let issue: FinanceIssue | undefined
  if (node.price === null || !Number.isFinite(node.price) || node.price < 0) issue = 'price'
  else if (node.price === 0) return { ...result, total: 0, monthly: 0, remaining: 0 }
  else if (!resolveFinanceCurrency(node.currency)) issue = 'currency'
  else {
    result.total = convertFinanceAmount(node.price, node.currency, currency, rates)
    if (result.total === null) issue = 'rate'
  }
  if (issue) return { ...result, issues: { total: issue, monthly: issue, remaining: issue } }
  if (result.once) return { ...result, monthly: 0, issues: { remaining: 'once' } }
  const period = billingPeriod(node.billing_cycle)
  if (!period) return { ...result, issues: { monthly: 'cycle', remaining: 'cycle' } }
  result.monthly = result.total! / period.months
  if (node.expires_in === null || !Number.isFinite(node.expires_in)) result.issues.remaining = 'expiry'
  else {
    const remaining = result.total! * (Math.max(0, node.expires_in) / period.days)
    if (Number.isFinite(remaining)) result.remaining = remaining
    else result.issues.remaining = 'expiry'
    result.prepaid = node.expires_in > period.days
  }
  return result
}

export interface FinanceMetric {
  value: number | null
  included: number
  missing: number
  issues: Partial<Record<FinanceIssue, number>>
}
export type FinanceSummary = Record<FinanceMetricKey, FinanceMetric>

export function summarizeFinance(nodes: MonitorNode[], currency: string, rates: ExchangeRates): FinanceSummary {
  const results = nodes.map(node => calculateNodeFinance(node, currency, rates))
  return Object.fromEntries((['total', 'monthly', 'remaining'] as const).map(key => {
    let sum = 0, included = 0
    const issues: FinanceMetric['issues'] = {}
    for (const result of results) {
      const value = result[key]
      if (value !== null) { sum += value; included++ }
      const issue = result.issues[key]
      if (issue) issues[issue] = (issues[issue] ?? 0) + 1
    }
    return [key, { value: (included || nodes.length === 0) && Number.isFinite(sum) ? sum : null, included, missing: nodes.length - included, issues }]
  })) as FinanceSummary
}

export function financeIssueText(issue: FinanceIssue | undefined): string {
  return issue ? ISSUE_LABELS[issue] : ''
}
export function financeCoverage(metric: FinanceMetric): string {
  return Object.entries(metric.issues).map(([issue, count]) => `${count} 台${ISSUE_LABELS[issue as FinanceIssue]}`).join('，')
}
export function financeAmount(value: number | null, currency: string, compact = false): string {
  if (value === null || !Number.isFinite(value)) return '—'
  const code = resolveFinanceCurrency(currency) ?? 'CNY'
  const short = compact && Math.abs(value) >= 10000
  return `${CURRENCY_CONFIG[code][1]}${new Intl.NumberFormat('zh-CN', { minimumFractionDigits: short ? 0 : 2, maximumFractionDigits: 2, notation: short ? 'compact' : 'standard' }).format(value)}`
}
