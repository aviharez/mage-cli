#!/usr/bin/env node

import fs from "fs"
import path from "path"
import os from "os"
import { spawnSync } from "child_process"
import { fileURLToPath } from "url"
import { createRequire } from "module"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const VERBOSE = process.argv.includes("--verbose") || process.env.MAGE_POSTINSTALL_VERBOSE === "1"

// npm v7+ silences lifecycle script stdout by default (requires --foreground-scripts to see it).
// We write everything to ~/.mage/postinstall.log so users can always inspect what happened.
// Critical messages (warnings, errors, final status) go to stderr — npm forwards those when
// the script exits non-zero, and they appear in the npm debug log regardless.
const LOG_PATH = path.join(os.homedir(), ".mage", "postinstall.log")
let _logFd = null

function _logFile(line) {
  try {
    if (_logFd === null) {
      fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true })
      _logFd = fs.openSync(LOG_PATH, "a")
    }
    fs.writeSync(_logFd, line + "\n")
  } catch { /* don't let log failures break the install */ }
}

function _ts() { return new Date().toISOString() }

const log = {
  step: (n, total, msg) => {
    const line = `\n[mage] (${n}/${total}) ${msg}`
    _logFile(`[${_ts()}] STEP  (${n}/${total}) ${msg}`)
    process.stderr.write(line + "\n")
  },
  info: (...args) => {
    const msg = args.join(" ")
    _logFile(`[${_ts()}] INFO  ${msg}`)
    if (VERBOSE) process.stderr.write(`  [mage] ${msg}\n`)
  },
  ok: (msg) => {
    _logFile(`[${_ts()}] OK    ${msg}`)
    process.stderr.write(`  [mage] ✓ ${msg}\n`)
  },
  warn: (msg) => {
    _logFile(`[${_ts()}] WARN  ${msg}`)
    process.stderr.write(`  [mage] ⚠ ${msg}\n`)
  },
  error: (msg) => {
    _logFile(`[${_ts()}] ERROR ${msg}`)
    process.stderr.write(`  [mage] ✗ ${msg}\n`)
  },
  debug: (...args) => {
    const msg = args.join(" ")
    _logFile(`[${_ts()}] DEBUG ${msg}`)
    if (VERBOSE) process.stderr.write(`  [mage:debug] ${msg}\n`)
  },
}

const DEFAULT_CONFIG = {
  $schema: "https://opencode.ai/config.json",
  permission: {
    edit: "ask",
    bash: "ask"
  },
  skills: {
    paths: ["~/.mage/skills"],
  },
  share: "disabled",
  lsp: true
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath)
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

// Deep merge source into target. Existing primitive values in target always win.
// Arrays are unioned. New keys from source are added recursively.
function deepMerge(target, source) {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (!(key in result)) {
      result[key] = source[key]
    } else if (Array.isArray(source[key]) && Array.isArray(result[key])) {
      result[key] = [...new Set([...result[key], ...source[key]])]
    } else if (
      typeof source[key] === "object" && source[key] !== null && !Array.isArray(source[key]) &&
      typeof result[key] === "object" && result[key] !== null && !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], source[key])
    }
    // existing primitive wins — skip
  }
  return result
}

function ensureGlobalConfig() {
  const mageDir = path.join(os.homedir(), ".mage")
  const configPath = path.join(mageDir, "mage.json")

  if (!fs.existsSync(mageDir)) {
    fs.mkdirSync(mageDir, { recursive: true })
  }

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8")
    log.ok(`Created global config at ${configPath}`)
  } else {
    log.info(`Existing config found at ${configPath}`)
    try {
      const existing = JSON.parse(fs.readFileSync(configPath, "utf8"))
      const merged = deepMerge(existing, DEFAULT_CONFIG)
      if (JSON.stringify(existing) !== JSON.stringify(merged)) {
        fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), "utf8")
        log.ok(`Updated global config at ${configPath}`)
      } else {
        log.info("Config is already up-to-date, no changes needed")
      }
    } catch (err) {
      log.warn(`Could not parse ${configPath} — leaving untouched (${err.message})`)
    }
  }
}

