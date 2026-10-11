<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { GlobeInstance } from 'globe.gl'
import type { MeshPhongMaterial, Texture } from 'three'
import type { MonitorNode } from '../types'
import { arcsToCountry, clustersOf, COORD_MAP, type RegionCluster } from '../lib/geo'
import { flagUrl } from '../lib/assets'
import { formatBytes } from '../lib/format'
import GeoMap from './GeoMap.vue'

const props = defineProps<{ nodes: MonitorNode[]; rotate: boolean; dark: boolean; reduceMotion: boolean; rotationSpeed: number; showLabels: boolean; showRates: boolean; visitorCountry: string }>()
const host = ref<HTMLElement | null>(null), failed = ref(false), ready = ref(false)
const clusters = computed(() => clustersOf(props.nodes))
const arcs = computed(() => arcsToCountry(clusters.value, props.visitorCountry))
let globe: GlobeInstance | null = null, observer: ResizeObserver | null = null, visibilityObserver: IntersectionObserver | null = null
let material: MeshPhongMaterial | null = null, water: Texture | null = null
let destroyed = false, inViewport = true
const labelElements = new Map<string, { root: HTMLElement; tx: Text; rx: Text }>()
const signature = computed(() => clusters.value.map((c) => `${c.code}:${c.total}:${c.online}`).join(','))

