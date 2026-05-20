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

// await import("./generate.ts")

import { Script } from "@mybcabisnis/mage-script"
import pkg from "../package.json"

// Load migrations from migration directories
const migrationDirs = (
  await fs.promises.readdir(path.join(dir, "migration"), {
    withFileTypes: true,
  })
)
  .filter((entry) => entry.isDirectory() && /^\d{4}\d{2}\d{2}\d{2}\d{2}\d{2}/.test(entry.name))
  .map((entry) => entry.name)
  .sort()

const migrations = await Promise.all(
  migrationDirs.map(async (name) => {
    const file = path.join(dir, "migration", name, "migration.sql")
    const sql = await Bun.file(file).text()
    const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(name)
    const timestamp = match
      ? Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        Number(match[6]),
      )
      : 0
    return { sql, timestamp, name }
  }),
)
console.log(`Loaded ${migrations.length} migrations`)

const singleFlag = process.argv.includes("--single")
const baselineFlag = process.argv.includes("--baseline")
const skipInstall = process.argv.includes("--skip-install")
const plugin = createSolidTransformPlugin()
const skipEmbedWebUi = process.argv.includes("--skip-embed-web-ui")

const createEmbeddedWebUIBundle = async () => {
  console.log(`Building Web UI to embed in the binary`)
  const appDir = path.join(import.meta.dirname, "../../app")
  const dist = path.join(appDir, "dist")
  await $`bun run --cwd ${appDir} build`
  const files = (await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: dist })))
    .map((file) => file.replaceAll("\\", "/"))
    .sort()
  const imports = files.map((file, i) => {
    const spec = path.relative(dir, path.join(dist, file)).replaceAll("\\", "/")
    return `import file_${i} from ${JSON.stringify(spec.startsWith(".") ? spec : `./${spec}`)} with { type: "file" };`
  })
  const entries = files.map((file, i) => `  ${JSON.stringify(file)}: file_${i},`)
  return [
    `// Import all files as file_$i with type: "file"`,
    ...imports,
    `// Export with original mappings`,
    `export default {`,
    ...entries,
    `}`,
  ].join("\n")
}

const embeddedFileMap = skipEmbedWebUi ? null : await createEmbeddedWebUIBundle()
const embeddedFileAbsPath = path.join(dir, "mage-web-ui.gen.ts")

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
// Maps ${os}-${arch} → ripgrep release artifact info
const RG_PLATFORMS: Record<string, { platform: string; binary: string; extension: "tar.gz" | "zip" }> = {
  "darwin-arm64": { platform: "aarch64-apple-darwin", binary: "rg", extension: "tar.gz" },
  "darwin-x64": { platform: "x86_64-apple-darwin", binary: "rg", extension: "tar.gz" },
  "linux-arm64": { platform: "aarch64-unknown-linux-gnu", binary: "rg", extension: "tar.gz" },
  "linux-x64": { platform: "x86_64-unknown-linux-musl", binary: "rg", extension: "tar.gz" },
  "win32-x64": { platform: "x86_64-pc-windows-msvc", binary: "rg.exe", extension: "zip" },
  "win32-arm64": { platform: "aarch64-pc-windows-msvc", binary: "rg.exe", extension: "zip" },
}

/**
 * Download the ripgrep binary for the given platform at build time and place it in destDir.
 * Uses a local .rg-cache to avoid re-downloading on repeated builds.
 * Emits a warning (non-fatal) if the download fails so the build still succeeds.
 */
