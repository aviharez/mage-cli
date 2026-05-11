---
name: angular-perf
description: Audit Angular application performance on Windows — bundle size, change detection (OnPush), lazy loading, template inefficiencies, RxJS memory leaks, Zone.js triggers, and signal migration opportunities. Produces a prioritized report file. Windows-only (PowerShell or CMD).
---

# Angular Performance Audit (Windows)

Scan the Angular codebase for performance issues and produce a prioritized report with specific file references and fix instructions. Run from the project root.

> **Platform:** This skill runs on **Windows only** (PowerShell or CMD). It does not include bash variants. If `process.platform` is not `win32`, stop and tell the user this skill targets Windows.

## CONTRACT — read this first

This task has exactly one completion condition: the file `PERF-AUDIT-[YYYY-MM-DD].md` must exist on disk, written using the **Write tool**.

**ALL output — including the final report — must be written using tool calls (Write/Edit/Bash). Never print findings or the report as a chat message.**

Until that file is written using the Write tool:
- Do NOT produce any text response to the user.
- Do NOT summarize findings in text.
- Do NOT print the report content as a message — use the Write tool instead.
- Do NOT ask the user anything.
- Do NOT stop between steps.
- Write intermediate findings and progress to `perf-scratch.md` using the Write/Edit tool (a tool call, not text).
- Always use FULL paths when reading files — never bare filenames.

The only acceptable output is tool calls, until `PERF-AUDIT-[YYYY-MM-DD].md` is written to disk.

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
  - Result `powershell` → write `OS=win32 SHELL=powershell` to `perf-scratch.md`. Use **PowerShell** commands.
  - Result `cmd` → write `OS=win32 SHELL=cmd` to `perf-scratch.md`. Use **CMD** commands.

Go to Step 1.

---

## Step 1 — Read build configuration

Read `angular.json` in full using the Read tool. Append findings to `perf-scratch.md` under `# BuildConfig`.

Check the production configuration for:
- `optimization: true`
- `sourceMap: false`
- `aot: true`
- `buildOptimizer: true`
- `budgets` array present with sensible thresholds (initial < 1MB, anyComponentStyle < 6kB)
- `outputHashing: all`

Flag any missing or disabled settings. Go to Step 2.

---

## Step 2 — Read package.json (Angular version + dependencies)

Read `package.json` in full using the Read tool. Append to `perf-scratch.md` under `# Dependencies`. Note the Angular version and whether `lodash`, `moment`, or other known heavy libraries are present.

Go to Step 3.

---

## Step 3 — Bundle size: heavy imports

### Lodash and Moment whole-library imports

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "from 'lodash'|from 'moment'" | Select-Object Path, LineNumber, Line | Select-Object -First 20
```
**CMD:**
```
findstr /s /n /c:"from 'lodash'" /c:"from 'moment'" src\*.ts 2>nul
```

### Bare rxjs imports (should use rxjs/operators where applicable)

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "from 'rxjs'" | Where-Object { $_.Line -notmatch "operators|ajax|webSocket|testing" } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```
**CMD:**
```
findstr /s /n /c:"from 'rxjs'" src\*.ts 2>nul | findstr /v "operators ajax webSocket testing"
```

### CommonModule imported in standalone components

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "CommonModule" | Select-Object Path, LineNumber, Line | Select-Object -First 30
```
**CMD:**
```
findstr /s /n /c:"CommonModule" src\*.ts 2>nul
```

Append all results to `perf-scratch.md` under `# BundleSize`. Go to Step 4.

---

## Step 4 — Change detection: missing OnPush

Find all component files and check which ones are missing `OnPush`.

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "ChangeDetectionStrategy" | Select-Object Path, LineNumber, Line | Select-Object -First 30
```
**CMD:**
```
findstr /s /n /c:"ChangeDetectionStrategy" src\*.ts 2>nul
```

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "@Component" -List | Select-Object -ExpandProperty Path | Select-Object -First 30
```
**CMD:**
```
findstr /s /m /c:"@Component" src\*.ts 2>nul
```

