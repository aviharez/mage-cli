#!/usr/bin/env bun

import { $ } from "bun"
import fs from "fs"
import os from "os"
import path from "path"
import { Script } from "@mybcabisnis/mage-script"

const dir = path.resolve(import.meta.dirname, "..")
const root = path.resolve(dir, "../..")
const registry =
  process.env.MAGE_NPM_REGISTRY ?? "https://artifactory.intra.bca.co.id/artifactory/api/npm/MBB-Registry-npm/"
const dryRun = process.env.MAGE_PUBLISH_DRY_RUN === "1"

process.chdir(dir)

const rootPackage = (await Bun.file(path.join(root, "package.json")).json()) as {
  workspaces?: { catalog?: Record<string, string> }
  catalog?: Record<string, string>
}
const catalog = rootPackage.workspaces?.catalog ?? rootPackage.catalog ?? {}
const sourcePackage = (await Bun.file("package.json").json()) as {
  name: string
  license?: string
  type?: string
  exports: Record<string, unknown>
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, unknown>
}
const workspaceVersions: Record<string, string> = {}

for (const packagePath of [
  path.join(root, "packages/sdk/js/package.json"),
  path.join(root, "packages/plugin/package.json"),
]) {
  const packageJson = (await Bun.file(packagePath).json()) as { name: string; version: string }
  workspaceVersions[packageJson.name] = Script.version
}

function resolveDependencies(dependencies: Record<string, string> = {}) {
  return Object.fromEntries(
    Object.entries(dependencies).map(([name, version]) => {
      if (version === "catalog:" || version === "catalog:default") {
        const resolved = catalog[name]
        if (!resolved) throw new Error(`Missing catalog entry for ${name}`)
        return [name, resolved]
      }
      if (version.startsWith("workspace:")) {
        const resolved = workspaceVersions[name]
        if (!resolved) throw new Error(`Missing workspace version for ${name}`)
        return [name, resolved]
      }
      return [name, version]
    }),
  )
}

function transformExports(exports: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(exports).map(([key, value]) => {
      if (typeof value === "string") {
        const file = value.replace("./src/", "./dist/").replace(/\.ts$/, "")
        return [key, { import: `${file}.js`, types: `${file}.d.ts` }]
      }
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return [key, transformExports(value as Record<string, unknown>)]
      }
      return [key, value]
    }),
  )
}

async function isPublished(name: string, version: string) {
  return (await $`npm view ${name}@${version} version --registry ${registry}`.nothrow()).exitCode === 0
}

async function publish(stagedDir: string) {
  if (!dryRun && (await isPublished(sourcePackage.name, Script.version))) {
    console.log(`already published ${sourcePackage.name}@${Script.version}`)
    return
  }

  await $`bun pm pack`.cwd(stagedDir)
  if (dryRun) {
    console.log(`[dry-run] packed ${sourcePackage.name}@${Script.version}`)
    return
  }

  await $`npm publish *.tgz --access public --tag ${Script.channel} --registry ${registry}`.cwd(stagedDir)
}

const stage = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mage-plugin-publish-"))
try {
  fs.cpSync("dist", path.join(stage, "dist"), { recursive: true })
  await Bun.write(
    path.join(stage, "package.json"),
    JSON.stringify(
      {
        name: sourcePackage.name,
        version: Script.version,
        type: sourcePackage.type,
        license: sourcePackage.license,
        exports: transformExports(sourcePackage.exports),
        files: ["dist"],
        dependencies: resolveDependencies(sourcePackage.dependencies),
        peerDependencies: sourcePackage.peerDependencies,
        peerDependenciesMeta: sourcePackage.peerDependenciesMeta,
        publishConfig: { access: "public", registry },
      },
      null,
      2,
    ),
  )
  await publish(stage)
} finally {
  await fs.promises.rm(stage, { recursive: true, force: true })
}
