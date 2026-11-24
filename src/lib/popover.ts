import { onBeforeUnmount, onMounted, type Ref } from 'vue'

/** Position a native top-layer summary popover anchored cleanly to its card element. */
function positionSummaryPopover(panel: HTMLElement | null, anchor: HTMLElement | null): void {
  if (!panel || !anchor || typeof panel.matches !== 'function' || !panel.matches(':popover-open')) return
  const rect = anchor.getBoundingClientRect()
  const { width, height } = panel.getBoundingClientRect()
  const margin = 12
  const gap = 8

  const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))
  const fitsBelow = rect.bottom + gap + height <= window.innerHeight - margin
  const above = rect.top - gap - height
  const candidate = fitsBelow || above < margin ? rect.bottom + gap : above
  const top = Math.max(margin, Math.min(candidate, window.innerHeight - height - margin))

  panel.style.left = `${left}px`
  panel.style.top = `${top}px`
}

export function useSummaryPopoverPosition(panel: Ref<HTMLElement | null>, anchor: () => HTMLElement | null): () => void {
  const position = () => positionSummaryPopover(panel.value, anchor())
  let observer: ResizeObserver | undefined

  onMounted(() => {
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    if (panel.value && typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(position)
      observer.observe(panel.value)
    }
  })
  onBeforeUnmount(() => {
    observer?.disconnect()
    window.removeEventListener('resize', position)
    window.removeEventListener('scroll', position, true)
  })

  return position
}
