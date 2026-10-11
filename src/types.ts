export interface Metrics {
  cpu: number
  load: [number, number, number]
  mem_total: number
  mem_used: number
  disk_total: number
  disk_used: number
  net_rx: number
  net_tx: number
  uptime: number
}

export interface MonitorNode {
  id: number
  name: string
  country: string
  group: string
  online: boolean
  metrics: Metrics | null
  metrics_invalid: boolean
  os: string
  arch: string
  virt: string
  cpu_name: string
  cpu_cores: number
  mem_total: number
  disk_total: number
  total_rx: number
  total_tx: number
  month_rx: number
  month_tx: number
  month_used: number
  traffic_limit: number
  traffic_mode: string
  price: number | null
  currency: string
  billing_cycle: string
  expires_at: string | null
  expires_in: number | null
  last_seen_ago: number | null
  public_remark: string
}

export interface SiteInfo {
  authed: boolean
  site_name: string
  public_page: boolean
  history_days?: number
}

export type EarthMode = 'earth' | 'earth-stop' | 'map' | 'summary' | 'hide'
export type Layout = 'card' | 'list'
export type ThemeMode = 'auto' | 'light' | 'dark'
export type SortKey = 'default' | 'name' | 'cpu' | 'memory' | 'disk' | 'traffic' | 'upload' | 'download'
export type ConnectionState = 'connecting' | 'live' | 'polling' | 'reconnecting' | 'paused' | 'closed'

export interface ThemeConfig {
  notice: string
  earth_mode: EarthMode
  layout: Layout
  offline_last: boolean
  show_ping: boolean
  show_price: boolean
  hide_admin: boolean
  reduce_motion: boolean
  background_light: string
  background_dark: string
  background_blur: number
  footer_text: string
  footer_url: string
}

export interface PingRow {
  ts: number
  task_id: number
  latency: number | null
  loss?: number
}
export interface PingNetwork {
  id: number
  name: string
  latest: PingRow | null
  rows: PingRow[]
  loss: number | null
}
