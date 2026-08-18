#!/usr/bin/env node

import childProcess from "child_process"
import fs from "fs"
import os from "os"
import path from "path"
import { createRequire } from "module"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const DEFAULT_CONFIG = {
  $schema: "https://mage.apps.ocpdevgra.dti.co.id/config.json",
  permission: {
    edit: "ask",
    bash: "ask",
  },
  skills: {
    paths: ["~/.mage/skills"],
  },
  share: "disabled",
  lsp: true,
}

const platformMap = {
  darwin: "darwin",
  linux: "linux",
  win32: "windows",
}
const archMap = {
  x64: "x64",
  arm64: "arm64",
  arm: "arm",
}

const platform = platformMap[os.platform()] ?? os.platform()
const arch = archMap[os.arch()] ?? os.arch()
const base = `@mybcabisnis/mage-${platform}-${arch}`
const sourceBinary = platform === "windows" ? "mage.exe" : "mage"
const targetBinary = path.join(__dirname, "bin", "mage.exe")
const rgBinary = platform === "windows" ? "rg.exe" : "rg"
const targetRg = path.join(process.env.MAGE_TEST_HOME || os.homedir(), ".mage", "bin", rgBinary)
const rtkBinary = platform === "windows" ? "rtk.exe" : "rtk"
const targetRtk = path.join(process.env.MAGE_TEST_HOME || os.homedir(), ".mage", "bin", rtkBinary)
const npmExecutable = platform === "windows" ? "npm.cmd" : "npm"

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function mergeDefaults(target, source = DEFAULT_CONFIG) {
  return Object.entries(source).reduce(
    (result, [key, value]) => {
      if (!(key in result)) return { ...result, [key]: value }
      if (Array.isArray(result[key]) && Array.isArray(value)) {
        return { ...result, [key]: [...new Set([...result[key], ...value])] }
      }
      if (isRecord(result[key]) && isRecord(value)) return { ...result, [key]: mergeDefaults(result[key], value) }
      return result
    },
    { ...target },
  )
}

export function tryPackages(names, installed, download) {
  for (const name of names) {
    try {
      if (installed(name)) return true
    } catch {}
    try {
      if (download(name)) return true
    } catch {}
  }
  return false
}

function ensureGlobalConfig() {
  const configPath = path.join(os.homedir(), ".mage", "mage.json")
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n")
    return
  }

  try {
    const existing = JSON.parse(fs.readFileSync(configPath, "utf8"))
    if (!isRecord(existing)) throw new Error("config root must be an object")
    const merged = mergeDefaults(existing)
    if (JSON.stringify(existing) !== JSON.stringify(merged)) {
      fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + "\n")
    }
  } catch (error) {
    console.warn(`Could not update ${configPath}; leaving it untouched: ${error.message}`)
  }
}

function supportsAvx2() {
  if (arch !== "x64") return false

  if (platform === "linux") {
    try {
      return /(^|\s)avx2(\s|$)/i.test(fs.readFileSync("/proc/cpuinfo", "utf8"))
    } catch {
      return false
    }
  }

  if (platform === "darwin") {
    try {
      const result = childProcess.spawnSync("sysctl", ["-n", "hw.optional.avx2_0"], {
        encoding: "utf8",
        timeout: 1500,
      })
      if (result.status !== 0) return false
      return (result.stdout || "").trim() === "1"
    } catch {
      return false
    }
  }

  if (platform === "windows") {
    const command =
      '(Add-Type -MemberDefinition "[DllImport(""kernel32.dll"")] public static extern bool IsProcessorFeaturePresent(int ProcessorFeature);" -Name Kernel32 -Namespace Win32 -PassThru)::IsProcessorFeaturePresent(40)'

    for (const executable of ["powershell.exe", "pwsh.exe", "pwsh", "powershell"]) {
      try {
        const result = childProcess.spawnSync(executable, ["-NoProfile", "-NonInteractive", "-Command", command], {
          encoding: "utf8",
          timeout: 3000,
          windowsHide: true,
        })
        if (result.status !== 0) continue
        const output = (result.stdout || "").trim().toLowerCase()
        if (output === "true" || output === "1") return true
        if (output === "false" || output === "0") return false
      } catch {
        continue
      }
    }
  }

  return false
}

