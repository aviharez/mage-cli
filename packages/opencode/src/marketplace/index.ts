import path from "path"
import z from "zod"
import { Filesystem, Log, Network } from "@/util"
import { applyEdits, modify } from "jsonc-parser"

const log = Log.create({ service: "marketplace" })

// ---------------------------------------------------------------------------
// Build-time constants (injected by script/build.ts via Bun define)
// In dev (bun run dev) these are undefined; fall back to runtime env or empty.
// ---------------------------------------------------------------------------
declare const MAGE_MARKETPLACE_COUNTER: string | undefined

// ---------------------------------------------------------------------------
// Baked-in default registry — Rune's JFrog Artifactory generic repository.
// ---------------------------------------------------------------------------
// /catalog ships inside the Mage CLI/TUI with no setup step for end users, so
// by explicit project decision this read-only catalog token is committed to
// source. By explicit project decision the catalog is ALWAYS fetched from
// this Artifactory registry — there is no config override and no env var for
// registry/token, so a misconfigured or stale override can never be the
// reason /catalog fails to load.
//
// SECURITY NOTE: because this token ships inside a distributed binary, it is
// extractable by anyone with the binary. Mitigate by scoping it to READ-ONLY
// access on a single catalog-only Artifactory repo — never reuse a
// broader-scoped token here, and rotate it if that ever becomes a concern.
//
// TODO(rune-setup): the values below are PLACEHOLDERS. Replace them once the
// Rune Artifactory repo exists — do not deploy with these placeholders in
// place (fetches will simply fail with a thrown error, so /catalog is safe
// to ship as-is until then, just non-functional).
// The publish side lives in the Rune repo's lib/artifactory.ts — both sides
// use the same nested "skills/<name>/<file>" layout under "rune-catalog/".
const RUNE_ARTIFACTORY_HOST = "https://artifactory.intra.bca.co.id"
const RUNE_ARTIFACTORY_REPO = "MBB-Registry-npm/general/mage"
const RUNE_ARTIFACTORY_READ_TOKEN = "cmVmdGtuOjAxOjE4MTQ4NjI1NTM6aDJ6VDNpRXd3TGxCc2ptbnJDbklScTlIemdk"

// Default (and only) registry base URL — no override, no fallback.
const RUNE_DEFAULT_REGISTRY = `${RUNE_ARTIFACTORY_HOST}/artifactory/${RUNE_ARTIFACTORY_REPO}/rune-catalog/`

// Unlike the Artifactory constants above, this points at Rune's own Next.js
// app (app/api/installs/route.ts there), not the Artifactory repo — Rune has
// no other API surface, and this is the one endpoint it exposes: a
// best-effort install counter bumped after a successful skill/mcp install.
// TODO(rune-setup): placeholder, same caveat as the Artifactory constants
// above — replace with Rune's real deployed URL before shipping.
const RUNE_COUNTER_ENDPOINT = "http://localhost:3000/api/installs"

/**
 * Resolve the install-counter endpoint.
 * Priority: explicit config override (config.marketplace.counter) →
 * MAGE_MARKETPLACE_COUNTER runtime env → baked build-time constant → Rune's
 * baked-in default counter endpoint.
 */
export function resolveCounterEndpoint(configValue?: string): string {
  return (
    configValue ||
    process.env.MAGE_MARKETPLACE_COUNTER ||
    (typeof MAGE_MARKETPLACE_COUNTER !== "undefined" && MAGE_MARKETPLACE_COUNTER !== ""
      ? MAGE_MARKETPLACE_COUNTER
      : undefined) ||
    RUNE_COUNTER_ENDPOINT
  )
}

// ---------------------------------------------------------------------------
// Catalog schema
// ---------------------------------------------------------------------------

export const McpInput = z.object({
  key: z.string().describe("Environment / header / arg key"),
  message: z.string().describe("Prompt message shown to the user"),
  placeholder: z.string().optional(),
  into: z.enum(["environment", "header", "arg"]).default("environment"),
  secret: z.boolean().optional().default(false),
})
export type McpInput = z.output<typeof McpInput>

export const McpEntry = z.object({
  name: z.string(),
  description: z.string(),
  /** Base ConfigMCP shape (type, command/url, etc.) without user-provided values */
  config: z.record(z.string(), z.unknown()),
  inputs: z.array(McpInput).optional().default([]),
})
export type McpEntry = z.output<typeof McpEntry>

