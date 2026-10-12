import { describe, expect, it } from 'vitest'
import { chartLineGeometry, monotonePath } from './chart-lines'

const x = (ts: number) => ts
const y = (value: number) => value

describe('延迟图平滑模式', () => {
  it('直线模式保留原始折线，平滑模式使用单调保形曲线', () => {
    const samples = [{ ts: 0, ping: 10 }, { ts: 60, ping: 45 }, { ts: 120, ping: 12 }]
    const raw = chartLineGeometry(samples, 'ping', 60, x, y)
    expect(raw.solid).toContain('L60 45')
    expect(raw.solid).not.toContain('C')
    expect(raw.bridge).toBe('')
    const smoothed = chartLineGeometry(samples, 'ping', 60, x, y, true)
    expect(smoothed.solid).toContain('C')
    expect(smoothed.solid).toContain('120 12')
    expect(smoothed.bridge).toBe('')
  })
  it('缺失一帧可以用明确虚线桥连接，关闭平滑保持真实断档', () => {
    const samples = [{ ts: 0, ping: 10 }, { ts: 120, ping: 15 }]
    expect(chartLineGeometry(samples, 'ping', 60, x, y).bridge).toBe('')
    const smooth = chartLineGeometry(samples, 'ping', 60, x, y, true)
    expect(smooth.bridge).toBe('M0 10 L120 15')
    expect(smooth.solid).not.toContain('L120 15')
  })
  it('明确超时不能画成0或使用虚线跨越，长缺测也不补齐', () => {
    const timeout = [{ ts: 0, ping: 15 }, { ts: 60, ping: null }, { ts: 120, ping: 20 }]
    const result = chartLineGeometry(timeout, 'ping', 60, x, y, true)
    expect(result.bridge).toBe('')
    expect(result.solid.split('M').length - 1).toBe(2)
    const longGap = chartLineGeometry([{ ts: 0, ping: 15 }, { ts: 240, ping: 20 }], 'ping', 60, x, y, true)
    expect(longGap.bridge).toBe('')
    expect(longGap.solid.split('M').length - 1).toBe(2)
  })
  it('不同线路缺少的时间点不会误当超时，原始零值保留', () => {
    const mixed = [{ ts: 0, first: 0 }, { ts: 60, second: 100 }, { ts: 120, first: 15 }]
    const result = chartLineGeometry(mixed, 'first', 60, x, y, true)
    expect(result.solid).toContain('M0 0')
    expect(result.bridge).toBe('M0 0 L120 15')
  })
  it('尖峰平滑不会产生高于原始峰值或低于谷值的控制点', () => {
    const path = monotonePath([{ x: 0, y: 15 }, { x: 1, y: 100 }, { x: 2, y: 10 }, { x: 3, y: 20 }])
    expect(path).toContain('C')
    const controls = [...path.matchAll(/C(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)]
    expect(controls).toHaveLength(3)
    expect(controls.flatMap(a => [Number(a[2]), Number(a[4]), Number(a[6])]).every(v => v >= 10 && v <= 100)).toBe(true)
  })
})