async function downloadRg(os: string, arch: string, destDir: string) {
  const config = RG_PLATFORMS[`${os}-${arch}`]
  if (!config) {
    console.log(`[rg] no pre-built binary for ${os}-${arch}, skipping`)
    return
  }

  const cacheDir = path.resolve(dir, ".rg-cache")
  const cachedBin = path.join(cacheDir, `${config.platform}-${config.binary}`)

  if (!fs.existsSync(cachedBin)) {
    const filename = `ripgrep-${RG_VERSION}-${config.platform}.${config.extension}`
    const url = `https://github.com/BurntSushi/ripgrep/releases/download/${RG_VERSION}/${filename}`
    const archivePath = path.join(cacheDir, filename)
    await $`mkdir -p ${cacheDir}`
    console.log(`[rg] downloading ${url}`)
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[rg] download failed (${res.status}) for ${os}-${arch} — bundled rg will be missing`)
      return
    }
    await Bun.write(archivePath, await res.arrayBuffer())

    const extractDir = path.join(cacheDir, `extract-${config.platform}`)
    await $`mkdir -p ${extractDir}`
    if (config.extension === "tar.gz") {
      await $`tar -xzf ${archivePath} -C ${extractDir}`
    } else {
      // unzip is available on macOS and Linux; on CI use system unzip
      await $`unzip -o ${archivePath} -d ${extractDir}`
    }
    const extracted = path.join(extractDir, `ripgrep-${RG_VERSION}-${config.platform}`, config.binary)
    fs.copyFileSync(extracted, cachedBin)
    if (os !== "win32") fs.chmodSync(cachedBin, 0o755)
    console.log(`[rg] cached ${config.platform}`)
  }

  const dest = path.join(destDir, config.binary)
  fs.copyFileSync(cachedBin, dest)
  if (os !== "win32") fs.chmodSync(dest, 0o755)
  console.log(`[rg] bundled rg into ${dest}`)
}

await $`rm -rf dist`

const binaries: Record<string, string> = {}
if (!skipInstall) {
  await $`bun install --os="*" --cpu="*" @opentui/core@${pkg.dependencies["@opentui/core"]}`
  await $`bun install --os="*" --cpu="*" @parcel/watcher@${pkg.dependencies["@parcel/watcher"]}`
}
for (const item of targets) {
  const pkgMage = pkg.name.replaceAll("@mybcabisnis/", "")
  const name = [
    pkgMage,
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
  const workerPath = "./src/cli/cmd/tui/worker.ts"

  // Use platform-specific bunfs root path based on target OS
  const bunfsRoot = item.os === "win32" ? "B:/~BUN/root/" : "/$bunfs/root/"
  const workerRelativePath = path.relative(dir, parserWorker).replaceAll("\\", "/")

  await Bun.build({
    conditions: ["browser"],
    tsconfig: "./tsconfig.json",
    plugins: [plugin],
    external: ["node-gyp"],
    format: "esm",
    minify: true,
    splitting: true,
    compile: {
      autoloadBunfig: false,
      autoloadDotenv: false,
      autoloadTsconfig: true,
      autoloadPackageJson: true,
      target: name.replace(pkgMage, "bun") as any,
      outfile: `dist/${name}/bin/mage`,
      execArgv: [`--user-agent=mage/${Script.version}`, "--use-system-ca", "--"],
      windows: {},
    },
    files: embeddedFileMap ? { [embeddedFileAbsPath]: embeddedFileMap } : {},
    entrypoints: ["./src/index.ts", parserWorker, workerPath],
    define: {
      MAGE_VERSION: `'${Script.version}'`,
      MAGE_MIGRATIONS: JSON.stringify(migrations),
      OTUI_TREE_SITTER_WORKER_PATH: bunfsRoot + workerRelativePath,
      MAGE_WORKER_PATH: workerPath,
      MAGE_CHANNEL: `'${Script.channel}'`,
      MAGE_LIBC: item.os === "linux" ? `'${item.abi ?? "glibc"}'` : "",
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

  // Bundle ripgrep binary so installed packages work offline / behind firewall
  await downloadRg(item.os, item.arch, `dist/${name}/bin`)

  const scope = pkg.name.includes("/") ? pkg.name.split("/")[0] : undefined
  const scopedName = scope ? `${scope}/${name}` : name
  await Bun.file(`dist/${name}/package.json`).write(
    JSON.stringify(
      {
        name: scopedName,
        version: Script.version,
        os: [item.os],
        cpu: [item.arch],
        publishConfig: (pkg as any).publishConfig,
      },
      null,
      2,
    ),
  )
  binaries[scopedName] = Script.version
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
