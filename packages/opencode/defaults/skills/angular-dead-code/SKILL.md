---
name: angular-dead-code
description: Audit an Angular project on Windows for unused code that bloats the bundle — unreferenced components/services/pipes/directives, orphaned SCSS partials, unreferenced assets, unused npm dependencies, leftover empty modules, and dead route entries. Produces a prioritized report file. Report-only — does NOT delete code. Windows-only (PowerShell or CMD).
---

# Angular Dead-Code Audit (Windows)

Scan the Angular codebase for unused code and produce a report listing safe-to-remove candidates with file references and a confidence rating. Run from the project root.

This skill is **report-only**. It never deletes files or edits code. The user reviews each candidate before removing anything, because grep-based reachability analysis has false positives (dynamic imports, string-based references, template-only usage, reflection).

> **Platform:** This skill runs on **Windows only** (PowerShell or CMD). It does not include bash variants. If `process.platform` is not `win32`, stop and tell the user this skill targets Windows.

## CONTRACT — read this first

This task has exactly one completion condition: the file `DEAD-CODE-AUDIT-[YYYY-MM-DD].md` must exist on disk, written using the **Write tool**.

**ALL output — including the final report — must be written using tool calls (Write/Edit/Bash). Never print findings or the report as a chat message.**

Until that file is written using the Write tool:
- Do NOT produce any text response to the user.
- Do NOT summarize findings in text.
- Do NOT print the report content as a message — use the Write tool instead.
- Do NOT ask the user anything.
- Do NOT stop between steps.
- Do NOT delete or edit any source files. This is a report-only skill.
- Write intermediate findings and progress to `dead-code-scratch.md` using the Write/Edit tool (a tool call, not text).
- Always use FULL paths when reading files — never bare filenames.

The only acceptable output is tool calls, until `DEAD-CODE-AUDIT-[YYYY-MM-DD].md` is written to disk.

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
  - Result `powershell` → write `OS=win32 SHELL=powershell` to `dead-code-scratch.md`. Use **PowerShell** commands.
  - Result `cmd` → write `OS=win32 SHELL=cmd` to `dead-code-scratch.md`. Use **CMD** commands.

Go to Step 1.

---

## Step 1 — Read project state

Read `package.json` in full using the Read tool.
Read `angular.json` in full using the Read tool. Note `sourceRoot` (default `src`).

Detect MFE / single-spa bootstrap (affects which entry points to consider "reachable"):

**PowerShell:**
```
if (Test-Path src/main.single-spa.ts) { "MFE=yes" } else { "MFE=no" }
```
**CMD:**
```
if exist src\main.single-spa.ts (echo MFE=yes) else (echo MFE=no)
```

Append to `dead-code-scratch.md` under `# CurrentState`:
```
PROJECT_NAME=[name from package.json]
ANGULAR_VERSION=[version]
SOURCE_ROOT=[from angular.json, default src]
MFE=[yes/no]
ENTRY_POINTS=[main.ts | main.single-spa.ts | both]
```

Go to Step 2.

---

## Step 2 — Inventory all source files

Build a complete file index. The audit will compare references against this index in later steps.

### TypeScript class files

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.component.ts","*.service.ts","*.directive.ts","*.pipe.ts","*.guard.ts","*.resolver.ts","*.interceptor.ts" -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch "\.spec\.ts$" } | Select-Object -ExpandProperty FullName
```
**CMD:**
```
dir /s /b src\*.component.ts src\*.service.ts src\*.directive.ts src\*.pipe.ts src\*.guard.ts src\*.resolver.ts src\*.interceptor.ts 2>nul | findstr /v ".spec.ts"
```

### SCSS files

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.scss","*.sass","*.css" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
```
**CMD:**
```
dir /s /b src\*.scss src\*.sass src\*.css 2>nul
```

### Asset files

**PowerShell:**
```
Get-ChildItem -Path src/assets -Recurse -File -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
```
**CMD:**
```
dir /s /b /a-d src\assets 2>nul
```

Append the full lists to `dead-code-scratch.md` under `# Inventory`. Go to Step 3.

---

## Step 3 — Unreferenced TypeScript classes

For each class file in the inventory, extract the exported class name and search the codebase for references. A class is a candidate for removal if NO file outside its own folder imports its symbol AND it is not referenced in any template file.

### 3a — Extract exported class names

For each `*.component.ts` / `*.service.ts` / `*.directive.ts` / `*.pipe.ts` / `*.guard.ts` / `*.resolver.ts` / `*.interceptor.ts` from Step 2, read the file with the Read tool and extract the class name from `export class XxxComponent { ... }`.

### 3b — Search for references to each class

