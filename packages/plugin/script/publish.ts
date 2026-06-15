#!/usr/bin/env bun
import { Script } from "@mybcabisnis/mage-script"
import { $ } from "bun"
import path from "path"
import { fileURLToPath } from "url"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

const REGISTRY = "https://artifactory.intra.bca.co.id/artifactory/api/npm/MBB-Registry-npm/"

// Read catalog versions from workspace root package.json
const rootPkg = await Bun.file(path.resolve(dir, "../../package.json")).json() as {
  version?: string
  catalog?: Record<string, string>
  workspaces?: { catalog?: Record<string, string> }
}
const catalog: Record<string, string> = rootPkg.workspaces?.catalog ?? rootPkg.catalog ?? {}

// Read workspace package versions so workspace:* can be pinned
const workspacePkgs: Record<string, string> = {}
for (const pkgPath of ["../sdk/js/package.json"]) {
  const p = await Bun.file(path.resolve(dir, pkgPath)).json() as { name: string; version: string }
  workspacePkgs[p.name] = p.version
}

function resolveDeps(deps: Record<string, string> = {}): Record<string, string> {
  return Object.fromEntries(
    Object.entries(deps).map(([name, ver]) => {
      if (ver === "catalog:" || ver === "catalog:default") {
        const resolved = catalog[name]
        if (!resolved) throw new Error(`catalog entry missing for '${name}'`)
        return [name, resolved]
      }
      if (ver.startsWith("workspace:")) {
        const resolved = workspacePkgs[name]
        if (!resolved) throw new Error(`workspace package '${name}' not found`)
        return [name, resolved]
      }
      return [name, ver]
    }),
  )
}

async function published(name: string, version: string) {
  return (await $`npm view ${name}@${version} version --registry ${REGISTRY}`.nothrow()).exitCode === 0
}

await $`bun tsc`

const originalText = await Bun.file("package.json").text()
const pkg = JSON.parse(originalText) as {
  name: string
  version: string
  exports: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

if (await published(pkg.name, pkg.version)) {
  console.log(`already published ${pkg.name}@${pkg.version}`)
} else {
  // Rewrite exports: src/*.ts → dist/*.{js,d.ts}
  for (const [key, value] of Object.entries(pkg.exports)) {
    const file = value.replace("./src/", "./dist/").replace(".ts", "")
    // @ts-ignore
    pkg.exports[key] = {
      import: file + ".js",
      types: file + ".d.ts",
    }
  }

  // Resolve workspace:* and catalog: markers so the published package.json
  // has real version ranges that consumers can install.
  if (pkg.dependencies) pkg.dependencies = resolveDeps(pkg.dependencies)
  if (pkg.devDependencies) pkg.devDependencies = resolveDeps(pkg.devDependencies)
  if (pkg.peerDependencies) pkg.peerDependencies = resolveDeps(pkg.peerDependencies)
  if (pkg.optionalDependencies) pkg.optionalDependencies = resolveDeps(pkg.optionalDependencies)

  await Bun.write("package.json", JSON.stringify(pkg, null, 2))
  try {
    await $`bun pm pack`
    await $`npm publish *.tgz --tag ${Script.channel} --access public`
  } finally {
    await Bun.write("package.json", originalText)
  }
}
