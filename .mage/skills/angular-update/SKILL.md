---
name: angular-update
description: Automate Angular application migration from Angular 18 to Angular 20, including control flow syntax, standalone components, signal-based APIs, and inject() function migration
---

# Angular Update (v18 → v20)

Migrate Angular projects from version 18 to version 20 following the official Angular migration path. Always migrate one major version at a time and commit after each successful step.

## CONTRACT

- Do NOT stop between steps unless a build fails.
- Do NOT produce any text response until the final report is written (or a build fails requiring user action).
- Write intermediate findings and progress to `ng-update-scratch.md` using tool calls.
- If a build fails, stop immediately and report the full error to the user. Do not continue to the next step.
- The task is complete only when `NG-UPDATE-REPORT-[YYYY-MM-DD].md` exists on disk.

---

## Step 0 — Detect OS

```
node -e "console.log(process.platform)"
```

- `win32` → **Windows**: use PowerShell and `npx ng` commands below.
- `darwin` / `linux` → **Unix**: use bash and `ng` commands below.

Write `OS=[result]` to `ng-update-scratch.md`. Go to Step 1.

---

## Step 1 — Read current state

Read `package.json` in full to note current Angular version and installed packages.

**bash:** `cat package.json`
**PowerShell:** `Get-Content package.json`

Read `angular.json` in full to note project structure.

**bash:** `cat angular.json`
**PowerShell:** `Get-Content angular.json`

Check which Angular packages are installed:

**bash:**
```
grep -i "@angular\|@ngrx\|@angular/material" package.json | head -30
```
**PowerShell:**
```
Get-Content package.json | Select-String -Pattern "@angular|@ngrx|@angular/material" | Select-Object -First 30
```

Append findings to `ng-update-scratch.md` under `# CurrentState`. Go to Step 2.

---

## Step 2 — Migrate v18 → v19

Run the Angular CLI update schematic:

**bash:**
```
ng update @angular/core@19 @angular/cli@19 --force
```
**Windows PowerShell:**
```
npx ng update @angular/core@19 @angular/cli@19 --force
```

If `@angular/material` is installed, also run:

**bash:**
```
ng update @angular/material@19 --force
```
**Windows PowerShell:**
```
npx ng update @angular/material@19 --force
```

If `@ngrx/store` is installed, also run:

**bash:**
```
ng update @ngrx/store@19 --force
```
**Windows PowerShell:**
```
npx ng update @ngrx/store@19 --force
```

Then verify the build:

**bash:** `ng build`
**Windows PowerShell:** `npx ng build`

If the build **fails**, stop and report the full error. If it **passes**, append `v18→v19 OK` to `ng-update-scratch.md`. Go to Step 3.

---

## Step 3 — Migrate v19 → v20

**bash:**
```
ng update @angular/core@20 @angular/cli@20 --force
```
**Windows PowerShell:**
```
npx ng update @angular/core@20 @angular/cli@20 --force
```

If `@angular/material` is installed:

**bash:**
```
ng update @angular/material@20 --force
```
**Windows PowerShell:**
```
npx ng update @angular/material@20 --force
```

If `@ngrx/store` is installed:

**bash:**
```
ng update @ngrx/store@20 --force
```
**Windows PowerShell:**
```
npx ng update @ngrx/store@20 --force
```

Then verify:

**bash:** `ng build`
**Windows PowerShell:** `npx ng build`

If the build **fails**, stop and report. If it **passes**, append `v19→v20 OK` to `ng-update-scratch.md`. Go to Step 4.

---

## Step 4 — Control flow syntax migration

Run the built-in schematic:

**bash:**
```
ng generate @angular/core:control-flow
```
**Windows PowerShell:**
```
npx ng generate @angular/core:control-flow
```

Then verify:

**bash:** `ng build`
**Windows PowerShell:** `npx ng build`

What the schematic converts automatically:
- `*ngIf="condition"` → `@if (condition) { } @else { }`
- `*ngFor="let item of items; trackBy: fn"` → `@for (item of items; track fn(item)) { } @empty { }`
- `*ngSwitch` / `*ngSwitchCase` / `*ngSwitchDefault` → `@switch` / `@case` / `@default`

After running, search for items that need manual review:

