---
name: angular-update
description: Automate Angular application migration from Angular 18 to Angular 20 on Windows. Runs on a dedicated `chore/MAGE/UPDATEANGULAR20` branch. Performs standalone migration + routing rename FIRST (Angular 18), then control-flow migration (Angular 18), then the core Angular update (18→19→20). Single-spa MFE-aware; pins @mybcabisnis-web/lib to 4.3.13, drops Material, bumps ngx-bootstrap / @angular/cdk / @angular-builders/custom-webpack to known-good versions, rewrites `browserTarget` → `buildTarget` in angular.json, and pins pipeline Node via `nvm` to v22.17.0. Uses the global `ng` binary directly (never `npx ng`) and never passes `--force` to `ng update`. Windows-only (PowerShell or CMD).
---

# Angular Update (v18 → v20) — MFE-Aware (Windows)

This skill performs an opinionated Angular 18 → 20 migration on a dedicated branch `chore/MAGE/UPDATEANGULAR20`. The order is deliberate and MUST NOT be changed:

1. **Standalone migration first** (while still on Angular 18) — including extracting `app.config.ts` from `main.single-spa.ts` and renaming `*-routing.module.ts` → `*.route.ts`. Commit.
2. **Control-flow migration next** (still on Angular 18). Commit.
3. **Core Angular update last** — `ng update @angular/core@19 @angular/cli@19`, post-19 dep pins, then `ng update @angular/core@20 @angular/cli@20`, then post-20 dep pins. Commit.

It is MFE-aware: many target projects bootstrap through `main.single-spa.ts`. The skill MUST preserve the single-spa lifecycle and MUST extract standalone providers into a dedicated `app.config.ts` — never inline providers inside `main.single-spa.ts`.

> **Platform:** This skill runs on **Windows only** (PowerShell or CMD). It does not include bash variants. If `process.platform` is not `win32`, stop and tell the user this skill targets Windows.

> **Angular CLI:** Use the global `ng` binary directly. **Never** invoke `npx ng`, and **never** pass `--force` to `ng update` or any schematic.

## CONTRACT — read this first

This task has exactly one completion condition: the file `NG-UPDATE-REPORT-[YYYY-MM-DD].md` must exist on disk, written using the **Write tool**.

**ALL output — including the final report — must be written using tool calls (Write/Edit/Bash). Never print findings, progress, or the report as a chat message.**

