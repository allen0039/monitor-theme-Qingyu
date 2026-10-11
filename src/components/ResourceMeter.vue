<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ label: string; value: number | null; detail?: string; detailTitle?: string; color?: string }>()
const color = computed(() => props.color || (props.value !== null && props.value >= 90 ? 'var(--danger)' : props.value !== null && props.value >= 75 ? 'var(--warning)' : 'var(--emerald)'))
</script>
<template>
  <div class="resource-meter">
    <div class="meter-label"><span>{{ label }}</span><span class="data-number">{{ value === null ? '—' : `${value.toFixed(1)}%` }}</span></div>
    <div class="meter-track" role="meter" :aria-label="label" :aria-valuenow="value === null ? undefined : Math.min(100, value)" aria-valuemin="0" aria-valuemax="100" :aria-valuetext="value === null ? '暂无指标' : `${value.toFixed(1)}%`"><span :style="{ width: `${Math.min(100, Math.max(0, value ?? 0))}%`, background: color }" /></div>
    <div v-if="detail" class="meter-detail" :title="detailTitle || detail">{{ detail }}</div>
  </div>
</template>