**bash:**
```
grep -rn "ngIf.*as \|ngFor.*let.*of\b" src --include="*.html" | head -20
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.html" -ErrorAction SilentlyContinue | Select-String -Pattern "ngIf.*as |ngFor.*let.*of\b" | Select-Object Path, LineNumber, Line | Select-Object -First 20
```

**bash:**
```
grep -rn "\*\[" src --include="*.html" | head -20
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.html" -ErrorAction SilentlyContinue | Select-String -Pattern "\*\[" | Select-Object Path, LineNumber, Line | Select-Object -First 20
```

Append findings to `ng-update-scratch.md` under `# ControlFlow`. Fix any manual items, then go to Step 5.

### Manual fixes required for:
- `*ngIf="obs$ | async as data"` → `@if (obs$ | async; as data)`
- Multiple structural directives on one element — extract one to `<ng-container>`
- Custom structural directives — keep or refactor manually
- `ng-template` used as `*ngIf` else blocks — rewrite as `@else { }` inline

---

## Step 5 — Standalone migration

Run the schematic three times in order:

**Step 5a — Convert components, directives, and pipes:**

**bash:**
```
ng generate @angular/core:standalone
```
**Windows PowerShell:**
```
npx ng generate @angular/core:standalone
```

When prompted, select: **Convert all components, directives, and pipes**

**bash:** `ng build`
**Windows PowerShell:** `npx ng build`

If build fails, stop and report.

**Step 5b — Remove unnecessary NgModules:**

**bash:**
```
ng generate @angular/core:standalone
```
**Windows PowerShell:**
```
npx ng generate @angular/core:standalone
```

When prompted, select: **Remove unnecessary NgModules**

**bash:** `ng build`
**Windows PowerShell:** `npx ng build`

**Step 5c — Bootstrap using standalone APIs:**

**bash:**
```
ng generate @angular/core:standalone
```
**Windows PowerShell:**
```
npx ng generate @angular/core:standalone
```

When prompted, select: **Bootstrap using standalone APIs**

**bash:** `ng build`
**Windows PowerShell:** `npx ng build`

After all three, check for remaining NgModule references:

**bash:**
```
grep -rn "NgModule\|@NgModule" src --include="*.ts" | grep -v "spec\|test\|//.*NgModule" | head -20
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "NgModule|@NgModule" | Where-Object { $_.Line -notmatch "spec|test|//.*NgModule" } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```

Append findings to `ng-update-scratch.md` under `# Standalone`. Go to Step 6.

### Manual fixes required for:
- `RouterModule.forRoot()` → `provideRouter(routes)` in `app.config.ts`
- `HttpClientModule` → `provideHttpClient()` in `app.config.ts`
- `BrowserAnimationsModule` → `provideAnimations()` in `app.config.ts`
- Lazy routes using `loadChildren: () => import('./x.module')` → `loadComponent: () => import('./x.component')`

---

## Step 6 — Signal-based inputs and queries migration

Run each schematic in order, building after each:

**bash:**
```
ng generate @angular/core:signal-input-migration
```
**Windows PowerShell:**
```
npx ng generate @angular/core:signal-input-migration
```

**bash:** `ng build`
**Windows PowerShell:** `npx ng build`

If build passes:

**bash:**
```
ng generate @angular/core:signal-queries-migration
```
**Windows PowerShell:**
```
npx ng generate @angular/core:signal-queries-migration
```

**bash:** `ng build`
**Windows PowerShell:** `npx ng build`

If build passes:

**bash:**
```
ng generate @angular/core:output-migration
```
**Windows PowerShell:**
```
npx ng generate @angular/core:output-migration
```

**bash:** `ng build`
**Windows PowerShell:** `npx ng build`

Check for any remaining decorator-based inputs that were not migrated:

**bash:**
```
grep -rn "@Input()\|@Output()\|@ViewChild\|@ContentChild" src --include="*.ts" | grep -v "spec\|test\|//" | head -20
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "@Input\(\)|@Output\(\)|@ViewChild|@ContentChild" | Where-Object { $_.Line -notmatch "spec|test|//" } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```

Append findings to `ng-update-scratch.md` under `# Signals`. Go to Step 7.

### What changes:
```typescript
// Before
@Input() title: string = '';
@Input({ required: true }) id!: number;
@Output() clicked = new EventEmitter<void>();
@ViewChild('myRef') myRef!: ElementRef;

// After
title = input('');
id = input.required<number>();
clicked = output<void>();
myRef = viewChild.required<ElementRef>('myRef');
```