function detectPlatformAndArch() {
  // Map platform names
  let platform
  switch (os.platform()) {
    case "darwin":
      platform = "darwin"
      break
    case "linux":
      platform = "linux"
      break
    case "win32":
      platform = "windows"
      break
    default:
      platform = os.platform()
      break
  }

  // Map architecture names
  let arch
  switch (os.arch()) {
    case "x64":
      arch = "x64"
      break
    case "arm64":
      arch = "arm64"
      break
    case "arm":
      arch = "arm"
      break
    default:
      arch = os.arch()
      break
  }

  return { platform, arch }
}

function findBinary() {
  const { platform, arch } = detectPlatformAndArch()
  const packageName = `@mybcabisnis/mage-${platform}-${arch}`
  const binaryName = platform === "windows" ? "mage.exe" : "mage"

  try {
    // Use require.resolve to find the package
    const packageJsonPath = require.resolve(`${packageName}/package.json`)
    const packageDir = path.dirname(packageJsonPath)
    const binaryPath = path.join(packageDir, "bin", binaryName)

    if (!fs.existsSync(binaryPath)) {
      throw new Error(`Binary not found at ${binaryPath}`)
    }

    return { binaryPath, binaryName }
  } catch (error) {
    throw new Error(`Could not find package ${packageName}: ${error.message}`, { cause: error })
  }
}

/**
 * Ensure ~/.mage/package.json and package-lock.json are consistent so the
 * Npm.install dirty-check at boot skips the slow arborist network install.
 * The bundled plugin/*.js files are self-contained; no real install is needed.
 * Also writes .npmrc so arborist uses the correct BCA registry if a real
 * install is ever triggered (e.g. user adds a custom plugin dependency).
 */
function ensureMageNpmFiles() {
  const mageDir = path.join(os.homedir(), ".mage")
  fs.mkdirSync(mageDir, { recursive: true })
  const pkgPath = path.join(mageDir, "package.json")
  const lockPath = path.join(mageDir, "package-lock.json")
  const npmrcPath = path.join(mageDir, ".npmrc")

  // Read or initialise package.json
  let pkg = {}
  if (fs.existsSync(pkgPath)) {
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) } catch { pkg = {} }
  }
  pkg.name ??= ".mage"
  pkg.dependencies ??= {}

  // Migrate from the old upstream package name to the BCA-scoped one.
  // Also ensure the new name is always present so the Npm.install dirty-check
  // (which adds "@mybcabisnis/mage-plugin" to declared at boot) always passes.
  let pkgChanged = false
  if (pkg.dependencies["@mybcabisnis/mage-plugin"]) {
    delete pkg.dependencies["@mybcabisnis/mage-plugin"]
    pkgChanged = true
  }
  if (!pkg.dependencies["@mybcabisnis/mage-plugin"]) {
    pkg.dependencies["@mybcabisnis/mage-plugin"] = "0.0.3"
    pkgChanged = true
  }
  if (pkgChanged || !fs.existsSync(pkgPath)) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), "utf8")
    log.ok("Updated ~/.mage/package.json")
    log.debug("Dependencies:", JSON.stringify(pkg.dependencies, null, 2))
  } else {
    log.info("~/.mage/package.json is already up-to-date")
  }

  // Regenerate package-lock.json when any declared dep is absent from packages[""].
  // The dirty-check in Npm.install only compares names, so a minimal lock suffices.
  const allDeps = {
    ...pkg?.dependencies,
    ...pkg?.devDependencies,
    ...pkg?.peerDependencies,
    ...pkg?.optionalDependencies,
  }
  const declared = Object.keys(allDeps)

  let needsLockUpdate = true
  if (fs.existsSync(lockPath)) {
    try {
      const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"))
      const root = lock?.packages?.[""] ?? {}
      const locked = new Set([
        ...Object.keys(root?.dependencies ?? {}),
        ...Object.keys(root?.devDependencies ?? {}),
        ...Object.keys(root?.peerDependencies ?? {}),
        ...Object.keys(root?.optionalDependencies ?? {}),
      ])
      needsLockUpdate = declared.some((name) => !locked.has(name))
    } catch {
      needsLockUpdate = true
    }
  }

  if (needsLockUpdate) {
    const lockContent = { name: ".mage", lockfileVersion: 3, requires: true, packages: { "": {} } }
    if (pkg?.dependencies && Object.keys(pkg.dependencies).length)
      lockContent.packages[""].dependencies = pkg.dependencies
    if (pkg?.devDependencies && Object.keys(pkg.devDependencies).length)
      lockContent.packages[""].devDependencies = pkg.devDependencies
    fs.writeFileSync(lockPath, JSON.stringify(lockContent, null, 2), "utf8")
    log.ok("Updated ~/.mage/package-lock.json")
  } else {
    log.info("~/.mage/package-lock.json is already consistent")
  }

  // Write .npmrc with BCA registry for @mybcabisnis scope so arborist resolves
  // scoped packages correctly if a real install is ever triggered.
  if (!fs.existsSync(npmrcPath)) {
    fs.writeFileSync(
      npmrcPath,
      "@mybcabisnis:registry=https://artifactory.intra.bca.co.id/artifactory/api/npm/MBB-Registry-npm/\n",
      "utf8",
    )
    log.ok("Created ~/.mage/.npmrc with @mybcabisnis registry")
  } else {
    log.info("~/.mage/.npmrc already exists, skipping")
  }
}

