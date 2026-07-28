#!/usr/bin/env bun
// import { $ } from "bun"
// import pkg from "../package.json"
// import { Script } from "@mybcabisnis/mage-script"
// import { fileURLToPath } from "url"

// const dir = fileURLToPath(new URL("..", import.meta.url))
// process.chdir(dir)

// const registry = "https://artifactory.intra.bca.co.id/artifactory/api/npm/MBB-Registry-npm/"

// async function published(name: string, version: string) {
//   return (await $`npm view ${name}@${version} version --registry ${registry}`.nothrow()).exitCode === 0
// }

// async function publish(dir: string, name: string, version: string) {
//   // GitHub artifact downloads can drop the executable bit, and Docker uses the
//   // unpacked dist binaries directly rather than the published tarball.
//   if (process.platform !== "win32") await $`chmod -R 755 .`.cwd(dir)
//   if (await published(name, version)) {
//     console.log(`already published ${name}@${version}`)
//     return
//   }
//   await $`bun pm pack`.cwd(dir)
//   await $`npm publish *.tgz --access public --tag ${Script.channel} --registry ${registry}`.cwd(dir)
// }

// // pkg.name is scoped (@mybcabisnis/mage); derive the unscoped "mage" form for
// // anything that becomes a bin command name or local filename, since neither
// // npm bin keys nor plain filenames may contain "/".
// const pkgMage = pkg.name.replaceAll("@mybcabisnis/", "")

// const binaries: Record<string, string> = {}
// // Per-platform packages publish under the @mybcabisnis scope, so their
// // package.json sits two levels deep (dist/@mybcabisnis/mage-*/package.json).
// for (const filepath of new Bun.Glob("{*/package.json,*/*/package.json}").scanSync({ cwd: "./dist" })) {
//   const pkg = await Bun.file(`./dist/${filepath}`).json()
//   binaries[pkg.name] = pkg.version
// }
// console.log("binaries", binaries)
// const version = Object.values(binaries)[0]

// await $`mkdir -p ./dist/${pkg.name}`
// await $`mkdir -p ./dist/${pkg.name}/bin`
// await $`cp ./script/postinstall.mjs ./dist/${pkg.name}/postinstall.mjs`
// await $`cp -r ./defaults ./dist/${pkg.name}/defaults`
// await Bun.file(`./dist/${pkg.name}/LICENSE`).write(await Bun.file("../../LICENSE").text())
// await Bun.file(`./dist/${pkg.name}/bin/${pkgMage}.exe`).write(
//   [
//     `echo "Error: ${pkg.name}-ai's postinstall script was not run." >&2`,
//     'echo "" >&2',
//     'echo "This occurs when using --ignore-scripts during installation, or when using a" >&2',
//     'echo "package manager like pnpm that does not run postinstall scripts by default." >&2',
//     'echo "" >&2',
//     'echo "To fix this, run the postinstall script manually:" >&2',
//     `echo "  cd node_modules/${pkg.name}-ai && node postinstall.mjs" >&2`,
//     'echo "" >&2',
//     `echo "Or reinstall ${pkg.name}-ai without the --ignore-scripts flag." >&2`,
//     "exit 1",
//     "",
//   ].join("\n"),
// )

// await Bun.file(`./dist/${pkg.name}/package.json`).write(
//   JSON.stringify(
//     {
//       name: pkg.name + "-ai",
//       bin: {
//         [pkgMage]: `./bin/${pkgMage}.exe`,
//       },
//       scripts: {
//         postinstall: "node ./postinstall.mjs",
//       },
//       version: version,
//       license: pkg.license,
//       os: ["darwin", "linux", "win32"],
//       cpu: ["arm64", "x64"],
//       optionalDependencies: binaries,
//     },
//     null,
//     2,
//   ),
// )

// const tasks = Object.entries(binaries).map(async ([name]) => {
//   await publish(`./dist/${name}`, name, binaries[name])
// })
// await Promise.all(tasks)
// await publish(`./dist/${pkg.name}`, `${pkg.name}-ai`, version)

// const image = "ghcr.io/anomalyco/opencode"
// const platforms = "linux/amd64,linux/arm64"
// const tags = [`${image}:${version}`, `${image}:${Script.channel}`]
// const tagFlags = tags.flatMap((t) => ["-t", t])

