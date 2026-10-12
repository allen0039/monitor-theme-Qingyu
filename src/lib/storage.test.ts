import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { readQingyuStorage } from './storage'

function memoryStorage(entries: [string, string][] = []): Storage {
  const data = new Map(entries)
  return {
    get length() { return data.size },
    clear: () => data.clear(),
    getItem: key => data.get(key) ?? null,
    key: index => [...data.keys()][index] ?? null,
    removeItem: key => { data.delete(key) },
    setItem: (key, value) => { data.set(key, value) },
  }
}

describe('Qingyu 浏览器存储迁移', () => {
  it.each(['preferences', 'finance.preferences.v1', 'finance.rates.v1', 'visitor-geo.v1', 'ping.smooth'])('迁移 %s 并清理旧键', suffix => {
    const storage = memoryStorage([[`boxpro.${suffix}`, 'saved']])
    expect(readQingyuStorage(storage, `qingyu.${suffix}`)).toBe('saved')
    expect(storage.getItem(`qingyu.${suffix}`)).toBe('saved')
    expect(storage.getItem(`boxpro.${suffix}`)).toBeNull()
  })

  it('已有新偏好优先，包括空字符串和关闭状态', () => {
    for (const current of ['', '0', '{"selectedIds":[]}']) {
      const storage = memoryStorage([['qingyu.preferences', current], ['boxpro.preferences', 'old']])
      expect(readQingyuStorage(storage, 'qingyu.preferences')).toBe(current)
    }
  })

  it('迁移写入失败仍读取旧值，并保留旧键以便之后重试', () => {
    const storage = memoryStorage([['boxpro.preferences', 'saved']])
    storage.setItem = () => { throw new Error('quota exceeded') }
    expect(readQingyuStorage(storage, 'qingyu.preferences')).toBe('saved')
    expect(storage.getItem('boxpro.preferences')).toBe('saved')
  })

  it('首次访问不会写入虚假的偏好', () => {
    const storage = memoryStorage()
    expect(readQingyuStorage(storage, 'qingyu.preferences')).toBeNull()
    expect(storage.length).toBe(0)
  })

  it('首屏配色沿用旧偏好，且已有 Qingyu 偏好优先', () => {
    const script = readFileSync(new URL('../../index.html', import.meta.url), 'utf8').match(/<script>([\s\S]*?)<\/script>/)![1]!
    const storage = memoryStorage([['boxpro.preferences', '{"theme":"dark"}']])
    const toggle = vi.fn()
    const context = { localStorage: storage, document: { documentElement: { classList: { toggle } } }, matchMedia: () => ({ matches: false }) }
    runInNewContext(script, context)
    expect(toggle).toHaveBeenLastCalledWith('dark', true)
    storage.setItem('qingyu.preferences', '{"theme":"light"}')
    runInNewContext(script, context)
    expect(toggle).toHaveBeenLastCalledWith('dark', false)
  })
})
