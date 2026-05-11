---
description: Migrate an Angular 18 project to Angular 20 on the chore/MAGE/UPDATEANGULAR20 branch. Windows-only. Driven by the angular-update plugin.
---

Run the Angular 18 → 20 migration. Hand off the deterministic work to plugin tools; only use your own judgment for the three steps explicitly marked **(LLM)** below.

## CONTRACT — read this first

This task has exactly one completion condition: `mage_ng_write_report` has been called and printed the report path.

**Until that final report path is printed, you produce TOOL CALLS, not prose.** A turn that ends with text like "I've completed steps 1–4. Now I'll proceed with step 5…" is a failed turn — it consumes your reply slot with narration instead of doing work. Compress every intent into a tool call and chain them across the turn.

Specifically:
- Do NOT announce which step you are about to do. Just call its first tool.
- Do NOT summarize what previous steps did before doing the next step.
- Do NOT pause for confirmation between steps.
- Do NOT ask the user anything between steps. The only valid stops are: (a) `mage_ng_detect` returned `ok: false`, (b) an `ng build` exited non-zero — in both cases, print the (concise) error and stop.
- Between every step, the next thing you emit must be the **first tool call of the next step**, in the same turn. One sentence of acknowledgement = a wasted turn.

**Step 5 specifically:** the (LLM) judgment work in step 5 must still be executed as a chain of `Read` → `Write` → `Edit` → shell tool calls. Translating providers happens in-memory between reading `app.module.ts` and writing `app.config.ts` — you do not need a separate "thinking out loud" turn to do it.

---

**Rules**
- Use the global `ng` binary. Never `npx ng`. Never `--force`.
- Run all `ng`, `npm`, and `git` commands via **raw shell** so you (and the user) see live logs at native speed.
- **Respect `state.shell` from `mage_ng_detect`.** It will be either `powershell` or `cmd`. Never mix syntaxes — `set X=Y` is cmd-only and will fail in PowerShell; `$env:X="Y"` is PowerShell-only and will be a no-op in cmd. When in doubt, use the cross-shell form below.
- **Never chain commands with `&&`.** `&&` works in cmd and PowerShell 7+ but NOT in PowerShell 5.1 (common on corporate Windows). Always put each command on its own line.
- For schematics, always pass `--interactive=false` and the explicit `--mode=...` flag (see step 4 and step 8 for the exact commands). Never run a schematic without these flags — without `--interactive=false`, the schematic hangs forever on its mode-selection prompt in a non-TTY context.
- Before the very first `ng` invocation, run `ng analytics off` as its own line. This is shell-agnostic, writes to `~/.angular-config-global.json`, and persists across sessions — no env-var fiddling needed. **Do NOT set `CI=true`** anywhere — that disables `.angular/cache` and roughly doubles every `ng build`.
- After every schematic, every manual HTML edit, every `package.json` edit, and every `ng update`: run `ng build`. If it exits non-zero, stop and report the error to the user.
- Do not skip steps. Do not reorder.

**Cross-shell quick reference (use the form matching `state.shell`):**

| Operation | PowerShell | cmd |
|---|---|---|
| Delete a file | `Remove-Item path\to\file -Force` | `del path\to\file` |
| Delete a directory | `Remove-Item path\to\dir -Recurse -Force` | `rmdir /s /q path\to\dir` |
| Set env var (one-line) | `$env:NAME="value"` | `set NAME=value` |
| Two commands sequentially | line 1, then line 2 (no separator needed) | line 1, then line 2 |

---

### 1. Detect

Call `mage_ng_detect`. Parse the returned state.
- If `ok=false`, tell the user the reason and stop.
- Note `state.shell` (`powershell` or `cmd`). Use this for every shell command in later steps — pick the matching column from the cross-shell quick reference at the top.
- If `mfe=true`, remember: the bootstrap file is `src/main.single-spa.ts` and must be rewritten manually in step 5.

Then immediately, as the next tool call in the same turn, run `ng analytics off` via raw shell. This is the one-time, shell-agnostic way to silence the first-run telemetry prompt. Do not chain it with anything via `&&`.

