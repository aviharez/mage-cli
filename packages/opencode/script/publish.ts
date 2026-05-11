#!/usr/bin/env bun
import { $ } from "bun"
import fs from "fs"
import path from "path"
import pkg from "../package.json"
import { Script } from "@mybcabisnis/mage-script"
import { fileURLToPath } from "url"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

const DEFAULTS_DIR_EXCLUDES = new Set(["node_modules"])

function copyDirExcluding(src: string, dest: string, excludes: Set<string>) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (excludes.has(entry.name)) continue
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirExcluding(srcPath, destPath, new Set())
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

async function publish(dir: string, name: string, version: string) {
  // GitHub artifact downloads can drop the executable bit, and Docker uses the
  // unpacked dist binaries directly rather than the published tarball.
  if (process.platform !== "win32") await $`chmod -R 755 .`.cwd(dir)

  await $`bun pm pack`.cwd(dir)
  await $`npm publish *.tgz --access public --tag ${Script.channel}`.cwd(dir)
}

const binaries: Record<string, string> = {}
for (const filepath of new Bun.Glob("*/package.json").scanSync({ cwd: "./dist" })) {
  const pkg = await Bun.file(`./dist/${filepath}`).json()
  binaries[pkg.name] = pkg.version
}
console.log("binaries", binaries)
const version = Object.values(binaries)[0]

await $`mkdir -p ./dist/${pkg.name}`
await $`cp -r ./bin ./dist/${pkg.name}/bin`
await $`cp ./script/postinstall.mjs ./dist/${pkg.name}/postinstall.mjs`
await Bun.file(`./dist/${pkg.name}/LICENSE`).write(await Bun.file("../../LICENSE").text())

const defaultsDir = path.resolve(dir, "./defaults")
if (fs.existsSync(defaultsDir)) {
  const destDefaultsDir = path.join("./dist", pkg.name, "defaults")
  copyDirExcluding(defaultsDir, destDefaultsDir, DEFAULTS_DIR_EXCLUDES)

  // Bundle each plugin .ts into a self-contained .js using bun build so the
  // installed package has no node_modules dependency — no registry or network
  // access needed on the user's machine at postinstall or first boot.
  const srcPluginDir = path.join(defaultsDir, "plugin")
  const destPluginDir = path.join(destDefaultsDir, "plugin")
  if (fs.existsSync(srcPluginDir)) {
    fs.mkdirSync(destPluginDir, { recursive: true })
    for (const f of fs.readdirSync(srcPluginDir)) {
      if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue
      const src = path.join(srcPluginDir, f)
      const outfile = path.join(destPluginDir, f.replace(/\.ts$/, ".js"))
      console.log(`Bundling plugin ${f}...`)
      await $`bun build ${src} --outfile ${outfile} --target bun`
      // Remove the copied .ts — the loader will use the .js bundle instead
      const copiedTs = path.join(destPluginDir, f)
      if (fs.existsSync(copiedTs)) fs.rmSync(copiedTs)
    }
  }

  console.log(`Bundled defaults/ into dist package`)
}

// Vendor @mybcabisnis/mage-sdk and @mybcabisnis/mage-plugin so postinstall
// can install them into ~/.mage/node_modules/ without BCA registry credentials.
// New users won't have Artifactory auth configured, so we ship the compiled
// dist directly inside the package and install from the local path at postinstall.
{
  const rootPkgData = JSON.parse(fs.readFileSync(path.resolve(dir, "../../package.json"), "utf8"))
  const catalog: Record<string, string> =
    (rootPkgData as any).workspaces?.catalog ?? (rootPkgData as any).catalog ?? {}

  const internalPkgDirs = [
    path.resolve(dir, "../sdk/js"),   // must come first — plugin depends on sdk
    path.resolve(dir, "../plugin"),
  ]

  // Collect workspace package versions for resolving workspace:* references
  const workspaceVersions: Record<string, string> = {}
  for (const pkgDir of internalPkgDirs) {
    const p = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"))
    workspaceVersions[p.name] = p.version
  }

  function resolveDepsForVendor(deps: Record<string, string> = {}): Record<string, string> {
    return Object.fromEntries(
      Object.entries(deps).map(([name, ver]) => {
        if (ver === "catalog:" || ver === "catalog:default") return [name, catalog[name] ?? ver]
        if (ver.startsWith("workspace:")) return [name, workspaceVersions[name] ?? ver]
        return [name, ver]
      }),
    )
  }

  function transformVendorExports(exports: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(exports).map(([key, value]) => {
        if (typeof value === "string") {
          const file = value.replace("./src/", "./dist/").replace(/\.ts$/, "")
          return [key, { import: file + ".js", types: file + ".d.ts" }]
        }
        if (typeof value === "object" && value !== null && !Array.isArray(value))
          return [key, transformVendorExports(value as Record<string, unknown>)]
        return [key, value]
      }),
    )
  }

  const vendorBaseDir = path.join("./dist", pkg.name, "vendor")
  for (const pkgDir of internalPkgDirs) {
    const rawPkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"))
    const distDir = path.join(pkgDir, "dist")
    if (!fs.existsSync(distDir)) {
      console.warn(`[vendor] dist/ not found for ${rawPkg.name} — run 'bun run build' first`)
      continue
    }
    // Handle scoped names like @mybcabisnis/mage-plugin → vendor/@mybcabisnis/mage-plugin
    const destDir = path.join(vendorBaseDir, ...rawPkg.name.split("/"))
    fs.mkdirSync(destDir, { recursive: true })
    copyDirExcluding(distDir, path.join(destDir, "dist"), new Set())
    const vendorPkg: Record<string, unknown> = {
      name: rawPkg.name,
      version: rawPkg.version,
      type: rawPkg.type,
      license: rawPkg.license,
      exports: rawPkg.exports ? transformVendorExports(rawPkg.exports) : undefined,
      ...(rawPkg.dependencies ? { dependencies: resolveDepsForVendor(rawPkg.dependencies) } : {}),
      ...(rawPkg.peerDependencies ? { peerDependencies: rawPkg.peerDependencies } : {}),
      ...(rawPkg.peerDependenciesMeta ? { peerDependenciesMeta: rawPkg.peerDependenciesMeta } : {}),
    }
    fs.writeFileSync(path.join(destDir, "package.json"), JSON.stringify(vendorPkg, null, 2))
    console.log(`[vendor] bundled ${rawPkg.name}@${rawPkg.version}`)
  }
}

await Bun.file(`./dist/${pkg.name}/package.json`).write(
  JSON.stringify(
    {
      name: pkg.name,
      bin: pkg.bin,
      scripts: {
        postinstall: "bun ./postinstall.mjs || node ./postinstall.mjs",
      },
      version: version,
      license: pkg.license,
      publishConfig: (pkg as any).publishConfig,
      optionalDependencies: binaries,
      // Explicitly list files so bun pm pack includes dotfolders like .mage/
      files: ["defaults", "bin", "postinstall.mjs", "LICENSE", "vendor"],
    },
    null,
    2,
  ),
)

const tasks = Object.entries(binaries).map(async ([pkgName]) => {
  const dirName = pkgName.replace(/^@[^/]+\//, "")
  await publish(`./dist/${dirName}`, pkgName, binaries[pkgName])
})
await Promise.all(tasks)
await publish(`./dist/${pkg.name}`, pkg.name, version)

