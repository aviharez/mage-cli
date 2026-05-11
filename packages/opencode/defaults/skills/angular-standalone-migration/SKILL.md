---
name: angular-standalone-migration
description: Migrate an Angular 20 project from NgModule-based architecture to standalone components on Windows, including control-flow conversion (*ngIf → @if), creation of a dedicated app.config.ts, route file renaming to *.route.ts, and rewiring of single-spa MFE bootstrap. Assumes Angular 20 is already installed — does NOT run version upgrades. Windows-only (PowerShell or CMD).
---

# Angular Standalone + Control-Flow Migration (Angular 20, Windows)

Use this skill when the project is **already on Angular 20** and only needs:
1. Control-flow conversion (`*ngIf` → `@if`, `*ngFor` → `@for`, `[ngSwitch]` → `@switch`).
2. Standalone migration with a dedicated `src/app/app.config.ts`.
3. Routing files renamed from `*-routing.module.ts` (or `*.routing.module.ts`) to `*.route.ts` exporting plain `Routes`.
4. For single-spa MFE projects: rewire `main.single-spa.ts` to use `bootstrapApplication` while preserving the lifecycle.

If the project is still on Angular 18 or 19, use the **`angular-update`** skill (full path) or **`angular-version-update`** skill (version bump only) first.

> **Platform:** This skill runs on **Windows only** (PowerShell or CMD). It does not include bash variants. If `process.platform` is not `win32`, stop and tell the user this skill targets Windows.

## CONTRACT — read this first

This task has exactly one completion condition: the file `STANDALONE-MIGRATION-REPORT-[YYYY-MM-DD].md` must exist on disk, written using the **Write tool**.

**ALL output — including the final report — must be written using tool calls (Write/Edit/Bash). Never print findings or the report as a chat message.**

Until that file is written using the Write tool:
- Do NOT produce any text response to the user.
- Do NOT summarize findings in text.
- Do NOT print the report content as a message — use the Write tool instead.
- Do NOT ask the user anything.
- Do NOT stop between steps unless a build fails.
- Write intermediate findings and progress to `standalone-scratch.md` using the Write/Edit tool (a tool call, not text).
- Always use FULL paths when reading files — never bare filenames.

**Exception:** If a build fails, stop immediately and report the full error to the user. Do not continue to the next step.

The only acceptable output is tool calls, until `STANDALONE-MIGRATION-REPORT-[YYYY-MM-DD].md` is written to disk (or a build fails).

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
  - Result `powershell` → write `OS=win32 SHELL=powershell` to `standalone-scratch.md`. Use **PowerShell** commands.
  - Result `cmd` → write `OS=win32 SHELL=cmd` to `standalone-scratch.md`. Use **CMD** commands.

Go to Step 1.

---

## Step 1 — Verify Angular 20 + detect bootstrap style

Read `package.json` in full using the Read tool.

If `@angular/core` is **not** at `^20.x` / `~20.x` / `20.x.x`:
- Stop immediately.
- Tell the user: "This skill targets Angular 20 only. Detected version: [X]. Use the `angular-version-update` skill (version bump only) or the `angular-update` skill (full migration) to upgrade first."
- Do NOT proceed.

Read `angular.json` in full using the Read tool. Note project name and `sourceRoot`.

### Detect MFE / single-spa bootstrap

**PowerShell:**
```
if (Test-Path src/main.single-spa.ts) { "MFE=yes" } else { "MFE=no" }
```
**CMD:**
```
if exist src\main.single-spa.ts (echo MFE=yes) else (echo MFE=no)
```

If `MFE=yes`, also read these files in full:
- `src/main.single-spa.ts`
- `src/main.ts` (if it exists)
- `src/single-spa/single-spa-props.ts` (if it exists)

### Detect existing standalone status

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "@NgModule" | Where-Object { $_.Line -notmatch "spec|test" } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```
**CMD:**
```
findstr /s /n /c:"@NgModule" src\*.ts 2>nul | findstr /v "spec test"
```

Append findings to `standalone-scratch.md` under `# CurrentState`:
```
PROJECT_NAME=[name from package.json]
ANGULAR_VERSION=[20.x.x]
HAS_MATERIAL=[yes/no]
HAS_NGRX=[yes/no]
MFE=[yes/no]
BOOTSTRAP_FILE=[main.single-spa.ts | main.ts]
APP_SELECTOR=[from app.component.ts, e.g. dashboard-setting-root]
NGMODULE_COUNT=[number of @NgModule occurrences]
```

