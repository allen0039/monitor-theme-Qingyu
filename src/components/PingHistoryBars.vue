<script setup lang="ts">
import type { PingBucket } from '../lib/ping-display'
import { latencyLabel, lossLabel, pingTone } from '../lib/ping-display'
defineProps<{ buckets: PingBucket[]; metric: 'latency' | 'loss'; label: string }>()
function tooltip(bucket: PingBucket, metric: 'latency' | 'loss') {
  const time = (ts: number) => new Date(ts * 1000).toLocaleTimeString()
  return `${time(bucket.start)}–${time(bucket.end)} · ${metric === 'latency' ? latencyLabel(bucket.latency, bucket.timeout) : lossLabel(bucket.loss)}\n${metric === 'latency' ? '近期返回采样的平均值' : '逐段丢包摘要，整段丢包见上方数值'}`
}
</script>
<template>
  <div class="ping-history" :aria-label="label">
    <span v-for="(bucket, index) in buckets" :key="index" :class="`ping-tone-${bucket.timeout && metric === 'latency' ? 'bad' : pingTone(bucket[metric], metric)}`" :title="tooltip(bucket, metric)" />
    <template v-if="!buckets.length"><span v-for="index in 10" :key="`empty-${index}`" class="ping-tone-unknown" title="暂无记录" /></template>
  </div>
</template>