For each class name `XxxComponent`:

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts","*.html" -ErrorAction SilentlyContinue | Select-String -Pattern "XxxComponent" -List | Select-Object -ExpandProperty Path
```
**CMD:**
```
findstr /s /m /c:"XxxComponent" src\*.ts src\*.html 2>nul
```

Filter out:
- The file that declares the class (it always references its own name).
- `*.spec.ts` and other test files (a class used only by its own test is still effectively dead).

A class is a **strong candidate** for removal if the filter yields zero references.

### 3c — Selector-based references (components, directives, pipes)

A component/directive may be referenced only by its **selector** in a template, not by its class name. For each component, also search by selector:

For a component declared as `@Component({ selector: 'app-foo', ... })`:

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.html" -ErrorAction SilentlyContinue | Select-String -Pattern "<app-foo|app-foo " -List | Select-Object -ExpandProperty Path
```
**CMD:**
```
findstr /s /m /c:"<app-foo" /c:"app-foo " src\*.html 2>nul
```

For a pipe declared as `@Pipe({ name: 'fooBar' })`:

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.html","*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "\| fooBar" -List | Select-Object -ExpandProperty Path
```
**CMD:**
```
findstr /s /m /c:"| fooBar" src\*.html src\*.ts 2>nul
```

If a class has zero class-name references AND zero selector references AND zero pipe-name references, mark it as **likely dead** in the report.

### 3d — Confidence rating

Assign a confidence level to each candidate:
- **High** — Class exported, never imported anywhere, selector/pipe-name never appears, not referenced from a route file.
- **Medium** — Class never imported but its selector appears in a template that is itself unreachable (because that template's component is also dead).
- **Low** — String matching found references in comments / docs / spec files only; needs manual review.

Append findings to `dead-code-scratch.md` under `# UnreferencedClasses`. Go to Step 4.

---

## Step 4 — Unreferenced TypeScript modules and barrels

Find `*.module.ts` files left over from a standalone migration that no longer have providers/declarations/exports beyond pass-through imports.

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.module.ts" -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch "\.spec\.ts$" } | Select-Object -ExpandProperty FullName
```
**CMD:**
```
dir /s /b src\*.module.ts 2>nul | findstr /v ".spec.ts"
```

For each module file:
1. Read it with the Read tool.
2. Check the `@NgModule({...})` decorator. If `declarations`, `providers`, and `exports` are all empty (or just re-export `RouterModule` etc.), it's an empty shell.
3. Search for references to the class name across the project (same technique as Step 3b).
4. If the module class has no references AND the file is empty, mark it as **dead module**.

Also find barrel `index.ts` files:

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "index.ts" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
```
**CMD:**
```
dir /s /b src\index.ts 2>nul
```

Read each barrel and verify every re-exported symbol still exists. Symbols re-exported but not pointing to a real file are dead exports.

Append to `dead-code-scratch.md` under `# DeadModules`. Go to Step 5.

---

## Step 5 — Orphaned SCSS partials

SCSS files starting with `_` (partials) must be `@use`'d or `@import`'d to take effect. A partial that no other SCSS file references is dead weight.

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Filter "_*.scss" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
```
**CMD:**
```
dir /s /b src\_*.scss 2>nul
```

For each partial file (e.g. `_buttons.scss`), strip the leading underscore and trailing `.scss`, then search:

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.scss","*.sass" -ErrorAction SilentlyContinue | Select-String -Pattern "@use\s+['""].*buttons['""]|@import\s+['""].*buttons['""]" -List | Select-Object -ExpandProperty Path
```
**CMD:**
```
findstr /s /m /r /c:"@use.*buttons" /c:"@import.*buttons" src\*.scss src\*.sass 2>nul
```

If no SCSS file references the partial, mark it as **orphaned**.

Also check `styles.scss` / `styles.css` (the global entry from `angular.json`) for any `@use` / `@import` pointing at files that no longer exist.

Append to `dead-code-scratch.md` under `# OrphanedSCSS`. Go to Step 6.

---

## Step 6 — Unreferenced assets

Files under `src/assets/` should be referenced by templates, components, styles, or scripts. An asset never referenced anywhere ships in the build for nothing.

For each asset file from Step 2's inventory, take just the file name (e.g. `logo.svg`) and search:

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.html","*.ts","*.scss","*.css","*.json" -ErrorAction SilentlyContinue | Select-String -Pattern "logo\.svg" -List | Select-Object -ExpandProperty Path
```
**CMD:**
```
findstr /s /m /c:"logo.svg" src\*.html src\*.ts src\*.scss src\*.css src\*.json 2>nul
```

If no file references the asset name, mark it as **unreferenced asset**.

> ⚠️ **Caveat:** Assets referenced by dynamic URL construction (e.g. `assetUrl('icons/' + name + '.svg')`) will look unreferenced to grep. In the report, list these candidates under "Low confidence" and warn the user to verify before deletion.

Append to `dead-code-scratch.md` under `# UnreferencedAssets`. Go to Step 7.