/**
 * Install @mybcabisnis/mage-sdk and @mybcabisnis/mage-plugin from the vendor/
 * directory bundled inside this package. These are BCA-internal packages that
 * can't be fetched from the public npm registry, so they're shipped pre-built.
 * Public transitive deps (effect, zod, cross-spawn) are handled by
 * runMageNpmInstall() afterwards.
 */
function installVendoredPackages() {
  const vendorDir = path.join(__dirname, "vendor")
  if (!fs.existsSync(vendorDir)) {
    log.info("No vendor/ directory found, skipping vendored package install")
    return
  }

  const mageDir = path.join(os.homedir(), ".mage")
  const localPaths = []

  // Collect paths — handles both @scope/pkg and plain pkg layouts
  for (const entry of fs.readdirSync(vendorDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const entryPath = path.join(vendorDir, entry.name)
    if (entry.name.startsWith("@")) {
      for (const pkgEntry of fs.readdirSync(entryPath, { withFileTypes: true })) {
        if (pkgEntry.isDirectory()) localPaths.push(path.join(entryPath, pkgEntry.name))
      }
    } else {
      localPaths.push(entryPath)
    }
  }

  if (localPaths.length === 0) {
    log.info("vendor/ directory is empty, nothing to install")
    return
  }

  const pkgNames = localPaths.map((p) => {
    try { return JSON.parse(fs.readFileSync(path.join(p, "package.json"), "utf8")).name } catch { return path.basename(p) }
  })
  log.info(`Found ${localPaths.length} vendored package(s): ${pkgNames.join(", ")}`)

  // Install from local paths — no registry credentials needed.
  // npm/bun will also fetch public transitive deps (effect, zod, cross-spawn).
  const managers = [
    ["npm", ["install", "--ignore-scripts", "--no-fund", "--no-audit", "--no-save", ...localPaths]],
    ["bun", ["add", "--ignore-scripts", ...localPaths]],
  ]
  for (const [bin, args] of managers) {
    log.info(`Trying ${bin} to install vendored packages...`)
    const result = spawnSync(bin, args, {
      cwd: mageDir,
      stdio: VERBOSE ? "inherit" : "pipe",
      env: process.env,
    })
    if (result.status === 0) {
      log.ok(`Installed vendored packages via ${bin}: ${pkgNames.join(", ")}`)
      return
    }
    if (result.error?.code === "ENOENT") {
      log.info(`${bin} not found, trying next package manager...`)
    } else {
      log.warn(`${bin} failed (exit code ${result.status ?? "unknown"}) to install vendored packages`)
      if (!VERBOSE && result.stderr) {
        log.warn(`${bin} stderr:\n${result.stderr.toString().trim()}`)
      }
      log.info("Trying next package manager...")
    }
  }

  // Final fallback: copy directly to node_modules so at least imports resolve,
  // even if transitive deps are missing.
  log.warn("All package managers failed — falling back to direct copy (transitive deps may be missing)")
  const nodeModulesDir = path.join(mageDir, "node_modules")
  for (const pkgPath of localPaths) {
    let pkgName = path.basename(pkgPath)
    try {
      const pkgJson = JSON.parse(fs.readFileSync(path.join(pkgPath, "package.json"), "utf8"))
      pkgName = pkgJson.name
      const dest = path.join(nodeModulesDir, ...pkgJson.name.split("/"))
      fs.mkdirSync(dest, { recursive: true })
      copyDirRecursive(pkgPath, dest)
      log.ok(`Copied vendored ${pkgJson.name} → ${dest}`)
    } catch (err) {
      log.error(`Failed to copy vendored package "${pkgName}": ${err.message}`)
    }
  }
}

/**
 * Run npm install (or bun install as fallback) inside ~/.mage/ so plugin
 * packages are actually available on disk. The .npmrc written by
 * ensureMageNpmFiles() points @mybcabisnis to the BCA Artifactory registry.
 * If the install fails (offline / behind firewall), we fall back to an empty
 * node_modules stub so the Npm.install dirty-check still passes at boot —
 * bundled plugin/*.js files are self-contained and need no real packages.
 */
function runMageNpmInstall() {
  const mageDir = path.join(os.homedir(), ".mage")
  const pkgPath = path.join(mageDir, "package.json")
  if (!fs.existsSync(pkgPath)) return

  let hasDeps = false
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"))
    hasDeps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).length > 0
  } catch { /* ignore */ }
  if (!hasDeps) return

  const managers = [
    ["npm", ["install", "--ignore-scripts", "--no-fund", "--no-audit"]],
    ["bun", ["install", "--ignore-scripts"]],
  ]

  for (const [bin, args] of managers) {
    log.info(`Trying ${bin} install in ~/.mage/...`)
    const result = spawnSync(bin, args, {
      cwd: mageDir,
      stdio: VERBOSE ? "inherit" : "pipe",
      env: process.env,
    })
    if (result.status === 0) {
      log.ok(`Installed ~/.mage/ dependencies via ${bin}`)
      return
    }
    if (result.error?.code === "ENOENT") {
      log.info(`${bin} not found, trying next package manager...`)
    } else {
      log.warn(`${bin} install in ~/.mage/ failed (exit code ${result.status ?? "unknown"})`)
      if (!VERBOSE && result.stderr) {
        log.warn(`${bin} stderr:\n${result.stderr.toString().trim()}`)
      }
      log.info("Trying next package manager...")
    }
  }

  log.warn("npm/bun install in ~/.mage/ failed — bundled plugins still work, custom plugin deps may be missing")
  log.warn("Tip: run with --verbose or set MAGE_POSTINSTALL_VERBOSE=1 for full output")
}

