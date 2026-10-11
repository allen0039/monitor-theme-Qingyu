export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'ApiError' }
}

export async function api<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ApiError(0, '网络连接失败，正在重试')
  }
  if (!response.ok) {
    const plain = response.headers.get('content-type')?.startsWith('text/plain') ? (await response.text()).trim() : ''
    throw new ApiError(response.status, plain || (response.status === 401 ? '需要登录后查看' : `服务暂时无法访问（HTTP ${response.status}），稍后再试`))
  }
  try { return await response.json() as T }
  catch { throw new ApiError(response.status, '收到的不是状态数据，稍后再试') }
}

export async function frameText(data: string | Blob): Promise<string> {
  if (typeof data === 'string') return data
  return new Response(data.stream().pipeThrough(new DecompressionStream('gzip'))).text()
}