Run a baseline build to confirm the starting state compiles:

**PowerShell / CMD:** `npx ng build`

If the build fails before any changes are made, stop and report. The migration assumes a green starting point.

Go to Step 2.

---

## Step 2 — Run control-flow schematic

Run the built-in schematic to auto-convert the majority of structural directives:

**PowerShell / CMD:**
```
npx ng generate @angular/core:control-flow
```

Verify:

**PowerShell / CMD:** `npx ng build`

If the build **fails**, stop and report.
If it **passes**, append `control-flow schematic: OK` to `standalone-scratch.md` under `# Steps`. Go to Step 3.

---

## Step 3 — Manual control-flow transformation

The schematic does not handle every case. This step finds and manually transforms all remaining structural directives using Read + Edit.

### 3a — Find files with remaining structural directives

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.html" -ErrorAction SilentlyContinue | Select-String -Pattern "\*ngIf|\*ngFor|\[ngSwitch\]|\*ngSwitchCase|\*ngSwitchDefault" -List | Select-Object -ExpandProperty Path
```
**CMD:**
```
findstr /s /m /c:"*ngIf" /c:"*ngFor" /c:"[ngSwitch]" /c:"*ngSwitchCase" /c:"*ngSwitchDefault" src\*.html 2>nul
```

Append the list to `standalone-scratch.md` under `# RemainingControlFlow`.

If no files are found, append `no manual control flow fixes needed` and skip to Step 4.

### 3b — Transform each file

Read EVERY file from the list above using the Read tool. Apply ALL transformations below using Edit. Never skip a file.

After editing each file, re-run:

**PowerShell / CMD:** `npx ng build`

If the build fails after any edit, stop and report the full diff and error.

---

### Transformation reference

#### `*ngIf` — simple condition

```html
<!-- Before -->
<div *ngIf="condition">content</div>

<!-- After -->
@if (condition) {
  <div>content</div>
}
```

#### `*ngIf` with `else`

```html
<!-- Before -->
<div *ngIf="condition; else elseBlock">content</div>
<ng-template #elseBlock>fallback</ng-template>

<!-- After -->
@if (condition) {
  <div>content</div>
} @else {
  fallback
}
```

> Remove the `<ng-template #elseBlock>` after inlining its content into `@else`.

#### `*ngIf` with `then` and `else`

```html
<!-- Before -->
<ng-container *ngIf="condition; then thenBlock; else elseBlock"></ng-container>
<ng-template #thenBlock>yes</ng-template>
<ng-template #elseBlock>no</ng-template>

<!-- After -->
@if (condition) {
  yes
} @else {
  no
}
```

#### `*ngIf` with `as` (async pipe alias)

```html
<!-- Before -->
<div *ngIf="obs$ | async as data">{{ data.name }}</div>

<!-- After -->
@if (obs$ | async; as data) {
  <div>{{ data.name }}</div>
}
```

#### `*ngFor` — basic

```html
<!-- Before -->
<li *ngFor="let item of items">{{ item }}</li>

<!-- After -->
@for (item of items; track item) {
  <li>{{ item }}</li>
}
```

> Use the most specific field as track expression (e.g., `track item.id`). Fall back to `track item` or `track $index` only if no unique field is present.

#### `*ngFor` with `trackBy`

```html
<!-- Before -->
<li *ngFor="let item of items; trackBy: trackById">{{ item.name }}</li>

<!-- After -->
@for (item of items; track trackById($index, item)) {
  <li>{{ item.name }}</li>
}
```

#### `*ngFor` with `index` / `first` / `last`

```html
<!-- Before -->
<li *ngFor="let item of items; let i = index; let isFirst = first">

<!-- After -->
@for (item of items; track item; let i = $index, isFirst = $first) {
```

Available implicit variables: `$index`, `$first`, `$last`, `$even`, `$odd`, `$count`.

#### `*ngFor` with `@empty`

```html
<!-- Before -->
<li *ngFor="let item of items">{{ item }}</li>
<p *ngIf="items.length === 0">No items.</p>

<!-- After -->
@for (item of items; track item) {
  <li>{{ item }}</li>
} @empty {
  <p>No items.</p>
}
```

#### `[ngSwitch]` / `*ngSwitchCase` / `*ngSwitchDefault`

```html
<!-- Before -->
<div [ngSwitch]="value">
  <span *ngSwitchCase="'a'">A</span>
  <span *ngSwitchCase="'b'">B</span>
  <span *ngSwitchDefault>other</span>
</div>

<!-- After -->
@switch (value) {
  @case ('a') { <span>A</span> }
  @case ('b') { <span>B</span> }
  @default { <span>other</span> }
}
```