export const SkillEntry = z.object({
  name: z.string(),
  description: z.string(),
  files: z.array(z.string()).default(["SKILL.md"]),
})
export type SkillEntry = z.output<typeof SkillEntry>

export const Catalog = z.object({
  skills: z.array(SkillEntry).default([]),
  mcp: z.array(McpEntry).default([]),
})
export type Catalog = z.output<typeof Catalog>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive the base URL of a registry entry, normalising trailing slash */
function base(registryUrl: string) {
  return registryUrl.endsWith("/") ? registryUrl : `${registryUrl}/`
}

/** Build fetch headers that include the Artifactory bearer token when provided */
function authHeaders(token?: string): HeadersInit {
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

// ---------------------------------------------------------------------------
// catalog – fetch index.json from Rune's Artifactory registry
// ---------------------------------------------------------------------------

// Bounds every catalog/skill fetch below so an unreachable-but-not-refusing
// host (dropped packets, VPN off, a proxy that never responds) fails fast
// instead of hanging the request forever — see recordInstall's identical
// reasoning further down, which this mirrors.
const FETCH_TIMEOUT_MS = 10_000

/**
 * Fetch the catalog from Rune's baked-in Artifactory registry. By explicit
 * project decision there is no other source: no config override, no env
 * var, and no bundled fallback — if the registry can't be reached this
 * throws, so the real reason (network error, HTTP status, bad JSON) is
 * visible to the caller instead of being silently swallowed.
 *
 * `connected` is always `true` on success; it's kept only so the existing
 * OpenAPI response shape / TUI checks don't need to change.
 */
export async function catalog(): Promise<Catalog & { connected: boolean }> {
  const url = new URL("index.json", base(RUNE_DEFAULT_REGISTRY)).href
  log.info("fetching catalog from Artifactory", { url })
  const fetchStarted = Date.now()
  const res = await fetch(url, {
    headers: authHeaders(RUNE_ARTIFACTORY_READ_TOKEN),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    ...(await Network.insecureFetchInit()),
  } as RequestInit)
  log.info("catalog fetch responded", {
    status: res.status,
    ms: Date.now() - fetchStarted,
    contentLength: res.headers.get("content-length"),
    transferEncoding: res.headers.get("transfer-encoding"),
    contentEncoding: res.headers.get("content-encoding"),
  })
  if (!res.ok) throw new Error(`Catalog fetch failed: HTTP ${res.status} from ${url}`)
  const parseStarted = Date.now()
  const raw = await res.json()
  log.info("catalog body parsed", { ms: Date.now() - parseStarted })

  // Parse skills/mcp entry-by-entry rather than the whole payload at once,
  // so a single malformed entry (e.g. a publisher typo) doesn't sink the
  // entire catalog — the rest of the entries remain usable.
  const rawSkills = Array.isArray(raw?.skills) ? raw.skills : []
  const rawMcp = Array.isArray(raw?.mcp) ? raw.mcp : []

  const skills = rawSkills.flatMap((entry: unknown) => {
    const parsed = SkillEntry.safeParse(entry)
    if (!parsed.success) {
      log.warn("dropping invalid skill catalog entry", { entry, issues: parsed.error.issues })
      return []
    }
    return [parsed.data]
  })

  const mcp = rawMcp.flatMap((entry: unknown) => {
    const parsed = McpEntry.safeParse(entry)
    if (!parsed.success) {
      log.warn("dropping invalid mcp catalog entry", { entry, issues: parsed.error.issues })
      return []
    }
    return [parsed.data]
  })

  return { skills, mcp, connected: true }
}

// ---------------------------------------------------------------------------
// installSkill – download skill files into a target directory
// ---------------------------------------------------------------------------

export async function installSkill(entry: SkillEntry, targetDir: string): Promise<string> {
  // Always Rune's baked-in Artifactory registry, same as catalog() above.
  // Nested "skills/<name>/<file>" paths are safe on Artifactory generic
  // repos, unlike GitLab's flat file_name requirement.
  const registryBase = base(RUNE_DEFAULT_REGISTRY)

  for (const file of entry.files) {
    const url = new URL(file, new URL(`skills/${entry.name}/`, registryBase).href).href
    const dest = path.join(targetDir, entry.name, file)

    // skip already-present files (idempotent re-installs)
    if (await Filesystem.exists(dest)) continue

    const res = await fetch(url, {
      headers: authHeaders(RUNE_ARTIFACTORY_READ_TOKEN),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      ...(await Network.insecureFetchInit()),
    } as RequestInit)
    if (!res.ok) throw new Error(`Failed to download ${url}: HTTP ${res.status}`)
    const buf = new Uint8Array(await res.arrayBuffer())
    await Filesystem.write(dest, buf)
  }

  return path.join(targetDir, entry.name)
}

// ---------------------------------------------------------------------------
// recordInstall – best-effort install-counter callback to Rune
// ---------------------------------------------------------------------------

/**
 * Fire-and-forget notification to Rune that `name` was installed, so its
 * dashboard/catalog install counts (Postgres `packages.install_count`,
 * never otherwise incremented since Mage only ever talks to Artifactory
 * directly — see Rune's app/api/installs/route.ts) reflect real usage.
 *
 * Deliberately swallows every failure: a counter being down, unreachable,
 * returning a non-2xx status, or misconfigured (e.g. still pointing at
 * RUNE_COUNTER_ENDPOINT's placeholder) must never fail an otherwise-
 * successful skill/mcp install, and must never surface to the CLI/TUI caller
 * — callers invoke this as `void recordInstall(...)` specifically so it never
 * gets awaited on the install's response path. The timeout guards against a
 * hung (not merely erroring) endpoint leaving a dangling request on the
 * long-lived opencode server process.
 */
export async function recordInstall(name: string, endpoint?: string): Promise<void> {
  try {
    await fetch(resolveCounterEndpoint(endpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
      signal: AbortSignal.timeout(5000),
      ...(await Network.insecureFetchInit()),
    } as RequestInit)
  } catch {
    // best-effort only — network errors, timeouts, and non-2xx responses
    // (fetch doesn't throw on those; we don't even check res.ok) are all
    // equally fine to ignore here.
  }
}

// ---------------------------------------------------------------------------
// buildMcpConfig – merge a catalog MCP template with user-provided inputs
// ---------------------------------------------------------------------------

export function buildMcpConfig(
  entry: McpEntry,
  inputs: Record<string, string>,
): Record<string, unknown> {
  const cfg = structuredClone(entry.config) as Record<string, unknown>

  for (const input of entry.inputs ?? []) {
    const value = inputs[input.key] ?? ""
    if (!value) continue

    if (input.into === "environment") {
      if (typeof cfg.environment !== "object" || cfg.environment === null) {
        cfg.environment = {} as Record<string, string>
      }
      ;(cfg.environment as Record<string, string>)[input.key] = value
    } else if (input.into === "header") {
      if (typeof cfg.headers !== "object" || cfg.headers === null) {
        cfg.headers = {} as Record<string, string>
      }
      ;(cfg.headers as Record<string, string>)[input.key] = value
    } else if (input.into === "arg") {
      if (!Array.isArray(cfg.command)) cfg.command = []
      ;(cfg.command as string[]).push(value)
    }
  }

  return cfg
}

// ---------------------------------------------------------------------------
// writeMcpToConfig – jsonc-parser write (mirrors addMcpToConfig in cli/cmd/mcp.ts)
// ---------------------------------------------------------------------------

export async function writeMcpToConfig(
  name: string,
  mcpConfig: Record<string, unknown>,
  configPath: string,
): Promise<void> {
  let text = "{}"
  if (await Filesystem.exists(configPath)) {
    text = await Filesystem.readText(configPath)
  }
  const edits = modify(text, ["mcp", name], mcpConfig, {
    formattingOptions: { tabSize: 2, insertSpaces: true },
  })
  await Filesystem.write(configPath, applyEdits(text, edits))
}

// ---------------------------------------------------------------------------
// resolveConfigPath – mirrors resolveConfigPath in cli/cmd/mcp.ts
// ---------------------------------------------------------------------------

export async function resolveConfigPath(baseDir: string, global = false): Promise<string> {
  const candidates = [path.join(baseDir, "mage.json"), path.join(baseDir, "mage.jsonc")]
  if (!global) {
    candidates.push(path.join(baseDir, ".mage", "mage.json"), path.join(baseDir, ".mage", "mage.jsonc"))
  }
  for (const candidate of candidates) {
    if (await Filesystem.exists(candidate)) return candidate
  }
  return candidates[0]
}

export * as Marketplace from "."