Cross-reference: component files that appear in the second list but NOT in the first list are missing `OnPush`. Append findings to `perf-scratch.md` under `# ChangeDetection`. Go to Step 5.

---

## Step 5 — Lazy loading: find eager routes

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.routes.ts","*.route.ts","*-routing.module.ts","app.routes.ts" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Select-Object -First 10
```
**CMD:**
```
dir /s /b src\*.routes.ts src\*.route.ts src\*-routing.module.ts 2>nul
```

Read each routing file returned using the Read tool. Flag any route using `component: SomeName` directly (eager) instead of `loadComponent: () => import(...)` (lazy). Also flag `loadChildren` pointing to a `.module.ts` file instead of a `.routes.ts` / `.route.ts` file.

Append findings to `perf-scratch.md` under `# LazyLoading`. Go to Step 6.

---

## Step 6 — Template inefficiencies

### `*ngFor` / `@for` without trackBy / track

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.html" -ErrorAction SilentlyContinue | Select-String -Pattern "ngFor|@for " | Where-Object { $_.Line -notmatch "trackBy|track " } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```
**CMD:**
```
findstr /s /n /c:"ngFor" /c:"@for " src\*.html 2>nul | findstr /v "trackBy track"
```

### Images without lazy loading

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.html" -ErrorAction SilentlyContinue | Select-String -Pattern "<img" | Where-Object { $_.Line -notmatch "loading=" } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```
**CMD:**
```
findstr /s /n /c:"<img" src\*.html 2>nul | findstr /v "loading="
```