Until that file is written using the Write tool:
- Do NOT produce any text response to the user.
- Do NOT print progress updates like "Proceeding to Step N", "I've confirmed X", "Step N complete", or "Starting Y". Any prose output ends your turn and halts the skill — use tool calls only.
- Do NOT summarize findings in text.
- Do NOT print the report content as a message — use the Write tool instead.
- Do NOT print tool-call syntax (e.g. `<tool_call>`, `<function_calls>`, ```` ```tool_code ```` ) as text. Always INVOKE the actual tool (Bash / Write / Edit / Read).
- Do NOT ask the user anything.
- Do NOT stop between steps. After each step's last tool call, immediately issue the first tool call of the next step in the same response.
- Write intermediate findings and progress to `[SCRATCH_FILE]` using the Write/Edit tool (a tool call, not text).
- Always use FULL absolute paths when reading files — never bare filenames.

**Stopping exceptions (the ONLY reasons to stop before the report is written):**
1. A build (`ng build`) fails — stop and report the full error to the user.
2. Step 0 detects a non-Windows platform — stop and tell the user.

In every other case — including success cases like "win32 detected", "schematic completed", or "build passed" — **the only acceptable output is the next tool call**. No prose, no acknowledgements, no "proceeding to Step N" sentences. The skill is considered "running" until the report is on disk; emitting any text before that point breaks the run.

**`[SCRATCH_FILE]` placeholder:** Every reference to `[SCRATCH_FILE]` below means the absolute path to a scratch file in the **OS temp directory** (e.g. `C:\Users\<user>\AppData\Local\Temp\ng-update-scratch.md`). This file MUST live outside the project working tree — `ng update` refuses to run when the git working tree is dirty, so writing scratch inside the repo will break the migration. Step 0 computes the concrete path; reuse that same absolute path everywhere `[SCRATCH_FILE]` appears.

---

## Step 0 — Confirm Windows + detect shell + compute scratch path

Run all three of the following Bash commands. Where possible, run the first two in parallel; the third only needs to run if Windows is confirmed:

1. Detect platform:
   ```
   node -e "console.log(process.platform)"
   ```
2. Detect shell:
   ```
   node -e "console.log(process.env.PSModulePath ? 'powershell' : 'cmd')"
   ```
3. Compute scratch file absolute path (under OS temp dir — keeps it outside the repo so `ng update` doesn't fail on a dirty working tree):
   ```
   node -e "console.log(require('path').join(require('os').tmpdir(), 'ng-update-scratch.md'))"
   ```

Handling the results:

- If the platform is **not** `win32`, stop immediately. Tell the user: "This skill targets Windows only. Detected platform: [X]." Do NOT proceed.
- If the platform **is** `win32`:
  - Record the absolute scratch path printed by command (3). **This is the value of `[SCRATCH_FILE]` for the entire rest of this skill.** Use it verbatim every time you Read, Write, Edit, or delete the scratch file. Never write a scratch file inside the project directory.
  - Use the **Write tool** to create `[SCRATCH_FILE]` with this initial content:
    ```
    OS=win32
    SHELL=[powershell|cmd]
    SCRATCH_PATH=[absolute path from command 3]
    ```
  - Shell choice for every command below:
    - `powershell` → use **PowerShell** snippets
    - `cmd` → use **CMD** snippets

After writing `[SCRATCH_FILE]`, immediately make the first tool call of Step 1 in the same response. Do NOT emit any text such as "Proceeding to Step 1" — that ends the turn and halts the skill. Tool call → tool call → tool call, no prose.

---

## Step 1 — Checkout migration branch

The entire migration runs on the branch `chore/MAGE/UPDATEANGULAR20`. Create it if it does not exist; checkout if it does.

**PowerShell:**
```
git rev-parse --verify chore/MAGE/UPDATEANGULAR20 2>$null
```
**CMD:**
```
git rev-parse --verify chore/MAGE/UPDATEANGULAR20 2>nul
```

- If the command exits with code 0, the branch exists. Checkout:
  ```
  git checkout chore/MAGE/UPDATEANGULAR20
  ```
- If the command exits non-zero, create and checkout:
  ```
  git checkout -b chore/MAGE/UPDATEANGULAR20
  ```

Confirm:
```
git status
```

Append to `[SCRATCH_FILE]` under `# Branch`: `BRANCH=chore/MAGE/UPDATEANGULAR20`. Go to Step 2.

---

## Step 2 — Read current state and detect bootstrap style

Read `package.json` in full using the Read tool. Note current Angular version, all `@angular/*` entries, and whether the following are present:
- `@mybcabisnis-web/lib`
- `@angular/material`
- `@angular/material-moment-adapter`
- `ngx-bootstrap`
- `@angular/cdk`
- `@angular-builders/custom-webpack`
- `@ngrx/store`
- `single-spa-angular`

Read `angular.json` in full using the Read tool. Note project name, structure, and whether any `browserTarget` keys exist.

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
- `src/app/app.module.ts` (if it still exists)

Append findings to `[SCRATCH_FILE]` under `# CurrentState`:
```
PROJECT_NAME=[name from package.json]
ANGULAR_VERSION=[current version]
MFE=[yes/no]
BOOTSTRAP_FILE=[main.single-spa.ts | main.ts]
APP_SELECTOR=[from app.component.ts, e.g. dashboard-setting-root]
HAS_MYBCABISNIS_LIB=[yes/no, with current version if yes]
HAS_MATERIAL=[yes/no]
HAS_MATERIAL_MOMENT=[yes/no]
HAS_NGX_BOOTSTRAP=[yes/no, with current version if yes]
HAS_ANGULAR_CDK=[yes/no, with current version if yes]
HAS_CUSTOM_WEBPACK=[yes/no, with current version if yes]
HAS_NGRX=[yes/no]
HAS_BROWSER_TARGET=[yes/no]
```

Go to Step 3.

---

## Step 3 — Pin @mybcabisnis-web/lib to 4.3.13 (pre-migration)

This step only runs if `HAS_MYBCABISNIS_LIB=yes` from Step 2.

1. Edit `package.json` using the Edit tool: set the `@mybcabisnis-web/lib` version to `"4.3.13"` (exact, no caret). Preserve the field's location (dependencies vs. devDependencies vs. peerDependencies).
2. Run:
   ```
   npm install --legacy-peer-deps
   ```
3. Verify the install picked up the new version:

   **PowerShell:**
   ```
   Get-Content package.json | Select-String "@mybcabisnis-web/lib"
   ```
   **CMD:**
   ```
   findstr "@mybcabisnis-web/lib" package.json
   ```
4. Verify the build still passes:
   ```
   ng build
   ```

If the build fails, stop and report the full error.

If `HAS_MYBCABISNIS_LIB=no`, skip this step entirely.

Append `mybcabisnis-web/lib pin to 4.3.13: OK | skipped` to `[SCRATCH_FILE]` under `# Steps`. Go to Step 4.

---

## Step 4 — Standalone schematic (3 sub-runs)

Run the `@angular/core:standalone` schematic three times. **Never** pass `--force`. **Never** prefix with `npx`.

### 4a — Convert components, directives, and pipes

```
ng generate @angular/core:standalone
```
When prompted, select: **Convert all components, directives, and pipes**

```
ng build
```
If the build fails, stop and report.

### 4b — Remove unnecessary NgModules

```
ng generate @angular/core:standalone
```
When prompted, select: **Remove unnecessary NgModules**

```
ng build
```

### 4c — Bootstrap using standalone APIs

> ⚠️ **MFE caveat:** If `MFE=yes` from Step 2, this schematic may modify `main.ts`. The single-spa entry point is `main.single-spa.ts`, which the schematic does not understand. The schematic-generated bootstrap on `main.ts` should be discarded (or kept only for non-single-spa local dev). The actual standalone wiring for single-spa MUST be done manually in Step 5.

```
ng generate @angular/core:standalone
```
When prompted, select: **Bootstrap using standalone APIs**

```
ng build
```

After all three, check for remaining NgModule references:

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "NgModule|@NgModule" | Where-Object { $_.Line -notmatch "spec|test|//.*NgModule" } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```
**CMD:**
```
findstr /s /n /c:"NgModule" /c:"@NgModule" src\*.ts 2>nul | findstr /v "spec test"
```

Append `standalone schematic: OK` to `[SCRATCH_FILE]` under `# Steps`. Go to Step 5.

---

## Step 5 — Create `src/app/app.config.ts` (REQUIRED)

This step is **mandatory and must not be skipped**, regardless of MFE status. The standalone bootstrap configuration MUST live in `src/app/app.config.ts`. Provider arrays MUST NOT be inlined in `main.ts` or `main.single-spa.ts`.

1. Re-read the OLD `app.module.ts` (if it still exists) **AND** the current `main.single-spa.ts` using the Read tool. Identify everything in the module's `imports`, `providers`, and any `@Inject` factory entries — and any providers the schematic inlined inside `main.single-spa.ts` (the schematic may have done this in Step 4c).
2. Create `src/app/app.config.ts` using the Write tool. Translate each item:
   - `RouterModule.forRoot(routes)` → `provideRouter(routes)` and import `routes` from `./app.route`
   - `HttpClientModule` → `provideHttpClient(withInterceptorsFromDi())` (keep `withInterceptorsFromDi()` if HTTP interceptors used `HTTP_INTERCEPTORS` multi-providers)
   - `BrowserAnimationsModule` → `provideAnimations()`
   - `BrowserModule` → drop (not needed in standalone)
   - `FormsModule`, `ReactiveFormsModule` → drop here (import in components that use them)
   - `TranslateModule.forRoot(...)` → `importProvidersFrom(TranslateModule.forRoot(...))`
   - Any other `XxxModule.forRoot(...)` → wrap in `importProvidersFrom(...)`
   - All `{ provide: ..., useClass/useValue/useFactory: ... }` entries → keep verbatim in the new `providers` array
3. The exported symbol MUST be `appConfig: ApplicationConfig`. For MFE projects, also export `createAppConfig(extra)`.

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

4. Update `src/main.ts` (if present) using Edit/Write to use `bootstrapApplication`:

```ts
// src/main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

bootstrapApplication(AppComponent, appConfig)
  .catch(err => console.error(err));
```

5. **If `MFE=yes`, rewrite `src/main.single-spa.ts`** using the Edit tool. The single-spa lifecycle is preserved, but `bootstrapModule(AppModule)` is replaced with `bootstrapApplication(AppComponent, createAppConfig([...]))`. Inject the `singleSpaPropsSubject` through `extraProviders`, NOT by inlining the provider list:

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
  template: '<[APP_SELECTOR] />', // use APP_SELECTOR from Step 2
  Router,
  NavigationStart,
  NgZone,
});