// // registries
// if (!Script.preview) {
//   await $`docker buildx build --platform ${platforms} ${tagFlags} --push .`
//   // Calculate SHA values
//   const arm64Sha = await $`sha256sum ./dist/mage-linux-arm64.tar.gz | cut -d' ' -f1`.text().then((x) => x.trim())
//   const x64Sha = await $`sha256sum ./dist/mage-linux-x64.tar.gz | cut -d' ' -f1`.text().then((x) => x.trim())
//   const macX64Sha = await $`sha256sum ./dist/mage-darwin-x64.zip | cut -d' ' -f1`.text().then((x) => x.trim())
//   const macArm64Sha = await $`sha256sum ./dist/mage-darwin-arm64.zip | cut -d' ' -f1`.text().then((x) => x.trim())

//   const [pkgver, _subver = ""] = Script.version.split(/(-.*)/, 2)

//   // arch
//   const binaryPkgbuild = [
//     "# Maintainer: dax",
//     "# Maintainer: adam",
//     "",
//     "pkgname='mage-bin'",
//     `pkgver=${pkgver}`,
//     `_subver=${_subver}`,
//     "options=('!debug' '!strip')",
//     "pkgrel=1",
//     "pkgdesc='The AI coding agent built for the terminal.'",
//     "url='https://github.com/anomalyco/opencode'",
//     "arch=('aarch64' 'x86_64')",
//     "license=('MIT')",
//     "provides=('mage')",
//     "conflicts=('mage')",
//     "depends=('ripgrep')",
//     "",
//     `source_aarch64=("\${pkgname}_\${pkgver}_aarch64.tar.gz::https://github.com/anomalyco/opencode/releases/download/v\${pkgver}\${_subver}/mage-linux-arm64.tar.gz")`,
//     `sha256sums_aarch64=('${arm64Sha}')`,

//     `source_x86_64=("\${pkgname}_\${pkgver}_x86_64.tar.gz::https://github.com/anomalyco/opencode/releases/download/v\${pkgver}\${_subver}/mage-linux-x64.tar.gz")`,
//     `sha256sums_x86_64=('${x64Sha}')`,
//     "",
//     "package() {",
//     '  install -Dm755 ./mage "${pkgdir}/usr/bin/mage"',
//     "}",
//     "",
//   ].join("\n")

//   for (const [pkg, pkgbuild] of [["mage-bin", binaryPkgbuild]]) {
//     for (let i = 0; i < 30; i++) {
//       try {
//         await $`rm -rf ./dist/aur-${pkg}`
//         await $`git clone ssh://aur@aur.archlinux.org/${pkg}.git ./dist/aur-${pkg}`
//         await $`cd ./dist/aur-${pkg} && git checkout master`
//         await Bun.file(`./dist/aur-${pkg}/PKGBUILD`).write(pkgbuild)
//         await $`cd ./dist/aur-${pkg} && makepkg --printsrcinfo > .SRCINFO`
//         await $`cd ./dist/aur-${pkg} && git add PKGBUILD .SRCINFO`
//         if ((await $`cd ./dist/aur-${pkg} && git diff --cached --quiet`.nothrow()).exitCode === 0) break
//         await $`cd ./dist/aur-${pkg} && git commit -m "Update to v${Script.version}"`
//         await $`cd ./dist/aur-${pkg} && git push`
//         break
//       } catch {
//         continue
//       }
//     }
//   }

//   // Homebrew formula
//   const homebrewFormula = [
//     "# typed: false",
//     "# frozen_string_literal: true",
//     "",
//     "# This file was generated by GoReleaser. DO NOT EDIT.",
//     "class Mage < Formula",
//     `  desc "The AI coding agent built for the terminal."`,
//     `  homepage "https://github.com/anomalyco/opencode"`,
//     `  version "${Script.version.split("-")[0]}"`,
//     "",
//     `  depends_on "ripgrep"`,
//     "",
//     "  on_macos do",
//     "    if Hardware::CPU.intel?",
//     `      url "https://github.com/anomalyco/opencode/releases/download/v${Script.version}/mage-darwin-x64.zip"`,
//     `      sha256 "${macX64Sha}"`,
//     "",
//     "      def install",
//     '        bin.install "mage"',
//     "      end",
//     "    end",
//     "    if Hardware::CPU.arm?",
//     `      url "https://github.com/anomalyco/opencode/releases/download/v${Script.version}/mage-darwin-arm64.zip"`,
//     `      sha256 "${macArm64Sha}"`,
//     "",
//     "      def install",
//     '        bin.install "mage"',
//     "      end",
//     "    end",
//     "  end",
//     "",
//     "  on_linux do",
//     "    if Hardware::CPU.intel? and Hardware::CPU.is_64_bit?",
//     `      url "https://github.com/anomalyco/opencode/releases/download/v${Script.version}/mage-linux-x64.tar.gz"`,
//     `      sha256 "${x64Sha}"`,
//     "      def install",
//     '        bin.install "mage"',
//     "      end",
//     "    end",
//     "    if Hardware::CPU.arm? and Hardware::CPU.is_64_bit?",
//     `      url "https://github.com/anomalyco/opencode/releases/download/v${Script.version}/mage-linux-arm64.tar.gz"`,
//     `      sha256 "${arm64Sha}"`,
//     "      def install",
//     '        bin.install "mage"',
//     "      end",
//     "    end",
//     "  end",
//     "end",
//     "",
//     "",
//   ].join("\n")

