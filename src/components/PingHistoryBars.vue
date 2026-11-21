<script setup lang="ts">
import type { PingBucket } from '../lib/ping-display'
import { latencyLabel, lossLabel, pingTone } from '../lib/ping-display'
const props = withDefaults(defineProps<{ buckets: PingBucket[]; metric: 'latency' | 'loss' | 'combined'; label: string; emptyTitle?: string }>(), {
  emptyTitle: '暂无记录',
})
function barTone(bucket: PingBucket): string {
  if (props.metric === 'latency') return bucket.timeout ? 'bad' : pingTone(bucket.peak ?? bucket.latency, 'latency')
  if (props.metric === 'loss') return bucket.timeout ? 'bad' : pingTone(bucket.maxLoss ?? bucket.loss, 'loss')
  if (bucket.timeout || (bucket.maxLoss ?? bucket.loss ?? 0) >= 2) return 'bad'
  if (bucket.anyLoss || (bucket.loss ?? 0) > 0) return 'slow'
  return pingTone(bucket.peak ?? bucket.latency, 'latency')
}
function hasSpike(bucket: PingBucket): boolean {
  return (props.metric === 'loss' || props.metric === 'combined') && (bucket.timeout || !!bucket.anyLoss || (bucket.loss !== null && bucket.loss > 0))
}
function tooltip(bucket: PingBucket, metric: 'latency' | 'loss' | 'combined') {
  const time = (ts: number) => new Date(ts * 1000).toLocaleTimeString()
  if (metric === 'combined') {
    return `${time(bucket.start)}–${time(bucket.end)} · 平均 ${latencyLabel(bucket.latency, bucket.timeout)} · 峰值 ${latencyLabel(bucket.peak, bucket.timeout)} · 丢包 ${lossLabel(bucket.maxLoss ?? bucket.loss)}`
  }
  return metric === 'latency'
    ? `${time(bucket.start)}–${time(bucket.end)} · ${latencyLabel(bucket.latency, bucket.timeout)}（峰值 ${latencyLabel(bucket.peak, bucket.timeout)}）\n近期返回采样的平均值与峰值`
    : `${time(bucket.start)}–${time(bucket.end)} · ${lossLabel(bucket.maxLoss ?? bucket.loss)}\n逐段丢包摘要，整段丢包见上方数值`
}
</script>
<template>
  <div class="ping-history" :class="{ 'ping-history-empty': !props.buckets.length, 'ping-history-combined': props.metric === 'combined' }" :aria-label="props.label">
    <span v-for="(bucket, index) in props.buckets" :key="index" :class="[`ping-tone-${barTone(bucket)}`, { 'ping-bar-spike': hasSpike(bucket) }]" :title="tooltip(bucket, props.metric)" />
    <template v-if="!props.buckets.length"><span v-for="index in 10" :key="`empty-${index}`" class="ping-tone-unknown" :title="props.emptyTitle" /></template>
  </div>
</template>
