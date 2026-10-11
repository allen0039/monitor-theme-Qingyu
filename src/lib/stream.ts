import type { ConnectionState, MonitorNode } from '../types'
import { api, ApiError, frameText } from './api'
import { normalizeNodes, record } from './data'

interface Callbacks {
  nodes: (nodes: MonitorNode[]) => void
  state: (state: ConnectionState) => void
  error: (message: string | null, closed?: boolean) => void
}

export function startStream(callbacks: Callbacks, pollInterval = 5000): () => void {
  let socket: WebSocket | null = null
  let poll: ReturnType<typeof setInterval> | null = null
  let retry: ReturnType<typeof setTimeout> | null = null
  let silent: ReturnType<typeof setTimeout> | null = null
  let request: AbortController | null = null
  let epoch = 0, revision = 0, stopped = false

  function receive(value: unknown, state: ConnectionState) {
    const nodes = normalizeNodes(record(value).nodes)
    revision++
    callbacks.nodes(nodes)
    callbacks.error(null, false)
    callbacks.state(state)
  }

  async function fetchOnce() {
    if (request || stopped || document.hidden) return
    const started = epoch, currentRevision = revision
    const controller = new AbortController()
    request = controller
    try {
      const result = await api<unknown>('/nodes', controller.signal)
      if (started === epoch && currentRevision === revision && !stopped) receive(result, 'polling')
    } catch (error) {
      if (started !== epoch || stopped || currentRevision !== revision) return
      const closed = error instanceof ApiError && error.status === 401
      if (closed || socket?.readyState !== WebSocket.OPEN) callbacks.error(error instanceof Error ? error.message : '状态数据暂时不可用', closed)
      if (closed) { pause(); callbacks.state('closed') }
    } finally {
      if (request === controller) request = null
    }
  }

  function ensurePoll() { poll ??= setInterval(() => { void fetchOnce() }, pollInterval) }
  function connect() {
    if (stopped || document.hidden) return
    const currentEpoch = epoch
    let opened: WebSocket
    try {
      const gzip = typeof DecompressionStream === 'function' ? '?gzip' : ''
      opened = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws${gzip}`)
    } catch {
      ensurePoll()
      retry = setTimeout(connect, 5000)
      return
    }
    socket = opened
    const watch = () => {
      if (silent) clearTimeout(silent)
      silent = setTimeout(() => {
        if (socket !== opened || stopped) return
        callbacks.error('实时数据中断，正在重新连接')
        resume()
      }, 10000)
    }
    watch()
    let decoded = Promise.resolve()
    opened.onmessage = (event) => {
      decoded = decoded.then(async () => {
        const value = JSON.parse(await frameText(event.data))
        if (socket !== opened || opened.readyState !== WebSocket.OPEN || currentEpoch !== epoch || stopped) return
        receive(value, 'live')
        watch()
        if (poll) clearInterval(poll)
        poll = null
      }).catch(() => { /* Unreadable frames do not reset the silence watchdog. */ })
    }
    opened.onerror = () => opened.close()
    opened.onclose = () => {
      if (socket !== opened || stopped || document.hidden) return
      if (silent) clearTimeout(silent)
      silent = null
      callbacks.state('reconnecting')
      ensurePoll()
      void fetchOnce()
      retry = setTimeout(connect, 5000)
    }
  }

  function pause() {
    epoch++
    request?.abort()
    request = null
    if (socket) {
      socket.onclose = socket.onmessage = socket.onerror = null
      socket.close()
      socket = null
    }
    if (poll) clearInterval(poll)
    if (retry) clearTimeout(retry)
    if (silent) clearTimeout(silent)
    poll = retry = silent = null
  }
  function resume() {
    pause()
    callbacks.state('connecting')
    ensurePoll()
    void fetchOnce()
    connect()
  }
  const visibility = () => {
    if (document.hidden) { pause(); callbacks.state('paused') }
    else resume()
  }
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('online', resume)
  if (!document.hidden) resume()
  else callbacks.state('paused')
  return () => {
    stopped = true
    document.removeEventListener('visibilitychange', visibility)
    window.removeEventListener('online', resume)
    pause()
  }
}
