/**
 * Mage angular-update plugin — auto-loaded from .mage/plugin/angular-update.ts
 *
 * Replaces the LLM-driven skills/angular-update/SKILL.md with deterministic
 * TypeScript tools. Each step that the original skill ran via shell commands
 * and string replacements is now a tool the model invokes by name. The model
 * still handles the parts that genuinely need judgment:
 *
 *   - building src/app/app.config.ts from the old app.module.ts
 *   - deciding loadChildren vs loadComponent for each lazy route
 *   - manual control-flow fixes the schematic missed
 *   - diagnosing ng build failures
 *
 * All other work (detection, branch, dep pins, route renames, browserTarget,
 * pipeline nvm, report) runs in code so output is reproducible across runs.
 *
 * State is persisted to a JSON file in the OS temp dir (outside the repo, so
 * `ng update` does not abort on a dirty working tree).
 */

import type { Plugin, Hooks } from "@mybcabisnis/mage-plugin"
import { tool } from "@mybcabisnis/mage-plugin"
import path from "path"
import os from "os"
import { existsSync } from "fs"

// ── Constants ────────────────────────────────────────────────────────────────

const MIGRATION_BRANCH = "chore/MAGE/UPDATEANGULAR20"
const LIB_NAME = "@mybcabisnis-web/lib"
const LIB_PIN = "4.3.13"
const NODE_PIN = "v22.17.0"

const POST_19_PINS: Record<string, string | null> = {
  "@angular/material": null,
  "@angular/material-moment-adapter": null,
  "ngx-bootstrap": "19.0.2",
  "@angular/cdk": "19.2.17",
  "@angular-builders/custom-webpack": "19.0.1",
}

const POST_20_PINS: Record<string, string | null> = {
  "@angular/cdk": "20.1.0",
  "@angular-builders/custom-webpack": "20.0.0",
}

const PKG_SECTIONS = ["dependencies", "devDependencies", "peerDependencies"] as const
type PkgSection = (typeof PKG_SECTIONS)[number]

// ── State ────────────────────────────────────────────────────────────────────

type DepLocation = { name: string; section: PkgSection; version: string }

interface MigrationState {
  startedAt: string
  projectName: string
  startVersion: string | null
  mfe: boolean
  bootstrapFile: string | null
  shell: "powershell" | "cmd" | "bash"
  hasMybcabisnisLib: boolean
  hasMaterial: boolean
  hasNgxBootstrap: boolean
  hasAngularCdk: boolean
  hasCustomWebpack: boolean
  hasNgrx: boolean
  hasBrowserTarget: boolean
  removedLib: DepLocation | null
  routesRenamed: Array<{ from: string; to: string }>
  loadChildrenCandidates: Array<{ file: string; importPath: string; symbol: string }>
  steps: Array<{ name: string; status: "ok" | "skipped" | "failed"; note?: string }>
}

function statePath(): string {
  return path.join(os.tmpdir(), "mage-ng-update-state.json")
}

async function readState(): Promise<MigrationState | null> {
  const file = statePath()
  if (!existsSync(file)) return null
  try {
    return JSON.parse(await Bun.file(file).text())
  } catch {
    return null
  }
}

async function writeState(state: MigrationState): Promise<void> {
  await Bun.write(statePath(), JSON.stringify(state, null, 2))
}

function emptyState(): MigrationState {
  return {
    startedAt: new Date().toISOString(),
    projectName: "",
    startVersion: null,
    mfe: false,
    bootstrapFile: null,
    shell: detectShell(),
    hasMybcabisnisLib: false,
    hasMaterial: false,
    hasNgxBootstrap: false,
    hasAngularCdk: false,
    hasCustomWebpack: false,
    hasNgrx: false,
    hasBrowserTarget: false,
    removedLib: null,
    routesRenamed: [],
    loadChildrenCandidates: [],
    steps: [],
  }
}

