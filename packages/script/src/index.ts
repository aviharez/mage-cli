import { $ } from "bun"
import semver from "semver"
import path from "path"

const rootPkgPath = path.resolve(import.meta.dir, "../../../package.json")
const rootPkg = await Bun.file(rootPkgPath).json()
const expectedBunVersion = rootPkg.packageManager?.split("@")[1]

if (!expectedBunVersion) {
  throw new Error("packageManager field not found in root package.json")
}

// relax version requirement
const expectedBunVersionRange = `^${expectedBunVersion}`

if (!semver.satisfies(process.versions.bun, expectedBunVersionRange)) {
  throw new Error(`This script requires bun@${expectedBunVersionRange}, but you are using bun@${process.versions.bun}`)
}

const env = {
  MAGE_CHANNEL: process.env["MAGE_CHANNEL"],
  MAGE_BUMP: process.env["MAGE_BUMP"],
  MAGE_VERSION: process.env["MAGE_VERSION"],
  MAGE_RELEASE: process.env["MAGE_RELEASE"],
}
// Branches that represent production releases; builds from these use the "latest" dist-tag.
const PRODUCTION_BRANCHES = new Set(
  (process.env.MAGE_MAIN_BRANCH ?? "main,master,mage/main,DEV/INIT").split(",").map((b) => b.trim()),
)

const CHANNEL = await (async () => {
  if (env.MAGE_CHANNEL) return env.MAGE_CHANNEL
  if (env.MAGE_BUMP) return "latest"
  if (env.MAGE_VERSION && !env.MAGE_VERSION.startsWith("0.0.0-")) return "latest"
  const branch = await $`git branch --show-current`.text().then((x) => x.trim())
  return PRODUCTION_BRANCHES.has(branch) ? "latest" : branch
})()
const IS_PREVIEW = CHANNEL !== "latest"

const VERSION = await (async () => {
  if (env.MAGE_VERSION) return env.MAGE_VERSION
  const opencodePkgPath = path.resolve(import.meta.dir, "../../opencode/package.json")
  const opencodePkg = await Bun.file(opencodePkgPath).json()
  const version = opencodePkg.version || "0.0.1"

  if (IS_PREVIEW) {
    const sanitizedChannel = CHANNEL.replace(/[^a-zA-Z0-9-]/g, "-")
    return `${version}-${sanitizedChannel}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`
  }


  const [major, minor, patch] = version.split(".").map((x: string) => Number(x) || 0)
  const t = env.MAGE_BUMP?.toLowerCase()
  if (t === "major") return `${major + 1}.0.0`
  if (t === "minor") return `${major}.${minor + 1}.0`
  if (t === "patch") return `${major}.${minor}.${patch + 1}`
  return version
})()

const bot = ["actions-user", "opencode", "opencode-agent[bot]"]
const team = [...bot]

export const Script = {
  get channel() {
    return CHANNEL
  },
  get version() {
    return VERSION
  },
  get preview() {
    return IS_PREVIEW
  },
  get release(): boolean {
    return !!env.MAGE_RELEASE
  },
  get team() {
    return team
  },
}
console.log(`opencode script`, JSON.stringify(Script, null, 2))