---

## Step 7 — Unused npm dependencies

Read `package.json` again. For each dependency in `dependencies` and `devDependencies`, check whether any file imports it.

**PowerShell:**
```
# For dependency name "lodash"
Get-ChildItem -Path src -Recurse -Include "*.ts","*.js" -ErrorAction SilentlyContinue | Select-String -Pattern "from ['""]lodash['""]?|require\(['""]lodash['""]\)" -List | Select-Object -ExpandProperty Path
```
**CMD:**
```
findstr /s /m /c:"from 'lodash'" /c:"from \"lodash\"" /c:"require('lodash')" /c:"require(\"lodash\")" src\*.ts src\*.js 2>nul
```

Repeat per dependency. Be careful with packages that are:
- Loaded by Angular CLI / build tooling (e.g. `@angular-builders/custom-webpack`, `@angular-devkit/build-angular`, `karma-*`, `webpack-bundle-analyzer`) — these are referenced from `angular.json` and config files, not from `src`. Cross-check against `angular.json` and `karma.conf.js` before flagging.
- Type-only (`@types/*`) — these are referenced via TypeScript's module resolution, not by import statements. Flag separately under "type-only deps".
- Transitively required (e.g. `tslib`, `zone.js`, polyfills) — never flag these even if no direct import.

Append to `dead-code-scratch.md` under `# UnusedDependencies`. Go to Step 8.

---

## Step 8 — Dead route entries

Read every route file in the project (`*.routes.ts`, `*.route.ts`, `*-routing.module.ts`, `*.routing.module.ts`).

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.routes.ts","*.route.ts","*-routing.module.ts","*.routing.module.ts" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
```
**CMD:**
```
dir /s /b src\*.routes.ts src\*.route.ts src\*-routing.module.ts src\*.routing.module.ts 2>nul
```

For each route entry, verify:
- Eager routes: the `component: XxxComponent` reference points to a class that exists and is exported.
- Lazy routes: the `loadChildren` or `loadComponent` import path points to a file that exists, and the imported symbol exists in that file.

Flag routes whose target component file no longer exists (orphaned route).

Append to `dead-code-scratch.md` under `# DeadRoutes`. Go to Step 9.

---

## Step 9 — Optional: cross-check with knip / depcheck if available

If the project has `knip` or `depcheck` installed locally, run them to cross-check findings:

**PowerShell:**
```
if (Test-Path node_modules/.bin/knip.cmd) { npx knip --reporter json }
if (Test-Path node_modules/.bin/depcheck.cmd) { npx depcheck --json }
```
**CMD:**
```
if exist node_modules\.bin\knip.cmd (npx knip --reporter json)
if exist node_modules\.bin\depcheck.cmd (npx depcheck --json)
```

If neither is installed, skip this step — do NOT install them. Append the JSON output (or "not installed") to `dead-code-scratch.md` under `# ToolCrossCheck`. Use the tool output to upgrade the **confidence** rating of any candidate that both grep and the tool agree on.

Go to Step 10.

---

## Step 10 — Write the audit report

**MANDATORY: Use the Write tool to write the file to disk. Do NOT print the report content as a chat message.**

1. Read `dead-code-scratch.md` in full using the Read tool.
2. Call the **Write tool** with `file_path = DEAD-CODE-AUDIT-[YYYY-MM-DD].md` and the full report as `content`. The file MUST be written to disk.
3. After the Write tool confirms success, delete `dead-code-scratch.md`:
   - **PowerShell:** `Remove-Item dead-code-scratch.md`
   - **CMD:** `del dead-code-scratch.md`
4. Only after the file exists on disk, post a single short message: `Dead-code audit written to DEAD-CODE-AUDIT-[YYYY-MM-DD].md`

Use ONLY information found in actual files. Reference exact file paths. Do not flag candidates with high confidence unless you have verified zero references via grep.

---

## Report structure