async function appendStep(name: string, status: "ok" | "skipped" | "failed", note?: string): Promise<void> {
  const state = (await readState()) ?? emptyState()
  state.steps.push({ name, status, ...(note ? { note } : {}) })
  await writeState(state)
}

// ── Shell detection ──────────────────────────────────────────────────────────

function detectShell(): MigrationState["shell"] {
  if (process.platform !== "win32") return "bash"
  return process.env.PSModulePath ? "powershell" : "cmd"
}

// ── Shell helpers ────────────────────────────────────────────────────────────

interface ExecResult {
  ok: boolean
  exitCode: number
  stdout: string
  stderr: string
}

async function exec(cmd: string, args: string[], cwd: string): Promise<ExecResult> {
  const proc = Bun.spawn([cmd, ...args], { cwd, stdout: "pipe", stderr: "pipe" })
  await proc.exited
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  return { ok: proc.exitCode === 0, exitCode: proc.exitCode ?? 0, stdout, stderr }
}

async function git(args: string[], cwd: string): Promise<ExecResult> {
  return exec("git", args, cwd)
}

// ── package.json helpers ─────────────────────────────────────────────────────

type PackageJson = {
  name?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  [k: string]: unknown
}

async function readPackageJson(dir: string): Promise<PackageJson | null> {
  const p = path.join(dir, "package.json")
  if (!existsSync(p)) return null
  try {
    return JSON.parse(await Bun.file(p).text())
  } catch {
    return null
  }
}

