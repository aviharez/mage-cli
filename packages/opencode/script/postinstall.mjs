#!/usr/bin/env node

import fs from "fs"
import path from "path"
import os from "os"
import { spawnSync } from "child_process"
import { fileURLToPath } from "url"
import { createRequire } from "module"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const DEFAULT_CONFIG = {
  $schema: "https://mage.ai/config.json",
  permission: {
    edit: "ask"
  },
  skills: {
    paths: ["~/.mage/skills"],
  },
  share: "manual"
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
    console.log(`Created global config at ${configPath}`)
  } else {
    try {
      const existing = JSON.parse(fs.readFileSync(configPath, "utf8"))
      const merged = deepMerge(existing, DEFAULT_CONFIG)
      if (JSON.stringify(existing) !== JSON.stringify(merged)) {
        fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), "utf8")
        console.log(`Updated global config at ${configPath}`)
      }
    } catch {
      // Leave config untouched if it cannot be parsed
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
  if (pkg.dependencies["@opencode-ai/plugin"]) {
    delete pkg.dependencies["@opencode-ai/plugin"]
    pkgChanged = true
  }
  if (!pkg.dependencies["@mybcabisnis/mage-plugin"]) {
    pkg.dependencies["@mybcabisnis/mage-plugin"] = "0.0.3"
    pkgChanged = true
  }
  if (pkgChanged || !fs.existsSync(pkgPath)) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), "utf8")
    console.log(`Updated ~/.mage/package.json`)
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
    console.log(`Updated ~/.mage/package-lock.json`)
  }

  // Write .npmrc with BCA registry for @mybcabisnis scope so arborist resolves
  // scoped packages correctly if a real install is ever triggered.
  if (!fs.existsSync(npmrcPath)) {
    fs.writeFileSync(
      npmrcPath,
      "@mybcabisnis:registry=https://artifactory.intra.bca.co.id/artifactory/api/npm/MBB-Registry-npm/\n",
      "utf8",
    )
    console.log(`Created ~/.mage/.npmrc`)
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
  if (!fs.existsSync(vendorDir)) return

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

  if (localPaths.length === 0) return

  // Install from local paths — no registry credentials needed.
  // npm/bun will also fetch public transitive deps (effect, zod, cross-spawn).
  const managers = [
    ["npm", ["install", "--ignore-scripts", "--no-fund", "--no-audit", "--no-save", ...localPaths]],
    ["bun", ["add", "--ignore-scripts", ...localPaths]],
  ]
  for (const [bin, args] of managers) {
    const result = spawnSync(bin, args, { cwd: mageDir, stdio: "inherit", env: process.env })
    if (result.status === 0) {
      console.log(`Installed vendored packages via ${bin}`)
      return
    }
    if (result.error?.code !== "ENOENT") {
      console.warn(`${bin} failed to install vendored packages, trying next manager...`)
    }
  }

  // Final fallback: copy directly to node_modules so at least imports resolve,
  // even if transitive deps are missing.
  console.warn("Falling back to direct copy for vendored packages")
  const nodeModulesDir = path.join(mageDir, "node_modules")
  for (const pkgPath of localPaths) {
    try {
      const pkgJson = JSON.parse(fs.readFileSync(path.join(pkgPath, "package.json"), "utf8"))
      const dest = path.join(nodeModulesDir, ...pkgJson.name.split("/"))
      fs.mkdirSync(dest, { recursive: true })
      copyDirRecursive(pkgPath, dest)
      console.log(`Copied vendored ${pkgJson.name} to ${dest}`)
    } catch { /* skip on error */ }
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
    const result = spawnSync(bin, args, { cwd: mageDir, stdio: "inherit", env: process.env })
    if (result.status === 0) {
      console.log(`Installed packages in ~/.mage/ via ${bin}`)
      return
    }
    if (result.error?.code !== "ENOENT") {
      // bin exists but install failed — try next manager
      console.warn(`${bin} install in ~/.mage/ failed, trying next manager...`)
    }
  }

  console.warn("npm/bun install in ~/.mage/ failed — bundled plugins still work, custom plugin deps may be missing")
}

async function main() {
  try {
    ensureGlobalConfig()
    ensureMageNpmFiles()
    installVendoredPackages()  // install BCA-internal packages from bundled vendor/
    runMageNpmInstall()        // install remaining public transitive deps

    // Create ~/.mage/node_modules/ as a fallback stub so the Npm.install
    // dirty-check at boot does not trigger a slow arborist network install
    // when the npm install above was skipped or failed.
    const nodeModulesDir = path.join(os.homedir(), ".mage", "node_modules")
    if (!fs.existsSync(nodeModulesDir)) fs.mkdirSync(nodeModulesDir, { recursive: true })

    const { platform, arch } = detectPlatformAndArch()
    const packageName = `@mybcabisnis/mage-${platform}-${arch}`
    const binaryName = platform === "windows" ? "mage.exe" : "mage"
    const rgName = platform === "windows" ? "rg.exe" : "rg"

    // Resolve platform package directory
    let packageDir
    try {
      const packageJsonPath = require.resolve(`${packageName}/package.json`)
      packageDir = path.dirname(packageJsonPath)
    } catch (error) {
      throw new Error(`Could not find package ${packageName}: ${error.message}`, { cause: error })
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
      } catch {
        fs.copyFileSync(rgSrc, rgDest)
      }
      if (platform !== "windows") fs.chmodSync(rgDest, 0o755)
      console.log(`Installed bundled rg at ${rgDest}`)
    } else {
      console.log(`No bundled rg found in ${packageName}, will download on first use`)
    }

    if (platform === "windows") {
      // On Windows, the .exe is already in the package and bin field points to it
      console.log("Windows detected: mage binary setup not needed (using packaged .exe)")
      return
    }

    // On non-Windows platforms, link/copy the mage binary
    const binaryPath = path.join(packageDir, "bin", binaryName)
    if (!fs.existsSync(binaryPath)) {
      throw new Error(`Binary not found at ${binaryPath}`)
    }
    const target = path.join(__dirname, "bin", ".mage")
    if (fs.existsSync(target)) fs.unlinkSync(target)
    try {
      fs.linkSync(binaryPath, target)
    } catch {
      fs.copyFileSync(binaryPath, target)
    }
    fs.chmodSync(target, 0o755)
  } catch (error) {
    console.error("Failed to setup mage binary:", error.message)
    process.exit(1)
  }
}

try {
  void main()
} catch (error) {
  console.error("Postinstall script error:", error.message)
  process.exit(0)
}
