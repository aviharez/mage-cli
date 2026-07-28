import fs from "fs/promises"
import path from "path"
import os from "os"
import { Filesystem } from "../util/filesystem"
import { Flock } from "@mybcabisnis/mage-shared/util/flock"

const getHomeDir = () => process.env.MAGE_TEST_HOME || os.homedir()

declare const MAGE_AGENTS_MD: string | undefined

const _overrides: Record<string, string | undefined> = {}
function _path(key: string, derive: () => string) {
  return {
    get() { return _overrides[key] ?? derive() },
    set(v: string) { _overrides[key] = v },
    enumerable: true,
    configurable: true,
  }
}

export const Path: {
  home: string
  data: string
  bin: string
  log: string
  cache: string
  config: string
  state: string
} = Object.defineProperties({} as any, {
  home: _path("home", getHomeDir),
  data: _path("data", () => path.join(getHomeDir(), ".mage", "data")),
  bin: _path("bin", () => path.join(getHomeDir(), ".mage", "bin")),
  log: _path("log", () => path.join(getHomeDir(), ".mage", "data", "log")),
  cache: _path("cache", () => path.join(getHomeDir(), ".mage", "cache")),
  config: _path("config", () => path.join(getHomeDir(), ".mage")),
  state: _path("state", () => path.join(getHomeDir(), ".mage", "state")),
})

// Initialize Flock with global state path
Flock.setGlobal({ state: Path.state })

await Promise.all([
  fs.mkdir(Path.data, { recursive: true }),
  fs.mkdir(Path.bin, { recursive: true }),
  fs.mkdir(Path.config, { recursive: true }),
  fs.mkdir(Path.state, { recursive: true }),
  fs.mkdir(Path.log, { recursive: true }),
  fs.mkdir(Path.cache, { recursive: true }),
])

if (typeof MAGE_AGENTS_MD === "string") {
  const agentsMdPath = path.join(Path.config, "AGENTS.md")
  await fs.access(agentsMdPath).catch(() =>
    fs.writeFile(agentsMdPath, MAGE_AGENTS_MD as string, "utf8"),
  )
}

const CACHE_VERSION = "21"

const version = await Filesystem.readText(path.join(Path.cache, "version")).catch(() => "0")

if (version !== CACHE_VERSION) {
  try {
    const contents = await fs.readdir(Path.cache)
    await Promise.all(
      contents.map((item) =>
        fs.rm(path.join(Path.cache, item), {
          recursive: true,
          force: true,
        }),
      ),
    )
  } catch { }
  await Filesystem.write(path.join(Path.cache, "version"), CACHE_VERSION)
}

export * as Global from "."
