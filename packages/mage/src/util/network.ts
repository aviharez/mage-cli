export function online() {
  const nav = globalThis.navigator
  if (!nav || typeof nav.onLine !== "boolean") return true
  return nav.onLine
}

// ---------------------------------------------------------------------------
// insecureFetchInit – TLS bypass for internal self-signed hosts
// ---------------------------------------------------------------------------

const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined"

let nodeDispatcher: unknown
let nodeDispatcherInit = false

/**
 * Extra `fetch` RequestInit fields that disable TLS verification, for talking to
 * internal self-signed hosts (the GAIA gateway, BCA's Artifactory, Rune's app).
 * The two runtimes that host the server need different mechanisms:
 *
 *   - Bun (CLI / `bun run dev` web backend) honors a per-request `tls` option on
 *     fetch.
 *   - Node (any Node-hosted sidecar, e.g. an Electron desktop shell) runs the
 *     prebuilt dist/node bundle and uses undici's fetch, which SILENTLY IGNORES
 *     the `tls` option. Without an undici dispatcher such a host fails with
 *     "fetch failed" on the self-signed cert. We lazily build an Agent that
 *     skips verification.
 *
 * Spread the result into the fetch options, e.g.
 * `fetch(url, { ...init, ...(await insecureFetchInit()) })`.
 */
export async function insecureFetchInit(): Promise<RequestInit> {
  if (isBun) return { tls: { rejectUnauthorized: false } } as RequestInit
  if (nodeDispatcherInit) return nodeDispatcher ? ({ dispatcher: nodeDispatcher } as RequestInit) : {}
  nodeDispatcherInit = true
  try {
    const { Agent } = await import("undici")
    nodeDispatcher = new Agent({ connect: { rejectUnauthorized: false } })
  } catch {
    // undici unavailable — fall through with no dispatcher
  }
  return nodeDispatcher ? ({ dispatcher: nodeDispatcher } as RequestInit) : {}
}

// ---------------------------------------------------------------------------
// isConnectionFailure – classify a fetch() rejection as "couldn't reach the
// host" (DNS/refused/reset/unreachable — e.g. GAIA is unreachable off-VPN) so
// callers can surface a clear message instead of runtime-specific wording
// like Bun's "Was there a typo in the url or port?".
// ---------------------------------------------------------------------------

const CONNECTION_FAILURE_CODES =
  /^(ConnectionRefused|ConnectionClosed|FailedToOpenSocket|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH)$/i

const CONNECTION_FAILURE_MESSAGE = /typo in the url or port|unable to connect|failed to fetch|fetch failed/i

export function isConnectionFailure(error: unknown): boolean {
  const code = String((error as { code?: unknown })?.code ?? "")
  const message = error instanceof Error ? error.message : String(error)
  return CONNECTION_FAILURE_CODES.test(code) || CONNECTION_FAILURE_MESSAGE.test(message)
}