---

### Cases that must NOT be auto-transformed

Leave the following as-is and record them under `# ManualItems` in `standalone-scratch.md`:

- Custom structural directives (anything that is not `*ngIf`, `*ngFor`, `*ngSwitch*`)
- `*ngIf` / `*ngFor` on the same element as another structural directive — extract one to `<ng-container>` first
- Templates with complex expressions that span multiple lines and risk mis-parsing

For each skipped item, append to `standalone-scratch.md`:
```
FILE=[path] LINE=[n] REASON=[why it was skipped]
```

After all files are transformed and the build passes, append `manual control flow: OK` to `standalone-scratch.md` under `# Steps`. Go to Step 4.

---

## Step 4 — Standalone migration (schematic, 3 passes)

Run the schematic three times in sequence. Verify the build after each sub-step.

### 4a — Convert components, directives, and pipes

**PowerShell / CMD:**
```
npx ng generate @angular/core:standalone
```

When prompted, select: **Convert all components, directives, and pipes**

**PowerShell / CMD:** `npx ng build`

If build fails, stop and report.

### 4b — Remove unnecessary NgModules

**PowerShell / CMD:**
```
npx ng generate @angular/core:standalone
```

When prompted, select: **Remove unnecessary NgModules**

**PowerShell / CMD:** `npx ng build`

### 4c — Bootstrap using standalone APIs

> ⚠️ **MFE caveat:** If `MFE=yes` from Step 1, this schematic may modify `main.ts`. The single-spa entry point is `main.single-spa.ts`, which the schematic does not understand. The schematic-generated bootstrap on `main.ts` should be discarded (or kept only for non-single-spa local dev). The actual standalone wiring for single-spa MUST be done manually in Step 5 below.

**PowerShell / CMD:**
```
npx ng generate @angular/core:standalone
```

When prompted, select: **Bootstrap using standalone APIs**

**PowerShell / CMD:** `npx ng build`

After all three, check for remaining NgModule references:

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "NgModule|@NgModule" | Where-Object { $_.Line -notmatch "spec|test|//.*NgModule" } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```
**CMD:**
```
findstr /s /n /c:"NgModule" /c:"@NgModule" src\*.ts 2>nul | findstr /v "spec test"
```

Append `standalone schematic: OK` to `standalone-scratch.md` under `# Steps`. Go to Step 5.

---

## Step 5 — Create `src/app/app.config.ts` (REQUIRED)

This step is **mandatory**, regardless of MFE status. The standalone bootstrap configuration MUST live in `src/app/app.config.ts`. Provider arrays MUST NOT be inlined in `main.ts` or `main.single-spa.ts`.

1. Re-read the OLD `app.module.ts` (if it still exists) using the Read tool. Identify everything in its `imports`, `providers`, and any `@Inject` factory entries.
2. Create `src/app/app.config.ts` using the Write tool. Translate each item:
   - `RouterModule.forRoot(routes)` → `provideRouter(routes)` and import `routes` from `./app.route`
   - `HttpClientModule` → `provideHttpClient(withInterceptorsFromDi())` (keep `withInterceptorsFromDi()` if HTTP interceptors used `HTTP_INTERCEPTORS` multi-providers)
   - `BrowserAnimationsModule` → `provideAnimations()`
   - `BrowserModule` → drop (not needed in standalone)
   - `FormsModule`, `ReactiveFormsModule` → drop here (import in components that use them)
   - `TranslateModule.forRoot(...)` → wrap as `importProvidersFrom(TranslateModule.forRoot(...))`
   - Any other `XxxModule.forRoot(...)` → wrap in `importProvidersFrom(...)`
   - All `{ provide: ..., useClass/useValue/useFactory: ... }` entries → keep verbatim in the new `providers` array
3. The exported symbol MUST be `appConfig: ApplicationConfig`.

### Template — non-MFE project

```ts
// src/app/app.config.ts
import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';

import { routes } from './app.route';
// ... other imports preserved from app.module.ts

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptorsFromDi()),
    provideAnimations(),
    // importProvidersFrom(TranslateModule.forRoot({...})),
    // { provide: HTTP_INTERCEPTORS, useClass: MyInterceptor, multi: true },
  ],
};
```

### Template — MFE / single-spa project