### 2. Branch

Call `mage_ng_branch`.

### 3. Pin @mybcabisnis-web/lib

Only if `state.hasMybcabisnisLib === true`:
- Call `mage_ng_lib` with `action="pin"`.
- Run `npm install --legacy-peer-deps`.

### 4. Standalone schematic (×3)

Run each schematic via raw shell with the exact command below. **Never** pass `--force`. **Never** prefix with `npx`. **Always** include `--mode=...` and `--interactive=false` — without those flags the schematic hangs forever on the mode-selection prompt.

1. `ng generate @angular/core:standalone --mode=convert-to-standalone --interactive=false` — Convert all components, directives, and pipes
2. `ng generate @angular/core:standalone --mode=prune-ng-modules --interactive=false` — Remove unnecessary NgModules
3. `ng generate @angular/core:standalone --mode=standalone-bootstrap --interactive=false` — Bootstrap using standalone APIs

> If `mfe=true`, the schematic-generated `main.ts` is not the real bootstrap — it will be overridden in step 5.

### 5. Build `src/app/app.config.ts` **(LLM)**

This is judgment work, but it runs as a fixed chain of tool calls. **Do not produce narration between sub-steps.** If `app.module.ts` was already deleted by an earlier schematic, use the most recent commit on this branch (`git show HEAD~N:src/app/app.module.ts`) to recover its content — never skip the translation.

Execute these sub-steps in order, each as a tool call (no prose between them):

**5a — Read inputs (one Read per file, in parallel if you can):**
- `Read` `src/app/app.module.ts` (or `git show <ref>:src/app/app.module.ts` if deleted)
- `Read` `src/main.single-spa.ts` (if `state.mfe`) OR `src/main.ts`
- `Read` `src/app/app.component.ts` (for selector — needed for the `<selector />` template literal in MFE bootstrap)
- `Read` `src/single-spa/single-spa-props.ts` if it exists (MFE only)

**5b — Translate providers in-memory.** Apply each rule below to every entry you read in step 5a. No "thinking out loud" turn — go straight to 5c.

| `app.module.ts` import / provider | Translation in `app.config.ts` |
|---|---|
| `RouterModule.forRoot(routes)` | `provideRouter(routes)`, import `routes` from `./app.route` |
| `HttpClientModule` | `provideHttpClient(withInterceptorsFromDi())` |
| `BrowserAnimationsModule` | `provideAnimations()` |
| `BrowserModule` | drop |
| `FormsModule` / `ReactiveFormsModule` | drop (import per-component instead) |
| `TranslateModule.forRoot(...)` | `importProvidersFrom(TranslateModule.forRoot(...))` |
| `XxxModule.forRoot(...)` (any other) | `importProvidersFrom(XxxModule.forRoot(...))` |
| `{ provide: X, useClass/useValue/useFactory: ... }` | keep verbatim in `providers` |
| HTTP_INTERCEPTORS multi-providers | keep verbatim |

**5c — Write `src/app/app.config.ts`** using the `Write` tool. Non-MFE projects export `appConfig: ApplicationConfig`. MFE projects export both `createAppConfig(extraProviders: any[] = []): ApplicationConfig` and `appConfig = createAppConfig()`. Use `importProvidersFrom` for every `forRoot(...)` you saw in 5a.

**5d — Rewrite the bootstrap file** using `Write` (single overwrite).
- Non-MFE → `src/main.ts` calls `bootstrapApplication(AppComponent, appConfig)`.
- MFE → `src/main.single-spa.ts` keeps the `singleSpaAngular({ bootstrapFunction })` wrapper; the body calls `bootstrapApplication(AppComponent, createAppConfig([...getSingleSpaExtraProviders(), { provide: ReusableStore, useValue: reusableStore }]))`. **Never** inline a `providers: [...]` array inside `main.single-spa.ts` — all providers come from `createAppConfig`. The template string must use the selector you read in 5a: `template: '<your-selector />'`.