//   const token = process.env.GITHUB_TOKEN
//   if (!token) {
//     console.error("GITHUB_TOKEN is required to update homebrew tap")
//     process.exit(1)
//   }
//   const tap = `https://x-access-token:${token}@github.com/anomalyco/homebrew-tap.git`
//   await $`rm -rf ./dist/homebrew-tap`
//   await $`git clone ${tap} ./dist/homebrew-tap`
//   await Bun.file("./dist/homebrew-tap/mage.rb").write(homebrewFormula)
//   await $`cd ./dist/homebrew-tap && git add mage.rb`
//   if ((await $`cd ./dist/homebrew-tap && git diff --cached --quiet`.nothrow()).exitCode !== 0) {
//     await $`cd ./dist/homebrew-tap && git commit -m "Update to v${Script.version}"`
//     await $`cd ./dist/homebrew-tap && git push`
//   }
// }


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
  await $`npm publish *.tgz --registry https://artifactory.intra.bca.co.id/artifactory/api/npm/MBB-Registry-npm/ --tag ${Script.channel}`.cwd(dir)
}

const binaries: Record<string, string> = {}
for (const filepath of new Bun.Glob("*/*/package.json").scanSync({ cwd: "./dist" })) {
  const binary = await Bun.file(`./dist/${filepath}`).json()
  if (binary.name === pkg.name) continue
  binaries[binary.name] = binary.version
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
    if (!fs.existsSync(distDir)) await $`bun run build`.cwd(pkgDir)
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

    // Also publish mage-sdk to Artifactory (reusing this already-staged, exports-
    // rewritten copy) — @mybcabisnis/mage-web-react depends on it at runtime and
    // is installed live via `Npm.add`, not vendored, so it needs a real registry
    // resolution. mage-plugin has no such external consumer; skip it.
    if (rawPkg.name === "@mybcabisnis/mage-sdk") {
      await publish(destDir, rawPkg.name, rawPkg.version)
      console.log(`[publish] ${rawPkg.name}@${rawPkg.version}`)
    }
  }

  // Publish @mybcabisnis/mage-web-react to Artifactory. It's never bundled into
  // the mage binary — its native deps (better-sqlite3, node-pty, sherpa-onnx-node)
  // can't cross-compile into a single executable — so `mage web` lazily installs
  // it on first use (packages/mage/src/cli/cmd/web.ts). Pinned to the mage release
  // version so that lazy install, which requests the compiled-in MAGE_VERSION,
  // resolves to a matching build.
  {
    const webReactDir = path.resolve(dir, "../web-react")
    const webReactPkg = JSON.parse(fs.readFileSync(path.join(webReactDir, "package.json"), "utf8"))
    await $`bun run build`.cwd(webReactDir)

    const webReactPublishDir = path.join("./dist", "mage-web-react-publish")
    fs.mkdirSync(webReactPublishDir, { recursive: true })
    for (const sub of ["dist", "server", "bin", "public"]) {
      const src = path.join(webReactDir, sub)
      if (fs.existsSync(src)) copyDirExcluding(src, path.join(webReactPublishDir, sub), new Set())
    }
    const readme = path.join(webReactDir, "README.md")
    if (fs.existsSync(readme)) fs.copyFileSync(readme, path.join(webReactPublishDir, "README.md"))

    fs.writeFileSync(
      path.join(webReactPublishDir, "package.json"),
      JSON.stringify(
        {
          ...webReactPkg,
          version,
          dependencies: resolveDepsForVendor(webReactPkg.dependencies),
          devDependencies: undefined,
        },
        null,
        2,
      ),
    )
    await publish(webReactPublishDir, webReactPkg.name, version)
    console.log(`[publish] ${webReactPkg.name}@${version}`)
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
  await publish(`./dist/${pkgName}`, pkgName, binaries[pkgName])
})
await Promise.all(tasks)
await publish(`./dist/${pkg.name}`, pkg.name, version)