For single-spa MFEs, factory providers that need `singleSpaPropsSubject` (e.g. a `ReusableStore`) must be exposed as a function so `main.single-spa.ts` can pass the subject in. Export `createAppConfig(extra)` instead of (or in addition to) a plain `appConfig`.

```ts
// src/app/app.config.ts
import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';

import { routes } from './app.route';
// import any preserved interceptors / tokens / shared lib modules here

export function createAppConfig(extraProviders: any[] = []): ApplicationConfig {
  return {
    providers: [
      provideRouter(routes),
      provideHttpClient(withInterceptorsFromDi()),
      provideAnimations(),
      importProvidersFrom(TranslateModule.forRoot()),
      // { provide: HTTP_INTERCEPTORS, useClass: MfeHttpRequestInterceptor, multi: true },
      // { provide: HTTP_INTERCEPTORS, useClass: MfeHttpErrorInterceptor, multi: true },
      ...extraProviders,
    ],
  };
}

// Convenience for non-single-spa local dev (main.ts).
export const appConfig: ApplicationConfig = createAppConfig();
```

### Update `main.ts`

If `main.ts` exists, rewrite it using Edit/Write to use `bootstrapApplication`:

```ts
// src/main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

bootstrapApplication(AppComponent, appConfig)
  .catch(err => console.error(err));
```

### Rewrite `main.single-spa.ts` (MFE only)

If `MFE=yes`, rewrite `src/main.single-spa.ts` using the Edit tool. The single-spa lifecycle is preserved, but `bootstrapModule(AppModule)` is replaced with `bootstrapApplication(AppComponent, createAppConfig([...]))`. Inject the singleSpaPropsSubject through `extraProviders`, NOT by inlining the provider list:

```ts
// src/main.single-spa.ts
import { enableProdMode, NgZone } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { NavigationStart, Router } from '@angular/router';
import { getSingleSpaExtraProviders, singleSpaAngular } from 'single-spa-angular';

import { AppComponent } from './app/app.component';
import { createAppConfig } from './app/app.config';
import { ReusableStore } from '@mybcabisnis-web/lib'; // adjust to actual lib import
import { environment } from './environments/environment';
import { singleSpaPropsSubject } from './single-spa/single-spa-props';

if (environment.production) {
  enableProdMode();
}

const reusableStore: ReusableStore = {
  urlGateway: '',
  i18nFile: environment.i18nFile,
  singleSpaProps: singleSpaPropsSubject,
  getI18nContext: () => {
    const path = window.location.pathname;
    if (path.includes('dashboard')) { return 'dashboard'; }
    if (path.includes('setting')) { return 'setting'; }
    return '';
  },
};

const lifecycles = singleSpaAngular({
  bootstrapFunction: singleSpaProps => {
    // @ts-ignore
    singleSpaPropsSubject.next(singleSpaProps);

    const config = createAppConfig([
      ...getSingleSpaExtraProviders(),
      { provide: ReusableStore, useValue: reusableStore },
    ]);

    return bootstrapApplication(AppComponent, config);
  },
  template: '<[APP_SELECTOR] />', // use APP_SELECTOR captured in Step 1
  Router,
  NavigationStart,
  NgZone,
});

export const bootstrap = lifecycles.bootstrap;
export const mount = lifecycles.mount;
export const unmount = lifecycles.unmount;
```

> **Hard rule:** Do NOT put `providers: [...]` arrays inside `main.single-spa.ts`. All providers live in `app.config.ts`. The single-spa file only constructs `extraProviders` that depend on the `singleSpaPropsSubject` and forwards them via `createAppConfig(extraProviders)`.

### Cleanup

Delete `src/app/app.module.ts` if it still exists and is no longer referenced. Verify with grep:

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "AppModule|app\.module" | Where-Object { $_.Line -notmatch "spec|test" } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```
**CMD:**
```
findstr /s /n /c:"AppModule" /c:"app.module" src\*.ts 2>nul | findstr /v "spec test"
```

After Step 5, verify:

**PowerShell / CMD:** `npx ng build`

Append `app.config.ts: OK` to `standalone-scratch.md` under `# Steps`. Go to Step 6.

---

## Step 6 — Rename routing files to `*.route.ts`

In Angular 20 standalone projects, routing files are conventionally named `*.route.ts` and export plain `Routes` arrays — no `NgModule` wrapper.

### 6a — Find old routing modules

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*-routing.module.ts","*.routing.module.ts","app-routing.module.ts" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Select-Object -First 30
```
**CMD:**
```
dir /s /b src\*-routing.module.ts src\*.routing.module.ts 2>nul
```

Append the list to `standalone-scratch.md` under `# RoutingFiles`. If no files are found, skip to Step 7.

