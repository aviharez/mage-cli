type Definition = {
  [method: string]: (input: any) => any
}

// Default budget for a full worker round-trip: request → handler → result.
// Without this, a handler that hangs (rather than throws) leaves the caller's
// promise pending forever — e.g. a stuck upstream fetch inside rpc.fetch
// previously meant a TUI spinner would never terminate.
const DEFAULT_TIMEOUT_MS = 30_000

export function listen(rpc: Definition) {
  onmessage = async (evt) => {
    const parsed = JSON.parse(evt.data)
    if (parsed.type === "rpc.request") {
      // Without this try/catch, a handler that throws/rejects never posts a
      // reply, so the caller's `call()` promise would only ever be rescued
      // by the timeout below instead of surfacing the real error quickly.
      try {
        const result = await rpc[parsed.method](parsed.input)
        postMessage(JSON.stringify({ type: "rpc.result", result, id: parsed.id }))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        postMessage(JSON.stringify({ type: "rpc.error", error: message, id: parsed.id }))
      }
    }
  }
}

export function emit(event: string, data: unknown) {
  postMessage(JSON.stringify({ type: "rpc.event", event, data }))
}

export function client<T extends Definition>(target: {
  postMessage: (data: string) => void | null
  onmessage: ((this: Worker, ev: MessageEvent<any>) => any) | null
}) {
  const pending = new Map<number, { resolve: (result: any) => void; reject: (error: Error) => void }>()
  const listeners = new Map<string, Set<(data: any) => void>>()
  let id = 0
  target.onmessage = async (evt) => {
    const parsed = JSON.parse(evt.data)
    if (parsed.type === "rpc.result") {
      const call = pending.get(parsed.id)
      if (call) {
        call.resolve(parsed.result)
        pending.delete(parsed.id)
      }
    }
    if (parsed.type === "rpc.error") {
      const call = pending.get(parsed.id)
      if (call) {
        call.reject(new Error(parsed.error))
        pending.delete(parsed.id)
      }
    }
    if (parsed.type === "rpc.event") {
      const handlers = listeners.get(parsed.event)
      if (handlers) {
        for (const handler of handlers) {
          handler(parsed.data)
        }
      }
    }
  }
  return {
    call<Method extends keyof T>(
      method: Method,
      input: Parameters<T[Method]>[0],
      timeoutMs = DEFAULT_TIMEOUT_MS,
    ): Promise<ReturnType<T[Method]>> {
      const requestId = id++
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(requestId)
          reject(new Error(`RPC call "${String(method)}" timed out after ${timeoutMs}ms`))
        }, timeoutMs)
        pending.set(requestId, {
          resolve: (result) => {
            clearTimeout(timer)
            resolve(result)
          },
          reject: (error) => {
            clearTimeout(timer)
            reject(error)
          },
        })
        target.postMessage(JSON.stringify({ type: "rpc.request", method, input, id: requestId }))
      })
    },
    on<Data>(event: string, handler: (data: Data) => void) {
      let handlers = listeners.get(event)
      if (!handlers) {
        handlers = new Set()
        listeners.set(event, handlers)
      }
      handlers.add(handler)
      return () => {
        handlers!.delete(handler)
      }
    },
  }
}
