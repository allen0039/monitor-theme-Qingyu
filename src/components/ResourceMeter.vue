<script setup lang="ts">
import { computed } from 'vue'
import { ArrowDownUp, Cpu, HardDrive, MemoryStick } from '@lucide/vue'
const props = defineProps<{ label: string; value: number | null; detail?: string; detailTitle?: string; icon?: 'cpu' | 'memory' | 'disk' | 'traffic'; warningAt?: number; dangerAt?: number }>()
const icons = { cpu: Cpu, memory: MemoryStick, disk: HardDrive, traffic: ArrowDownUp }
const alertColor = computed(() => props.value !== null && props.value >= (props.dangerAt ?? 90) ? 'var(--meter-danger, var(--danger))'
  : props.value !== null && props.value >= (props.warningAt ?? 75) ? 'var(--meter-warning, var(--warning))' : '')
const color = computed(() => alertColor.value || 'var(--emerald)')
</script>
<template>
  <div class="resource-meter">
    <div class="meter-label"><span class="meter-name"><component :is="icons[icon]" v-if="icon" class="meter-icon" :class="`meter-icon-${icon}`" />{{ label }}</span><span class="data-number">{{ value === null ? '—' : `${value.toFixed(1)}%` }}</span></div>
    <div class="meter-track" role="meter" :aria-label="label" :aria-valuenow="value === null ? undefined : Math.min(100, value)" aria-valuemin="0" aria-valuemax="100" :aria-valuetext="value === null ? '暂无指标' : `${value.toFixed(1)}%`"><span :style="{ width: `${Math.min(100, Math.max(0, value ?? 0))}%`, background: color }" /></div>
    <div v-if="detail" class="meter-detail" :title="detailTitle || detail">{{ detail }}</div>
  </div>
</template>
