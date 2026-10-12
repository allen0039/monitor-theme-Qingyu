/** A presentation-only path generator. No missing or timed-out sample becomes a measurement. */
export interface PlotSample { ts: number; [key: string]: number | null | undefined }
export interface PlotXY { x: number; y: number }
export interface LineGeometry { solid: string }

const r = (n: number) => Number(n.toFixed(2))
const xy = (p: PlotXY) => `${r(p.x)} ${r(p.y)}`
const lineTo = (point: PlotXY) => `L${xy(point)}`

/** PCHIP slope at a boundary: preserves monotonic segments and does not create false peaks. */
function edge(a: number, b: number, h1: number, h2: number): number {
  const m = ((2 * h1 + h2) * a - h1 * b) / (h1 + h2)
  if (m * a <= 0) return 0
  return a * b < 0 && Math.abs(m) > 3 * Math.abs(a) ? 3 * a : m
}

/** Monotone piecewise cubic Hermite interpolation; x coordinates must be increasing. */
export function monotonePath(points: PlotXY[]): string {
  if (!points.length) return ''
  const prefix = `M${xy(points[0]!)}`
  if (points.length === 1) return prefix
  const hs = points.slice(1).map((p, i) => p.x - points[i]!.x)
  if (hs.some(h => h <= 0)) return prefix + points.slice(1).map(p => lineTo(p)).join(' ')
  const slopes = hs.map((h, i) => (points[i + 1]!.y - points[i]!.y) / h)
  const m = points.map((_, i) => {
    if (points.length === 2) return slopes[0]!
    if (i === 0) return edge(slopes[0]!, slopes[1]!, hs[0]!, hs[1]!)
    if (i === points.length - 1) return edge(slopes.at(-1)!, slopes.at(-2)!, hs.at(-1)!, hs.at(-2)!)
    const a = slopes[i - 1]!, b = slopes[i]!
    if (a * b <= 0) return 0
    const h0 = hs[i - 1]!, h1 = hs[i]!
    const w0 = 2 * h1 + h0, w1 = h1 + 2 * h0
    return (w0 + w1) / (w0 / a + w1 / b)
  })
  let d = prefix
  for (let i = 0; i < hs.length; i++) {
    const p = points[i]!, next = points[i + 1]!, oneThird = hs[i]! / 3
    d += ` C${xy({ x: p.x + oneThird, y: p.y + oneThird * m[i]! })} ${xy({ x: next.x - oneThird, y: next.y - oneThird * m[i + 1]! })} ${xy(next)}`
  }
  return d
}

interface LineSample { ts: number; value: number }

/** A time-weighted three-sample average reduces spikes only in the drawing copy. */
function smoothSamples(samples: LineSample[], step: number): LineSample[] {
  return samples.map((sample, i) => {
    let sum = sample.value * 2, weight = 2
    for (const neighbor of [samples[i - 1], samples[i + 1]]) {
      if (!neighbor) continue
      const w = Math.max(0, 2 - Math.abs(neighbor.ts - sample.ts) / step)
      sum += neighbor.value * w
      weight += w
    }
    return { ts: sample.ts, value: sum / weight }
  })
}

/**
 * Smooth mode joins up to two missing/timeout cycles with the same continuous curve.
 * Long outages and invalid values still split paths. Source samples remain untouched.
 */
export function chartLineGeometry(
  points: PlotSample[], key: string, step: number,
  x: (ts: number) => number, y: (v: number) => number,
  smooth = false,
): LineGeometry {
  const cadence = Math.max(1, step)
  const maxGap = cadence * (smooth ? 3.25 : 1.6)
  const segments: LineSample[][] = []
  let segment: LineSample[] = []
  let previous: LineSample | null = null
  function finish() { if (segment.length) segments.push(segment); segment = [] }
  for (const row of points) {
    const value = row[key]
    if (value === null && smooth) continue
    if (value === null || (value !== undefined && !Number.isFinite(value))) {
      finish()
      previous = null
      continue
    }
    if (value === undefined) continue // Another line may have sampled at this timestamp.
    const sample = { ts: row.ts, value }
    if (!previous) {
      segment = [sample]
    } else {
      const delta = row.ts - previous.ts
      if (delta <= 0 || delta > maxGap) {
        finish()
        segment = [sample]
      } else segment.push(sample)
    }
    previous = sample
  }
  finish()
  return { solid: segments.map(segment => {
    const samples = smooth ? smoothSamples(segment, cadence) : segment
    const plotted = samples.map(sample => ({ x: x(sample.ts), y: y(sample.value) }))
    return smooth ? monotonePath(plotted) : `M${xy(plotted[0]!)} ${plotted.slice(1).map(lineTo).join(' ')}`
  }).join(' ') }
}
