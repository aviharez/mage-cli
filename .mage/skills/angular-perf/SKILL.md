---
name: angular-perf
description: Audit Angular application performance — bundle size, change detection, lazy loading, template inefficiencies, RxJS memory leaks, and build configuration
---

# Angular Performance Audit

Scan the Angular codebase for performance issues and produce a prioritized report with specific file references and fix instructions. Run from the project root.

## CONTRACT

- Do NOT stop between steps.
- Do NOT produce any text response until the final report is written.
- Write intermediate findings to `perf-scratch.md` using tool calls.
- Always use FULL file paths when reading files.
- The task is complete only when `PERF-AUDIT-[YYYY-MM-DD].md` exists on disk.

---

## Step 0 — Detect OS

```
node -e "console.log(process.platform)"
```

- `win32` → **Windows**: use PowerShell commands in every step below.
- `darwin` / `linux` → **Unix**: use bash commands in every step below.

Write `OS=[result]` to `perf-scratch.md`. Go to Step 1.

---

## Step 1 — Read build configuration

Read `angular.json` in full. Append to `perf-scratch.md` under `# BuildConfig`.

**bash:** `cat angular.json`
**PowerShell:** `Get-Content angular.json`

Check the production configuration for:
- `optimization: true`
- `sourceMap: false`
- `aot: true`
- `buildOptimizer: true`
- `budgets` array present
- `outputHashing: all`

Flag any missing or disabled settings. Go to Step 2.

---

## Step 2 — Read package.json (Angular version + dependencies)

**bash:** `cat package.json`
**PowerShell:** `Get-Content package.json`

Append to `perf-scratch.md` under `# Dependencies`. Note the Angular version and whether `lodash`, `moment`, or other known heavy libraries are present. Go to Step 3.

---

## Step 3 — Bundle size: heavy imports

### Lodash and Moment whole-library imports

**bash:**
```
grep -rn "from 'lodash'\|from 'moment'" src --include="*.ts" | head -20
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "from 'lodash'|from 'moment'" | Select-Object Path, LineNumber, Line | Select-Object -First 20
```

### Bare rxjs imports (should use rxjs/operators)

**bash:**
```
grep -rn "from 'rxjs'" src --include="*.ts" | grep -v "operators\|ajax\|webSocket\|testing" | head -20
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "from 'rxjs'" | Where-Object { $_.Line -notmatch "operators|ajax|webSocket|testing" } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```

### CommonModule imported in standalone components

**bash:**
```
grep -rn "CommonModule" src --include="*.ts" | head -30
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "CommonModule" | Select-Object Path, LineNumber, Line | Select-Object -First 30
```

Append all results to `perf-scratch.md` under `# BundleSize`. Go to Step 4.

---

## Step 4 — Change detection: missing OnPush

Find all component files and check which ones are missing `OnPush`.

**bash:**
```
grep -rn "ChangeDetectionStrategy" src --include="*.ts" | head -30
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "ChangeDetectionStrategy" | Select-Object Path, LineNumber, Line | Select-Object -First 30
```

**bash:**
```
grep -rn "@Component" src --include="*.ts" -l | head -30
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "@Component" -List | Select-Object -ExpandProperty Path | Select-Object -First 30
```

Cross-reference: component files that appear in the second list but NOT in the first list are missing `OnPush`. Append findings to `perf-scratch.md` under `# ChangeDetection`. Go to Step 5.

---

## Step 5 — Lazy loading: find eager routes

**bash:**
```
find src -name "*.routes.ts" -o -name "*-routing.module.ts" -o -name "app.routes.ts" | head -10
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.routes.ts","*-routing.module.ts","app.routes.ts" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Select-Object -First 10
```

Read each routing file returned using the full path. Flag any route using `component: SomeName` directly (eager) instead of `loadComponent: () => import(...)` (lazy). Also flag `loadChildren` pointing to a `.module.ts` file instead of a `.routes.ts` file.

Append findings to `perf-scratch.md` under `# LazyLoading`. Go to Step 6.

---

## Step 6 — Template inefficiencies

### *ngFor without trackBy

**bash:**
```
grep -rn "ngFor" src --include="*.html" | grep -v "trackBy\|track " | head -20
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.html" -ErrorAction SilentlyContinue | Select-String -Pattern "ngFor" | Where-Object { $_.Line -notmatch "trackBy|track " } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```