```markdown
# Angular Dead-Code Audit — [Project Name]

**Generated:** [today's date]
**Angular version:** [from package.json]
**MFE (single-spa):** [yes/no]

> Report-only. Each candidate below requires manual verification before deletion. Grep-based reachability has false positives — dynamic imports, string-based DI tokens, template-only usage, and reflection are not detected.

---

## Summary

| Category | Candidates | Estimated impact |
|----------|------------|------------------|
| Unreferenced classes | [n] | Bundle size + tree-shaking |
| Dead modules | [n] | Build graph cleanup |
| Orphaned SCSS partials | [n] | CSS bundle |
| Unreferenced assets | [n] | Static asset weight |
| Unused dependencies | [n] | node_modules + lock file |
| Dead route entries | [n] | Build errors / 404s |

---

## Unreferenced Classes

### High confidence

| File | Class | Type | Notes |
|------|-------|------|-------|
| `src/app/.../foo.component.ts` | `FooComponent` | Component | Selector `app-foo` not found in any template |
| `src/app/.../bar.service.ts` | `BarService` | Service | Class not imported anywhere |

### Medium confidence

| File | Class | Type | Notes |
|------|-------|------|-------|
| `src/app/.../baz.directive.ts` | `BazDirective` | Directive | Used only by a parent that is itself unreferenced |

### Low confidence (manual review required)

| File | Class | Type | Why uncertain |
|------|-------|------|---------------|
| `src/app/.../qux.pipe.ts` | `QuxPipe` | Pipe | Pipe name `qux` matched in a comment block — verify |

---

## Dead Modules

| File | Class | Notes |
|------|-------|-------|
| `src/app/legacy.module.ts` | `LegacyModule` | Empty `@NgModule`, no references after standalone migration |

---

## Orphaned SCSS Partials

| File | Notes |
|------|-------|
| `src/styles/_legacy-buttons.scss` | Not `@use`'d or `@import`'d by any other SCSS file |

---

## Unreferenced Assets

### High confidence

| File | Size | Notes |
|------|------|-------|
| `src/assets/icons/old-logo.svg` | 12 KB | Filename not found in any source file |

### Low confidence (dynamic URL construction possible)

| File | Notes |
|------|-------|
| `src/assets/icons/menu/home.svg` | Folder may be referenced via `assetUrl('icons/menu/' + name)` — verify |

---

## Unused Dependencies

### Likely safe to remove

| Package | Where it would have been used |
|---------|-------------------------------|
| `lodash` | No `from 'lodash'` import anywhere in `src` |

### Build-tool / type-only (do NOT auto-remove)

| Package | Reason to keep |
|---------|----------------|
| `@angular-builders/custom-webpack` | Referenced in `angular.json` |
| `@types/jasmine` | Type-only, used by spec files |

---

## Dead Route Entries

| Route file | Path | Issue |
|-----------|------|-------|
| `src/app/app.route.ts` | `/legacy` | Target component file `./legacy/legacy.component.ts` does not exist |

---

## Recommended cleanup order

1. **Dead route entries** — these can break the build; fix first.
2. **Dead modules** — empty shells left after migration; safest to delete.
3. **High-confidence unreferenced classes** — verify each, then delete.
4. **Orphaned SCSS partials** — delete and re-run a build to confirm no visual regressions.
5. **Unreferenced assets** — high-confidence list first; low-confidence list after manual spot-check.
6. **Unused dependencies** — run `npm uninstall` one at a time, verify build.

After each batch:
```
npx ng build --configuration production
npx ng test --watch=false
```

Roll back any batch that breaks the build or tests.

---

## False-positive checklist

A candidate may be falsely flagged as dead if:
- It is referenced via a dynamic `import()` based on runtime state.
- It is referenced via a string-based DI token (e.g. `Injector.get('FooService')`).
- It is referenced from a route's `data` block via a string key.
- It is loaded by a config file outside `src/` (e.g. `karma.conf.js`, `webpack.config.js`, `extra-webpack.config.js`).
- It is part of a public API surface exposed by an internal lib (`packages/*/index.ts`).
- The asset path is built at runtime: `` `assets/icons/${name}.svg` ``.

When in doubt, keep the file and add a TODO instead of deleting.
```

---

## Guidelines

- This skill is **report-only**. Do not delete any file or edit any source code from inside this skill.
- Cross-check high-confidence candidates against `angular.json`, `karma.conf.js`, and any `*.config.js` files before flagging — build tooling references won't show up in `src/`.
- For MFE projects, treat `main.single-spa.ts` and any `singleSpaAngular({ ... })` wrapper as the entry point; everything reachable from the AppComponent / route tree is alive.
- Components/directives/pipes referenced only by their selector or pipe-name in a template ARE alive — Step 3c is mandatory before flagging a class as dead.
- Recommend `npm uninstall <pkg>` one at a time, with a build verification between each — bulk removal masks which uninstall broke the build.
- This skill is Windows-only. If the user is on macOS or Linux, refer them to a different skill or ask them to run on a Windows machine.
