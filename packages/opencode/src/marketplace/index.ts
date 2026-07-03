import path from "path"
import z from "zod"
import { Filesystem } from "@/util"
import { createRequire } from "module"
import { fileURLToPath } from "url"
import { applyEdits, modify } from "jsonc-parser"

// ---------------------------------------------------------------------------
// Build-time constants (injected by script/build.ts via Bun define)
// In dev (bun run dev) these are undefined; fall back to runtime env or empty.
// ---------------------------------------------------------------------------
declare const MAGE_MARKETPLACE_REGISTRY: string | undefined
declare const MAGE_MARKETPLACE_TOKEN: string | undefined

// ---------------------------------------------------------------------------
// Baked-in default registry — Rune's GitLab generic package registry.
// ---------------------------------------------------------------------------
// /catalog ships inside the Mage CLI/TUI with no setup step for end users, so
// by explicit project decision this read-only catalog token is committed to
// source instead of being env-var-only (unlike MAGE_MARKETPLACE_TOKEN above,
// which remains available as an override for anyone self-hosting a registry).
//
// SECURITY NOTE: because this token ships inside a distributed binary, it is
// extractable by anyone with the binary. Mitigate by scoping it to
// package-registry READ on a single catalog-only GitLab project — never
// reuse a broader-scoped token here, and rotate it if that ever becomes a
// concern.
//
// TODO(rune-setup): the values below are PLACEHOLDERS. Replace them once the
// Rune GitLab project exists — do not deploy with these placeholders in
// place (fetches will simply fail and /catalog will fall back to the bundled
// catalog, so this is safe to ship as-is until then, just non-functional).
// The publish side lives in the Rune repo's lib/gitlab.ts — the file name
// encoding in runeSkillFileName() below MUST stay byte-for-byte in sync with
// lib/gitlab.ts's skillFileName(), or published skills become unreadable.
const RUNE_GITLAB_HOST = "https://gitlab.com"
const RUNE_GITLAB_PROJECT_ID = "REPLACE_WITH_RUNE_GITLAB_PROJECT_ID"
const RUNE_GITLAB_PACKAGE_NAME = "rune-catalog"
const RUNE_GITLAB_PACKAGE_VERSION = "latest"
const RUNE_GITLAB_READ_TOKEN = "REPLACE_WITH_RUNE_READ_ONLY_PAT"

function runeGitlabFileUrl(fileName: string): string {
  return `${RUNE_GITLAB_HOST}/api/v4/projects/${encodeURIComponent(RUNE_GITLAB_PROJECT_ID)}/packages/generic/${RUNE_GITLAB_PACKAGE_NAME}/${RUNE_GITLAB_PACKAGE_VERSION}/${encodeURIComponent(fileName)}`
}

/**
 * GitLab generic packages require a flat file_name (no "/"), so nested skill
 * file paths are encoded as one segment. Must exactly match the encoding
 * Rune's lib/gitlab.ts uses when it publishes skill files.
 */
function runeSkillFileName(skillName: string, file: string): string {
  return `skill__${skillName}__${file.replace(/\//g, "__")}`
}

/**
 * Resolve the marketplace registry URL.
 * Priority: explicit config override → MAGE_MARKETPLACE_REGISTRY runtime env →
 * baked build-time constant → undefined (falls back to bundled catalog).
 */
export function resolveRegistry(configValue?: string): string | undefined {
  return (
    configValue ||
    process.env.MAGE_MARKETPLACE_REGISTRY ||
    (typeof MAGE_MARKETPLACE_REGISTRY !== "undefined" && MAGE_MARKETPLACE_REGISTRY !== ""
      ? MAGE_MARKETPLACE_REGISTRY
      : undefined)
  )
}

/**
 * Resolve the marketplace auth token.
 * Priority: explicit config override → MAGE_MARKETPLACE_TOKEN runtime env →
 * baked build-time constant → undefined (unauthenticated fetch).
 */
export function resolveToken(configValue?: string): string | undefined {
  return (
    configValue ||
    process.env.MAGE_MARKETPLACE_TOKEN ||
    (typeof MAGE_MARKETPLACE_TOKEN !== "undefined" && MAGE_MARKETPLACE_TOKEN !== ""
      ? MAGE_MARKETPLACE_TOKEN
      : undefined)
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

/** Build fetch headers that include the GitLab PRIVATE-TOKEN when provided */
function authHeaders(token?: string): HeadersInit {
  if (!token) return {}
  return { "PRIVATE-TOKEN": token }
}

// ---------------------------------------------------------------------------
// catalog – fetch index.json and fall back to bundled marketplace.json
// ---------------------------------------------------------------------------

let _bundled: Catalog | null = null
function bundledCatalog(): Catalog {
  if (_bundled) return _bundled
  try {
    // resolve relative to this file so it works after bundling too
    const _require = createRequire(import.meta.url)
    const raw = _require(
      path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../defaults/marketplace.json"),
    )
    _bundled = Catalog.parse(raw)
  } catch {
    _bundled = { skills: [], mcp: [] }
  }
  return _bundled!
}

/**
 * `connected` tells callers whether the registry was actually reached, so
 * "no entries published" (connected, empty catalog) can be told apart from
 * "couldn't reach the registry" (not connected, bundled fallback) — the TUI's
 * /catalog popup shows a different message for each case.
 */
export async function catalog(registryUrl?: string, token?: string): Promise<Catalog & { connected: boolean }> {
  // No explicit override (mage.json / env) → use Rune's baked-in GitLab
  // registry by default, so /catalog works with zero user configuration.
  if (!registryUrl) {
    try {
      const res = await fetch(runeGitlabFileUrl("index.json"), { headers: authHeaders(RUNE_GITLAB_READ_TOKEN) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const raw = await res.json()
      return { ...Catalog.parse(raw), connected: true }
    } catch {
      return { ...bundledCatalog(), connected: false }
    }
  }

  try {
    const url = new URL("index.json", base(registryUrl)).href
    const res = await fetch(url, { headers: authHeaders(token) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const raw = await res.json()
    return { ...Catalog.parse(raw), connected: true }
  } catch {
    return { ...bundledCatalog(), connected: false }
  }
}

// ---------------------------------------------------------------------------
// installSkill – download skill files into a target directory
// ---------------------------------------------------------------------------

export async function installSkill(
  entry: SkillEntry,
  registryUrl: string | undefined,
  token: string | undefined,
  targetDir: string,
): Promise<string> {
  // No explicit override → download from Rune's baked-in GitLab registry
  // using its flat file-name encoding (see runeSkillFileName above).
  const fileUrl = registryUrl
    ? (file: string) => new URL(file, new URL(`skills/${entry.name}/`, base(registryUrl)).href).href
    : (file: string) => runeGitlabFileUrl(runeSkillFileName(entry.name, file))
  const fetchToken = registryUrl ? token : RUNE_GITLAB_READ_TOKEN

  for (const file of entry.files) {
    const url = fileUrl(file)
    const dest = path.join(targetDir, entry.name, file)

    // skip already-present files (idempotent re-installs)
    if (await Filesystem.exists(dest)) continue

    const res = await fetch(url, { headers: authHeaders(fetchToken) })
    if (!res.ok) throw new Error(`Failed to download ${url}: HTTP ${res.status}`)
    const buf = new Uint8Array(await res.arrayBuffer())
    await Filesystem.write(dest, buf)
  }

  return path.join(targetDir, entry.name)
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