### Images without lazy loading

**bash:**
```
grep -rn "<img" src --include="*.html" | grep -v "loading=" | head -20
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.html" -ErrorAction SilentlyContinue | Select-String -Pattern "<img" | Where-Object { $_.Line -notmatch "loading=" } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```

### Function calls in templates

**bash:**
```
grep -rn "{{.*(" src --include="*.html" | grep -v "async\|translate\|date\|currency\|percent\|number\|json\|slice\|uppercase\|lowercase" | head -20
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.html" -ErrorAction SilentlyContinue | Select-String -Pattern "\{\{.*\(" | Where-Object { $_.Line -notmatch "async|translate|date|currency|percent|number|json|slice|uppercase|lowercase" } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```

Append all results to `perf-scratch.md` under `# Templates`. Go to Step 7.

---

## Step 7 — RxJS: memory leaks

### Subscriptions without takeUntil or takeUntilDestroyed

**bash:**
```
grep -rn "\.subscribe(" src --include="*.ts" | grep -v "takeUntil\|takeUntilDestroyed\|spec\|test\|mock" | head -30
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "\.subscribe\(" | Where-Object { $_.Line -notmatch "takeUntil|takeUntilDestroyed|spec|test|mock" } | Select-Object Path, LineNumber, Line | Select-Object -First 30
```

For each file returned, check if the class has `ngOnDestroy` with `.unsubscribe()`. If not, it is a memory leak.

### Nested subscribe calls

**bash:**
```
grep -rn "\.subscribe(" src --include="*.ts" -l | head -15
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "\.subscribe\(" -List | Select-Object -ExpandProperty Path | Select-Object -First 15
```

Read each file returned. Look for `.subscribe(` appearing inside another `.subscribe(` callback. Flag these as nested subscribe anti-patterns.

Append all results to `perf-scratch.md` under `# RxJS`. Go to Step 8.

---

## Step 8 — Zone.js: unnecessary triggers

**bash:**
```
grep -rn "setInterval\|setTimeout\|addEventListener" src --include="*.ts" | grep -v "spec\|test\|mock\|ngZone" | head -20
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "setInterval|setTimeout|addEventListener" | Where-Object { $_.Line -notmatch "spec|test|mock|ngZone" } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```

Flag any `setInterval`, `setTimeout`, or `addEventListener` calls not wrapped in `ngZone.runOutsideAngular()`. Append to `perf-scratch.md` under `# Zone`. Go to Step 9.

---

## Step 9 — Signal migration opportunities

**bash:**
```
grep -rn "@Input()\|new BehaviorSubject\|@ViewChild\|@ContentChild" src --include="*.ts" | grep -v "spec\|test" | head -30
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "@Input\(\)|new BehaviorSubject|@ViewChild|@ContentChild" | Where-Object { $_.Line -notmatch "spec|test" } | Select-Object Path, LineNumber, Line | Select-Object -First 30
```

Only flag as a migration opportunity if the Angular version (from Step 2) is 17 or higher. Append to `perf-scratch.md` under `# Signals`. Go to Step 10.

---

## Step 10 — Write the audit report

Read `perf-scratch.md` in full. Write `PERF-AUDIT-[YYYY-MM-DD].md` at the project root using the structure below. Delete `perf-scratch.md`. This is the only step that produces user-visible output.

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
| `CommonModule` in standalone | Import `NgIf`, `NgFor`, `AsyncPipe` individually |
| Missing `OnPush` | Add `changeDetection: ChangeDetectionStrategy.OnPush` |
| Eager route | Change to `loadComponent: () => import('./x.component').then(m => m.XComponent)` |
| `*ngFor` no trackBy | Add `trackBy: trackById` or use `@for (item of items; track item.id)` |
| `<img>` no lazy | Add `loading="lazy"` |
| Function in template | Use pure pipe or computed signal instead |
| Unmanaged subscribe | Add `.pipe(takeUntilDestroyed())` |
| Nested subscribe | Replace with `switchMap` / `mergeMap` |
| Timer inside zone | Wrap with `ngZone.runOutsideAngular(() => { ... })` |
