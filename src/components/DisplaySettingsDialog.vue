<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowDown, ArrowUp, Banknote, Globe2, Image, LayoutDashboard, Monitor, Network, RotateCcw, Server, X } from '@lucide/vue'
import type { SummaryKey, ThemeConfig } from '../types'
import { summaryKeys } from '../lib/config'
import { DISPLAY_FIELDS, DISPLAY_SECTIONS, SITE_RESTRICTED_FIELDS, SUMMARY_CHOICES, validDisplaySetting, type DisplayField, type DisplaySettingKey } from '../lib/display-settings'

const props = defineProps<{ config: ThemeConfig; siteConfig: ThemeConfig; priceAllowed: boolean; storageAvailable: boolean }>()
const emit = defineEmits<{ change: [key: DisplaySettingKey, value: unknown]; reset: []; close: [] }>()
const dialog = ref<HTMLDialogElement | null>(null)
const content = ref<HTMLElement | null>(null)
const active = ref<typeof DISPLAY_SECTIONS[number]['id']>('appearance')
const section = computed(() => DISPLAY_SECTIONS.find(section => section.id === active.value)!)
const fields = computed(() => DISPLAY_FIELDS.filter(field => (section.value.keys as readonly string[]).includes(field.key)))
const icons = { appearance: Monitor, layout: Globe2, summary: LayoutDashboard, nodes: Server, network: Network, finance: Banknote, background: Image }
const errors = ref<Record<string, string>>({})
const selectedSummaryCards = computed(() => summaryKeys({ ...props.config, summary_preset: 'custom' }))
function toggleSummaryCard(key: SummaryKey, checked: boolean) {
  const next = checked ? [...selectedSummaryCards.value, key] : selectedSummaryCards.value.filter(value => value !== key)
  emit('change', 'summary_cards', next.join('\n'))
}
function moveSummaryCard(index: number, direction: number) {
  const next = [...selectedSummaryCards.value], target = index + direction
  if (target < 0 || target >= next.length) return
  const previous = next[index]!
  next[index] = next[target]!
  next[target] = previous
  emit('change', 'summary_cards', next.join('\n'))
}
function summaryLabel(key: SummaryKey) { return SUMMARY_CHOICES.find(choice => choice.key === key)!.label }

