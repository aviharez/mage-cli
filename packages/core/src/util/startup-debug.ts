export * as StartupDebug from "./startup-debug"

const enabled = Boolean(process.env.MAGE_STARTUP_DEBUG)

export function mark(label: string) {
  if (!enabled) return
  process.stderr.write(`[startup] ${label}: ${Math.round(performance.now())}ms\n`)
}

export function duration(label: string, started: number) {
  if (!enabled) return
  process.stderr.write(`[startup] ${label}: ${Math.round(performance.now() - started)}ms\n`)
}

export function time<T>(label: string, promise: Promise<T>): Promise<T> {
  if (!enabled) return promise
  const started = performance.now()
  return promise.finally(() => duration(label, started))
}
