#!/usr/bin/env bun

import { $ } from "bun"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

import { Script } from "@mybcabisnis/mage-script"
import pkg from "../package.json"

const singleFlag = process.argv.includes("--single")
const baselineFlag = process.argv.includes("--baseline")
const skipInstall = process.argv.includes("--skip-install")
const sourcemapsFlag = process.argv.includes("--sourcemaps")
const plugin = createSolidTransformPlugin()

// Mage's web UI is served by the separate @mybcabisnis/mage-web-react
// process (`mage web` spawns it), not embedded in this binary — see
// packages/mage/src/cli/cmd/web.ts and src/server/shared/ui.ts.
const embeddedFileMap = null

// Embedded so packages/mage/src/global/index.ts can seed a default
// AGENTS.md even when the compiled binary ships without its defaults/ dir
// alongside it (e.g. a global npm install).
const defaultAgentsMd = await Bun.file(path.join(dir, "defaults", "AGENTS.md")).text()

const allTargets: {
  os: string
  arch: "arm64" | "x64"
  abi?: "musl"
  avx2?: false
}[] = [
  {
    os: "linux",
    arch: "x64",
  },
  {
    os: "darwin",
    arch: "arm64",
  },
  {
    os: "darwin",
    arch: "x64",
  },
  {
    os: "darwin",
    arch: "x64",
    avx2: false,
  },
  {
    os: "win32",
    arch: "x64",
  },
  {
    os: "win32",
    arch: "x64",
    avx2: false,
  },
]

const targets = singleFlag
  ? allTargets.filter((item) => {
      if (item.os !== process.platform || item.arch !== process.arch) {
        return false
      }

      // When building for the current platform, prefer a single native binary by default.
      // Baseline binaries require additional Bun artifacts and can be flaky to download.
      if (item.avx2 === false) {
        return baselineFlag
      }

      // also skip abi-specific builds for the same reason
      if (item.abi !== undefined) {
        return false
      }

      return true
    })
  : allTargets

const RG_VERSION = "15.1.0"
const RG_PLATFORMS: Record<string, { platform: string; binary: string; extension: "tar.gz" | "zip" }> = {
  "darwin-arm64": { platform: "aarch64-apple-darwin", binary: "rg", extension: "tar.gz" },
  "darwin-x64": { platform: "x86_64-apple-darwin", binary: "rg", extension: "tar.gz" },
  "linux-arm64": { platform: "aarch64-unknown-linux-gnu", binary: "rg", extension: "tar.gz" },
  "linux-x64": { platform: "x86_64-unknown-linux-musl", binary: "rg", extension: "tar.gz" },
  "win32-arm64": { platform: "aarch64-pc-windows-msvc", binary: "rg.exe", extension: "zip" },
  "win32-x64": { platform: "x86_64-pc-windows-msvc", binary: "rg.exe", extension: "zip" },
}

const RTK_VERSION = "0.44.2"
// rtk ships no aarch64-pc-windows-msvc build (upstream gap)
const RTK_PLATFORMS: Record<string, { platform: string; binary: string; extension: "tar.gz" | "zip" }> = {
  "darwin-arm64": { platform: "aarch64-apple-darwin", binary: "rtk", extension: "tar.gz" },
  "darwin-x64": { platform: "x86_64-apple-darwin", binary: "rtk", extension: "tar.gz" },
  "linux-arm64": { platform: "aarch64-unknown-linux-gnu", binary: "rtk", extension: "tar.gz" },
  "linux-x64": { platform: "x86_64-unknown-linux-musl", binary: "rtk", extension: "tar.gz" },
  "win32-x64": { platform: "x86_64-pc-windows-msvc", binary: "rtk.exe", extension: "zip" },
}