### 6b — Convert each file

For every routing file found, apply this transformation using Read + Write:

**Before** (`app-routing.module.ts`):
```ts
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { EmptyRouteComponent } from './shared/component/empty-route/empty-route.component';

const routes: Routes = [
  { path: 'dashboard', loadChildren: () => import('./mfe_dashboard/dashboard.module').then(m => m.DashboardModule) },
  { path: '**', component: EmptyRouteComponent },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
```

**After** (`app.route.ts`):
```ts
import { Routes } from '@angular/router';
import { EmptyRouteComponent } from './shared/component/empty-route/empty-route.component';

export const routes: Routes = [
  { path: 'dashboard', loadChildren: () => import('./mfe_dashboard/dashboard.route').then(m => m.routes) },
  { path: '**', component: EmptyRouteComponent },
];
```

Transformation rules:
- Drop the `@NgModule({...})` wrapper and the class declaration.
- Drop `RouterModule` and `NgModule` imports.
- Change `const routes: Routes` → `export const routes: Routes`.
- Rename file: `app-routing.module.ts` → `app.route.ts`. For feature files: `dashboard-routing.module.ts` → `dashboard.route.ts`, `setting-front-office.routing.module.ts` → `setting-front-office.route.ts`.
- Update every `loadChildren: () => import('./x/x.module').then(m => m.XModule)` to either:
  - `loadChildren: () => import('./x/x.route').then(m => m.routes)` — when the feature still has child routes (preferred for nested routes)
  - `loadComponent: () => import('./x/x.component').then(m => m.XComponent)` — when the feature is a single standalone component
- Update every consumer (typically `app.config.ts`) to import `routes` from `./app.route` instead of `AppRoutingModule`.

### 6c — Rename feature route files

For every `*-routing.module.ts` and `*.routing.module.ts` under feature folders:
1. Read the file.
2. Apply the same transformation (export plain `Routes`, drop `@NgModule`).
3. Write the new file at the renamed path (`*.route.ts`).
4. Delete the old `*-routing.module.ts` / `*.routing.module.ts` file.
5. Update any imports across the codebase that referenced the old path.

Use grep to find leftover references:

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "routing\.module|RoutingModule" | Select-Object Path, LineNumber, Line | Select-Object -First 30
```
**CMD:**
```
findstr /s /n /c:"routing.module" /c:"RoutingModule" src\*.ts 2>nul
```

After the renames, verify:

**PowerShell / CMD:** `npx ng build`

Append `routes renamed: OK` to `standalone-scratch.md` under `# Steps`. Go to Step 7.

---

## Step 7 — Final cleanup and verification

### Remove unused CommonModule imports

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "CommonModule" | Where-Object { $_.Line -notmatch "spec|test|//" } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```
**CMD:**
```
findstr /s /n /c:"CommonModule" src\*.ts 2>nul | findstr /v "spec test //"
```

In standalone components, `CommonModule` is rarely needed — built-in pipes (`AsyncPipe`, `DatePipe`, etc.) can be imported individually. Remove `CommonModule` from `imports: [...]` arrays whose templates only use `@if` / `@for` / `@switch`.

### Find leftover module files

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Filter "*.module.ts" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Select-Object -First 20
```
**CMD:**
```
dir /s /b src\*.module.ts 2>nul
```

For each `*.module.ts` left, read it. If the module is empty (no providers/declarations beyond shared barrel imports), delete it and update consumers. If it still contains `forRoot()`-style configuration that depends on a third-party library, keep it and wrap usage in `importProvidersFrom(...)`.

### Run full verification

**PowerShell / CMD:**
```
npx ng build --configuration production
```

**PowerShell / CMD:** `npx ng test --watch=false`

**PowerShell / CMD:** `npx ng lint`

Append all results to `standalone-scratch.md` under `# Verification`. Go to Step 8.

---

## Step 8 — Write the migration report

**MANDATORY: Use the Write tool to write the file to disk. Do NOT print the report content as a chat message.**

1. Read `standalone-scratch.md` in full using the Read tool.
2. Call the **Write tool** with `file_path = STANDALONE-MIGRATION-REPORT-[YYYY-MM-DD].md` and the full report as `content`. The file MUST be written to disk.
3. After the Write tool confirms success, delete `standalone-scratch.md`:
   - **PowerShell:** `Remove-Item standalone-scratch.md`
   - **CMD:** `del standalone-scratch.md`
