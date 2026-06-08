import { chmodSync, copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { app, utilityProcess } from "electron"
import type { Details } from "electron"
import { DEFAULT_SERVER_URL_KEY, WSL_ENABLED_KEY } from "./constants"
import { getUserShell, loadShellEnv } from "./shell-env"
import { getStore } from "./store"
import type { SqliteMigrationProgress } from "../preload/types"

export type WslConfig = { enabled: boolean }

export type HealthCheck = { wait: Promise<void> }

type SidecarMessage =
  | { type: "sqlite"; progress: SqliteMigrationProgress }
  | { type: "ready" }
  | { type: "stopped" }
  | { type: "error"; error: { message: string; stack?: string } }

export type SidecarListener = { stop: () => Promise<void> }

const SIDECAR_SERVICE_NAME = "opencode server"
const SIDECAR_START_STALL_TIMEOUT = 60_000
const SIDECAR_STOP_TIMEOUT = 6_000

type SpawnLocalServerOptions = {
  needsMigration: boolean
  userDataPath: string
  onSqliteProgress?: (progress: SqliteMigrationProgress) => void
  onStdout?: (message: string) => void
  onStderr?: (message: string) => void
  onExit?: (code: number) => void
}

export function getDefaultServerUrl(): string | null {
  const value = getStore().get(DEFAULT_SERVER_URL_KEY)
  return typeof value === "string" ? value : null
}

export function setDefaultServerUrl(url: string | null) {
  if (url) {
    getStore().set(DEFAULT_SERVER_URL_KEY, url)
    return
  }

  getStore().delete(DEFAULT_SERVER_URL_KEY)
}

export function getWslConfig(): WslConfig {
  const value = getStore().get(WSL_ENABLED_KEY)
  return { enabled: typeof value === "boolean" ? value : false }
}

export function setWslConfig(config: WslConfig) {
  getStore().set(WSL_ENABLED_KEY, config.enabled)
}

// Path to the shipped default config dir (command/, skills/, agent, themes, AGENTS.md).
// Packaged: copied into Resources/defaults via electron-builder extraResources.
// Dev: the source dir in the opencode package, relative to out/main (mirrors iconsDir()).
function bundledDefaultsDir() {
  const root = dirname(fileURLToPath(import.meta.url))
  return app.isPackaged ? join(process.resourcesPath, "defaults") : join(root, "../../../opencode/defaults")
}

export function preferAppEnv(userDataPath: string) {
  const shell = process.platform === "win32" ? null : getUserShell()
  Object.assign(process.env, {
    ...(shell ? loadShellEnv(shell) : null),
    OPENCODE_EXPERIMENTAL_ICON_DISCOVERY: "true",
    OPENCODE_EXPERIMENTAL_FILEWATCHER: "true",
    OPENCODE_CLIENT: "desktop",
    XDG_STATE_HOME: process.env.XDG_STATE_HOME ?? userDataPath,
    // Point the bundled server at the shipped defaults so /boilerplate, /generate, etc.
    // load the same as the web dev server (which sets MAGE_CONFIG_DIR=.../defaults).
    // Additive — ~/.mage and project .mage are still scanned; a user override wins.
    MAGE_CONFIG_DIR: process.env.MAGE_CONFIG_DIR ?? bundledDefaultsDir(),
  })
}

// Mirrors the DEFAULT_CONFIG the CLI's postinstall.mjs seeds into ~/.mage/mage.json.
const DEFAULT_GLOBAL_CONFIG = {
  $schema: "https://opencode.ai/config.json",
  permission: { edit: "ask", bash: "ask" },
  skills: { paths: ["~/.mage/skills"] },
  share: "disabled",
  lsp: true,
}

// Seed ~/.mage/mage.json on first launch. The desktop app never runs the npm
// package's postinstall.mjs (that script only runs on `npm/bun install` of the
// CLI distribution), so a fresh profile otherwise has no global config until the
// first UI save — which used to create ~/.mage/mage.jsonc. Writing mage.json here
// keeps the desktop aligned with the CLI `init` wizard and globalConfigFile().
// No-op if any global config already exists (json or legacy jsonc), so existing
// setups are never touched. Best-effort: a failed seed just defers creation to
// the first config save.
export function ensureGlobalConfig() {
  const configDir = join(homedir(), ".mage")
  const jsonPath = join(configDir, "mage.json")
  const jsoncPath = join(configDir, "mage.jsonc")
  if (existsSync(jsonPath) || existsSync(jsoncPath)) return
  try {
    mkdirSync(configDir, { recursive: true })
    writeFileSync(jsonPath, JSON.stringify(DEFAULT_GLOBAL_CONFIG, null, 2) + "\n", "utf8")
  } catch {
    /* best effort */
  }
}

// Path to the ripgrep binary bundled at build time (scripts/download-rg.ts →
// electron-builder extraResources). Packaged: <resourcesPath>/rg. Dev: the
// desktop package's resources/rg dir, relative to out/main (mirrors bundledDefaultsDir).
function bundledRgDir() {
  const root = dirname(fileURLToPath(import.meta.url))
  return app.isPackaged ? join(process.resourcesPath, "rg") : join(root, "../../resources/rg")
}

// Copy the bundled ripgrep binary into ~/.mage/bin on launch so the bundled
// server resolves it locally (opencode src/file/ripgrep.ts checks Global.Path.bin
// = ~/.mage/bin before downloading from GitHub). Mirrors the CLI postinstall.mjs,
// which the desktop app never runs. Best-effort and idempotent: re-copies only
// when the destination is missing or a different size (e.g. an app update bumped
// the bundled rg version). If the bundle is missing, the server still works by
// downloading rg at runtime.
export function ensureRipgrepBinary() {
  const rgName = process.platform === "win32" ? "rg.exe" : "rg"
  const source = join(bundledRgDir(), rgName)
  if (!existsSync(source)) return
  const binDir = join(homedir(), ".mage", "bin")
  const dest = join(binDir, rgName)
  try {
    if (existsSync(dest) && statSync(dest).size === statSync(source).size) return
    mkdirSync(binDir, { recursive: true })
    copyFileSync(source, dest)
    if (process.platform !== "win32") chmodSync(dest, 0o755)
  } catch {
    /* best effort */
  }
}

export async function spawnLocalServer(
  hostname: string,
  port: number,
  password: string,
  options: SpawnLocalServerOptions,
) {
  const sidecar = join(dirname(fileURLToPath(import.meta.url)), "sidecar.js")
  const child = utilityProcess.fork(sidecar, [], {
    cwd: process.cwd(),
    env: createSidecarEnv(),
    serviceName: SIDECAR_SERVICE_NAME,
    stdio: "pipe",
  })
  let exited = false
  const exit = defer<number>()

  const onProcessGone = (_event: unknown, details: Details) => {
    if (details.type !== "Utility" || details.name !== SIDECAR_SERVICE_NAME) return
    options.onStderr?.(`utility process gone reason=${details.reason} exitCode=${details.exitCode}`)
  }

  app.on("child-process-gone", onProcessGone)
  child.once("exit", (code) => {
    exited = true
    app.off("child-process-gone", onProcessGone)
    options.onExit?.(code)
    exit.resolve(code)
  })
  child.on("error", (error) => options.onStderr?.(`utility process error: ${serializeError(error).message}`))

  child.stdout?.on("data", (chunk: Buffer) => options.onStdout?.(chunk.toString("utf8").trimEnd()))
  child.stderr?.on("data", (chunk: Buffer) => options.onStderr?.(chunk.toString("utf8").trimEnd()))

  await new Promise<void>((resolve, reject) => {
    let done = false
    let timeout: NodeJS.Timeout

    const fail = (error: Error) => {
      if (done) return
      done = true
      cleanup()
      reject(error)
    }

    const refreshTimeout = () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        fail(new Error(`Sidecar did not become ready within ${SIDECAR_START_STALL_TIMEOUT}ms: ${sidecar}`))
      }, SIDECAR_START_STALL_TIMEOUT)
    }

    const onMessage = (message: SidecarMessage) => {
      if (message.type === "sqlite") {
        refreshTimeout()
        options.onSqliteProgress?.(message.progress)
        return
      }
      if (message.type === "ready") {
        if (done) return
        done = true
        cleanup()
        resolve()
        return
      }
      if (message.type === "error") {
        fail(Object.assign(new Error(message.error.message), { stack: message.error.stack }))
      }
    }
    const onExit = (code: number) => {
      fail(new Error(`Sidecar exited before ready with code ${code}`))
    }
    const cleanup = () => {
      clearTimeout(timeout)
      child.off("message", onMessage)
      child.off("exit", onExit)
    }

    child.on("message", onMessage)
    child.on("exit", onExit)
    refreshTimeout()
    child.postMessage({
      type: "start",
      hostname,
      port,
      password,
      userDataPath: options.userDataPath,
      needsMigration: options.needsMigration,
    })
  }).catch((error) => {
    if (!exited) child.kill()
    throw error
  })

  const wait = (async () => {
    const url = `http://${hostname}:${port}`
    let healthy = false
    const gone = exit.promise.then((code) => {
      if (healthy) return
      throw new Error(`Sidecar exited before health check passed with code ${code}`)
    })

    const ready = async () => {
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        if (await checkHealth(url, password)) {
          healthy = true
          return
        }
      }
    }

    await Promise.race([ready(), gone])
  })()

  let stopping: Promise<void> | undefined

  return {
    listener: {
      stop: () => {
        if (stopping) return stopping
        if (exited) return Promise.resolve()
        child.postMessage({ type: "stop" })
        stopping = Promise.race([
          exit.promise.then(() => undefined),
          delay(SIDECAR_STOP_TIMEOUT).then(() => {
            if (!exited) child.kill()
          }),
        ])
        return stopping
      },
    },
    health: { wait },
  }
}

export async function checkHealth(url: string, password?: string | null): Promise<boolean> {
  let healthUrl: URL
  try {
    healthUrl = new URL("/global/health", url)
  } catch {
    return false
  }

  const headers = new Headers()
  if (password) {
    const auth = Buffer.from(`opencode:${password}`).toString("base64")
    headers.set("authorization", `Basic ${auth}`)
  }

  try {
    const res = await fetch(healthUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(3000),
    })
    return res.ok
  } catch {
    return false
  }
}

function createSidecarEnv(): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries(process.env).flatMap(([key, value]) => (value === undefined ? [] : [[key, String(value)]])),
  )
  delete env.DEBUG
  if (process.platform === "linux") delete env.LD_PRELOAD
  return env
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function serializeError(error: unknown) {
  if (error instanceof Error) return { message: error.message, stack: error.stack }
  return { message: String(error) }
}

function defer<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