### Function calls in templates

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.html" -ErrorAction SilentlyContinue | Select-String -Pattern "\{\{.*\(" | Where-Object { $_.Line -notmatch "async|translate|date|currency|percent|number|json|slice|uppercase|lowercase" } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```
**CMD:**
```
findstr /s /n /r /c:"{{.*(" src\*.html 2>nul | findstr /v "async translate date currency percent number json slice uppercase lowercase"
```

Append all results to `perf-scratch.md` under `# Templates`. Go to Step 7.

---

## Step 7 — RxJS: memory leaks

### Subscriptions without takeUntil or takeUntilDestroyed

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "\.subscribe\(" | Where-Object { $_.Line -notmatch "takeUntil|takeUntilDestroyed|spec|test|mock" } | Select-Object Path, LineNumber, Line | Select-Object -First 30
```
**CMD:**
```
findstr /s /n /c:".subscribe(" src\*.ts 2>nul | findstr /v "takeUntil takeUntilDestroyed spec test mock"
```

For each file returned, read with the Read tool and check if the class has `ngOnDestroy` with `.unsubscribe()`. If not, it is a memory leak.

### Nested subscribe calls

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "\.subscribe\(" -List | Select-Object -ExpandProperty Path | Select-Object -First 15
```
**CMD:**
```
findstr /s /m /c:".subscribe(" src\*.ts 2>nul
```

Read each file returned. Look for `.subscribe(` appearing inside another `.subscribe(` callback. Flag these as nested subscribe anti-patterns.

Append all results to `perf-scratch.md` under `# RxJS`. Go to Step 8.

---

## Step 8 — Zone.js: unnecessary triggers

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "setInterval|setTimeout|addEventListener" | Where-Object { $_.Line -notmatch "spec|test|mock|ngZone" } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```
**CMD:**
```
findstr /s /n /c:"setInterval" /c:"setTimeout" /c:"addEventListener" src\*.ts 2>nul | findstr /v "spec test mock ngZone"
```

Flag any `setInterval`, `setTimeout`, or `addEventListener` calls not wrapped in `ngZone.runOutsideAngular()`. Append to `perf-scratch.md` under `# Zone`. Go to Step 9.

---

## Step 9 — Signal migration opportunities

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "@Input\(\)|new BehaviorSubject|@ViewChild|@ContentChild" | Where-Object { $_.Line -notmatch "spec|test" } | Select-Object Path, LineNumber, Line | Select-Object -First 30
```
**CMD:**
```
findstr /s /n /c:"@Input()" /c:"new BehaviorSubject" /c:"@ViewChild" /c:"@ContentChild" src\*.ts 2>nul | findstr /v "spec test"
```

Only flag as a migration opportunity if the Angular version (from Step 2) is 17 or higher. Append to `perf-scratch.md` under `# Signals`. Go to Step 10.

---

## Step 10 — Write the audit report

**MANDATORY: Use the Write tool to write the file to disk. Do NOT print the report content as a chat message.**

1. Read `perf-scratch.md` in full using the Read tool.
2. Call the **Write tool** with `file_path = PERF-AUDIT-[YYYY-MM-DD].md` and the full report as `content`. The file MUST be written to disk.
3. After the Write tool confirms success, delete `perf-scratch.md`:
   - **PowerShell:** `Remove-Item perf-scratch.md`
   - **CMD:** `del perf-scratch.md`
4. Only after the file exists on disk, post a single short message: `Performance audit written to PERF-AUDIT-[YYYY-MM-DD].md`

Use ONLY information found in actual files. Reference exact file paths and line numbers. Do not flag issues that are already correctly implemented.

---

## Output structure

```markdown
# Angular Performance Audit — [Project Name]

**Generated:** [today's date]
**Angular version:** [from package.json]

---

## Summary

| Category | Issues Found | Severity |
|----------|-------------|----------|
| Build config | [n] | High / Medium / Low |
| Bundle size | [n] | High / Medium / Low |
| Change detection | [n] | High / Medium / Low |
| Lazy loading | [n] | High / Medium / Low |
| Template | [n] | High / Medium / Low |
| RxJS leaks | [n] | High / Medium / Low |
| Zone.js | [n] | Medium / Low |
| Signals | [n] | Low |

---

## High Priority

### [Issue Title]
**File:** `path/to/file.ts:line`
**Problem:** [what is wrong and why it hurts performance]
**Fix:**
```typescript
// Before
...
// After
...
```

---

## Medium Priority

[same structure]

---

## Low Priority

[same structure]

---

## What is Already Good

- [List anything the codebase does correctly — do not leave this section empty]
```

---

## Severity guide

| Severity | Criteria |
|----------|----------|
| **High** | Memory leaks, large bundle bloat, or missing production build flags |
| **Medium** | Unnecessary re-renders, missing lazy loading, template function calls |
| **Low** | Best-practice improvements with minor measurable impact |

## Fix reference

| Issue | Fix |
|-------|-----|
| Whole lodash import | `import debounce from 'lodash/debounce'` |
| Bare rxjs import | `import { map } from 'rxjs/operators'` |
| `CommonModule` in standalone | Import `NgIf`, `NgFor`, `AsyncPipe` individually, or rely on `@if` / `@for` |
| Missing `OnPush` | Add `changeDetection: ChangeDetectionStrategy.OnPush` |
| Eager route | Change to `loadComponent: () => import('./x.component').then(m => m.XComponent)` |
| `*ngFor` no trackBy | Add `trackBy: trackById` or use `@for (item of items; track item.id)` |
| `<img>` no lazy | Add `loading="lazy"` |
| Function in template | Use pure pipe or computed signal instead |
| Unmanaged subscribe | Add `.pipe(takeUntilDestroyed())` |
| Nested subscribe | Replace with `switchMap` / `mergeMap` |
| Timer inside zone | Wrap with `ngZone.runOutsideAngular(() => { ... })` |

---

## Guidelines

- This skill is Windows-only. If the user is on macOS or Linux, refer them to a different skill or ask them to run on a Windows machine.
- Always verify a flagged issue by reading the file before including it in the report — false positives erode trust.
- Do not mutate code in this skill — produce a report only. Fixes belong in a follow-up task or in `angular-update` / `angular-standalone-migration`.
