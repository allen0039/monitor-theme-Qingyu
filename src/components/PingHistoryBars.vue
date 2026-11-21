<script setup lang="ts">
import type { PingBucket } from '../lib/ping-display'
import { latencyLabel, lossLabel, pingTone } from '../lib/ping-display'
const props = withDefaults(defineProps<{ buckets: PingBucket[]; metric: 'latency' | 'loss'; label: string; emptyTitle?: string }>(), {
  emptyTitle: '暂无记录',
})
function barTone(bucket: PingBucket): string {
  if (props.metric === 'latency') return bucket.timeout ? 'bad' : pingTone(bucket.latency, 'latency')
  return bucket.timeout ? 'bad' : pingTone(bucket.maxLoss ?? bucket.loss, 'loss')
}
function tooltip(bucket: PingBucket, metric: 'latency' | 'loss') {
  const time = (ts: number) => new Date(ts * 1000).toLocaleTimeString()
  return metric === 'latency'
    ? `${time(bucket.start)}–${time(bucket.end)} · ${latencyLabel(bucket.latency, bucket.timeout)}（峰值 ${latencyLabel(bucket.peak, bucket.timeout)}）\n近期返回采样的平均值`
    : `${time(bucket.start)}–${time(bucket.end)} · 最高丢包 ${lossLabel(bucket.maxLoss ?? bucket.loss)}\n整段丢包见上方数值`
}
</script>
<template>
  <div class="ping-history" :class="{ 'ping-history-empty': !props.buckets.length }" role="img" :aria-label="props.buckets.length ? props.label : `${props.label}：${props.emptyTitle}`">
    <span v-for="(bucket, index) in props.buckets" :key="index" :class="`ping-tone-${barTone(bucket)}`" :title="tooltip(bucket, props.metric)" />
    <template v-if="!props.buckets.length"><span v-for="index in 10" :key="`empty-${index}`" class="ping-tone-unknown" :title="props.emptyTitle" /></template>
  </div>
</template>
