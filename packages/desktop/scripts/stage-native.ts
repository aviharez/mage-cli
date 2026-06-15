#!/usr/bin/env bun
//
// Stage prebuilt native modules for a target platform/arch into the desktop
// package's node_modules so electron-builder can pack them.
//
// Why this exists: @lydell/node-pty and @parcel/watcher ship platform-specific
// prebuilt (N-API) binaries as optionalDependencies. Package managers SKIP the
// ones whose `os`/`cpu` don't match the build host, so a macOS machine never
// downloads the win32 binaries. Without them, a cross-built Windows app ends up
// shipping the macOS .node files, the sidecar server crashes on launch, and the
// window stays blank.
//
// `npm pack` ignores the os/cpu filter (it only downloads, never "installs") and
// honors the repo .npmrc (registry, scope auth, proxy), so we use it to fetch the
// exact pinned versions and extract them into place.
//
// Usage: bun ./scripts/stage-native.ts [platform] [arch]
//   platform/arch default to MAGE_TARGET_PLATFORM/MAGE_TARGET_ARCH, then the host.

import { $ } from "bun"
import { existsSync } from "node:fs"
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const desktopDir = resolve(import.meta.dir, "..")
const platform = process.argv[2] || Bun.env.MAGE_TARGET_PLATFORM || process.platform
const arch = process.argv[3] || Bun.env.MAGE_TARGET_ARCH || process.arch

const pkg = await Bun.file(join(desktopDir, "package.json")).json()
const optional: Record<string, string> = pkg.optionalDependencies ?? {}

// @parcel/watcher names linux builds with a libc suffix; win32/darwin have none.
const libc = platform === "linux" ? (Bun.env.MAGE_TARGET_LIBC === "musl" ? "-musl" : "-glibc") : ""
const targets = [
  `@lydell/node-pty-${platform}-${arch}`,
  platform === "linux" ? `@parcel/watcher-linux-${arch}${libc}` : `@parcel/watcher-${platform}-${arch}`,
]

console.log(`Staging native modules for ${platform}-${arch}`)

for (const name of targets) {
  const version = optional[name]
  if (!version) {
    console.error(`✗ ${name} is not pinned in optionalDependencies of package.json; cannot stage it`)
    process.exit(1)
  }

  const dest = join(desktopDir, "node_modules", name)
  const destPkg = join(dest, "package.json")
  if (existsSync(destPkg)) {
    const current = await Bun.file(destPkg)
      .json()
      .catch(() => ({}) as { version?: string })
    if (current.version === version) {
      console.log(`• ${name}@${version} already present, skipping`)
      continue
    }
  }

  const tmp = await mkdtemp(join(tmpdir(), "mage-native-"))
  try {
    // npm pack writes <scope-without-@>-<name>-<version>.tgz (slash -> dash).
    const tgz = `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`
    await $`npm pack ${name}@${version} --pack-destination ${tmp}`.cwd(desktopDir).quiet()
    await $`tar -xzf ${join(tmp, tgz)} -C ${tmp}`.quiet()

    await rm(dest, { recursive: true, force: true })
    await mkdir(resolve(dest, ".."), { recursive: true })
    await cp(join(tmp, "package"), dest, { recursive: true })
    console.log(`✓ staged ${name}@${version}`)
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

console.log("Native staging complete")