async function downloadRtk(os: string, arch: string, destDir: string) {
  const config = RTK_PLATFORMS[`${os}-${arch}`]
  if (!config) return

  const cacheDir = path.resolve(dir, ".rtk-cache")
  const cachedBin = path.join(cacheDir, `${config.platform}-${config.binary}`)
  if (!fs.existsSync(cachedBin)) {
    const filename = `rtk-${config.platform}.${config.extension}`
    const archivePath = path.join(cacheDir, filename)
    const extractDir = path.join(cacheDir, `extract-${config.platform}`)
    await $`mkdir -p ${cacheDir} ${extractDir}`
    const response = await fetch(
      `https://github.com/rtk-ai/rtk/releases/download/v${RTK_VERSION}/${filename}`,
    )
    if (!response.ok) throw new Error(`Failed to download rtk for ${os}-${arch}: ${response.status}`)
    await Bun.write(archivePath, await response.arrayBuffer())
    if (config.extension === "tar.gz") await $`tar -xzf ${archivePath} -C ${extractDir}`
    if (config.extension === "zip") await $`unzip -o ${archivePath} -d ${extractDir}`
    // rtk archives contain the bare binary at the root (unlike ripgrep's nested folder)
    fs.copyFileSync(path.join(extractDir, config.binary), cachedBin)
    if (os !== "win32") fs.chmodSync(cachedBin, 0o755)
  }

  const dest = path.join(destDir, config.binary)
  fs.copyFileSync(cachedBin, dest)
  if (os !== "win32") fs.chmodSync(dest, 0o755)
}

async function downloadRg(os: string, arch: string, destDir: string) {
  const config = RG_PLATFORMS[`${os}-${arch}`]
  if (!config) return

  const cacheDir = path.resolve(dir, ".rg-cache")
  const cachedBin = path.join(cacheDir, `${config.platform}-${config.binary}`)
  if (!fs.existsSync(cachedBin)) {
    const filename = `ripgrep-${RG_VERSION}-${config.platform}.${config.extension}`
    const archivePath = path.join(cacheDir, filename)
    const extractDir = path.join(cacheDir, `extract-${config.platform}`)
    await $`mkdir -p ${cacheDir} ${extractDir}`
    const response = await fetch(`https://github.com/BurntSushi/ripgrep/releases/download/${RG_VERSION}/${filename}`)
    if (!response.ok) throw new Error(`Failed to download ripgrep for ${os}-${arch}: ${response.status}`)
    await Bun.write(archivePath, await response.arrayBuffer())
    if (config.extension === "tar.gz") await $`tar -xzf ${archivePath} -C ${extractDir}`
    if (config.extension === "zip") await $`unzip -o ${archivePath} -d ${extractDir}`
    fs.copyFileSync(path.join(extractDir, `ripgrep-${RG_VERSION}-${config.platform}`, config.binary), cachedBin)
    if (os !== "win32") fs.chmodSync(cachedBin, 0o755)
  }

  const dest = path.join(destDir, config.binary)
  fs.copyFileSync(cachedBin, dest)
  if (os !== "win32") fs.chmodSync(dest, 0o755)
}

await $`rm -rf dist`

