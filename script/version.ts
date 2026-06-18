#!/usr/bin/env bun
// version.ts — unified version bumper for mage
//
// Usage:
//   bun script/version.ts              # print current version, no changes
//   bun script/version.ts 1.3.0        # set exact version across all packages
//   bun script/version.ts patch        # bump patch (1.2.4 → 1.2.5)
//   bun script/version.ts minor        # bump minor (1.2.4 → 1.3.0)
//   bun script/version.ts major        # bump major (1.2.4 → 2.0.0)
//
// Updates:
//   - All packages/[pkg]/package.json (and packages/sdk/js/package.json) with a "version" field
//   - packages/web/config.mjs              → version: "..."
//   - packages/web/src/content/i18n/id.json  → app.lander.eyebrow (vX.Y.Z)
//   - packages/web/src/components/Lander.astro → TERM_SCRIPT sys line
//   - README.md                            → Current version: **vX.Y.Z**

// @ts-ignore — semver types live in packages/script; script runs fine via bun
import semver from "semver"
import path from "path"

const root = path.resolve(import.meta.dir, "..")

// ── Read current version from opencode (source of truth) ─────────────────────
const opencodePkgPath = path.join(root, "packages/opencode/package.json")
const opencodePkg = await Bun.file(opencodePkgPath).json()
const currentVersion: string = opencodePkg.version

// ── Resolve target version ────────────────────────────────────────────────────
const arg = process.argv[2]

if (!arg) {
  console.log(currentVersion)
  process.exit(0)
}

let targetVersion: string

if (arg === "patch" || arg === "minor" || arg === "major") {
  const next = semver.inc(currentVersion, arg)
  if (!next) {
    console.error(`Could not bump ${arg} from current version "${currentVersion}"`)
    process.exit(1)
  }
  targetVersion = next
} else {
  if (!semver.valid(arg)) {
    console.error(`Invalid version: "${arg}". Pass a valid semver (e.g. 1.3.0) or patch|minor|major.`)
    process.exit(1)
  }
  targetVersion = semver.clean(arg) ?? arg
}

console.log(`Bumping ${currentVersion} → ${targetVersion}\n`)

// ── Helper: replace "version" field in a package.json file ───────────────────
async function bumpPackageJson(filePath: string): Promise<boolean> {
  const text = await Bun.file(filePath).text().catch(() => null)
  if (text === null) return false
  if (!/"version"\s*:/.test(text)) return false

  const pkg = JSON.parse(text) as { version?: string }
  if (!pkg.version) return false

  const oldValue = pkg.version
  // Replace the exact version string value, preserving surrounding formatting
  const updated = text.replace(
    new RegExp(`("version"\\s*:\\s*)"${escapeRegex(oldValue)}"`),
    `$1"${targetVersion}"`,
  )
  if (updated === text) return false

  await Bun.write(filePath, updated)
  console.log(`  ✓ ${path.relative(root, filePath)}  ${oldValue} → ${targetVersion}`)
  return true
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// ── 1. Update all packages/*/package.json ────────────────────────────────────
const glob = new Bun.Glob("packages/*/package.json")
const pkgPaths = [
  ...(await Array.fromAsync(glob.scan({ cwd: root, absolute: true }))),
  path.join(root, "packages/sdk/js/package.json"),
]

for (const p of pkgPaths.sort()) {
  await bumpPackageJson(p)
}

// ── 2. packages/web/config.mjs → version: "..." ──────────────────────────────
const configPath = path.join(root, "packages/web/config.mjs")
const configText = await Bun.file(configPath).text()
const oldConfigMatch = configText.match(/version:\s*"(\d+\.\d+\.\d+[^"]*)"/)
if (oldConfigMatch) {
  const updated = configText.replace(
    /version:\s*"(\d+\.\d+\.\d+[^"]*)"/,
    `version: "${targetVersion}"`,
  )
  await Bun.write(configPath, updated)
  console.log(`  ✓ packages/web/config.mjs  ${oldConfigMatch[1]} → ${targetVersion}`)
} else {
  console.warn(`  ⚠ packages/web/config.mjs — version field not found, skipped`)
}

// ── 3. id.json → app.lander.eyebrow ──────────────────────────────────────────
const i18nPath = path.join(root, "packages/web/src/content/i18n/id.json")
const i18nText = await Bun.file(i18nPath).text()
const oldEyebrowMatch = i18nText.match(/"app\.lander\.eyebrow"\s*:\s*"v(\d+\.\d+\.\d+)/)
if (oldEyebrowMatch) {
  const oldFull = `v${oldEyebrowMatch[1]}`
  // Replace only the version token; preserve any trailing text (e.g. " — Now Available")
  const updated = i18nText.replace(
    /("app\.lander\.eyebrow"\s*:\s*")v\d+\.\d+\.\d+/,
    `$1v${targetVersion}`,
  )
  await Bun.write(i18nPath, updated)
  console.log(`  ✓ packages/web/src/content/i18n/id.json  ${oldFull} → v${targetVersion}`)
} else {
  console.warn(`  ⚠ packages/web/src/content/i18n/id.json — app.lander.eyebrow not found, skipped`)
}

// ── 4. Lander.astro → TERM_SCRIPT sys line ───────────────────────────────────
const landerPath = path.join(root, "packages/web/src/components/Lander.astro")
const landerText = await Bun.file(landerPath).text()
const oldLanderMatch = landerText.match(/mage v(\d+\.\d+\.\d+[^\s']*)/)
if (oldLanderMatch) {
  const oldFull = `mage v${oldLanderMatch[1]}`
  const updated = landerText.replace(
    /mage v\d+\.\d+\.\d+[^\s']*/,
    `mage v${targetVersion}`,
  )
  await Bun.write(landerPath, updated)
  console.log(`  ✓ packages/web/src/components/Lander.astro  ${oldFull} → mage v${targetVersion}`)
} else {
  console.warn(`  ⚠ packages/web/src/components/Lander.astro — version pattern not found, skipped`)
}

// ── 5. README.md → Current version: **vX.Y.Z** ───────────────────────────────
const readmePath = path.join(root, "README.md")
const readmeText = await Bun.file(readmePath).text()
const oldReadmeMatch = readmeText.match(/Current version:\s*\*\*v(\d+\.\d+\.\d+[^*]*)\*\*/)
if (oldReadmeMatch) {
  const oldFull = `v${oldReadmeMatch[1]}`
  const updated = readmeText.replace(
    /Current version:\s*\*\*v\d+\.\d+\.\d+[^*]*\*\*/,
    `Current version: **v${targetVersion}**`,
  )
  await Bun.write(readmePath, updated)
  console.log(`  ✓ README.md  ${oldFull} → v${targetVersion}`)
} else {
  console.warn(`  ⚠ README.md — "Current version" badge not found, skipped`)
}

console.log(`\nDone. New version: ${targetVersion}`)