4. Only after the file exists on disk, post a single short message: `Standalone migration report written to STANDALONE-MIGRATION-REPORT-[YYYY-MM-DD].md`

---

## Report structure

```markdown
# Angular Standalone Migration Report — [Project Name]

**Generated:** [today's date]
**Angular version:** 20.x.x (no version upgrade performed)
**MFE (single-spa):** [yes/no]

---

## Migration Steps

| Step | Description | Status |
|------|-------------|--------|
| Control flow (schematic) | @angular/core:control-flow | ✓ / ✗ |
| Control flow (manual) | Read + Edit transforms | ✓ / ✗ |
| Standalone schematic | @angular/core:standalone (×3) | ✓ / ✗ |
| app.config.ts created | Manual extraction from app.module.ts | ✓ / ✗ |
| main.single-spa.ts rewired | bootstrapApplication + createAppConfig | ✓ / ✗ / N/A |
| Routes renamed | *-routing.module.ts → *.route.ts | ✓ / ✗ |

---

## Control Flow Changes

### Files transformed automatically (schematic)

[list of files the schematic modified]

### Files transformed manually

| File | Directive | Transformation applied |
|------|-----------|----------------------|
| `path/to/file.html` | `*ngIf` | `@if` |
| `path/to/file.html` | `*ngFor` | `@for` |

### Items skipped (require manual review)

| File | Line | Reason |
|------|------|--------|

---

## Standalone Migration

### app.config.ts

- Path: `src/app/app.config.ts`
- Exported symbol(s): `appConfig`, `createAppConfig` (MFE only)
- Providers migrated from old `app.module.ts`: [list]

### Bootstrap

- `main.ts`: [updated / not present]
- `main.single-spa.ts`: [updated / N/A] — single-spa lifecycle preserved, providers come from `createAppConfig(extraProviders)`

### Route files renamed

| Old | New |
|-----|-----|
| `app-routing.module.ts` | `app.route.ts` |
| `dashboard-routing.module.ts` | `dashboard.route.ts` |

---

## Manual Items Remaining

| File | Line | Issue |
|------|------|-------|

---

## Build Results

- Development build: ✓ / ✗
- Production build: ✓ / ✗
- Tests: ✓ / ✗
- Lint: ✓ / ✗

---

## Common Errors Reference

| Error | Fix |
|-------|-----|
| Template parse error after control-flow migration | Check for orphaned `<ng-template>` or whitespace-sensitive wrappers |
| `NullInjectorError: No provider for X` after standalone | Add `X` to the `providers` array in `app.config.ts` (or pass through `createAppConfig` extras for MFE) |
| `RouterModule` not found | Use `provideRouter(routes)` in `app.config.ts`; import `RouterOutlet` / `RouterLink` directly in components |
| `HttpClientModule` not found | Use `provideHttpClient(withInterceptorsFromDi())` in `app.config.ts` |
| Single-spa MFE white-screen after standalone | Verify `main.single-spa.ts` calls `bootstrapApplication(AppComponent, createAppConfig([...]))`, and that `getSingleSpaExtraProviders()` is included in extras |
| `@for` missing track expression | Add `track item.id` or `track $index` |
| Component still references `*ngIf` after schematic | Ensure `CommonModule` is no longer required by removing it from `imports`; the template uses only `@if`/`@for` now |
```

---

## Guidelines

- **Standalone configuration belongs in `src/app/app.config.ts` — never inline a `providers: [...]` array inside `main.ts` or `main.single-spa.ts`.**
- **Route files use the suffix `*.route.ts` and export a plain `Routes` constant — no `NgModule` wrapper.**
- For single-spa MFEs, preserve the entire `singleSpaAngular({...})` lifecycle wrapper. Only the `bootstrapFunction` body changes from `bootstrapModule(AppModule)` to `bootstrapApplication(AppComponent, createAppConfig([...]))`.
- Run `npx ng build` after every schematic and after every manual HTML file edit before proceeding.
- Commit after each step so individual steps are reversible.
- For large codebases, use `--path` flag on `@angular/core:standalone` to migrate one feature folder at a time.
- Do not manually edit files a schematic will modify — run the schematic first, then patch the result.
- When transforming `*ngFor`, prefer `track item.id` (or equivalent unique key) over `track $index`.
- This skill does NOT touch package versions. If you need to upgrade Angular itself, use the `angular-version-update` skill (version-only) or `angular-update` skill (full migration).
- This skill is Windows-only. If the user is on macOS or Linux, refer them to a different skill or ask them to run on a Windows machine.