const binaries: Record<string, string> = {}
if (!skipInstall) {
  await $`bun install --os="*" --cpu="*" @opentui/core@${pkg.dependencies["@opentui/core"]}`
  await $`bun install --os="*" --cpu="*" @parcel/watcher@${pkg.dependencies["@parcel/watcher"]}`
  await $`bun install --os="*" --cpu="*" @ff-labs/fff-bun@${pkg.dependencies["@ff-labs/fff-bun"]}`
}
for (const item of targets) {
  const name = [
    pkg.name,
    // changing to win32 flags npm for some reason
    item.os === "win32" ? "windows" : item.os,
    item.arch,
    item.avx2 === false ? "baseline" : undefined,
    item.abi === undefined ? undefined : item.abi,
  ]
    .filter(Boolean)
    .join("-")
  console.log(`building ${name}`)
  await $`mkdir -p dist/${name}/bin`

  const localPath = path.resolve(dir, "node_modules/@opentui/core/parser.worker.js")
  const rootPath = path.resolve(dir, "../../node_modules/@opentui/core/parser.worker.js")
  const parserWorker = fs.realpathSync(fs.existsSync(localPath) ? localPath : rootPath)
  const workerPath = "./src/cli/tui/worker.ts"

  // Use platform-specific bunfs root path based on target OS
  const bunfsRoot = item.os === "win32" ? "B:/~BUN/root/" : "/$bunfs/root/"
  const workerRelativePath = path.relative(dir, parserWorker).replaceAll("\\", "/")

  await Bun.build({
    conditions: ["bun", "node"],
    tsconfig: "./tsconfig.json",
    plugins: [plugin],
    external: ["node-gyp"],
    format: "esm",
    minify: true,
    sourcemap: sourcemapsFlag ? "linked" : "none",
    // Chunk splitting is disabled: as of Bun 1.3.14, compile-mode splitting
    // across this build's multiple entrypoints (index.ts + the TUI worker)
    // produces two content-identical-but-distinct module records for
    // @mybcabisnis/mage-sdk's process.ts (reached from both entrypoints via
    // the workspace symlink) and writes them to the same content-hashed chunk
    // path, erroring with "Multiple files share the same output path" even
    // with an explicit [hash] naming pattern (verified — the hash itself
    // collides, so it isn't a naming-template problem). Splitting only
    // affects binary size here (compile mode still emits one self-contained
    // executable either way) — no functional difference, so disabling it is
    // a safe workaround pending a Bun fix.
    splitting: false,
    compile: {
      autoloadBunfig: false,
      autoloadDotenv: false,
      autoloadTsconfig: true,
      autoloadPackageJson: true,
      target: name.replace(pkg.name, "bun") as any,
      outfile: `dist/${name}/bin/mage`,
      execArgv: [`--user-agent=mage/${Script.version}`, "--use-system-ca", "--"],
      windows: {},
    },
    files: embeddedFileMap ? { "mage-web-ui.gen.ts": embeddedFileMap } : {},
    entrypoints: ["./src/index.ts", parserWorker, workerPath, ...(embeddedFileMap ? ["mage-web-ui.gen.ts"] : [])],
    define: {
      FFF_LIBC: JSON.stringify(item.abi === "musl" ? "musl" : "gnu"),
      MAGE_VERSION: `'${Script.version}'`,
      OTUI_TREE_SITTER_WORKER_PATH: bunfsRoot + workerRelativePath,
      MAGE_WORKER_PATH: workerPath,
      MAGE_CHANNEL: `'${Script.channel}'`,
      MAGE_LIBC: item.os === "linux" ? `'${item.abi ?? "glibc"}'` : "",
      MAGE_AGENTS_MD: JSON.stringify(defaultAgentsMd),
      ...(item.os === "linux" ? { "process.env.OPENTUI_LIBC": JSON.stringify(item.abi ?? "glibc") } : {}),
    },
  })

  // Smoke test: only run if binary is for current platform
  if (item.os === process.platform && item.arch === process.arch && !item.abi) {
    const binaryPath = `dist/${name}/bin/mage`
    console.log(`Running smoke test: ${binaryPath} --version`)
    try {
      const versionOutput = await $`${binaryPath} --version`.text()
      console.log(`Smoke test passed: ${versionOutput.trim()}`)
    } catch (e) {
      console.error(`Smoke test failed for ${name}:`, e)
      process.exit(1)
    }
  }

  await $`rm -rf ./dist/${name}/bin/tui`
  await downloadRg(item.os, item.arch, `dist/${name}/bin`)
  await downloadRtk(item.os, item.arch, `dist/${name}/bin`)
  const binDir = path.resolve(`dist/${name}/bin`)
  for (const binary of [item.os === "win32" ? "rg.exe" : "rg", item.os === "win32" ? "rtk.exe" : "rtk"]) {
    if (!fs.existsSync(path.join(binDir, binary))) throw new Error(`${name} is missing bundled ${binary}`)
  }
  if (item.os === process.platform && item.arch === process.arch && !item.abi) {
    const rtk = path.join(binDir, item.os === "win32" ? "rtk.exe" : "rtk")
    const result = await $`${rtk} rewrite ${"git status"}`.quiet().nothrow()
    const rewritten = result.stdout.toString().trim()
    if (rewritten !== "rtk git status") {
      throw new Error(`bundled RTK rewrite failed: expected "rtk git status", got "${rewritten}"`)
    }
  }
  await Bun.file(`dist/${name}/package.json`).write(
    JSON.stringify(
      {
        name,
        version: Script.version,
        preferUnplugged: true,
        os: [item.os],
        cpu: [item.arch],
        ...(item.abi ? { libc: [item.abi] } : {}),
      },
      null,
      2,
    ),
  )
  binaries[name] = Script.version
}

if (Script.release) {
  for (const key of Object.keys(binaries)) {
    if (key.includes("linux")) {
      await $`tar -czf ../../${key}.tar.gz *`.cwd(`dist/${key}/bin`)
    } else {
      await $`zip -r ../../${key}.zip *`.cwd(`dist/${key}/bin`)
    }
  }
  await $`gh release upload v${Script.version} ./dist/*.zip ./dist/*.tar.gz --clobber --repo ${process.env.GH_REPO}`
}

export { binaries }