export const bootstrap = lifecycles.bootstrap;
export const mount = lifecycles.mount;
export const unmount = lifecycles.unmount;
```

> **Hard rule:** Do NOT put `providers: [...]` arrays inside `main.single-spa.ts`. All providers live in `app.config.ts`. The single-spa file only constructs `extraProviders` that depend on the `singleSpaPropsSubject` and forwards them via `createAppConfig(extraProviders)`.

6. Delete `src/app/app.module.ts` if it still exists and is no longer referenced.

Verify:
```
ng build
```

Append `app.config.ts: OK` to `[SCRATCH_FILE]` under `# Steps`. Go to Step 6.

---

## Step 6 — Rename `*-routing.module.ts` → `*.route.ts`

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

Append the list to `[SCRATCH_FILE]` under `# RoutingFiles`.

### 6b — Convert each file

For every routing file found, apply this transformation using Read + Write.

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
- For every `loadChildren: () => import('./x/x.module').then(m => m.XModule)`, decide between **`loadChildren`** and **`loadComponent`** based on what the lazy-loaded item is:
  - **The target is a sub-router** (i.e. the old module had its own nested `Routes` array via `RouterModule.forChild(...)`) → keep `loadChildren`, but point to the new `*.route.ts`:
    ```ts
    loadChildren: () => import('./x/x.route').then(m => m.routes)
    ```
  - **The target is a single standalone component** (no nested routes — the module's only purpose was to declare/expose one component) → switch to `loadComponent`:
    ```ts
    loadComponent: () => import('./x/x.component').then(m => m.XComponent)
    ```
  - To decide: read the old `*.module.ts` you are replacing. If it imported `RouterModule.forChild(routes)` or had a non-empty `Routes` array, use `loadChildren`. If it only declared a component and had no child routes, use `loadComponent`.
- Update every consumer that imported `AppRoutingModule` (usually the old `app.module.ts` or `app.config.ts`) to import `routes` from `./app.route` instead.

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
```
ng build
```

Append `routes renamed: OK` to `[SCRATCH_FILE]` under `# Steps`. Go to Step 7.

---

## Step 7 — Commit standalone migration

```
git add .
git commit -m "chore(MAGE/UPDATEANGULAR20): standalone migration + route rename"
```

Confirm:
```
git status
git log -1 --oneline
```

Append `commit standalone: OK` to `[SCRATCH_FILE]` under `# Steps`. Go to Step 8.

---

## Step 8 — Control flow schematic

Run the built-in schematic to auto-convert the majority of structural directives:

```
ng generate @angular/core:control-flow
```

Verify:
```
ng build
```

If the build fails, stop and report.

Append `control-flow schematic: OK` to `[SCRATCH_FILE]` under `# Steps`. Go to Step 9.

---

## Step 9 — Manual control flow transformation

The schematic does not handle every case. This step finds and manually transforms all remaining structural directives using the Read and Edit tools.

### 9a — Find files with remaining structural directives

**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.html" -ErrorAction SilentlyContinue | Select-String -Pattern "\*ngIf|\*ngFor|\[ngSwitch\]|\*ngSwitchCase|\*ngSwitchDefault" -List | Select-Object -ExpandProperty Path
```
**CMD:**
```
findstr /s /m /c:"*ngIf" /c:"*ngFor" /c:"[ngSwitch]" /c:"*ngSwitchCase" /c:"*ngSwitchDefault" src\*.html 2>nul
```

Append the file list to `[SCRATCH_FILE]` under `# RemainingControlFlow`.

If no files are found, append `no manual control flow fixes needed` and skip to Step 10.

### 9b — Transform each file

Read EVERY file from the list above using the Read tool. For each file, apply ALL of the transformations below using the Edit tool. Never skip a file.

After editing each file, re-run:
```
ng build
```

If the build fails after any edit, stop and report the full diff and error to the user.

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

> Only use `@empty` when the fallback message is directly associated with an empty list. Remove the corresponding `*ngIf` guard.

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

### Cases that must NOT be auto-transformed

Leave the following as-is and record them under `# ManualItems` in `[SCRATCH_FILE]`:

- Custom structural directives (anything that is not `*ngIf`, `*ngFor`, `*ngSwitch*`)
- `*ngIf` / `*ngFor` on the same element as another structural directive — extract one to `<ng-container>` first
- Templates with complex expressions that span multiple lines and risk mis-parsing

For each skipped item, append to `[SCRATCH_FILE]`:
```
FILE=[path] LINE=[n] REASON=[why it was skipped]
```

After all files are transformed and the build passes, append `manual control flow: OK` to `[SCRATCH_FILE]` under `# Steps`. Go to Step 10.

---

## Step 10 — Commit control flow migration

```
git add .
git commit -m "chore(MAGE/UPDATEANGULAR20): control flow migration"
```

Append `commit control flow: OK` to `[SCRATCH_FILE]` under `# Steps`. Go to Step 11.

---

## Step 11 — Prep for Angular core update

Before the core update, the project must be clean of the in-house lib (it pins to the old Angular major) and have no stale lockfile or modules.

1. Edit `package.json` to **remove** the `@mybcabisnis-web/lib` entry entirely from wherever it lives (dependencies / devDependencies / peerDependencies). Append its old version to `[SCRATCH_FILE]` under `# RemovedLib` so it can be re-added in Step 19.
2. Delete `node_modules` and `package-lock.json`:

   **PowerShell:**
   ```
   if (Test-Path node_modules) { Remove-Item -Recurse -Force node_modules }
   if (Test-Path package-lock.json) { Remove-Item -Force package-lock.json }
   ```
   **CMD:**
   ```
   if exist node_modules rmdir /s /q node_modules
   if exist package-lock.json del /q package-lock.json
   ```

Do NOT run `npm install` here — `ng update` in Step 12 will reinstall.

Append `prep for core update: OK` to `[SCRATCH_FILE]` under `# Steps`. Go to Step 12.

---

## Step 12 — Migrate v18 → v19 (core)

Use the global `ng` directly. **Never** `npx ng`. **Never** `--force`.

```
ng update @angular/core@19 @angular/cli@19
```

If `@ngrx/store` was detected in Step 2:
```
ng update @ngrx/store@19
```

Verify the build:
```
ng build
```

If the build **fails**, stop and report the full error.

Append `v18→v19 core: OK` to `[SCRATCH_FILE]` under `# Steps`. Go to Step 13.

---

## Step 13 — Post-19 dependency pins

Edit `package.json` using the Edit tool:
- If `@angular/material` is present → **remove** the entry entirely.
- If `@angular/material-moment-adapter` is present → **remove** the entry entirely.
- If `ngx-bootstrap` is present → set version to `19.0.2` (exact, no caret). If absent, do NOT add it.
- If `@angular/cdk` is present → set version to `19.2.17` (exact). If absent, do NOT add it.
- If `@angular-builders/custom-webpack` is present → set version to `19.0.1` (exact). If absent, do NOT add it.

Run:
```
npm install --legacy-peer-deps
```

Verify:
```
ng build
```

Append `post-19 deps: OK` to `[SCRATCH_FILE]` under `# Steps`. Go to Step 14.

---

## Step 14 — Rename `browserTarget` → `buildTarget` in `angular.json`

Angular 19 deprecates `browserTarget` (used by `serve`/`extract-i18n`/`dev-server`/etc.) in favor of `buildTarget`. Read `angular.json` in full using the Read tool, find every occurrence of the literal key `"browserTarget"`, and rename to `"buildTarget"`. Use the Edit tool with `replace_all: true` on the exact string `"browserTarget":` if the file contains multiple occurrences.

After editing, verify:
```
ng build
```

Append `browserTarget → buildTarget: OK | not present` to `[SCRATCH_FILE]` under `# Steps`. Go to Step 15.

---

## Step 15 — Commit Angular 19 update

```
git add .
git commit -m "chore(MAGE/UPDATEANGULAR20): angular 19 update + post-19 deps"
```

Append `commit angular 19: OK` to `[SCRATCH_FILE]` under `# Steps`. Go to Step 16.

---

## Step 16 — Migrate v19 → v20 (core)

Use the global `ng` directly. **Never** `npx ng`. **Never** `--force`.

```
ng update @angular/core@20 @angular/cli@20
```

If `@ngrx/store` was detected in Step 2:
```
ng update @ngrx/store@20
```

Verify the build:
```
ng build
```

If the build **fails**, stop and report the full error.

Append `v19→v20 core: OK` to `[SCRATCH_FILE]` under `# Steps`. Go to Step 17.

---

## Step 17 — Post-20 dependency pins

Edit `package.json` using the Edit tool:
- If `@angular/cdk` is present → set version to `20.1.0` (exact).
- If `@angular-builders/custom-webpack` is present → set version to `20.0.0` (exact).

Run:
```
npm install --legacy-peer-deps
```

Verify:
```
ng build
```

Append `post-20 deps: OK` to `[SCRATCH_FILE]` under `# Steps`. Go to Step 18.

---

## Step 18 — Update `pipeline.yml` Node version

Find the pipeline file:

**PowerShell:**
```
Get-ChildItem -Recurse -Include "pipeline.yml","pipeline.yaml","pipelines.yml","pipelines.yaml" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Select-Object -First 5
```
**CMD:**
```
dir /s /b pipeline.yml pipeline.yaml pipelines.yml pipelines.yaml 2>nul
```

If a pipeline file is found, read it. Replace the `nvm` Node version with `v22.17.0`. Common patterns to update:
- `nvm install <something>` → `nvm install v22.17.0`
- `nvm use <something>` → `nvm use v22.17.0`
- A YAML key like `NODE_VERSION: <something>` if it's the value consumed by an `nvm` line → `NODE_VERSION: v22.17.0`

Use the Edit tool on the exact lines. If no pipeline file is found, append `pipeline.yml: not present` to `[SCRATCH_FILE]` and continue.

Append `pipeline.yml nvm → v22.17.0: OK | not present` to `[SCRATCH_FILE]` under `# Steps`. Go to Step 19.

---

## Step 19 — Re-add `@mybcabisnis-web/lib` v4.3.13

Only run this step if Step 11 removed `@mybcabisnis-web/lib`.

1. Edit `package.json` to add back `"@mybcabisnis-web/lib": "4.3.13"` (exact, no caret) into the same section it lived in originally (recorded under `# RemovedLib` in `[SCRATCH_FILE]`).
2. Run:
   ```
   npm install --legacy-peer-deps
   ```
3. Verify:
   ```
   ng build
   ```

If `@mybcabisnis-web/lib` was not present in Step 2, skip this step.

Append `re-add @mybcabisnis-web/lib 4.3.13: OK | skipped` to `[SCRATCH_FILE]` under `# Steps`. Go to Step 20.

---

## Step 20 — Final verification + commit

Run:
```
ng build --configuration production
ng test --watch=false
ng lint
```

Append all results to `[SCRATCH_FILE]` under `# Verification`.

Commit:
```
git add .
git commit -m "chore(MAGE/UPDATEANGULAR20): angular 20 update + post-20 deps + pipeline"
```

Append `final commit: OK` to `[SCRATCH_FILE]` under `# Steps`. Go to Step 21.

---

## Step 21 — Write the migration report

**MANDATORY: Use the Write tool to write the file to disk. Do NOT print the report content as a chat message.**

1. Read `[SCRATCH_FILE]` in full using the Read tool.
2. Call the **Write tool** with `file_path = NG-UPDATE-REPORT-[YYYY-MM-DD].md` (in the project root) and the full report as `content`. The file MUST be written to disk.
3. After the Write tool confirms success, delete the scratch file using its absolute path (the value of `[SCRATCH_FILE]` from Step 0):
   - **PowerShell:** `Remove-Item "<absolute path from Step 0>"`
   - **CMD:** `del "<absolute path from Step 0>"`
4. Only after the file exists on disk, post a single short message: `Migration report written to NG-UPDATE-REPORT-[YYYY-MM-DD].md`

---

## Report structure

```markdown
# Angular Migration Report — [Project Name]

**Generated:** [today's date]
**Branch:** chore/MAGE/UPDATEANGULAR20
**Migrated:** v[start] → v20
**MFE (single-spa):** [yes/no]

---

## Migration Steps

| Step | Description | Status |
|------|-------------|--------|
| Branch checkout | chore/MAGE/UPDATEANGULAR20 | ✓ / ✗ |
| @mybcabisnis-web/lib → 4.3.13 (pre) | Pre-migration pin | ✓ / ✗ / N/A |
| Standalone schematic | @angular/core:standalone (×3) | ✓ / ✗ |
| app.config.ts created | Manual extraction | ✓ / ✗ |
| main.single-spa.ts rewired | bootstrapApplication + createAppConfig | ✓ / ✗ / N/A |
| Routes renamed | *-routing.module.ts → *.route.ts | ✓ / ✗ |
| Commit (standalone) | git commit | ✓ / ✗ |
| Control flow (schematic) | @angular/core:control-flow | ✓ / ✗ |
| Control flow (manual) | Read + Edit transforms | ✓ / ✗ |
| Commit (control flow) | git commit | ✓ / ✗ |
| Prep core update | Remove lib + node_modules + lockfile | ✓ / ✗ |
| v18 → v19 core | ng update @angular/core@19 | ✓ / ✗ |
| Post-19 deps | Drop Material, pin ngx-bootstrap/cdk/custom-webpack | ✓ / ✗ |
| browserTarget → buildTarget | angular.json | ✓ / ✗ / N/A |
| Commit (Angular 19) | git commit | ✓ / ✗ |
| v19 → v20 core | ng update @angular/core@20 | ✓ / ✗ |
| Post-20 deps | Pin @angular/cdk@20.1.0, custom-webpack@20.0.0 | ✓ / ✗ |
| pipeline.yml nvm | → v22.17.0 | ✓ / ✗ / N/A |
| Re-add @mybcabisnis-web/lib | 4.3.13 | ✓ / ✗ / N/A |
| Final verification | ng build (prod), ng test, ng lint | ✓ / ✗ |
| Commit (Angular 20) | git commit | ✓ / ✗ |

---

## Dependency Changes

| Package | Before | After | Action |
|---------|--------|-------|--------|
| @angular/core | 18.x | 20.x | bump |
| @angular/cli | 18.x | 20.x | bump |
| @angular/cdk | [v] | 20.1.0 | bump |
| @angular-builders/custom-webpack | [v] | 20.0.0 | bump |
| ngx-bootstrap | [v] | 19.0.2 | pin (post-19) |
| @angular/material | [v] | — | removed |
| @angular/material-moment-adapter | [v] | — | removed |
| @mybcabisnis-web/lib | [v] | 4.3.13 | re-pinned |

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

| Old | New | Lazy load style |
|-----|-----|-----------------|
| `app-routing.module.ts` | `app.route.ts` | — |
| `dashboard-routing.module.ts` | `dashboard.route.ts` | loadChildren |
| `widget-routing.module.ts` | `widget.route.ts` | loadComponent |

---

## angular.json / pipeline.yml

- `browserTarget` keys renamed to `buildTarget`: [count or N/A]
- `pipeline.yml` Node version pinned via `nvm` → v22.17.0: [yes / N/A]

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

## Commits on `chore/MAGE/UPDATEANGULAR20`

[output of `git log --oneline` since the branch base]

---

## Common Errors Reference

| Error | Fix |
|-------|-----|
| `The repository is not clean. Please commit or stash any changes before updating.` | Ensure scratch file is in `%TEMP%`, not the project tree |
| `NG0203: inject() must be called from an injection context` | Move `inject()` to class field declarations, not inside methods |
| Template parse error after control-flow migration | Check for orphaned `<ng-template>` or whitespace-sensitive wrappers |
| `NullInjectorError: No provider for X` after standalone | Add `X` to the `providers` array in `app.config.ts` (or pass through `createAppConfig` extras for MFE) |
| `RouterModule` not found | Use `provideRouter(routes)` in `app.config.ts`, import `RouterOutlet` / `RouterLink` directly in components |
| `HttpClientModule` not found | Use `provideHttpClient(withInterceptorsFromDi())` in `app.config.ts` |
| Single-spa MFE white-screen after standalone | Verify `main.single-spa.ts` calls `bootstrapApplication(AppComponent, createAppConfig([...]))`, and that `getSingleSpaExtraProviders()` is included in extras |
| `browserTarget` is deprecated | Rename to `buildTarget` in `angular.json` |
| `peer dep conflict` on install | Always `npm install --legacy-peer-deps` after dep edits |
| `ng: command not found` | Install `@angular/cli` globally; never substitute `npx ng` |
```

---

## Guidelines

- **Run all 21 steps in a single continuous execution with ZERO text output.** "Go to Step N" at the end of each step is a hard instruction — issue the next step's first tool call immediately, in the same response. Any prose between steps (even one word like "Done." or "Proceeding...") ends the turn and halts the skill.
- **The only valid stops mid-skill** are: a `ng build` failure, or Step 0 detecting a non-Windows platform. Everything else, including success after a schematic or a build, is just a cue to issue the next tool call.
- **Never print tool-call markup as text.** Strings like `<tool_call>`, `<function_calls>`, or fenced ```` ```tool_code ```` blocks are signs you tried to render a tool call as a chat message. Always invoke the actual tool (Bash / Write / Edit / Read) instead.
- **Scratch file lives outside the repo.** Never write `[SCRATCH_FILE]` (or any other intermediate notes file) inside the project working tree. `ng update` aborts with "The repository is not clean" when extra files exist. Always use the absolute OS-temp path computed in Step 0.
- **Order is fixed:** standalone + routing → commit → control flow → commit → core update (18→19) → post-19 deps + browserTarget → commit → core update (19→20) → post-20 deps → pipeline.yml → re-add lib → final commit. Do NOT reorder.
- **Use global `ng` only.** Never `npx ng`. Never `--force`.
- **Never skip a major version** — always go 18 → 19 → 20.
- **Run `ng build` after every schematic, every manual HTML file edit, and every `package.json` dep change.**
- For `*ngFor`, prefer `track item.id` (or equivalent unique key) over `track $index`.
- **Standalone configuration belongs in `src/app/app.config.ts`** — never inline a `providers: [...]` array inside `main.ts` or `main.single-spa.ts`.
- **Route files use the suffix `*.route.ts`** and export a plain `Routes` constant — no `NgModule` wrapper.
- For single-spa MFEs, preserve the entire `singleSpaAngular({...})` lifecycle wrapper. Only the `bootstrapFunction` body changes from `bootstrapModule(AppModule)` to `bootstrapApplication(AppComponent, createAppConfig([...]))`.
- When deciding between `loadChildren` and `loadComponent` in routes: nested routes → `loadChildren` (pointing at the new `*.route.ts`); single component lazy-load → `loadComponent`.
- This skill is Windows-only. If the user is on macOS or Linux, refer them to a different skill or ask them to run on a Windows machine.
