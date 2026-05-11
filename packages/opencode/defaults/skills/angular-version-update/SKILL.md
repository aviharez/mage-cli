---
name: angular-version-update
description: Upgrade an Angular project's package versions from Angular 18 → 19 → 20 on Windows using the official ng update schematics. Verifies a successful build between each major version. Does NOT touch standalone components, control flow syntax, signals, inject(), or routing structure — version bump only. Windows-only (PowerShell or CMD).
---

# Angular Version Update (v18 → v20) — Version Bump Only (Windows)

Use this skill when the project is on Angular 18 and the user **only** wants the package versions raised to Angular 20. This skill performs the official `ng update` migrations one major version at a time and verifies the build after each step. It does **not** convert templates to the new control-flow syntax, migrate to standalone components, switch to `inject()`, or rename routing files. For those, use **`angular-standalone-migration`** (post-upgrade) or **`angular-update`** (full pipeline) afterwards.

> **Platform:** This skill runs on **Windows only** (PowerShell or CMD). It does not include bash variants. If `process.platform` is not `win32`, stop and tell the user this skill targets Windows.

## CONTRACT — read this first

This task has exactly one completion condition: the file `NG-VERSION-UPDATE-REPORT-[YYYY-MM-DD].md` must exist on disk, written using the **Write tool**.

**ALL output — including the final report — must be written using tool calls (Write/Edit/Bash). Never print findings or the report as a chat message.**

Until that file is written using the Write tool:
- Do NOT produce any text response to the user.
- Do NOT summarize findings in text.
- Do NOT print the report content as a message — use the Write tool instead.
- Do NOT ask the user anything.
- Do NOT stop between steps unless a build fails.
- Write intermediate findings and progress to `ng-version-scratch.md` using the Write/Edit tool (a tool call, not text).
- Always use FULL paths when reading files — never bare filenames.

**Exception:** If a build fails, stop immediately and report the full error to the user. Do not continue to the next step.

The only acceptable output is tool calls, until `NG-VERSION-UPDATE-REPORT-[YYYY-MM-DD].md` is written to disk (or a build fails).

---

## Step 0 — Confirm Windows + detect shell

**Run:**
```
node -e "console.log(process.platform)"
```

- If the result is **not** `win32`, stop immediately. Tell the user: "This skill targets Windows only. Detected platform: [X]." Do NOT proceed.
- If the result is `win32`, detect the shell:
  ```
  node -e "console.log(process.env.PSModulePath ? 'powershell' : 'cmd')"
  ```
  - Result `powershell` → write `OS=win32 SHELL=powershell` to `ng-version-scratch.md`. Use **PowerShell** commands.
  - Result `cmd` → write `OS=win32 SHELL=cmd` to `ng-version-scratch.md`. Use **CMD** commands.

Go to Step 1.

---

## Step 1 — Read current state

Read `package.json` in full using the Read tool. Note the current Angular version and which Angular-adjacent packages are installed.

If `@angular/core` is **not** at v18.x, stop and tell the user the detected version. This skill is designed for v18 → v20.

Check related packages:

**PowerShell:**
```
Get-Content package.json | Select-String -Pattern "@angular|@ngrx|@angular/material|@angular/cdk" | Select-Object -First 30
```
**CMD:**
```
findstr /i "@angular @ngrx @angular/material @angular/cdk" package.json
```

Run a baseline build to confirm the starting state compiles:

**PowerShell / CMD:** `npx ng build`

If the baseline build fails, stop and report. The migration assumes a green starting point.

Append findings to `ng-version-scratch.md` under `# CurrentState`:
```
PROJECT_NAME=[name from package.json]
ANGULAR_VERSION=[current version, expected 18.x]
HAS_MATERIAL=[yes/no]
HAS_CDK=[yes/no]
HAS_NGRX=[yes/no]
NODE_VERSION=[output of node -v]
NPM_VERSION=[output of npm -v]
BASELINE_BUILD=OK
```

Go to Step 2.

---

## Step 2 — Migrate v18 → v19

Run the Angular CLI update schematic for core + cli first:

**PowerShell / CMD:**
```
npx ng update @angular/core@19 @angular/cli@19 --force
```

If `@angular/cdk` is installed (and not bundled with material):

**PowerShell / CMD:**
```
npx ng update @angular/cdk@19 --force
```

If `@angular/material` is installed:

**PowerShell / CMD:**
```
npx ng update @angular/material@19 --force
```

If `@ngrx/store` is installed:

**PowerShell / CMD:**
```
npx ng update @ngrx/store@19 --force
```

Verify the build:

**PowerShell / CMD:** `npx ng build`

If the build **fails**, stop and report the full error. Common v19 issues:
- `target` in `tsconfig.json` may need to be raised to `ES2022`.
- `zone.js` peer-dep mismatch — let `ng update` resolve it; do not pin manually.

If it **passes**, append `v18→v19: OK` to `ng-version-scratch.md` under `# Steps`. Go to Step 3.

---

## Step 3 — Migrate v19 → v20

**PowerShell / CMD:**
```
npx ng update @angular/core@20 @angular/cli@20 --force
```

If `@angular/cdk` is installed:

**PowerShell / CMD:**
```
npx ng update @angular/cdk@20 --force
```

If `@angular/material` is installed:

**PowerShell / CMD:**
```
npx ng update @angular/material@20 --force
```

If `@ngrx/store` is installed:

**PowerShell / CMD:**
```
npx ng update @ngrx/store@20 --force
```

Verify:

**PowerShell / CMD:** `npx ng build`

