import { describe, expect, it } from 'vitest'
import { chartLineGeometry, monotonePath } from './chart-lines'

const x = (ts: number) => ts
const y = (value: number) => value

describe('延迟图平滑模式', () => {
  it('平滑减轻尖峰并使用保形曲线，关闭后恢复原始折线和读数', () => {
    const samples = [{ ts: 0, ping: 10 }, { ts: 60, ping: 45 }, { ts: 120, ping: 12 }].map(row => Object.freeze(row))
    const before = structuredClone(samples)
    const raw = chartLineGeometry(samples, 'ping', 60, x, y)
    expect(raw.solid).toContain('L60 45')
    expect(raw.solid).not.toContain('C')
    const smoothed = chartLineGeometry(samples, 'ping', 60, x, y, true)
    expect(smoothed.solid).toContain('C')
    expect(smoothed.solid).toContain('60 28')
    expect(smoothed.solid).not.toContain('60 45')
    expect(samples).toEqual(before)
    expect(chartLineGeometry(samples, 'ping', 60, x, y)).toEqual(raw)
  })
  it('缺失时间点用同一条实线曲线连接，关闭平滑保持断档', () => {
    const samples = [{ ts: 0, ping: 10 }, { ts: 120, ping: 15 }]
    expect(chartLineGeometry(samples, 'ping', 60, x, y).solid.match(/M/g)).toHaveLength(2)
    const smooth = chartLineGeometry(samples, 'ping', 60, x, y, true)
    expect(smooth.solid.match(/M/g)).toHaveLength(1)
    expect(smooth.solid).toContain('C')
    expect(smooth.solid).toContain('120 15')
  })
  it.each([1, 2])('连续 %i 次短暂超时连接为实线，不产生零延迟测量', count => {
    const samples = [
      { ts: 0, ping: 15 },
      ...Array.from({ length: count }, (_, i) => ({ ts: (i + 1) * 60, ping: null })),
      { ts: (count + 1) * 60, ping: 20 },
    ]
    const result = chartLineGeometry(samples, 'ping', 60, x, y, true)
    expect(result.solid.match(/M/g)).toHaveLength(1)
    expect(result.solid).toContain('C')
    const ys = result.solid.match(/-?\d+(?:\.\d+)?/g)!.map(Number).filter((_, i) => i % 2 === 1)
    expect(ys.every(value => value >= 15 && value <= 20)).toBe(true)
    expect(chartLineGeometry(samples, 'ping', 60, x, y).solid.match(/M/g)).toHaveLength(2)
  })
  it('持续超时和长缺测仍断开', () => {
    const samples = [{ ts: 0, ping: 15 }, { ts: 60, ping: null }, { ts: 120, ping: null }, { ts: 180, ping: null }, { ts: 240, ping: 20 }]
    expect(chartLineGeometry(samples, 'ping', 60, x, y, true).solid).toBe('M0 15 M240 20')
    const longGap = chartLineGeometry([{ ts: 0, ping: 15 }, { ts: 240, ping: 20 }], 'ping', 60, x, y, true)
    expect(longGap.solid).toBe('M0 15 M240 20')
  })
  it('缺测连接上限随采样周期变化', () => {
    const samples = [{ ts: 0, ping: 15 }, { ts: 900, ping: 20 }]
    expect(chartLineGeometry(samples, 'ping', 300, x, y, true).solid.match(/M/g)).toHaveLength(1)
    expect(chartLineGeometry(samples, 'ping', 60, x, y, true).solid.match(/M/g)).toHaveLength(2)
  })
  it.each([NaN, Infinity, -Infinity])('无效值 %s 保留硬断点', invalid => {
    const samples = [{ ts: 0, ping: 15 }, { ts: 60, ping: invalid }, { ts: 120, ping: 20 }]
    expect(chartLineGeometry(samples, 'ping', 60, x, y, true).solid).toBe('M0 15 M120 20')
  })
  it('不向首尾超时或全空数据外推', () => {
    const timeout = [{ ts: 0, ping: 15 }, { ts: 60, ping: null }, { ts: 120, ping: 20 }]
    expect(chartLineGeometry(timeout.slice(1), 'ping', 60, x, y, true).solid).toBe('M120 20')
    expect(chartLineGeometry(timeout.slice(0, 2), 'ping', 60, x, y, true).solid).toBe('M0 15')
    expect(chartLineGeometry([{ ts: 60, ping: null }], 'ping', 60, x, y, true).solid).toBe('')
    expect(chartLineGeometry([], 'ping', 60, x, y, true).solid).toBe('')
  })
  it('不同线路缺少的时间点不会误当超时，原始零值保留', () => {
    const mixed = [{ ts: 0, first: 0 }, { ts: 60, second: 100 }, { ts: 120, first: 15 }]
    const result = chartLineGeometry(mixed, 'first', 60, x, y, true)
    expect(result.solid).toContain('M0 0')
    expect(result.solid.match(/M/g)).toHaveLength(1)
    expect(result.solid).toContain('120 15')
  })
  it('长断档两侧的平滑互不影响，时间倒序不会被连接', () => {
    const left = [{ ts: 0, ping: 10 }, { ts: 60, ping: 20 }, { ts: 120, ping: 10 }]
    const right = [{ ts: 420, ping: 100 }, { ts: 480, ping: 200 }, { ts: 540, ping: 100 }]
    expect(chartLineGeometry([...left, ...right], 'ping', 60, x, y, true).solid).toBe(
      chartLineGeometry(left, 'ping', 60, x, y, true).solid + ' ' + chartLineGeometry(right, 'ping', 60, x, y, true).solid,
    )
    expect(chartLineGeometry([{ ts: 60, ping: 10 }, { ts: 0, ping: 20 }], 'ping', 60, x, y, true).solid).toBe('M60 10 M0 20')
  })
  it('尖峰平滑不会产生高于原始峰值或低于谷值的控制点', () => {
    const path = monotonePath([{ x: 0, y: 15 }, { x: 1, y: 100 }, { x: 2, y: 10 }, { x: 3, y: 20 }])
    expect(path).toContain('C')
    const controls = [...path.matchAll(/C(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)]
    expect(controls).toHaveLength(3)
    expect(controls.flatMap(a => [Number(a[2]), Number(a[4]), Number(a[6])]).every(v => v >= 10 && v <= 100)).toBe(true)
  })
})