function createLabel(value: object): HTMLElement {
  const c = value as RegionCluster
  const root = document.createElement('div')
  root.className = 'earth-label'
  root.title = `${c.name} · ${c.online}/${c.total} 在线`
  const panel = document.createElement('div')
  panel.className = 'earth-rate-panel'
  panel.hidden = !props.showRates
  const textNodes: Text[] = []
  for (const [direction, rate] of [['up', c.tx], ['down', c.rx]] as const) {
    const row = document.createElement('div')
    row.className = `earth-rate-row ${direction}`
    const arrow = document.createElement('span')
    arrow.textContent = direction === 'up' ? '↑' : '↓'
    const text = document.createTextNode(formatBytes(rate, true, 'overview'))
    row.append(arrow, text)
    panel.append(row)
    textNodes.push(text)
  }
  const flag = document.createElement('img')
  flag.className = 'earth-flag'
  flag.src = flagUrl(c.code) || ''
  flag.alt = c.name
  root.append(panel, flag)
  labelElements.set(c.code, { root, tx: textNodes[0], rx: textNodes[1] })
  return root
}
function syncData() {
  if (!globe) return
  labelElements.clear()
  globe.htmlElementsData(props.showLabels ? clusters.value : [])
}
function syncRates() {
  for (const c of clusters.value) {
    const element = labelElements.get(c.code)
    if (!element) continue
    element.tx.textContent = formatBytes(c.tx, true, 'overview')
    element.rx.textContent = formatBytes(c.rx, true, 'overview')
  }
}
function syncArcs() {
  globe?.arcsData(arcs.value)
}
function arcColor() {
  return props.dark ? 'rgba(96,165,250,0.96)' : 'rgba(37,99,235,0.94)'
}
function resetPointOfView(duration = 0) {
  const [lat, lng] = COORD_MAP.CN
  globe?.pointOfView({ lat, lng, altitude: 1.95 }, duration)
}
function resize() {
  // Globe.gl inserts a canvas with the window height during construction. Reading
  // its content-driven host height would keep that oversized canvas forever.
  if (host.value && globe) globe.width(host.value.clientWidth).height(host.value.clientWidth)
}
function syncVisibility() {
  if (!globe) return
  const visible = !document.hidden && inViewport
  if (visible) { globe.resumeAnimation(); resize() }
  else globe.pauseAnimation()
  globe.controls().autoRotate = visible && props.rotate && !props.reduceMotion
  globe.controls().autoRotateSpeed = props.rotationSpeed
}
onMounted(async () => {
  try {
    const [{ default: Globe }, THREE] = await Promise.all([import('globe.gl'), import('three')])
    await nextTick()
    if (destroyed || !host.value) return
    const size = host.value.clientWidth
    globe = new Globe(host.value, { animateIn: !props.reduceMotion, rendererConfig: { alpha: true, antialias: true } })
      .width(size).height(size)
      .backgroundColor('rgba(0,0,0,0)').globeImageUrl('/images/earth/earth-blue-marble.jpg')
      .bumpImageUrl('/images/earth/earth-topology.png').showAtmosphere(true).atmosphereColor('#60a5fa').atmosphereAltitude(.1)
      .arcStartLat('fromLat').arcStartLng('fromLng').arcEndLat('toLat').arcEndLng('toLng')
      .arcColor(arcColor).arcAltitude(.28).arcStroke(.55).arcCurveResolution(64)
      .arcsTransitionDuration(props.reduceMotion ? 0 : 700)
      .htmlLat('lat').htmlLng('lng').htmlAltitude(.018).htmlElement(createLabel)
      .htmlElementVisibilityModifier((element, visible) => {
        element.style.opacity = visible ? '1' : '0'
        element.style.filter = visible ? 'blur(0)' : 'blur(16px)'
      })
      .htmlTransitionDuration(props.reduceMotion ? 0 : 400)
    const renderer = globe.renderer()
    renderer.setClearColor(0, 0)
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
    const m = globe.globeMaterial()
    if ('shininess' in m) {
      material = m as MeshPhongMaterial
      material.bumpScale = .03
      material.shininess = 14
      material.emissive.set(0x244c69)
      material.emissiveIntensity = .26
      material.specular = new THREE.Color(0x475569)
      water = new THREE.TextureLoader().load('/images/earth/earth-water.png', () => {
        if (material) { material.specularMap = water; material.needsUpdate = true }
      })
    }
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.08)
    keyLight.position.set(1.2, 1.1, 1.6)
    const fill = new THREE.DirectionalLight(0xdbeafe, .46)
    fill.position.set(-1.2, .2, 1.2)
    const rearFill = new THREE.DirectionalLight(0xe0f2fe, .34)
    rearFill.position.set(-1, -.8, -1.2)
    globe.lights([new THREE.AmbientLight(0xffffff, 1.35), keyLight, fill, rearFill])
    const controls = globe.controls()
    controls.autoRotateSpeed = props.rotationSpeed
    controls.enableDamping = true
    controls.enableZoom = controls.enablePan = false
    controls.rotateSpeed = .55
    resetPointOfView()
    syncData()
    syncArcs()
    observer = new ResizeObserver(resize)
    observer.observe(host.value)
    visibilityObserver = new IntersectionObserver(([entry]) => { inViewport = entry.isIntersecting; syncVisibility() })
    visibilityObserver.observe(host.value)
    document.addEventListener('visibilitychange', syncVisibility)
    syncVisibility()
    ready.value = true
  } catch {
    globe?.pauseAnimation()
    globe?._destructor()
    globe = null
    water?.dispose()
    water = null
    host.value?.replaceChildren()
    failed.value = true
  }
})
watch(signature, syncData)
watch(clusters, syncRates)
watch([signature, () => props.visitorCountry], syncArcs)
watch(() => props.dark, () => globe?.arcColor(arcColor))
watch(() => [props.rotate, props.reduceMotion, props.rotationSpeed], syncVisibility)
watch(() => props.reduceMotion, value => {
  globe?.htmlTransitionDuration(value ? 0 : 400).arcsTransitionDuration(value ? 0 : 700)
})
watch(() => props.rotate, value => { if (!value) resetPointOfView(props.reduceMotion ? 0 : 300) })
watch(() => [props.showLabels, props.showRates], syncData)
onBeforeUnmount(() => {
  destroyed = true
  observer?.disconnect()
  visibilityObserver?.disconnect()
  document.removeEventListener('visibilitychange', syncVisibility)
  globe?.pauseAnimation()
  globe?._destructor()
  globe = material = null
  water?.dispose()
  water = null
  labelElements.clear()
})
</script>
<template>
  <div class="globe-panel" :class="{ 'globe-dark': dark }">
    <GeoMap v-if="failed" :nodes="nodes" :show-labels="showLabels" />
    <template v-else>
      <div v-if="!ready" class="earth-placeholder" aria-label="地球加载中" />
      <div ref="host" class="globe-host" role="img" aria-label="交互地球，可拖动查看节点地区" />
    </template>
  </div>
</template>
