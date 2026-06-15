#!/usr/bin/env bun
//
// Download ripgrep for BOTH macOS and Windows and stage both into resources/rg/
// (mac → `rg`, Windows → `rg.exe` — distinct names, so they coexist). A single
// `bun run build` therefore prepares every desktop target; electron-builder ships
// whatever is present (extraResources → <resourcesPath>/rg), and at first launch
// ensureRipgrepBinary() in src/main/server.ts copies the one matching the running
// OS into ~/.mage/bin/. Mirrors the CLI script/build.ts downloadRg + postinstall.mjs.
//
// Arches default to: macOS = build-host arch when on mac else arm64; Windows = x64.
// Override per-OS with MAGE_RG_DARWIN_ARCH / MAGE_RG_WIN_ARCH if you need x64 mac
// or arm64 windows. Each download is best-effort (non-fatal): if it fails, the
// bundled server falls back to downloading rg at runtime.
//
// Usage: bun ./scripts/download-rg.ts

import { $ } from "bun"
import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs"
import { join, resolve } from "node:path"

const desktopDir = resolve(import.meta.dir, "..")

// Keep VERSION aligned with packages/opencode/src/file/ripgrep.ts (VERSION) and
// script/build.ts (RG_VERSION) so the bundled binary matches what the server expects.
const RG_VERSION = "15.1.0"

const RG_PLATFORMS: Record<string, { platform: string; binary: string; extension: "tar.gz" | "zip" }> = {
  "darwin-arm64": { platform: "aarch64-apple-darwin", binary: "rg", extension: "tar.gz" },
  "darwin-x64": { platform: "x86_64-apple-darwin", binary: "rg", extension: "tar.gz" },
  "win32-x64": { platform: "x86_64-pc-windows-msvc", binary: "rg.exe", extension: "zip" },
  "win32-arm64": { platform: "aarch64-pc-windows-msvc", binary: "rg.exe", extension: "zip" },
}

const macArch = Bun.env.MAGE_RG_DARWIN_ARCH || (process.platform === "darwin" ? process.arch : "arm64")
const winArch = Bun.env.MAGE_RG_WIN_ARCH || "x64"
const wanted: Array<{ os: "darwin" | "win32"; arch: string }> = [
  { os: "darwin", arch: macArch },
  { os: "win32", arch: winArch },
]

const cacheDir = resolve(desktopDir, ".rg-cache")
const destDir = join(desktopDir, "resources", "rg")
mkdirSync(destDir, { recursive: true })

async function stage(os: "darwin" | "win32", arch: string) {
  const config = RG_PLATFORMS[`${os}-${arch}`]
  if (!config) {
    console.warn(`[rg] no pre-built binary for ${os}-${arch}, skipping`)
    return
  }

  const cachedBin = join(cacheDir, `${config.platform}-${config.binary}`)
  try {
    if (!existsSync(cachedBin)) {
      const filename = `ripgrep-${RG_VERSION}-${config.platform}.${config.extension}`
      const url = `https://github.com/BurntSushi/ripgrep/releases/download/${RG_VERSION}/${filename}`
      const archivePath = join(cacheDir, filename)
      mkdirSync(cacheDir, { recursive: true })
      console.log(`[rg] downloading ${url}`)
      const res = await fetch(url)
      if (!res.ok) {
        console.warn(`[rg] download failed (${res.status}) for ${os}-${arch} — that target's rg will be missing`)
        return
      }
      await Bun.write(archivePath, await res.arrayBuffer())

      const extractDir = join(cacheDir, `extract-${config.platform}`)
      mkdirSync(extractDir, { recursive: true })
      if (config.extension === "tar.gz") {
        await $`tar -xzf ${archivePath} -C ${extractDir}`
      } else {
        await $`unzip -o ${archivePath} -d ${extractDir}`
      }
      const extracted = join(extractDir, `ripgrep-${RG_VERSION}-${config.platform}`, config.binary)
      copyFileSync(extracted, cachedBin)
      if (os !== "win32") chmodSync(cachedBin, 0o755)
      console.log(`[rg] cached ${config.platform}`)
    }

    const dest = join(destDir, config.binary)
    copyFileSync(cachedBin, dest)
    if (os !== "win32") chmodSync(dest, 0o755)
    console.log(`[rg] staged ${config.platform} → ${dest}`)
  } catch (err) {
    console.warn(`[rg] staging failed for ${os}-${arch} — that target's rg will be missing:`, err)
  }
}

for (const { os, arch } of wanted) await stage(os, arch)