function disabledReason(key: DisplaySettingKey): string {
  if (SITE_RESTRICTED_FIELDS.includes(key) && !props.siteConfig[key]) return '站点已关闭此功能'
  if (['show_price', 'finance_currency', 'show_personal_finance'].includes(key) && !props.priceAllowed) return '费用由站点控制，当前不可显示'
  if (['finance_currency', 'show_personal_finance'].includes(key) && !props.config.show_price) return '开启费用后可设置'
  if (['ping_mode', 'ping_tasks', 'ping_max_lines', 'ping_refresh_interval'].includes(key) && !props.config.show_ping) return '开启网络延迟后可设置'
  if (key === 'earth_rotation_speed' && props.config.earth_mode !== 'earth') return '选择自转地球后可设置'
  if (key === 'earth_show_labels' && !['earth', 'earth-stop', 'map'].includes(props.config.earth_mode)) return '选择地球或地图后可设置'
  if (key === 'earth_show_rates' && !['earth', 'earth-stop'].includes(props.config.earth_mode)) return '选择地球后可设置'
  if (key === 'summary_cards' && props.config.summary_preset !== 'custom') return '选择自定义总览方案后可设置'
  if (['summary_preset', 'summary_scope', 'summary_cards'].includes(key) && !props.config.show_summary) return '开启总览卡片后可设置'
  if (['background_light', 'background_dark', 'background_blur', 'background_opacity'].includes(key) && !props.config.background_enabled) return '开启自定义背景后可设置'
  if (key === 'expiry_warning_days' && !props.config.show_expiry) return '显示到期时间后可设置'
  return ''
}
function update(field: DisplayField, event: Event) {
  const input = event.target as HTMLInputElement
  const value = field.type === 'boolean' ? input.checked : field.type === 'number' ? input.value === '' ? null : Number(input.value) : input.value
  if (!validDisplaySetting(field.key, value)) {
    errors.value[field.key] = field.type === 'number' ? `请输入 ${field.min}–${field.max} 范围内的${field.key === 'earth_rotation_speed' ? '数值' : '整数'}` : '请选择有效的设置'
    return
  }
  delete errors.value[field.key]
  emit('change', field.key, value)
}
function changeSection(id: typeof active.value) { active.value = id; content.value?.scrollTo({ top: 0 }) }
function reset() { errors.value = {}; emit('reset') }
function onBackdrop(event: MouseEvent) {
  if (event.target !== dialog.value) return
  const rect = dialog.value!.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) emit('close')
}
let previousOverflow = '', previousPadding = '', returnFocus: HTMLElement | null = null
onMounted(() => {
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  previousOverflow = document.body.style.overflow
  previousPadding = document.body.style.paddingRight
  const scrollbar = window.innerWidth - document.documentElement.clientWidth
  if (scrollbar > 0) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbar}px`
  document.body.style.overflow = 'hidden'
  dialog.value?.showModal()
})
onBeforeUnmount(() => {
  dialog.value?.close()
  document.body.style.overflow = previousOverflow
  document.body.style.paddingRight = previousPadding
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
})
</script>
<template>
  <Teleport to="body">
    <dialog ref="dialog" class="display-settings-dialog" :class="{ 'display-settings-reduced': config.reduce_motion }" aria-labelledby="display-settings-title" aria-describedby="display-settings-description" @cancel.prevent="emit('close')" @close="emit('close')" @click="onBackdrop">
      <header class="display-settings-header">
        <div><h2 id="display-settings-title">显示设置</h2><p id="display-settings-description">只影响当前浏览器，修改后立即生效。</p></div>
        <button class="icon-button" type="button" aria-label="关闭显示设置" autofocus @click="emit('close')"><X /></button>
      </header>
      <div class="display-settings-body">
        <nav class="display-settings-nav" aria-label="显示设置分类">
          <button v-for="item in DISPLAY_SECTIONS" :key="item.id" type="button" :class="{ active: active === item.id }" :aria-current="active === item.id ? 'true' : undefined" @click="changeSection(item.id)"><component :is="icons[item.id]" />{{ item.label }}</button>
        </nav>
        <section ref="content" class="display-settings-content" :aria-label="section.label">
          <div class="display-settings-section-heading"><h3>{{ section.label }}</h3><p>{{ section.description }}</p></div>
          <div class="display-settings-fields">
            <component :is="field.key === 'summary_cards' ? 'div' : 'label'" v-for="field in fields" :key="field.key" class="display-settings-field" :class="{ 'display-settings-toggle': field.type === 'boolean', 'display-settings-wide': field.type === 'text', 'display-settings-disabled': !!disabledReason(field.key) }">
              <span class="display-settings-field-label">{{ field.label }}</span>
              <span v-if="field.type === 'boolean'" class="display-settings-switch"><input type="checkbox" role="switch" :aria-label="field.label" :checked="!!config[field.key]" :disabled="!!disabledReason(field.key)" @change="update(field, $event)" /><span aria-hidden="true" /></span>
              <select v-else-if="field.type === 'select'" :value="config[field.key]" :aria-label="field.label" :disabled="!!disabledReason(field.key)" @change="update(field, $event)"><option v-for="option in field.options" :key="option.value" :value="option.value">{{ option.label }}</option></select>
              <fieldset v-else-if="field.key === 'summary_cards'" class="display-summary-picker" :disabled="!!disabledReason(field.key)" :aria-label="field.label">
                <div class="display-summary-choices"><label v-for="choice in SUMMARY_CHOICES" :key="choice.key"><input type="checkbox" :checked="selectedSummaryCards.includes(choice.key)" :aria-label="`显示总览：${choice.label}`" @change="toggleSummaryCard(choice.key, ($event.target as HTMLInputElement).checked)" />{{ choice.label }}</label></div>
                <ol v-if="selectedSummaryCards.length" class="display-summary-order"><li v-for="(key, index) in selectedSummaryCards" :key="key"><span>{{ summaryLabel(key) }}</span><button type="button" :disabled="index === 0" :aria-label="`上移${summaryLabel(key)}`" @click="moveSummaryCard(index, -1)"><ArrowUp /></button><button type="button" :disabled="index === selectedSummaryCards.length - 1" :aria-label="`下移${summaryLabel(key)}`" @click="moveSummaryCard(index, 1)"><ArrowDown /></button></li></ol>
                <p v-else class="display-settings-field-help">未选择卡片，首页总览将隐藏。</p>
              </fieldset>
              <input v-else :type="field.type === 'number' ? 'number' : 'text'" :value="config[field.key]" :min="field.min" :max="field.max" :step="field.key === 'earth_rotation_speed' ? 0.1 : 1" :aria-label="field.label" :aria-invalid="!!errors[field.key]" :disabled="!!disabledReason(field.key)" @change="update(field, $event)" />
              <span v-if="errors[field.key]" class="display-settings-field-error" role="alert">{{ errors[field.key] }}</span>
              <span v-else class="display-settings-field-help">{{ disabledReason(field.key) || field.help }}</span>
            </component>
          </div>
        </section>
      </div>
      <footer class="display-settings-footer">
        <button class="display-settings-reset" type="button" @click="reset"><RotateCcw />恢复站点默认</button>
        <span class="display-settings-save-note" role="status">{{ storageAvailable ? '自动保存在当前浏览器' : '浏览器存储不可用，仅本次页面有效' }}</span>
        <button class="display-settings-done" type="button" @click="emit('close')">完成</button>
      </footer>
    </dialog>
  </Teleport>
</template>
