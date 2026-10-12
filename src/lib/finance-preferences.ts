import { readQingyuStorage } from './storage'
import { ref, watch } from 'vue'
import { resolveFinanceCurrency, type FinanceCurrency } from './finance'
import { record } from './data'

const KEY = 'qingyu.finance.preferences.v1'
interface FinancePreferences { selectedIds: number[] | null; currency: FinanceCurrency }
const validId = (id: unknown): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id >= 0
export function readFinancePreferences(): FinancePreferences {
  try {
    const saved = record(JSON.parse(readQingyuStorage(localStorage, KEY) ?? 'null'))
    return {
      selectedIds: Array.isArray(saved.selectedIds) && saved.selectedIds.every(validId) ? [...new Set(saved.selectedIds)] : null,
      currency: typeof saved.currency === 'string' ? resolveFinanceCurrency(saved.currency) ?? 'CNY' : 'CNY',
    }
  } catch { return { selectedIds: null, currency: 'CNY' } }
}
export function reconcileFinanceSelection(selected: number[] | null, available: number[]): number[] {
  const ids = new Set(available)
  return selected === null ? [...ids] : selected.filter(id => ids.has(id))
}
export function useFinancePreferences(nodeIds: () => number[]) {
  const saved = readFinancePreferences()
  const selectedIds = ref(saved.selectedIds)
  const currency = ref(saved.currency)
  const storageAvailable = ref(true)
  watch(nodeIds, available => {
    const next = reconcileFinanceSelection(selectedIds.value, available)
    if (selectedIds.value === null || next.length !== selectedIds.value.length || next.some((id, index) => id !== selectedIds.value![index])) selectedIds.value = next
  }, { immediate: true })
  watch([selectedIds, currency], ([ids, code]) => {
    try { localStorage.setItem(KEY, JSON.stringify({ selectedIds: ids, currency: code })); storageAvailable.value = true }
    catch { storageAvailable.value = false }
  }, { immediate: true, flush: 'sync' })
  return { selectedIds, currency, storageAvailable }
}
