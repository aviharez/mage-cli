#!/usr/bin/env bun

import { Script } from "@mybcabisnis/mage-script"
import { $ } from "bun"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

const REGISTRY =
  process.env.MAGE_NPM_REGISTRY ?? "https://artifactory.intra.bca.co.id/artifactory/api/npm/MBB-Registry-npm/"
const DRY_RUN = process.env.MAGE_PUBLISH_DRY_RUN === "1"

// Read catalog versions from workspace root package.json
const rootPkg = (await Bun.file(path.resolve(dir, "../../../package.json")).json()) as {
  catalog?: Record<string, string>
  workspaces?: { catalog?: Record<string, string> }
}
const catalog: Record<string, string> = rootPkg.workspaces?.catalog ?? rootPkg.catalog ?? {}

function resolveDeps(deps: Record<string, string> = {}): Record<string, string> {
  return Object.fromEntries(
    Object.entries(deps).map(([name, ver]) => {
      if (ver === "catalog:" || ver === "catalog:default") {
        const resolved = catalog[name]
        if (!resolved) throw new Error(`catalog entry missing for '${name}'`)
        return [name, resolved]
      }
      return [name, ver]
    }),
  )
}

async function published(name: string, version: string) {
  return (await $`npm view ${name}@${version} version --registry ${REGISTRY}`.nothrow()).exitCode === 0
}

const originalText = await Bun.file("package.json").text()
const pkg = JSON.parse(originalText) as {
  name: string
  version: string
  exports: Record<string, unknown>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  version: string
}

function transformExports(exports: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(exports).map(([key, value]) => {
      if (typeof value === "string") {
        const file = value.replace("./src/", "./dist/").replace(".ts", "")
        return [key, { import: file + ".js", types: file + ".d.ts" }]
      }
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        return [key, transformExports(value as Record<string, unknown>)]
      }
      return [key, value]
    }),
  )
}

if (!DRY_RUN && (await published(pkg.name, Script.version))) {
  console.log(`already published ${pkg.name}@${Script.version}`)
} else {
  pkg.version = Script.version
  pkg.exports = transformExports(pkg.exports)

  // Resolve catalog: markers to real versions before packing
  if (pkg.dependencies) pkg.dependencies = resolveDeps(pkg.dependencies)
  if (pkg.devDependencies) pkg.devDependencies = resolveDeps(pkg.devDependencies)
  if (pkg.peerDependencies) pkg.peerDependencies = resolveDeps(pkg.peerDependencies)
  if (pkg.optionalDependencies) pkg.optionalDependencies = resolveDeps(pkg.optionalDependencies)

  await Bun.write("package.json", JSON.stringify(pkg, null, 2))
  try {
    await $`bun pm pack`
    if (DRY_RUN) {
      console.log(`[dry-run] packed ${pkg.name}@${Script.version}`)
    } else {
      await $`npm publish *.tgz --tag ${Script.channel} --access public --registry ${REGISTRY}`
    }
  } finally {
    await Bun.write("package.json", originalText)
    for (const file of fs.readdirSync(".")) {
      if (file.endsWith(".tgz")) fs.rmSync(file, { force: true })
    }
  }
}
