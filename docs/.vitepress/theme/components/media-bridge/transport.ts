export interface JsonResponse<T = any> {
  data: T
  headers: Headers
}

export type AsyncLimiter = <T>(operation: () => Promise<T>) => Promise<T>

const lastServiceWrite = new WeakMap<object, number>()

export function createAsyncLimiter(concurrency: number): AsyncLimiter {
  let active = 0
  const waiting: Array<() => void> = []
  return async function limit<T>(operation: () => Promise<T>): Promise<T> {
    if (active >= concurrency) await new Promise<void>(resolve => waiting.push(resolve))
    active++
    try {
      return await operation()
    } finally {
      active--
      waiting.shift()?.()
    }
  }
}

export async function waitForWriteSlot(credentials: object, minimumGapMs: number) {
  const waitMs = Math.max(
    0,
    (lastServiceWrite.get(credentials) || 0) + minimumGapMs - Date.now()
  )
  if (waitMs) await sleep(waitMs)
  lastServiceWrite.set(credentials, Date.now())
}

export function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new DOMException('The operation was aborted.', 'AbortError'))
      return
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timeout)
      reject(signal?.reason || new DOMException('The operation was aborted.', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

export async function mapLimit<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await mapper(items[index], index)
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    () => worker()
  ))
  return results
}

export function errorDetail(data: any, statusText: string): string {
  if (data && typeof data === 'object') {
    return String(
      data.error_description
      || data.message
      || data.msg
      || data.error?.message
      || data.error
      || JSON.stringify(data)
    )
  }
  return String(data || statusText || 'Request failed')
}

export async function requestBridgeJson<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<JsonResponse<T>> {
  const response = await fetch(url, options)
  const text = await response.text()
  let data: any = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  if (!response.ok) {
    const error = new Error(`${response.status} ${errorDetail(data, response.statusText)}`) as Error & {
      status?: number
      body?: any
      headers?: Headers
    }
    error.status = response.status
    error.body = data
    error.headers = response.headers
    throw error
  }
  return { data: data as T, headers: response.headers }
}
