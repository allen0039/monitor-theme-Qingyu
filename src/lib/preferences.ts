import { readQingyuStorage } from './storage'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { EarthMode, Layout, SortKey, ThemeConfig, ThemeMode } from '../types'
import { record } from './data'
import { applyDisplaySettings, normalizeDisplaySettings, validDisplaySetting, type DisplaySettingKey } from './display-settings'

const KEY = 'qingyu.preferences'
const MODES: EarthMode[] = ['earth', 'earth-stop', 'map', 'summary', 'hide']
const SORTS: SortKey[] = ['default', 'name', 'cpu', 'memory', 'disk', 'traffic', 'upload', 'download']
const THEMES: ThemeMode[] = ['auto', 'beijing', 'light', 'dark']

export function isDarkTheme(theme: ThemeMode, systemDark: boolean, now = new Date()): boolean {
  const beijingHour = (now.getUTCHours() + 8) % 24
  return theme === 'dark' || (theme === 'auto' && systemDark) || (theme === 'beijing' && (beijingHour < 6 || beijingHour >= 18))
}

export function usePreferences(siteConfig: { value: ThemeConfig }) {
  let saved: Record<string, unknown> = {}
  try { saved = record(JSON.parse(readQingyuStorage(localStorage, KEY) || '{}')) } catch {}
  const displayOverrides = ref(normalizeDisplaySettings(saved.display))
  const displayConfig = computed(() => applyDisplaySettings(siteConfig.value, displayOverrides.value))
  const storageAvailable = ref(true)
  const themeOverride = ref<ThemeMode | null>(THEMES.includes(saved.theme as ThemeMode) ? saved.theme as ThemeMode : null)
  const layoutOverride = ref<Layout | null>(['card', 'list'].includes(String(saved.layout)) ? saved.layout as Layout : null)
  const earthOverride = ref<EarthMode | null>(MODES.includes(saved.earth as EarthMode) ? saved.earth as EarthMode : null)
  const offlineOverride = ref<boolean | null>(typeof saved.offlineLast === 'boolean' ? saved.offlineLast : null)
  const sortOverride = ref<SortKey | null>(SORTS.includes(saved.sort as SortKey) ? saved.sort as SortKey : null)
  const pingOverride = ref<boolean | null>(typeof saved.pingDetails === 'boolean' ? saved.pingDetails : null)
  const group = ref<string | null>(typeof saved.group === 'string' ? saved.group : null)
  const theme = computed({ get: () => themeOverride.value ?? displayConfig.value.theme_mode, set: (v: ThemeMode) => { themeOverride.value = v } })
  const layout = computed({ get: () => layoutOverride.value ?? displayConfig.value.layout, set: (v: Layout) => { layoutOverride.value = v } })
  const earth = computed({ get: () => earthOverride.value ?? displayConfig.value.earth_mode, set: (v: EarthMode) => { earthOverride.value = v } })
  const offlineLast = computed({ get: () => offlineOverride.value ?? displayConfig.value.offline_last, set: (v: boolean) => { offlineOverride.value = v } })
  const sort = computed({ get: () => sortOverride.value ?? displayConfig.value.default_sort, set: (v: SortKey) => { sortOverride.value = v } })
  const pingDetails = computed({ get: () => pingOverride.value ?? displayConfig.value.ping_mode === 'details', set: (v: boolean) => { pingOverride.value = v } })
  const config = computed<ThemeConfig>(() => ({ ...displayConfig.value, theme_mode: theme.value, layout: layout.value, earth_mode: earth.value, offline_last: offlineLast.value, default_sort: sort.value, ping_mode: pingDetails.value ? 'details' : 'summary' }))
  const scheme = matchMedia('(prefers-color-scheme: dark)')
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  const systemDark = ref(scheme.matches), systemReduce = ref(motion.matches)
  const onScheme = (event: MediaQueryListEvent) => { systemDark.value = event.matches }
  const onMotion = (event: MediaQueryListEvent) => { systemReduce.value = event.matches }
  scheme.addEventListener('change', onScheme)
  motion.addEventListener('change', onMotion)
  const now = ref(new Date())
  const clock = setInterval(() => { now.value = new Date() }, 30000)
  const dark = computed(() => isDarkTheme(theme.value, systemDark.value, now.value))
  const reduceMotion = computed(() => config.value.reduce_motion || systemReduce.value)
  watch(dark, (value) => {
    document.documentElement.classList.toggle('dark', value)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value ? '#101a24' : '#f8fafc')
  }, { immediate: true })
  watch([themeOverride, layoutOverride, earthOverride, offlineOverride, sortOverride, pingOverride, group, displayOverrides], () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ theme: themeOverride.value, layout: layoutOverride.value, earth: earthOverride.value, offlineLast: offlineOverride.value, sort: sortOverride.value, pingDetails: pingOverride.value, group: group.value, display: displayOverrides.value }))
      storageAvailable.value = true
    } catch { storageAvailable.value = false }
  })
  onBeforeUnmount(() => { clearInterval(clock); scheme.removeEventListener('change', onScheme); motion.removeEventListener('change', onMotion) })
  function cycleTheme() { theme.value = THEMES[(THEMES.indexOf(theme.value) + 1) % THEMES.length] }
  function setPreference(key: DisplaySettingKey, value: unknown) {
    if (!validDisplaySetting(key, value)) return
    if (key === 'theme_mode') theme.value = value as ThemeMode
    else if (key === 'layout') layout.value = value as Layout
    else if (key === 'earth_mode') earth.value = value as EarthMode
    else if (key === 'default_sort') sort.value = value as SortKey
    else if (key === 'offline_last') offlineLast.value = value as boolean
    else if (key === 'ping_mode') pingDetails.value = value === 'details'
    else displayOverrides.value = { ...displayOverrides.value, [key]: value }
  }
  function resetPreferences() {
    themeOverride.value = layoutOverride.value = earthOverride.value = sortOverride.value = null
    offlineOverride.value = pingOverride.value = null
    group.value = null
    displayOverrides.value = {}
  }
  return { config, theme, layout, earth, offlineLast, sort, pingDetails, group, dark, reduceMotion, storageAvailable, setPreference, cycleTheme, resetPreferences }
}
