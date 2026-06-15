#!/usr/bin/env bun
import { $, Glob } from "bun"
import { resolve } from "path"

import { resolveChannel } from "./utils"

const channel = resolveChannel()
await $`bun ./scripts/copy-icons.ts ${channel}`
await $`bun ./scripts/copy-metainfo.ts ${channel}`

// Download ripgrep for BOTH macOS (rg) and Windows (rg.exe) into resources/rg/ so
// every build/package target ships it (electron-builder extraResources) and the
// first launch can seed ~/.mage/bin without a network fetch (mirrors postinstall.mjs).
await $`bun ./scripts/download-rg.ts`

// Pre-bundle every defaults/plugin/*.ts into a self-contained ESM .js so the
// packaged sidecar (plain Node, no monorepo node_modules) can import them without
// needing a synthesized node_modules tree. All bare deps — @mybcabisnis/mage-plugin,
// zod, yaml — are inlined by Bun.build. electron-builder copies these .js files
// into <resourcesPath>/defaults/plugin/ (see config). Dev is untouched: the loader
// discovers the raw .ts first (same directory, same Glob pattern) and they resolve
// deps from packages/opencode/node_modules as before.
const pluginSrcDir = resolve(import.meta.dir, "../../opencode/defaults/plugin")
const pluginsOutDir = "./resources/plugins-bundled"

await Bun.write(pluginsOutDir + "/.keep", "") // ensure dir exists

const pluginFiles: string[] = Array.from(new Glob("*.ts").scanSync({ cwd: pluginSrcDir }))

for (const file of pluginFiles) {
  const entrypoint = resolve(pluginSrcDir, file)
  const outName = file.replace(/\.ts$/, ".js")
  const result = await Bun.build({
    target: "node",
    entrypoints: [entrypoint],
    outdir: pluginsOutDir,
    format: "esm",
    naming: outName,
    // Node built-ins stay external; everything else (zod, yaml, mage-plugin) is bundled.
    external: ["node:*", "fs", "path", "os", "child_process", "stream", "util", "events", "crypto"],
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    throw new Error(`Failed to bundle default plugin: ${file}`)
  }
  console.log(`Bundled default plugin: ${file} → ${outName}`)
}

await $`cd ../opencode && bun script/build-node.ts`