If the build **fails**, stop and report the full error.
If it **passes**, append `v19→v20: OK` to `ng-version-scratch.md` under `# Steps`. Go to Step 4.

---

## Step 4 — Verify package.json reflects v20

Read the updated `package.json` in full using the Read tool. Confirm:
- `@angular/core` is at `^20.x` / `~20.x` / `20.x.x`
- `@angular/cli` is at the same major
- `@angular/cdk`, `@angular/material`, `@ngrx/store` (if present) are also on their v20 lines
- TypeScript is at the version Angular 20 supports (`>=5.8 <5.10` per the v20 release notes — check the schematic output)

Append the resolved versions to `ng-version-scratch.md` under `# FinalVersions`.

If any package is still on the old major (because `ng update` couldn't resolve it), record it under `# UnresolvedPackages` and continue — do not block on third-party libs.

Go to Step 5.

---

## Step 5 — Final verification

Run the production build, tests, and lint:

**PowerShell / CMD:**
```
npx ng build --configuration production
```

**PowerShell / CMD:** `npx ng test --watch=false`

**PowerShell / CMD:** `npx ng lint`

Append all results (pass/fail and the first 30 lines of output for any failure) to `ng-version-scratch.md` under `# Verification`.

Go to Step 6.

---

## Step 6 — Write the version-update report

**MANDATORY: Use the Write tool to write the file to disk. Do NOT print the report content as a chat message.**

1. Read `ng-version-scratch.md` in full using the Read tool.
2. Call the **Write tool** with `file_path = NG-VERSION-UPDATE-REPORT-[YYYY-MM-DD].md` and the full report as `content`. The file MUST be written to disk.
3. After the Write tool confirms success, delete `ng-version-scratch.md`:
   - **PowerShell:** `Remove-Item ng-version-scratch.md`
   - **CMD:** `del ng-version-scratch.md`
4. Only after the file exists on disk, post a single short message: `Version update report written to NG-VERSION-UPDATE-REPORT-[YYYY-MM-DD].md`

---

## Report structure

```markdown
# Angular Version Update Report — [Project Name]

**Generated:** [today's date]
**Upgraded:** v18.x → v20.x (version bump only)

> This report covers package version upgrades only. Standalone migration, control-flow conversion, signals, inject(), and route renaming were NOT performed. Use the `angular-standalone-migration` or `angular-update` skill if those changes are also needed.

---

## Migration Steps

| Step | Description | Status |
|------|-------------|--------|
| Baseline build | npx ng build (before any change) | ✓ / ✗ |
| v18 → v19 | ng update @angular/core@19 @angular/cli@19 | ✓ / ✗ |
| v19 → v20 | ng update @angular/core@20 @angular/cli@20 | ✓ / ✗ |
| Production build | npx ng build --configuration production | ✓ / ✗ |
| Tests | npx ng test --watch=false | ✓ / ✗ |
| Lint | npx ng lint | ✓ / ✗ |

---

## Resolved Versions

| Package | Before | After |
|---------|--------|-------|
| @angular/core | 18.x.x | 20.x.x |
| @angular/cli | 18.x.x | 20.x.x |
| @angular/material | 18.x.x | 20.x.x |
| @angular/cdk | 18.x.x | 20.x.x |
| @ngrx/store | 18.x.x | 20.x.x |
| typescript | 5.4.x | 5.8.x / 5.9.x |

---

## Unresolved Packages (if any)

| Package | Reason | Suggested fix |
|---------|--------|---------------|
| `pkg-name` | `ng update` did not provide a v20 schematic | Bump manually or replace |

---

## Build Results

- Development build: ✓ / ✗
- Production build: ✓ / ✗
- Tests: ✓ / ✗
- Lint: ✓ / ✗

---

## Next Steps (NOT performed by this skill)

If the project should also adopt the new Angular 20 idioms, run one of:
- **`angular-standalone-migration`** — control-flow + standalone + app.config.ts + route renames (recommended next).
- **`angular-update`** — same as standalone-migration plus signals (`input()`/`output()`/`viewChild()`) and `inject()` rewrites.

---

## Common Errors Reference

| Error | Fix |
|-------|-----|
| `Cannot find module '@angular/build'` after v19 | Run `npx ng update @angular/cli@19` again — the new builder is registered by the schematic |
| TypeScript version error during ng build | Allow `ng update` to bump TypeScript; do not pin in `package.json` |
| `zone.js` peer-dep warnings | Re-run `npx ng update @angular/core@<n>` so the schematic resolves zone.js automatically |
| Tests fail with `Cannot find module 'karma-jasmine-html-reporter'` | Run `npm install` after the update — peer deps may need a fresh resolution |
| Production build OOMs | Raise Node heap: `set NODE_OPTIONS=--max-old-space-size=8192` (CMD) / `$env:NODE_OPTIONS="--max-old-space-size=8192"` (PowerShell), then re-run |
```

---

## Guidelines

- This skill ONLY upgrades package versions. Do not run `@angular/core:control-flow`, `@angular/core:standalone`, `@angular/core:signal-input-migration`, or `@angular/core:inject` — those belong in the other skills.
- Never skip a major version — always go 18 → 19 → 20 with a build verification between each.
- Use `--force` on `ng update` only because the project may have outdated peer deps; review the schematic output for warnings.
- If a build breaks during a major step, stop and surface the full error. Do not patch templates or component code in this skill — that is out of scope.
- Commit after each successful major bump so the v18→v19 step is reversible without losing the v19→v20 attempt.
- This skill is Windows-only. If the user is on macOS or Linux, refer them to a different skill or ask them to run on a Windows machine.
