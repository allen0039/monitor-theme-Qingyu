import { describe, expect, it } from 'vitest'
import { normalizeNodes } from './data'
import { billingPeriod, calculateNodeFinance, convertFinanceAmount, financeAmount, summarizeFinance } from './finance'

const node = (extra: Record<string, unknown> = {}) => normalizeNodes([{ id: 1, price: 60, currency: 'CNY', billing_cycle: 'monthly', expires_in: 15, ...extra }])[0]!

describe('费用计算', () => {
  it.each([['monthly', 60, 60], ['quarterly', 300, 100], ['semiannual', 600, 100], ['yearly', 1200, 100], ['biennial', 2400, 100], ['triennial', 3600, 100], ['18m', 1800, 100]])('按 %s 的付款月数摊销', (billing_cycle, price, monthly) => {
    expect(calculateNodeFinance(node({ billing_cycle, price }), 'CNY', {}).monthly).toBe(monthly)
  })
  it('剩余价值按周期参考天数折算，过期归零，多周期预付不截断', () => {
    expect(calculateNodeFinance(node(), 'CNY', {})).toMatchObject({ total: 60, monthly: 60, remaining: 30 })
    expect(calculateNodeFinance(node({ price: 365, billing_cycle: 'yearly', expires_in: 100 }), 'CNY', {}).remaining).toBe(100)
    expect(calculateNodeFinance(node({ expires_in: -1 }), 'CNY', {}).remaining).toBe(0)
    expect(calculateNodeFinance(node({ expires_in: 45, online: false }), 'CNY', {})).toMatchObject({ remaining: 90, prepaid: true, monthly: 60 })
  })
  it('CNY 基准汇率换算方向正确，同币种不依赖汇率', () => {
    expect(convertFinanceAmount(10, 'USD', 'CNY', { USD: 0.125 })).toBe(80)
    expect(convertFinanceAmount(80, 'CNY', 'USD', { USD: 0.125 })).toBe(10)
    expect(convertFinanceAmount(10, 'USD', 'EUR', { USD: 0.125, EUR: 0.1 })).toBe(8)
    expect(convertFinanceAmount(10, 'USD', 'USD', {})).toBe(10)
    for (const rate of [0, -1, Infinity, NaN]) expect(convertFinanceAmount(10, 'USD', 'CNY', { USD: rate })).toBeNull()
    expect(convertFinanceAmount(10, 'bad-code', 'CNY', {})).toBeNull()
  })
  it('免费、未知价格、未知汇率不能混为一谈', () => {
    expect(calculateNodeFinance(node({ price: 0, currency: 'bad-code', expires_in: null }), 'CNY', {})).toMatchObject({ total: 0, monthly: 0, remaining: 0 })
    expect(calculateNodeFinance(node({ price: null }), 'CNY', {})).toMatchObject({ total: null, monthly: null, remaining: null, issues: { total: 'price' } })
    expect(calculateNodeFinance(node({ currency: 'USD' }), 'CNY', {})).toMatchObject({ total: null, issues: { remaining: 'rate' } })
    expect(calculateNodeFinance(node({ currency: 'XXX' }), 'CNY', {})).toMatchObject({ issues: { total: 'currency' } })
  })
  it('到期信息缺失仅影响剩余；一次性不产生持续月费', () => {
    expect(calculateNodeFinance(node({ expires_in: null }), 'CNY', {})).toMatchObject({ total: 60, monthly: 60, remaining: null, issues: { remaining: 'expiry' } })
    expect(calculateNodeFinance(node({ billing_cycle: 'once' }), 'CNY', {})).toMatchObject({ total: 60, monthly: 0, remaining: null, once: true })
    expect(calculateNodeFinance(node({ billing_cycle: '0m' }), 'CNY', {})).toMatchObject({ total: 60, monthly: null, remaining: null })
    for (const cycle of ['0m', '-3m', 'month', 'Infinitym', '999999999999999999m', '__proto__']) expect(billingPeriod(cycle)).toBeNull()
  })
  it('各指标分别统计覆盖率，全部未知显示未知，空选择才为零', () => {
    const result = summarizeFinance([node(), node({ expires_in: null }), node({ price: null })], 'CNY', {})
    expect(result.total).toMatchObject({ value: 120, included: 2, missing: 1 })
    expect(result.monthly).toMatchObject({ value: 120, included: 2, missing: 1 })
    expect(result.remaining).toMatchObject({ value: 30, included: 1, missing: 2, issues: { price: 1, expiry: 1 } })
    expect(summarizeFinance([node({ price: null })], 'CNY', {}).total.value).toBeNull()
    expect(summarizeFinance([], 'CNY', {}).remaining.value).toBe(0)
  })
  it('先汇总后格式化，避免小额逐行舍入损失', () => {
    const result = summarizeFinance([node({ price: 0.004 }), node({ price: 0.004 }), node({ price: 0.004 })], 'CNY', {})
    expect(financeAmount(result.total.value, 'CNY')).toBe('¥0.01')
    expect(financeAmount(null, 'CNY')).toBe('—')
  })
})
