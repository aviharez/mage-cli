import path from "path"
import fs from "fs"
import { spawnSync } from "child_process"
import { Global } from "../global"
import { which } from "../util/which"

const VERSION = "0.44.2"
// rtk ships no aarch64-pc-windows-msvc build (upstream gap)
const PLATFORM = {
  "arm64-darwin": { platform: "aarch64-apple-darwin", extension: "tar.gz" },
  "arm64-linux": { platform: "aarch64-unknown-linux-gnu", extension: "tar.gz" },
  "x64-darwin": { platform: "x86_64-apple-darwin", extension: "tar.gz" },
  "x64-linux": { platform: "x86_64-unknown-linux-musl", extension: "tar.gz" },
  "x64-win32": { platform: "x86_64-pc-windows-msvc", extension: "zip" },
} as const

const binary = process.platform === "win32" ? "rtk.exe" : "rtk"

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: "utf8" })
  if (result.status !== 0)
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `${command} failed with code ${result.status}`)
}

// rtk archives contain the bare binary at the root (unlike ripgrep's nested folder)
function extract(archive: string, extension: string, target: string) {
  const dir = fs.mkdtempSync(path.join(Global.Path.bin, "rtk-"))
  try {
    if (extension === "tar.gz") run("tar", ["-xzf", archive, "-C", dir])
    if (extension === "zip") {
      const shell = which("powershell.exe") ?? which("pwsh.exe") ?? "powershell.exe"
      run(shell, [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `$global:ProgressPreference = 'SilentlyContinue'; Expand-Archive -LiteralPath '${archive.replaceAll("'", "''")}' -DestinationPath '${dir.replaceAll("'", "''")}' -Force`,
      ])
    }
    const extracted = path.join(dir, binary)
    if (!fs.existsSync(extracted)) throw new Error(`rtk archive did not contain executable: ${extracted}`)
    fs.copyFileSync(extracted, target)
    if (process.platform !== "win32") fs.chmodSync(target, 0o755)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

async function resolve() {
  const system = which(
    binary,
    {
      PATH: (process.env.PATH ?? process.env.Path ?? "")
        .split(path.delimiter)
        .filter((item) =>
          process.platform === "win32"
            ? path.resolve(item).toLowerCase() !== path.resolve(Global.Path.bin).toLowerCase()
            : path.resolve(item) !== path.resolve(Global.Path.bin),
        )
        .join(path.delimiter),
      PATHEXT: process.env.PATHEXT ?? process.env.PathExt,
    },
    { includeGlobalBin: false },
  )
  if (system && fs.existsSync(system)) {
    return system
  }

  const adjacent = path.join(path.dirname(process.execPath), binary)
  if (fs.existsSync(adjacent)) {
    return adjacent
  }

  const cached = path.join(Global.Path.bin, binary)
  if (fs.existsSync(cached)) {
    return cached
  }

  const config = PLATFORM[`${process.arch}-${process.platform}` as keyof typeof PLATFORM]
  if (!config) throw new Error(`unsupported platform for rtk: ${process.arch}-${process.platform}`)

  const filename = `rtk-${config.platform}.${config.extension}`
  const url = `https://github.com/rtk-ai/rtk/releases/download/v${VERSION}/${filename}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`failed to download rtk from ${url}: ${response.status}`)

  fs.mkdirSync(Global.Path.bin, { recursive: true })
  const archive = path.join(Global.Path.bin, filename)
  await Bun.write(archive, await response.arrayBuffer())
  const out = path.join(Global.Path.bin, binary)
  extract(archive, config.extension, out)
  fs.rmSync(archive, { force: true })
  return out
}

let pending: Promise<string> | undefined

// Resolves the rtk binary once per process: system PATH, the Mage bin dir
// (seeded by postinstall), or a lazy download from GitHub releases.
export function filepath(): Promise<string> {
  pending ??= resolve().catch((error) => {
    pending = undefined
    throw error
  })
  return pending
}