function isMusl() {
  if (platform !== "linux") return false

  try {
    if (fs.existsSync("/etc/alpine-release")) return true
  } catch {
    // Ignore filesystem probes that are blocked by the host.
  }

  try {
    const result = childProcess.spawnSync("ldd", ["--version"], { encoding: "utf8" })
    return `${result.stdout || ""}${result.stderr || ""}`.toLowerCase().includes("musl")
  } catch {
    return false
  }
}

function packageNames() {
  const baseline = arch === "x64" && !supportsAvx2()

  if (platform === "linux") {
    if (isMusl()) {
      if (arch === "x64")
        return baseline
          ? [`${base}-baseline-musl`, `${base}-musl`, `${base}-baseline`, base]
          : [`${base}-musl`, `${base}-baseline-musl`, base, `${base}-baseline`]
      return [`${base}-musl`, base]
    }

    if (arch === "x64")
      return baseline
        ? [`${base}-baseline`, base, `${base}-baseline-musl`, `${base}-musl`]
        : [base, `${base}-baseline`, `${base}-musl`, `${base}-baseline-musl`]
    return [base, `${base}-musl`]
  }

  if (arch === "x64") return baseline ? [`${base}-baseline`, base] : [base, `${base}-baseline`]
  return [base]
}

function resolvePackage(name) {
  const packageJsonPath = require.resolve(`${name}/package.json`)
  const packageDir = path.dirname(packageJsonPath)
  const binaryPath = path.join(packageDir, "bin", sourceBinary)
  if (!fs.existsSync(binaryPath)) throw new Error(`Binary not found at ${binaryPath}`)
  return packageDir
}

function installPackage(name) {
  const version = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8")).optionalDependencies?.[name]
  if (!version) return

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "mage-install-"))
  try {
    const result = childProcess.spawnSync(
      npmExecutable,
      ["install", "--ignore-scripts", "--no-save", "--loglevel=error", "--prefix", temp, `${name}@${version}`],
      { stdio: "inherit", windowsHide: true },
    )
    if (result.status !== 0) return
    const packageDir = path.join(temp, "node_modules", name)
    copyPackage(packageDir)
    return true
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
}

function copyBinary(source, target) {
  if (!fs.existsSync(source)) throw new Error(`Binary not found at ${source}`)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  if (fs.existsSync(target)) fs.unlinkSync(target)
  try {
    fs.linkSync(source, target)
  } catch {
    fs.copyFileSync(source, target)
  }
  fs.chmodSync(target, 0o755)
}

function copyPackage(packageDir) {
  copyBinary(path.join(packageDir, "bin", sourceBinary), targetBinary)
  const sourceRg = path.join(packageDir, "bin", rgBinary)
  if (fs.existsSync(sourceRg)) copyBinary(sourceRg, targetRg)
  const sourceRtk = path.join(packageDir, "bin", rtkBinary)
  copyBinary(sourceRtk, targetRtk)
}

function verifyBinary() {
  const result = childProcess.spawnSync(targetBinary, ["--version"], {
    encoding: "utf8",
    stdio: "ignore",
    windowsHide: true,
  })
  return result.status === 0
}

function verifyRtk() {
  const version = childProcess.spawnSync(targetRtk, ["--version"], {
    encoding: "utf8",
    windowsHide: true,
  })
  if (version.status !== 0) return false

  const result = childProcess.spawnSync(targetRtk, ["rewrite", "git status"], {
    encoding: "utf8",
    windowsHide: true,
  })
  return (result.stdout || "").trim() === "rtk git status"
}

function main() {
  ensureGlobalConfig()
  if (
    tryPackages(
      packageNames(),
      (name) => {
        copyPackage(resolvePackage(name))
        return verifyBinary() && verifyRtk()
      },
      (name) => Boolean(installPackage(name) && verifyBinary() && verifyRtk()),
    )
  )
    return

  throw new Error(
    `It seems your package manager failed to install the right Mage CLI and RTK package. Try manually installing ${packageNames()
      .map((name) => JSON.stringify(name))
      .join(" or ")}.`,
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
