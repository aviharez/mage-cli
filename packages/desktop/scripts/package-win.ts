#!/usr/bin/env bun
//
// Build and package the Windows desktop app. Designed to run on any host
// (including macOS / Jenkins-on-mac): it targets win32 explicitly so the bundle
// references the win32 native module, stages that prebuilt binary, then packages.

import { $ } from "bun"

const arch = Bun.env.MAGE_TARGET_ARCH || "x64"

process.env.MAGE_CHANNEL = "prod"
process.env.MAGE_TARGET_PLATFORM = "win32"
process.env.MAGE_TARGET_ARCH = arch

// 1. Build server + main + renderer. With MAGE_TARGET_PLATFORM=win32 the main
//    bundle externalizes/imports @lydell/node-pty-win32-${arch} instead of the host's.
await $`bun run build`

// 2. Download the win32 prebuilt native modules that bun skips on a non-win host.
await $`bun ./scripts/stage-native.ts win32 ${arch}`

// 3. Package the NSIS installer.
await $`electron-builder --win --${arch} --config electron-builder.config.ts`
