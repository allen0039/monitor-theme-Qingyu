import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { EarthMode, Layout, SortKey, ThemeConfig, ThemeMode } from '../types'
import { record } from './data'

const KEY = 'boxpro.preferences'
const MODES: EarthMode[] = ['earth', 'earth-stop', 'map', 'summary', 'hide']
const SORTS: SortKey[] = ['default', 'name', 'cpu', 'memory', 'disk', 'traffic', 'upload', 'download']
export function usePreferences(config: { value: ThemeConfig }) {
  let saved: Record<string, unknown> = {}
  try { saved = record(JSON.parse(localStorage.getItem(KEY) || '{}')) } catch {}
  const theme = ref<ThemeMode>(['auto', 'light', 'dark'].includes(String(saved.theme)) ? saved.theme as ThemeMode : 'auto')
  const layoutOverride = ref<Layout | null>(['card', 'list'].includes(String(saved.layout)) ? saved.layout as Layout : null)
  const earthOverride = ref<EarthMode | null>(MODES.includes(saved.earth as EarthMode) ? saved.earth as EarthMode : null)
  const offlineOverride = ref<boolean | null>(typeof saved.offlineLast === 'boolean' ? saved.offlineLast : null)
  const sort = ref<SortKey>(SORTS.includes(saved.sort as SortKey) ? saved.sort as SortKey : 'default')
  const pingDetails = ref(saved.pingDetails === true)
  const group = ref<string | null>(typeof saved.group === 'string' ? saved.group : null)
  const layout = computed({ get: () => layoutOverride.value ?? config.value.layout, set: (v: Layout) => { layoutOverride.value = v } })
  const earth = computed({ get: () => earthOverride.value ?? config.value.earth_mode, set: (v: EarthMode) => { earthOverride.value = v } })
  const offlineLast = computed({ get: () => offlineOverride.value ?? config.value.offline_last, set: (v: boolean) => { offlineOverride.value = v } })
  const scheme = matchMedia('(prefers-color-scheme: dark)')
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  const systemDark = ref(scheme.matches), systemReduce = ref(motion.matches)
  const onScheme = (event: MediaQueryListEvent) => { systemDark.value = event.matches }
  const onMotion = (event: MediaQueryListEvent) => { systemReduce.value = event.matches }
  scheme.addEventListener('change', onScheme)
  motion.addEventListener('change', onMotion)
  const dark = computed(() => theme.value === 'dark' || (theme.value === 'auto' && systemDark.value))
  const reduceMotion = computed(() => config.value.reduce_motion || systemReduce.value)
  watch(dark, (value) => {
    document.documentElement.classList.toggle('dark', value)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value ? '#101a24' : '#f8faf9')
  }, { immediate: true })
  watch([theme, layoutOverride, earthOverride, offlineOverride, sort, pingDetails, group], () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ theme: theme.value, layout: layoutOverride.value, earth: earthOverride.value, offlineLast: offlineOverride.value, sort: sort.value, pingDetails: pingDetails.value, group: group.value }))
    } catch { /* Preferences are optional when browser storage is unavailable. */ }
  })
  onBeforeUnmount(() => { scheme.removeEventListener('change', onScheme); motion.removeEventListener('change', onMotion) })
  function cycleTheme() { theme.value = theme.value === 'auto' ? 'light' : theme.value === 'light' ? 'dark' : 'auto' }
  return { theme, layout, earth, offlineLast, sort, pingDetails, group, dark, reduceMotion, cycleTheme }
}
