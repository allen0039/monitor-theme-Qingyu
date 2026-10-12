import manifest from '../../theme.json'
import type { ThemeConfig } from '../types'
import { parseConfig } from './config'
import { record } from './data'

export const DISPLAY_SECTIONS = [
  { id: 'appearance', label: '基础与外观', description: '调整配色、节点视图和阅读密度。', keys: ['theme_mode', 'layout', 'card_size', 'reduce_motion', 'poll_interval'] },
  { id: 'layout', label: '首页布局与地球', description: '选择头部展示方式，以及首页需要保留的工具。', keys: ['earth_mode', 'earth_rotation_speed', 'earth_show_labels', 'earth_show_rates', 'show_node_status', 'show_group_tabs', 'show_search', 'show_sort', 'notice_enabled'] },
  { id: 'summary', label: '首页总览卡片', description: '选择统计卡片、排列顺序和汇总范围。', keys: ['show_summary', 'summary_preset', 'summary_cards', 'summary_scope'] },
  { id: 'nodes', label: '节点卡片与列表', description: '按自己的阅读习惯选择节点指标。', keys: ['default_sort', 'offline_last', 'show_cpu', 'show_memory', 'show_disk', 'show_traffic', 'show_speed', 'show_uptime', 'show_total_traffic', 'show_node_metadata', 'show_expiry', 'expiry_warning_days', 'show_remark'] },
  { id: 'network', label: '首页网络延迟', description: '选择延迟视图、探测线路和刷新频率。', keys: ['show_ping', 'ping_mode', 'ping_max_lines', 'ping_tasks', 'ping_refresh_interval'] },
  { id: 'finance', label: '费用展示', description: '选择是否显示费用，以及公开汇总使用的币种。', keys: ['show_price', 'finance_currency', 'show_personal_finance'] },
  { id: 'background', label: '背景与访客信息', description: '调整背景图片、网格和底部访客气泡。', keys: ['background_enabled', 'background_light', 'background_dark', 'background_blur', 'background_opacity', 'background_show_grid', 'visitor_info_enabled'] },
] as const

export type DisplaySettingKey = typeof DISPLAY_SECTIONS[number]['keys'][number]
export type DisplayOverrides = Partial<Pick<ThemeConfig, DisplaySettingKey>>
export const SUMMARY_CHOICES = [
  { key: 'memory', label: '内存用量' }, { key: 'remaining_value', label: '剩余价值' }, { key: 'upload', label: '实时上行' },
  { key: 'disk', label: '硬盘用量' }, { key: 'traffic', label: '累计流量' }, { key: 'download', label: '实时下行' },
  { key: 'cpu', label: '平均 CPU' }, { key: 'online', label: '节点在线' }, { key: 'offline', label: '离线节点' }, { key: 'regions', label: '国家和地区' },
] as const
export interface DisplayField {
  key: DisplaySettingKey
  type: 'boolean' | 'select' | 'number' | 'string' | 'text'
  label: string
  help: string
  min?: number
  max?: number
  options?: { value: string; label: string }[]
}
const labels: Partial<Record<DisplaySettingKey, string>> = { theme_mode: '页面配色', layout: '节点视图', earth_mode: '头部展示', default_sort: '节点排序', ping_mode: '延迟展示', finance_currency: '公开汇总币种', show_personal_finance: '显示个人计算入口' }
const help: Partial<Record<DisplaySettingKey, string>> = {
  theme_mode: '跟随系统，或按北京时间 06:00–18:00 使用浅色。',
  layout: '在卡片和列表之间切换，与首页工具栏保持同步。',
  card_size: '调整卡片宽度、字号和间距；列表视图不受影响。',
  reduce_motion: '停止地球自转并减弱过渡；系统的减少动态效果始终生效。',
  poll_interval: '实时连接中断后的刷新间隔，正常连接仍实时更新。',
  earth_mode: '地球、地图、仅总览或隐藏整个头部。',
  notice_enabled: '显示或隐藏站点公告，公告内容由站点提供。',
  summary_cards: '勾选需要显示的卡片，再用上下按钮调整顺序。全部取消时隐藏总览。',
  default_sort: '与首页排序选择同步；离线节点可单独排到末尾。',
  ping_mode: '摘要适合快速查看，明细逐条展示线路与历史色条。',
  ping_tasks: '按名称或 ID 选择线路并排序，用逗号或换行分隔；留空显示全部线路。',
  show_price: '可隐藏费用；站点关闭费用或要求登录时，个人设置无法开启。',
  finance_currency: '用于首页公开费用汇总，个人计算器的币种单独保存。',
  show_personal_finance: '控制顶部钱包入口，个人选择不改变公开统计。',
}
const fields = new Map(manifest.config.filter(field => 'key' in field).map(field => [field.key, field]))
export const DISPLAY_FIELDS: DisplayField[] = DISPLAY_SECTIONS.flatMap(section => section.keys.map(key => {
  const field = fields.get(key)!
  return { ...field, key, label: labels[key] ?? field.label, help: help[key] ?? field.help } as DisplayField
}))
const fieldMap = new Map(DISPLAY_FIELDS.map(field => [field.key, field]))
export const SITE_RESTRICTED_FIELDS: DisplaySettingKey[] = ['show_price', 'show_personal_finance', 'show_ping']

export function validDisplaySetting(key: string, value: unknown): key is DisplaySettingKey {
  const field = fieldMap.get(key as DisplaySettingKey)
  if (!field) return false
  if (field.type === 'boolean') return typeof value === 'boolean'
  if (field.type === 'select') return field.options!.some(option => option.value === value)
  if (field.type === 'number') return typeof value === 'number' && Number.isFinite(value) && value >= field.min! && value <= field.max! && (key === 'earth_rotation_speed' || Number.isInteger(value))
  return typeof value === 'string'
}
export function normalizeDisplaySettings(value: unknown): DisplayOverrides {
  return Object.fromEntries(Object.entries(record(value)).filter(([key, value]) => validDisplaySetting(key, value))) as DisplayOverrides
}
export function applyDisplaySettings(site: ThemeConfig, value: unknown): ThemeConfig {
  const config = parseConfig({ ...site, ...normalizeDisplaySettings(value) })
  for (const key of SITE_RESTRICTED_FIELDS) {
    if (!site[key]) Object.assign(config, { [key]: false })
  }
  return config
}