**5e — Delete `src/app/app.module.ts`** if it still exists. Pick by `state.shell`:
- PowerShell: `Remove-Item src\app\app.module.ts -Force`
- cmd: `del src\app\app.module.ts`

**5f — Verify** via raw shell: `ng build`. If it exits non-zero, print the error and stop. On success, move directly to step 6 by calling its first tool — no acknowledgement.

### 6. Rename routing modules

- Call `mage_ng_rename_routes`. The plugin handles the mechanical rewrite (drop `@NgModule`, export `Routes`, rename `*.module.ts` → `*.route.ts`, rewrite `loadChildren` paths).
- For each entry in the returned `loadChildrenCandidates` list **(LLM)**: read the original `*.module.ts` target.
  - If it had `RouterModule.forChild(routes)` or a non-empty `Routes` array → leave the rewritten `loadChildren: () => import('...').then(m => m.routes)` as-is.
  - If it only declared a single component → edit the file to use `loadComponent: () => import('./x.component').then(m => m.XComponent)` instead.
- Run `ng build`.

### 7. Commit standalone migration

```
git add .
git commit -m "chore(MAGE/UPDATEANGULAR20): standalone migration + route rename"
```

### 8. Control flow schematic

Run via raw shell, then run `ng build`:

```
ng generate @angular/core:control-flow --interactive=false
```

### 9. Manual control flow **(LLM)**

Grep `src/**/*.html` for remaining `*ngIf`, `*ngFor`, `[ngSwitch]`, `*ngSwitchCase`, `*ngSwitchDefault`. For each file:
- Convert to `@if` / `@for (... ; track ...)` / `@switch` per the transformation rules in the original skill doc.
- For `*ngFor`, prefer `track item.id` (or equivalent unique key) over `track $index`.
- Skip custom structural directives, stacked structural directives on the same element, and complex multi-line cases. Record skips via `mage_ng_state` with `action="note", name="manual-cf-skip", status="skipped", note="<file>:<line> <reason>"`.
- Run `ng build` after each file. Stop on non-zero exit.

### 10. Commit control flow

```
git add .
git commit -m "chore(MAGE/UPDATEANGULAR20): control flow migration"
```

### 11. Prep for core update

- Call `mage_ng_lib` with `action="remove"`.
- Call `mage_ng_clean_modules`.
- **Do not** run npm install — `ng update` will reinstall.

### 12. v18 → v19

- Run `ng update @angular/core@19 @angular/cli@19`.
- If `state.hasNgrx`, also run `ng update @ngrx/store@19`.
- Run `ng build`. Stop on non-zero exit.

### 13. Post-19 deps

- Call `mage_ng_dep_pins` with `phase="19"`.
- Run `npm install --legacy-peer-deps`.
- Run `ng build`.

### 14. browserTarget → buildTarget

- Call `mage_ng_angular_json`.
- Run `ng build`.

### 15. Commit Angular 19

```
git add .
git commit -m "chore(MAGE/UPDATEANGULAR20): angular 19 update + post-19 deps"
```

### 16. v19 → v20

- Run `ng update @angular/core@20 @angular/cli@20`.
- If `state.hasNgrx`, also run `ng update @ngrx/store@20`.
- Run `ng build`. Stop on non-zero exit.

### 17. Post-20 deps

- Call `mage_ng_dep_pins` with `phase="20"`.
- Run `npm install --legacy-peer-deps`.
- Run `ng build`.

### 18. pipeline.yml nvm

Call `mage_ng_pipeline_nvm`.

### 19. Restore @mybcabisnis-web/lib

- Call `mage_ng_lib` with `action="restore"`.
- Run `npm install --legacy-peer-deps`.
- Run `ng build`.

### 20. Final verification + commit

- Run `ng build --configuration production`.
- Run `ng test --watch=false`.
- Run `ng lint`.
- Commit:

```
git add .
git commit -m "chore(MAGE/UPDATEANGULAR20): angular 20 update + post-20 deps + pipeline"
```

### 21. Report

Call `mage_ng_write_report`. Tell the user the report path. Done.
