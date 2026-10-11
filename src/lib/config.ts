import manifest from '../../theme.json'
import type { ThemeConfig } from '../types'
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
export async function loadConfig(): Promise<ThemeConfig> {
  try {
    const response = await fetch(`/api/themes/${manifest.short}/config`, { signal: AbortSignal.timeout(10000) })
    return parseConfig(response.ok ? await response.json() : {})
  } catch { return defaultConfig() }
}
