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
  traffic_reset_day?: number | null
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
export type ThemeMode = 'auto' | 'beijing' | 'light' | 'dark'
export type SummaryKey = 'memory' | 'disk' | 'online' | 'offline' | 'traffic' | 'upload' | 'download' | 'cpu' | 'regions' | 'remaining_value'
export type SortKey = 'default' | 'name' | 'cpu' | 'memory' | 'disk' | 'traffic' | 'upload' | 'download'
export type ConnectionState = 'connecting' | 'live' | 'polling' | 'reconnecting' | 'paused' | 'closed'

export interface ThemeConfig {
  theme_mode: ThemeMode
  card_size: 'mini' | 'compact' | 'comfortable' | 'large'
  site_icon: string
  poll_interval: number
  notice_enabled: boolean
  notice_title: string
  notice: string
  earth_mode: EarthMode
  earth_rotation_speed: number
  earth_show_labels: boolean
  earth_show_rates: boolean
  show_node_status: boolean
  show_group_tabs: boolean
  show_search: boolean
  show_sort: boolean
  show_summary: boolean
  summary_preset: 'default' | 'resources' | 'network' | 'status' | 'all' | 'custom'
  summary_cards: string
  summary_scope: 'group' | 'all'
  layout: Layout
  default_sort: SortKey
  offline_last: boolean
  show_cpu: boolean
  show_memory: boolean
  show_disk: boolean
  show_traffic: boolean
  show_speed: boolean
  show_uptime: boolean
  show_total_traffic: boolean
  show_node_metadata: boolean
  show_expiry: boolean
  expiry_warning_days: number
  show_remark: boolean
  show_ping: boolean
  ping_mode: 'summary' | 'details'
  ping_max_lines: number
  ping_tasks: string
  ping_refresh_interval: number
  show_price: boolean
  finance_currency: string
  show_personal_finance: boolean
  hide_price_logged_out: boolean
  hide_admin: boolean
  reduce_motion: boolean
  background_enabled: boolean
  background_light: string
  background_dark: string
  background_blur: number
  background_opacity: number
  background_show_grid: boolean
  footer_text: string
  footer_url: string
  visitor_info_enabled: boolean
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
