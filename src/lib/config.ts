import manifest from '../../theme.json'
import type { SummaryKey, ThemeConfig } from '../types'
import { record } from './data'

interface Field { key?: string; type: string; default?: unknown; min?: number; max?: number; options?: { value: string }[] }
const fields = (manifest.config as Field[]).filter((field) => field.key)
export function parseConfig(value: unknown): ThemeConfig {
  const saved = record(value)
  return Object.fromEntries(fields.map((field) => {
    const v = saved[field.key!]
    const valid = field.type === 'boolean' ? typeof v === 'boolean'
      : field.type === 'number' ? typeof v === 'number' && Number.isFinite(v) && v >= (field.min ?? -Infinity) && v <= (field.max ?? Infinity)
      : field.type === 'select' ? field.options?.some((option) => option.value === v)
      : typeof v === 'string'
    return [field.key, valid ? v : field.default]
  })) as unknown as ThemeConfig
}
export const defaultConfig = () => parseConfig({})

const SUMMARY_PRESETS: Record<Exclude<ThemeConfig['summary_preset'], 'custom'>, SummaryKey[]> = {
  default: ['memory', 'remaining_value', 'upload', 'disk', 'traffic', 'download'],
  resources: ['cpu', 'memory', 'disk'],
  network: ['traffic', 'upload', 'download'],
  status: ['online', 'offline', 'regions'],
  all: ['memory', 'remaining_value', 'upload', 'disk', 'traffic', 'download', 'cpu', 'online', 'offline', 'regions'],
}
export function summaryKeys(config: ThemeConfig): SummaryKey[] {
  if (config.summary_preset !== 'custom') return SUMMARY_PRESETS[config.summary_preset]
  const keys = [...new Set(config.summary_cards.split(/[\s,，]+/))]
  return keys.filter((key): key is SummaryKey => SUMMARY_PRESETS.all.includes(key as SummaryKey))
}
export async function loadConfig(): Promise<ThemeConfig> {
  try {
    const response = await fetch(`/api/themes/${manifest.short}/config`, { signal: AbortSignal.timeout(10000) })
    return parseConfig(response.ok ? await response.json() : {})
  } catch { return defaultConfig() }
}