### Manual fixes required for:
- Two-way bound inputs using `ngModel` or `[(value)]` — stay as `@Input`/`@Output` pairs or use `model()` signal
- Inputs read via `ngOnChanges` — switch to `effect()` watching the signal
- `@ViewChildren` / `@ContentChildren` returning `QueryList` — migrate to `viewChildren()` / `contentChildren()`

---

## Step 7 — inject() function migration

**bash:**
```
ng generate @angular/core:inject
```
**Windows PowerShell:**
```
npx ng generate @angular/core:inject
```

**bash:** `ng build`
**Windows PowerShell:** `npx ng build`

Check for remaining constructor injections:

**bash:**
```
grep -rn "constructor(" src --include="*.ts" | grep -v "spec\|test\|//" | head -20
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "constructor\(" | Where-Object { $_.Line -notmatch "spec|test|//" } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```

Append findings to `ng-update-scratch.md` under `# Inject`. Go to Step 8.

### What changes:
```typescript
// Before
constructor(
  private router: Router,
  private http: HttpClient,
) {}

// After
private router = inject(Router);
private http = inject(HttpClient);
```

---

## Step 8 — Final cleanup and verification

### Remove unused CommonModule imports

**bash:**
```
grep -rn "CommonModule" src --include="*.ts" | grep -v "spec\|test\|//" | head -20
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "CommonModule" | Where-Object { $_.Line -notmatch "spec|test|//" } | Select-Object Path, LineNumber, Line | Select-Object -First 20
```

### Find leftover empty module files

**bash:**
```
find src -name "*.module.ts" | head -10
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Filter "*.module.ts" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Select-Object -First 10
```

### Check tsconfig target

**bash:** `cat tsconfig.json`
**PowerShell:** `Get-Content tsconfig.json`

Ensure `"target": "ES2022"` is set.

### Run full verification

**bash:**
```
ng build --configuration production
```
**Windows PowerShell:**
```
npx ng build --configuration production
```

**bash:** `ng test`
**Windows PowerShell:** `npx ng test`

**bash:** `ng lint`
**Windows PowerShell:** `npx ng lint`

Append all results to `ng-update-scratch.md` under `# Verification`. Go to Step 9.

---

## Step 9 — Write the migration report

Read `ng-update-scratch.md` in full. Write `NG-UPDATE-REPORT-[YYYY-MM-DD].md` at the project root. Delete `ng-update-scratch.md`. This is the only step that produces user-visible output.

```markdown
# Angular Migration Report — [Project Name]

**Generated:** [today's date]
**Migrated:** v[start] → v20

---

## Migration Steps Completed

| Step | Description | Status |
|------|-------------|--------|
| v18 → v19 | ng update @angular/core@19 | ✓ / ✗ |
| v19 → v20 | ng update @angular/core@20 | ✓ / ✗ |
| Control flow | @angular/core:control-flow | ✓ / ✗ |
| Standalone | @angular/core:standalone (×3) | ✓ / ✗ |
| Signal inputs | signal-input-migration | ✓ / ✗ |
| Signal queries | signal-queries-migration | ✓ / ✗ |
| Output migration | output-migration | ✓ / ✗ |
| inject() | @angular/core:inject | ✓ / ✗ |

---

## Manual Items Remaining

### Control Flow
| File | Line | Issue |
|------|------|-------|

### Standalone
| File | Line | Issue |
|------|------|-------|

### Signals
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
| `NG0203: inject() must be called from an injection context` | Move `inject()` to class field declarations, not inside methods |
| Template parse error after control-flow migration | Check for orphaned `ng-template` or whitespace-sensitive wrappers |
| `NullInjectorError: No provider for X` after standalone | Add `X` to `providers` in `app.config.ts` or the component |
| `RouterModule` not found | Use `provideRouter(routes)` in `app.config.ts`, import `RouterOutlet` / `RouterLink` directly |
| `HttpClientModule` not found | Use `provideHttpClient()` in `app.config.ts` |
| Signal input read as plain value | Call the signal: `this.myInput()` not `this.myInput` |
```

---

## Guidelines

- Never skip a major version — always go 18 → 19 → 20
- Run `ng build` after every schematic before proceeding
- Commit after each step so individual steps are reversible
- For large codebases, use `--path` flag on schematics to migrate one feature module at a time
- Do not manually edit files a schematic will modify — run the schematic first, then patch the result
