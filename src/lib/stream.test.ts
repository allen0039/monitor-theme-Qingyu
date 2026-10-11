import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { frameText } from './api'
import { startStream } from './stream'

class FakeSocket {
  static OPEN = 1
  static instances: FakeSocket[] = []
  readyState = 0
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: string | Blob }) => void) | null = null
  constructor(public url: string) { FakeSocket.instances.push(this) }
  close() { this.readyState = 3; this.onclose?.() }
  push(value: unknown) { this.readyState = 1; this.onmessage?.({ data: JSON.stringify(value) }) }
}
const payload = (id = 1) => ({ nodes: [{ id, name: `节点 ${id}`, online: true, metrics: null }] })
let page: EventTarget & { hidden: boolean }
let dispose: (() => void) | undefined
const callbacks = () => ({ nodes: vi.fn(), state: vi.fn(), error: vi.fn() })
const flush = async () => { await vi.advanceTimersByTimeAsync(0) }
beforeEach(() => {
  vi.useFakeTimers()
  FakeSocket.instances = []
  page = Object.assign(new EventTarget(), { hidden: false })
  vi.stubGlobal('document', page)
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('location', { protocol: 'https:', host: 'hub.example.com' })
  vi.stubGlobal('WebSocket', FakeSocket)
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(payload()), { headers: { 'content-type': 'application/json' } }))))
})
afterEach(() => { dispose?.(); dispose = undefined; vi.unstubAllGlobals(); vi.useRealTimers() })

describe('Monitor 实时连接', () => {
  it('使用压缩同源 WebSocket，并接收旧 hub 的文本帧', async () => {
    const cb = callbacks(); dispose = startStream(cb)
    expect(FakeSocket.instances[0].url).toBe('wss://hub.example.com/api/ws?gzip')
    FakeSocket.instances[0].push(payload(2)); await flush()
    expect(cb.nodes.mock.calls.at(-1)?.[0][0].id).toBe(2)
    expect(cb.state).toHaveBeenLastCalledWith('live')
  })
  it('较晚返回的 HTTP 快照不能覆盖较新的推送', async () => {
    let resolve!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => { resolve = r })))
    const cb = callbacks(); dispose = startStream(cb)
    FakeSocket.instances[0].push(payload(2)); await flush()
    resolve(new Response(JSON.stringify(payload(1)))); await flush()
    expect(cb.nodes).toHaveBeenCalledTimes(1)
    expect(cb.nodes.mock.calls[0][0][0].id).toBe(2)
  })
  it('断流十秒后立即换连接，坏帧不延长断流时限', async () => {
    const cb = callbacks(); dispose = startStream(cb)
    await flush()
    FakeSocket.instances[0].push(payload()); await flush()
    await vi.advanceTimersByTimeAsync(8000)
    FakeSocket.instances[0].onmessage?.({ data: 'not JSON' }); await flush()
    await vi.advanceTimersByTimeAsync(2000)
    expect(FakeSocket.instances).toHaveLength(2)
    expect(cb.error).toHaveBeenCalledWith('实时数据中断，正在重新连接')
  })
  it('页面隐藏时关闭连接和轮询，返回前台立即刷新', async () => {
    const cb = callbacks(); dispose = startStream(cb); await flush()
    page.hidden = true; page.dispatchEvent(new Event('visibilitychange'))
    const requests = vi.mocked(fetch).mock.calls.length
    await vi.advanceTimersByTimeAsync(30000)
    expect(vi.mocked(fetch).mock.calls).toHaveLength(requests)
    expect(FakeSocket.instances[0].readyState).toBe(3)
    page.hidden = false; page.dispatchEvent(new Event('visibilitychange')); await flush()
    expect(FakeSocket.instances).toHaveLength(2)
    expect(vi.mocked(fetch).mock.calls).toHaveLength(requests + 1)
  })
  it('服务端关闭公开页时明确报告登录状态', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('需要登录后查看', { status: 401, headers: { 'content-type': 'text/plain' } }))))
    const cb = callbacks(); dispose = startStream(cb); await flush()
    expect(cb.error).toHaveBeenCalledWith('需要登录后查看', true)
    expect(cb.state).toHaveBeenCalledWith('closed')
    expect(FakeSocket.instances[0].readyState).toBe(3)
  })
})

describe('压缩帧', () => {
  it('解码官方 gzip Blob 帧', async () => {
    const text = JSON.stringify(payload(7))
    const packed = await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob()
    expect(await frameText(packed)).toBe(text)
    expect(await frameText(text)).toBe(text)
  })
})
