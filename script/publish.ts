#!/usr/bin/env bun

import { $ } from "bun"
import fs from "fs"
import os from "os"
import path from "path"

const root = path.resolve(import.meta.dirname, "..")
const releaseMetadataFile = path.join(root, ".mage-release-metadata")
if (!process.env.MAGE_VERSION && fs.existsSync(releaseMetadataFile)) {
  const metadata = JSON.parse(fs.readFileSync(releaseMetadataFile, "utf8")) as { version?: string; channel?: string }
  if (metadata.version) process.env.MAGE_VERSION = metadata.version
  if (!process.env.MAGE_CHANNEL && metadata.channel) process.env.MAGE_CHANNEL = metadata.channel
}
const { Script } = await import("@mybcabisnis/mage-script")
const registry =
  process.env.MAGE_NPM_REGISTRY ?? "https://artifactory.intra.bca.co.id/artifactory/api/npm/MBB-Registry-npm/"
const dryRun = process.env.MAGE_PUBLISH_DRY_RUN === "1"

process.chdir(root)
process.env.MAGE_VERSION ??= Script.version
process.env.MAGE_CHANNEL ??= Script.channel

const packagePaths = {
  mage: path.join(root, "packages/mage/package.json"),
  sdk: path.join(root, "packages/sdk/js/package.json"),
  plugin: path.join(root, "packages/plugin/package.json"),
  web: path.join(root, "packages/web-react/package.json"),
}

const packages = await Promise.all(
  Object.entries(packagePaths).map(async ([key, filepath]) => [key, await Bun.file(filepath).json()] as const),
)
const packageMap = Object.fromEntries(packages) as Record<string, { name: string; version?: string }>
const sourceVersions = Object.values(packageMap)
  .map((pkg) => pkg.version)
  .filter(Boolean)

if (!Script.preview && new Set(sourceVersions).size > 1) {
  throw new Error(`Release package versions disagree: ${sourceVersions.join(", ")}`)
}

for (const directory of ["packages/sdk/js/dist", "packages/plugin/dist", "packages/web-react/dist", "packages/mage/dist"]) {
  if (!fs.existsSync(path.join(root, directory))) {
    throw new Error(`Missing ${directory}; run bun run build:release first`)
  }
}

const rootPackage = (await Bun.file(path.join(root, "package.json")).json()) as {
  workspaces?: { catalog?: Record<string, string> }
  catalog?: Record<string, string>
}
const catalog = rootPackage.workspaces?.catalog ?? rootPackage.catalog ?? {}

function resolveDependencies(dependencies: Record<string, string> = {}) {
  return Object.fromEntries(
    Object.entries(dependencies).map(([name, version]) => {
      if (version === "catalog:" || version === "catalog:default") {
        const resolved = catalog[name]
        if (!resolved) throw new Error(`Missing catalog entry for ${name}`)
        return [name, resolved]
      }
      if (version.startsWith("workspace:")) return [name, Script.version]
      return [name, version]
    }),
  )
}

async function isPublished(name: string, version: string) {
  return (await $`npm view ${name}@${version} version --registry ${registry}`.nothrow()).exitCode === 0
}

async function publishDirectory(directory: string, name: string) {
  if (!dryRun && (await isPublished(name, Script.version))) {
    console.log(`already published ${name}@${Script.version}`)
    return
  }

  await $`bun pm pack`.cwd(directory)
  if (dryRun) {
    console.log(`[dry-run] packed ${name}@${Script.version}`)
    return
  }
  await $`npm publish *.tgz --access public --tag ${Script.channel} --registry ${registry}`.cwd(directory)
}

async function stageWebPackage() {
  const source = packageMap.web as typeof packageMap.web & {
    type: string
    license?: string
    dependencies?: Record<string, string>
    files?: string[]
    publishConfig?: Record<string, unknown>
  }
  const stage = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mage-web-publish-"))

  for (const entry of ["dist", "server", "bin", "public", "README.md"]) {
    const sourcePath = path.join(root, "packages/web-react", entry)
    if (fs.existsSync(sourcePath)) fs.cpSync(sourcePath, path.join(stage, entry), { recursive: true })
  }

  await Bun.write(
    path.join(stage, "package.json"),
    JSON.stringify(
      {
        ...source,
        version: Script.version,
        private: undefined,
        dependencies: resolveDependencies(source.dependencies),
        devDependencies: undefined,
        publishConfig: { ...source.publishConfig, access: "public", registry },
      },
      null,
      2,
    ),
  )

  try {
    await publishDirectory(stage, source.name)
  } finally {
    await fs.promises.rm(stage, { recursive: true, force: true })
  }
}

console.log(`Preparing Mage release ${Script.version} (${Script.channel})`)
await $`bun run publish`.cwd(path.join(root, "packages/sdk/js"))
await $`bun run publish`.cwd(path.join(root, "packages/plugin"))
await stageWebPackage()
await $`bun run publish`.cwd(path.join(root, "packages/mage"))
