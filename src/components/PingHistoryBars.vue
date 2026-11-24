<script setup lang="ts">
import type { PingBucket } from '../lib/ping-display'
import {
  bucketAllTimeout,
  bucketLatencyTone,
  formatHistoryBucketTooltip,
  pingTone,
} from '../lib/ping-display'

const props = withDefaults(defineProps<{
  buckets: PingBucket[]
  metric: 'latency' | 'loss'
  label: string
  emptyTitle?: string
  scope?: string
}>(), {
  emptyTitle: '暂无记录',
})

function barClass(bucket: PingBucket): string {
  if (props.metric === 'latency') return `latency-bar-${bucketLatencyTone(bucket)}`
  return `ping-tone-${bucketAllTimeout(bucket) ? 'bad' : pingTone(bucket.maxLoss ?? bucket.loss, 'loss')}`
}
</script>
<template>
  <div class="ping-history" :class="{ 'ping-history-empty': !props.buckets.length }" role="img" :aria-label="props.buckets.length ? props.label : `${props.label}：${props.emptyTitle}`">
    <span v-for="(bucket, index) in props.buckets" :key="index" :class="barClass(bucket)" :title="formatHistoryBucketTooltip(bucket, props.metric, props.scope)" />
    <template v-if="!props.buckets.length"><span v-for="index in 10" :key="`empty-${index}`" :class="props.metric === 'latency' ? 'latency-bar-unknown ping-tone-unknown' : 'ping-tone-unknown'" :title="props.emptyTitle" /></template>
  </div>
</template>