async function writePackageJson(dir: string, pkg: PackageJson): Promise<void> {
  await Bun.write(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n")
}

function findDep(pkg: PackageJson, name: string): DepLocation | null {
  for (const section of PKG_SECTIONS) {
    const map = pkg[section] as Record<string, string> | undefined
    if (map && name in map) return { name, section, version: map[name]! }
  }
  return null
}

function setDep(pkg: PackageJson, location: DepLocation, version: string): void {
  const map = (pkg[location.section] as Record<string, string> | undefined) ?? {}
  map[location.name] = version
  ;(pkg as Record<string, unknown>)[location.section] = map
}

function removeDep(pkg: PackageJson, name: string): DepLocation | null {
  const loc = findDep(pkg, name)
  if (!loc) return null
  const map = pkg[loc.section] as Record<string, string>
  delete map[loc.name]
  return loc
}

function extractAngularVersion(pkg: PackageJson): string | null {
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
  return deps["@angular/core"] ?? null
}

// ── Route file transformation ────────────────────────────────────────────────

function transformRoutingFile(content: string): {
  output: string
  loadChildrenTargets: Array<{ importPath: string; symbol: string }>
} {
  // 1. Drop NgModule + RouterModule imports
  let out = content
    .replace(/^\s*import\s+\{\s*NgModule\s*\}\s+from\s+["']@angular\/core["'];?\s*$/gm, "")
    .replace(
      /^(\s*import\s+\{)([^}]*)\}\s+from\s+["']@angular\/router["'];?\s*$/gm,
      (_m, lead, names) => {
        const cleaned = names
          .split(",")
          .map((s: string) => s.trim())
          .filter((n: string) => n && n !== "RouterModule")
        if (cleaned.length === 0) return ""
        return `${lead} ${cleaned.join(", ")} } from "@angular/router";`
      },
    )

  // 2. Drop the @NgModule({...}) decorator + the AppRoutingModule class declaration
  out = out.replace(/@NgModule\s*\(\s*\{[\s\S]*?\}\s*\)\s*export\s+class\s+\w+\s*\{\s*\}\s*/g, "")

  // 3. const routes: Routes = ... → export const routes: Routes = ...
  out = out.replace(/(^|\n)\s*const\s+routes\s*:\s*Routes\s*=/g, "$1export const routes: Routes =")

  // 4. Rewrite loadChildren paths to point at *.route instead of *.module.
  //    Track each one for the LLM to decide loadChildren vs loadComponent.
  const targets: Array<{ importPath: string; symbol: string }> = []
  out = out.replace(
    /loadChildren\s*:\s*\(\s*\)\s*=>\s*import\s*\(\s*["']([^"']+?)\.module["']\s*\)\s*\.then\s*\(\s*\w+\s*=>\s*\w+\.(\w+Module)\s*\)/g,
    (_m, importPath, symbol) => {
      targets.push({ importPath, symbol })
      return `loadChildren: () => import("${importPath}.route").then(m => m.routes)`
    },
  )

  // 5. Collapse multiple blank lines left behind by the import strips
  out = out.replace(/\n{3,}/g, "\n\n")

  return { output: out.trimStart(), loadChildrenTargets: targets }
}

async function findRoutingFiles(dir: string): Promise<string[]> {
  const src = path.join(dir, "src")
  if (!existsSync(src)) return []
  const glob = new Bun.Glob("**/*-routing.module.ts")
  const glob2 = new Bun.Glob("**/*.routing.module.ts")
  const found = new Set<string>()
  for await (const rel of glob.scan({ cwd: src })) found.add(path.join(src, rel))
  for await (const rel of glob2.scan({ cwd: src })) found.add(path.join(src, rel))
  return [...found]
}

function targetRoutePath(oldPath: string): string {
  // app-routing.module.ts → app.route.ts
  // foo.routing.module.ts → foo.route.ts
  return oldPath
    .replace(/([\\/])([\w-]+)-routing\.module\.ts$/, "$1$2.route.ts")
    .replace(/([\\/])([\w-]+)\.routing\.module\.ts$/, "$1$2.route.ts")
}

// ── Plugin definition ────────────────────────────────────────────────────────

export const server: Plugin = async (input) => {
  const { directory } = input

  const hooks: Hooks = {
    tool: {
      // ─── Step 0 + 2: detect platform, MFE bootstrap, current deps ─────────
      mage_ng_detect: tool({
        description:
          "Detect the project state required to plan the Angular 18 → 20 migration. " +
          "Detects the active shell (powershell / cmd on Windows, bash on Unix), reads package.json, identifies whether the project bootstraps via single-spa (main.single-spa.ts), and records which optional deps are present. " +
          "Initializes the migration state file in the OS temp dir. Returns a JSON summary including `state.shell` — the LLM MUST consult this before running any shell command, since cmd-only syntax (e.g. `set X=Y`) will fail in PowerShell and on bash.",
        args: {},
        async execute() {
          const pkg = await readPackageJson(directory)
          if (!pkg) {
            return JSON.stringify(
              { ok: false, reason: "no-package-json", message: `No package.json at ${directory}` },
              null,
              2,
            )
          }

          const state = emptyState()
          state.projectName = pkg.name ?? path.basename(directory)
          state.startVersion = extractAngularVersion(pkg)
          state.bootstrapFile = existsSync(path.join(directory, "src", "main.single-spa.ts"))
            ? "main.single-spa.ts"
            : existsSync(path.join(directory, "src", "main.ts"))
              ? "main.ts"
              : null
          state.mfe = state.bootstrapFile === "main.single-spa.ts"
          state.hasMybcabisnisLib = !!findDep(pkg, LIB_NAME)
          state.hasMaterial =
            !!findDep(pkg, "@angular/material") || !!findDep(pkg, "@angular/material-moment-adapter")
          state.hasNgxBootstrap = !!findDep(pkg, "ngx-bootstrap")
          state.hasAngularCdk = !!findDep(pkg, "@angular/cdk")
          state.hasCustomWebpack = !!findDep(pkg, "@angular-builders/custom-webpack")
          state.hasNgrx = !!findDep(pkg, "@ngrx/store")

          // Cheap text check — angular.json is small.
          const angularJsonPath = path.join(directory, "angular.json")
          if (existsSync(angularJsonPath)) {
            const text = await Bun.file(angularJsonPath).text()
            state.hasBrowserTarget = text.includes('"browserTarget"')
          }

          await writeState(state)
          return JSON.stringify({ ok: true, state, statePath: statePath() }, null, 2)
        },
      }),

      // ─── Step 1: create/checkout migration branch ─────────────────────────
      mage_ng_branch: tool({
        description:
          "Create or checkout the migration branch chore/MAGE/UPDATEANGULAR20. " +
          "Idempotent. Returns whether the branch was created or already existed.",
        args: {},
        async execute() {
          const exists = await git(["rev-parse", "--verify", MIGRATION_BRANCH], directory)
          if (exists.ok) {
            const out = await git(["checkout", MIGRATION_BRANCH], directory)
            await appendStep("branch", out.ok ? "ok" : "failed", "existing branch")
            return out.ok ? `Checked out existing branch ${MIGRATION_BRANCH}` : `git checkout failed: ${out.stderr}`
          }
          const create = await git(["checkout", "-b", MIGRATION_BRANCH], directory)
          await appendStep("branch", create.ok ? "ok" : "failed", "created branch")
          return create.ok ? `Created and checked out ${MIGRATION_BRANCH}` : `git checkout -b failed: ${create.stderr}`
        },
      }),

      // ─── Steps 3 / 11 / 19: manage @mybcabisnis-web/lib version ──────────
      mage_ng_lib: tool({
        description:
          "Manage the @mybcabisnis-web/lib dependency. " +
          "action='pin' → set to 4.3.13 (Step 3 pre-migration pin). " +
          "action='remove' → remove the entry entirely so ng update can proceed (Step 11). The removed location is saved to state. " +
          "action='restore' → re-add at 4.3.13 in the same section it lived in originally (Step 19). " +
          "No-op if the lib was never present. Caller should run npm install --legacy-peer-deps and ng build after this.",
        args: {
          action: tool.schema.enum(["pin", "remove", "restore"]),
        },
        async execute({ action }) {
          const pkg = await readPackageJson(directory)
          if (!pkg) return "No package.json found."

          const state = (await readState()) ?? emptyState()

          if (action === "pin") {
            const loc = findDep(pkg, LIB_NAME)
            if (!loc) {
              await appendStep("lib-pin", "skipped", "not present")
              return `${LIB_NAME} not present — skipped.`
            }
            setDep(pkg, loc, LIB_PIN)
            await writePackageJson(directory, pkg)
            await appendStep("lib-pin", "ok", `was ${loc.version} → ${LIB_PIN}`)
            return `Pinned ${LIB_NAME} to ${LIB_PIN} in ${loc.section}.`
          }

          if (action === "remove") {
            const loc = removeDep(pkg, LIB_NAME)
            if (!loc) {
              await appendStep("lib-remove", "skipped", "not present")
              return `${LIB_NAME} not present — skipped.`
            }
            await writePackageJson(directory, pkg)
            state.removedLib = loc
            await writeState(state)
            await appendStep("lib-remove", "ok", `removed from ${loc.section} (was ${loc.version})`)
            return `Removed ${LIB_NAME} from ${loc.section} (was ${loc.version}). Saved location for restore.`
          }

          if (action === "restore") {
            if (!state.removedLib) {
              await appendStep("lib-restore", "skipped", "no prior removal")
              return `No prior removal recorded — skipped.`
            }
            const loc: DepLocation = { ...state.removedLib, version: LIB_PIN }
            setDep(pkg, loc, LIB_PIN)
            await writePackageJson(directory, pkg)
            await appendStep("lib-restore", "ok", `restored to ${loc.section} at ${LIB_PIN}`)
            return `Restored ${LIB_NAME} to ${loc.section} at ${LIB_PIN}.`
          }

          return "Unknown action."
        },
      }),

      // ─── Step 11 (part): wipe node_modules + lockfile before ng update ───
      mage_ng_clean_modules: tool({
        description:
          "Delete node_modules and package-lock.json so `ng update` starts from a clean slate. " +
          "Do NOT run `npm install` after this — `ng update` reinstalls.",
        args: {},
        async execute() {
          const fs = await import("fs/promises")
          const targets = ["node_modules", "package-lock.json"]
          const removed: string[] = []
          for (const t of targets) {
            const full = path.join(directory, t)
            if (!existsSync(full)) continue
            await fs.rm(full, { recursive: true, force: true })
            removed.push(t)
          }
          await appendStep("clean-modules", "ok", removed.join(", "))
          return removed.length > 0 ? `Removed: ${removed.join(", ")}` : "Nothing to remove."
        },
      }),

      // ─── Step 6: rename and rewrite routing modules ───────────────────────
      mage_ng_rename_routes: tool({
        description:
          "Find every *-routing.module.ts and *.routing.module.ts under src/, rewrite each into the new standalone *.route.ts format (drop @NgModule, export plain Routes), rename the file, and delete the old one. " +
          "Also rewrites lazy `loadChildren: () => import('./x.module').then(m => m.XModule)` calls to `import('./x.route').then(m => m.routes)`. " +
          "Returns a list of files transformed and a separate list of loadChildren targets that may need to be converted to loadComponent — the model should inspect each target module and decide.",
        args: {},
        async execute() {
          const found = await findRoutingFiles(directory)
          if (found.length === 0) {
            await appendStep("rename-routes", "skipped", "no routing modules found")
            return JSON.stringify({ renamed: [], loadChildrenCandidates: [] }, null, 2)
          }

          const fs = await import("fs/promises")
          const state = (await readState()) ?? emptyState()
          const renamed: Array<{ from: string; to: string }> = []
          const allTargets: Array<{ file: string; importPath: string; symbol: string }> = []

          for (const oldPath of found) {
            const newPath = targetRoutePath(oldPath)
            const content = await Bun.file(oldPath).text()
            const { output, loadChildrenTargets } = transformRoutingFile(content)
            await Bun.write(newPath, output)
            if (newPath !== oldPath) await fs.rm(oldPath)
            renamed.push({ from: oldPath, to: newPath })
            for (const t of loadChildrenTargets) {
              allTargets.push({ file: newPath, importPath: t.importPath, symbol: t.symbol })
            }
          }

          state.routesRenamed = renamed
          state.loadChildrenCandidates = allTargets
          await writeState(state)
          await appendStep("rename-routes", "ok", `${renamed.length} file(s)`)

          return JSON.stringify(
            {
              renamed,
              loadChildrenCandidates: allTargets,
              note: "For each candidate, read the original *.module.ts target. If it had RouterModule.forChild(routes) or a non-empty Routes array, keep loadChildren (already rewritten). If it only declared a single component, change the edited *.route.ts to use loadComponent: () => import('...').then(m => m.XComponent).",
            },
            null,
            2,
          )
        },
      }),

      // ─── Steps 13 / 17: apply dep pins after each core update ─────────────
      mage_ng_dep_pins: tool({
        description:
          "Apply the post-Angular-update dep pin policy. " +
          "phase='19' → drop @angular/material + @angular/material-moment-adapter, pin ngx-bootstrap@19.0.2, @angular/cdk@19.2.17, @angular-builders/custom-webpack@19.0.1 (only when each is already present). " +
          "phase='20' → pin @angular/cdk@20.1.0, @angular-builders/custom-webpack@20.0.0 (only when already present). " +
          "Caller should run npm install --legacy-peer-deps and ng build after this.",
        args: {
          phase: tool.schema.enum(["19", "20"]),
        },
        async execute({ phase }) {
          const pkg = await readPackageJson(directory)
          if (!pkg) return "No package.json found."

          const pins = phase === "19" ? POST_19_PINS : POST_20_PINS
          const changes: string[] = []

          for (const [name, target] of Object.entries(pins)) {
            const loc = findDep(pkg, name)
            if (!loc) continue
            if (target === null) {
              removeDep(pkg, name)
              changes.push(`removed ${name} (was ${loc.version})`)
            } else {
              setDep(pkg, loc, target)
              changes.push(`${name}: ${loc.version} → ${target}`)
            }
          }

          if (changes.length === 0) {
            await appendStep(`post-${phase}-deps`, "skipped", "no matching deps present")
            return `No matching deps to update for phase ${phase}.`
          }

          await writePackageJson(directory, pkg)
          await appendStep(`post-${phase}-deps`, "ok", changes.join("; "))
          return changes.join("\n")
        },
      }),

      // ─── Step 14: angular.json browserTarget → buildTarget ────────────────
      mage_ng_angular_json: tool({
        description:
          "Rename every occurrence of the key \"browserTarget\" to \"buildTarget\" in angular.json. " +
          "Required when bumping to Angular 19. No-op if the project does not use browserTarget.",
        args: {},
        async execute() {
          const file = path.join(directory, "angular.json")
          if (!existsSync(file)) {
            await appendStep("angular-json", "skipped", "not present")
            return "angular.json not present."
          }
          const before = await Bun.file(file).text()
          const after = before.replaceAll('"browserTarget"', '"buildTarget"')
          const count = before === after ? 0 : (before.match(/"browserTarget"/g) || []).length
          if (count === 0) {
            await appendStep("angular-json", "skipped", "no browserTarget keys")
            return "No browserTarget keys to rename."
          }
          await Bun.write(file, after)
          await appendStep("angular-json", "ok", `${count} key(s) renamed`)
          return `Renamed ${count} browserTarget → buildTarget in angular.json.`
        },
      }),

      // ─── Step 18: pipeline.yml nvm version ────────────────────────────────
      mage_ng_pipeline_nvm: tool({
        description:
          "Pin the Node version in pipeline.yml / pipeline.yaml (or pipelines.yml) to v22.17.0. " +
          "Updates `nvm install <ver>`, `nvm use <ver>`, and a `NODE_VERSION:` key when present. " +
          "Returns the relative path of the file that was edited, or 'not present' if no pipeline file was found.",
        args: {},
        async execute() {
          const candidates = ["pipeline.yml", "pipeline.yaml", "pipelines.yml", "pipelines.yaml"]
          let target: string | null = null
          for (const c of candidates) {
            const full = path.join(directory, c)
            if (existsSync(full)) {
              target = full
              break
            }
          }
          if (!target) {
            await appendStep("pipeline-nvm", "skipped", "not present")
            return "No pipeline file found."
          }

          const before = await Bun.file(target).text()
          let after = before
            .replace(/(nvm\s+install\s+)(\S+)/g, `$1${NODE_PIN}`)
            .replace(/(nvm\s+use\s+)(\S+)/g, `$1${NODE_PIN}`)
            .replace(/(NODE_VERSION\s*:\s*)(\S+)/g, `$1${NODE_PIN}`)

          if (after === before) {
            await appendStep("pipeline-nvm", "skipped", "no nvm/NODE_VERSION lines matched")
            return `No nvm/NODE_VERSION lines matched in ${path.basename(target)}.`
          }

          await Bun.write(target, after)
          await appendStep("pipeline-nvm", "ok", `${path.basename(target)} → ${NODE_PIN}`)
          return `Updated ${path.relative(directory, target)} → ${NODE_PIN}.`
        },
      }),

      // ─── State read / write ───────────────────────────────────────────────
      mage_ng_state: tool({
        description:
          "Read or modify the migration state JSON kept in the OS temp dir. " +
          "action='get' → return the full state. " +
          "action='note' → append a free-form step entry (requires name and status). " +
          "action='reset' → delete the state file (use to start a fresh run).",
        args: {
          action: tool.schema.enum(["get", "note", "reset"]),
          name: tool.schema.string().optional(),
          status: tool.schema.enum(["ok", "skipped", "failed"]).optional(),
          note: tool.schema.string().optional(),
        },
        async execute({ action, name, status, note }) {
          if (action === "get") {
            const state = await readState()
            return state ? JSON.stringify(state, null, 2) : "No state — run mage_ng_detect first."
          }
          if (action === "note") {
            if (!name || !status) return "name and status are required for action='note'."
            await appendStep(name, status, note)
            return `Recorded step: ${name} = ${status}`
          }
          if (action === "reset") {
            const fs = await import("fs/promises")
            if (existsSync(statePath())) await fs.rm(statePath())
            return "State reset."
          }
          return "Unknown action."
        },
      }),

      // ─── Step 21: render the final report ─────────────────────────────────
      mage_ng_write_report: tool({
        description:
          "Render the migration report from accumulated state and write it to NG-UPDATE-REPORT-YYYY-MM-DD.md in the project root. " +
          "Also collects the git log on chore/MAGE/UPDATEANGULAR20 since divergence from master. " +
          "Returns the path of the written report.",
        args: {},
        async execute() {
          const state = await readState()
          if (!state) return "No state to report. Run mage_ng_detect first."

          const date = new Date().toISOString().slice(0, 10)
          const reportPath = path.join(directory, `NG-UPDATE-REPORT-${date}.md`)

          const log = await git(["log", "--oneline", `master..${MIGRATION_BRANCH}`], directory)
          const commitLog = log.ok && log.stdout.trim() ? log.stdout.trim() : "(no commits found)"

          const stepRow = (s: { name: string; status: string; note?: string }) =>
            `| ${s.name} | ${s.status === "ok" ? "✓" : s.status === "skipped" ? "N/A" : "✗"} | ${s.note ?? ""} |`

          const renamedRows = state.routesRenamed
            .map((r) => `| ${path.relative(directory, r.from)} | ${path.relative(directory, r.to)} |`)
            .join("\n")

          const candidateRows = state.loadChildrenCandidates
            .map((c) => `| ${path.relative(directory, c.file)} | ${c.importPath} | ${c.symbol} |`)
            .join("\n")

          const md = `# Angular Migration Report — ${state.projectName}

**Generated:** ${date}
**Branch:** ${MIGRATION_BRANCH}
**Migrated:** ${state.startVersion ?? "(unknown)"} → v20
**MFE (single-spa):** ${state.mfe ? "yes" : "no"}

---

## Migration Steps

| Step | Status | Note |
|------|--------|------|
${state.steps.map(stepRow).join("\n")}

---

## Initial State

- Bootstrap file: ${state.bootstrapFile ?? "(none detected)"}
- ${LIB_NAME}: ${state.hasMybcabisnisLib ? "present" : "absent"}
- @angular/material(-moment-adapter): ${state.hasMaterial ? "present (removed during migration)" : "absent"}
- ngx-bootstrap: ${state.hasNgxBootstrap ? "present" : "absent"}
- @angular/cdk: ${state.hasAngularCdk ? "present" : "absent"}
- @angular-builders/custom-webpack: ${state.hasCustomWebpack ? "present" : "absent"}
- @ngrx/store: ${state.hasNgrx ? "present (updated alongside core)" : "absent"}
- angular.json browserTarget: ${state.hasBrowserTarget ? "present (renamed to buildTarget)" : "absent"}

---

## Routes Renamed

${renamedRows ? `| Old | New |\n|-----|-----|\n${renamedRows}` : "_None_"}

### loadChildren candidates (review for loadComponent)

${candidateRows ? `| Edited file | Original module path | Original symbol |\n|------|----------------------|-----------------|\n${candidateRows}` : "_None_"}

---

## Commits on \`${MIGRATION_BRANCH}\`

\`\`\`
${commitLog}
\`\`\`
`

          await Bun.write(reportPath, md)
          return `Wrote ${path.relative(directory, reportPath)}`
        },
      }),
    },
  }

  return hooks
}
