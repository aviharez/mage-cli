#!/usr/bin/env bun
import { $ } from "bun"
import { resolve } from "path"

import { resolveChannel } from "./utils"

const channel = resolveChannel()
await $`bun ./scripts/copy-icons.ts ${channel}`
await $`bun ./scripts/copy-metainfo.ts ${channel}`

// Download ripgrep for BOTH macOS (rg) and Windows (rg.exe) into resources/rg/ so
// every build/package target ships it (electron-builder extraResources) and the
// first launch can seed ~/.mage/bin without a network fetch (mirrors postinstall.mjs).
await $`bun ./scripts/download-rg.ts`

// Build the runtime shim for `@mybcabisnis/mage-plugin` (zod bundled in) so the
// packaged default file-plugins can resolve it — electron-builder copies this
// into resources/defaults/node_modules/@mybcabisnis/mage-plugin (see config).
await $`bun build ./scripts/plugin-shim/index.ts --target node --format esm --outfile ./resources/plugin-shim/index.js`
await Bun.write(
  "./resources/plugin-shim/package.json",
  JSON.stringify(
    {
      name: "@mybcabisnis/mage-plugin",
      version: "1.1.0",
      type: "module",
      exports: { ".": "./index.js", "./tool": "./index.js", "./tui": "./index.js" },
    },
    null,
    2,
  ) + "\n",
)

// Bundle zod + yaml so the packaged default plugins (defaults/plugin/boilerplate.ts)
// can resolve their direct `import "zod"` / `import "yaml"`. Same rationale as the
// mage-plugin shim above: the packaged app has no monorepo node_modules. In dev
// these resolve from packages/opencode/node_modules — plugin source is left untouched.
// Absolute path to opencode's node_modules so the entry files can import zod/yaml
// regardless of where they're written (Bun resolves bare specifiers relative to
// the entry file's location, not to the script's cwd).
const opencodeNodeModules = resolve(import.meta.dir, "../../opencode/node_modules")

for (const dep of ["zod", "yaml"] as const) {
  // Temporary entry file — re-exports everything from the dep's actual install location.
  // zod and yaml are opencode deps (not desktop deps); using the absolute path avoids
  // adding them to desktop's package.json and always bundles the exact version the plugin uses.
  const entry = `./resources/dep-shim/${dep}-entry.ts`
  await Bun.write(entry, `export * from "${opencodeNodeModules}/${dep}"\n`)
  const result = await Bun.build({
    target: "node",
    entrypoints: [entry],
    outdir: `./resources/dep-shim/${dep}`,
    format: "esm",
    naming: "index.js",
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    throw new Error(`Failed to bundle dep-shim for ${dep}`)
  }
  await Bun.write(
    `./resources/dep-shim/${dep}/package.json`,
    JSON.stringify(
      { name: dep, version: "0.0.0-bundled", type: "module", exports: { ".": "./index.js" } },
      null,
      2,
    ) + "\n",
  )
  console.log(`Bundled dep-shim for ${dep}`)
}

await $`cd ../opencode && bun script/build-node.ts`