async function main() {
  _logFile(`[${_ts()}] ===== postinstall start (node ${process.version}, verbose=${VERBOSE}) =====`)
  if (VERBOSE) process.stderr.write("[mage postinstall] verbose mode enabled (MAGE_POSTINSTALL_VERBOSE or --verbose)\n")
  process.stderr.write(`[mage postinstall] starting setup... (log: ${LOG_PATH})\n`)

  try {
    log.step(1, 3, "Ensuring global config (~/.mage/mage.json)")
    ensureGlobalConfig()

    // log.step(2, 5, "Ensuring ~/.mage npm files (package.json, lock, .npmrc)")
    // ensureMageNpmFiles()

    // log.step(3, 5, "Installing vendored BCA-internal packages")
    // installVendoredPackages()

    // log.step(4, 5, "Installing remaining public dependencies in ~/.mage/")
    // runMageNpmInstall()

    // // Create ~/.mage/node_modules/ as a fallback stub so the Npm.install
    // // dirty-check at boot does not trigger a slow arborist network install
    // // when the npm install above was skipped or failed.
    // const nodeModulesDir = path.join(os.homedir(), ".mage", "node_modules")
    // if (!fs.existsSync(nodeModulesDir)) {
    //   fs.mkdirSync(nodeModulesDir, { recursive: true })
    //   log.info("Created ~/.mage/node_modules/ stub")
    // }

    log.step(2, 3, "Setting up mage binary")
    const { platform, arch } = detectPlatformAndArch()
    const packageName = `@mybcabisnis/mage-${platform}-${arch}`
    const binaryName = platform === "windows" ? "mage.exe" : "mage"
    const rgName = platform === "windows" ? "rg.exe" : "rg"

    log.debug(`Platform: ${platform}, arch: ${arch}, package: ${packageName}`)

    // Resolve platform package directory
    let packageDir
    try {
      const packageJsonPath = require.resolve(`${packageName}/package.json`)
      packageDir = path.dirname(packageJsonPath)
      log.info(`Resolved ${packageName} → ${packageDir}`)
    } catch (error) {
      throw new Error(
        `Could not find package ${packageName}.\n` +
        `  Make sure the platform package is installed (e.g. npm install ${packageName}).\n` +
        `  Original error: ${error.message}`,
        { cause: error },
      )
    }

    // Copy bundled rg binary to ~/.mage/bin/ so mage never needs to download it
    const rgSrc = path.join(packageDir, "bin", rgName)
    if (fs.existsSync(rgSrc)) {
      const mageBin = path.join(os.homedir(), ".mage", "bin")
      if (!fs.existsSync(mageBin)) fs.mkdirSync(mageBin, { recursive: true })
      const rgDest = path.join(mageBin, rgName)
      try {
        if (fs.existsSync(rgDest)) fs.unlinkSync(rgDest)
        fs.linkSync(rgSrc, rgDest)
        log.info(`Hard-linked rg: ${rgSrc} → ${rgDest}`)
      } catch {
        fs.copyFileSync(rgSrc, rgDest)
        log.info(`Copied rg (hard-link failed): ${rgSrc} → ${rgDest}`)
      }
      if (platform !== "windows") fs.chmodSync(rgDest, 0o755)
      log.ok(`Installed bundled rg at ${rgDest}`)
    } else {
      log.info(`No bundled rg found in ${packageName} (${rgSrc}) — will download on first use`)
    }

    if (platform === "windows") {
      log.ok("Windows: mage binary is already in the package, no extra setup needed")
      _logFile(`[${_ts()}] ===== postinstall complete =====`)
      process.stderr.write("\n[mage postinstall] setup complete\n")
      return
    }

    // On non-Windows platforms, link/copy the mage binary
    const binaryPath = path.join(packageDir, "bin", binaryName)
    if (!fs.existsSync(binaryPath)) {
      throw new Error(
        `mage binary not found at expected path: ${binaryPath}\n` +
        `  Package directory: ${packageDir}\n` +
        `  Expected binary name: ${binaryName}`,
      )
    }
    const target = path.join(__dirname, "bin", ".mage")
    if (fs.existsSync(target)) fs.unlinkSync(target)
    try {
      fs.linkSync(binaryPath, target)
      log.info(`Hard-linked mage: ${binaryPath} → ${target}`)
    } catch {
      fs.copyFileSync(binaryPath, target)
      log.info(`Copied mage (hard-link failed): ${binaryPath} → ${target}`)
    }
    fs.chmodSync(target, 0o755)
    log.ok(`mage binary ready at ${target}`)
    _logFile(`[${_ts()}] ===== postinstall complete =====`)
    process.stderr.write(`\n[mage postinstall] setup complete — full log: ${LOG_PATH}\n`)
  } catch (error) {
    _logFile(`[${_ts()}] FATAL ${error.message}`)
    process.stderr.write(`\n[mage postinstall] setup failed: ${error.message}\n`)
    process.stderr.write(`[mage postinstall] full log: ${LOG_PATH}\n`)
    if (VERBOSE && error.cause) process.stderr.write(`[mage postinstall] caused by: ${error.cause}\n`)
    process.exit(1)
  }
}

try {
  void main()
} catch (error) {
  _logFile(`[${_ts()}] FATAL unexpected: ${error.message}`)
  process.stderr.write(`[mage postinstall] unexpected error: ${error.message}\n`)
  if (VERBOSE) process.stderr.write(String(error) + "\n")
  process.exit(0)
}
