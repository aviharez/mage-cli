---
name: angular-update
description: Automate Angular application migration from Angular 18 to Angular 20, including control flow syntax, standalone components, signal-based APIs, and inject() function migration
---

# Angular Update (v18 → v20)

Migrate Angular projects from version 18 to version 20 following the official Angular migration path. Always migrate one major version at a time and commit after each successful step.

## Migration Steps

### Step 1: Update Dependencies

Run the Angular CLI update schematic for each major version sequentially:

```bash
# First: v18 → v19
ng update @angular/core@19 @angular/cli@19 --force
ng build  # verify no breaking errors before proceeding

# Then: v19 → v20
ng update @angular/core@20 @angular/cli@20 --force
ng build
```

Also update related Angular packages (run after each version bump):
```bash
ng update @angular/material@<version> @angular/cdk@<version>  # if used
ng update @ngrx/store@<version>  # if used
```

After each `ng update`, read the migration output carefully — it will list manual steps. Apply those before proceeding to the next version.

### Step 2: Control Flow Syntax Migration

Run the built-in schematic:
```bash
ng generate @angular/core:control-flow
```

Conversions applied automatically:
- `*ngIf="condition"` → `@if (condition) { } @else { }`
- `*ngFor="let item of items; trackBy: fn"` → `@for (item of items; track trackFn(item)) { } @empty { }`
- `*ngSwitch` / `*ngSwitchCase` / `*ngSwitchDefault` → `@switch` / `@case` / `@default`

**Manual review required for:**
- `*ngIf` with `as` alias: change `*ngIf="obs$ | async as data"` to `@if (obs$ | async; as data)`
- Multiple structural directives on the same element — extract one to a wrapping `<ng-container>`
- Custom structural directives — cannot be auto-migrated, keep or refactor manually
- `ng-template` with `*ngIf` used as else blocks — rewrite as `@else { }` inline

### Step 3: Standalone Migration

Run the schematic interactively:
```bash
ng generate @angular/core:standalone
```

Run in this order when prompted:
1. **Convert all components, directives, and pipes** — adds `standalone: true` and moves declarations into component `imports`
2. **Remove unnecessary NgModules** — deletes NgModules that only existed for declarations
3. **Bootstrap using standalone APIs** — updates `main.ts` from `bootstrapModule` to `bootstrapApplication`

Result in `main.ts`:
```typescript
// Before
platformBrowserDynamic().bootstrapModule(AppModule)

// After
bootstrapApplication(AppComponent, appConfig)
```

**Manual review required for:**
- `RouterModule.forRoot()` / `forChild()` → replace with `provideRouter(routes)` in `app.config.ts`
- `HttpClientModule` → replace with `provideHttpClient()` in `app.config.ts`
- `BrowserAnimationsModule` → replace with `provideAnimations()` in `app.config.ts`
- Shared modules that export third-party modules — keep or flatten exports one by one
- Lazy-loaded routes using `loadChildren: () => import('./x.module')` → change to `loadComponent: () => import('./x.component')`

### Step 4: Signal-Based Inputs and Queries

Run the migration schematics:
```bash
ng generate @angular/core:signal-input-migration
ng generate @angular/core:signal-queries-migration
ng generate @angular/core:output-migration
```

What changes:
```typescript
// Before
@Input() title: string = '';
@Input({ required: true }) id!: number;
@Input({ alias: 'myAlias' }) value = 0;
@Output() clicked = new EventEmitter<void>();
@ViewChild('myRef') myRef!: ElementRef;
@ContentChild(MyDir) dir?: MyDir;

// After
title = input('');
id = input.required<number>();
value = input(0, { alias: 'myAlias' });
clicked = output<void>();
myRef = viewChild.required<ElementRef>('myRef');
dir = contentChild(MyDir);
```

To read signal inputs in the template or class, call them as functions: `this.title()` / `{{ title() }}`.

**Manual review required for:**
- Two-way bound inputs using `ngModel` or `[(value)]` — these stay as `@Input`/`@Output` pairs unless you use the `model()` signal
- Inputs read via `ngOnChanges` — switch to `effect()` watching the signal instead
- `@ViewChildren` / `@ContentChildren` returning `QueryList` — migrate to `viewChildren()` / `contentChildren()` returning `Signal<T[]>`

### Step 5: inject() Function

Replace constructor injection with the `inject()` function for cleaner, more composable code:

```typescript
// Before
@Component({ ... })
export class MyComponent {
  constructor(
    private router: Router,
    private http: HttpClient,
    private destroyRef: DestroyRef,
  ) {}
}

// After
@Component({ ... })
export class MyComponent {
  private router = inject(Router);
  private http = inject(HttpClient);
  private destroyRef = inject(DestroyRef);
}
```

Run the schematic if available in your Angular version:
```bash
ng generate @angular/core:inject
```

Use `DestroyRef` with `takeUntilDestroyed()` to replace `ngOnDestroy` + `Subject` teardown:
```typescript
// Before
private destroy$ = new Subject<void>();
ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }
someObs$.pipe(takeUntil(this.destroy$)).subscribe(...)

// After
someObs$.pipe(takeUntilDestroyed()).subscribe(...)
```

### Step 6: Verify and Clean Up

```bash
ng build --configuration production   # catch any remaining errors
ng test                               # ensure tests still pass
ng lint                               # fix any lint errors introduced by migration
```

Additional cleanup:
- Remove `CommonModule` from any `imports` array where it is no longer used — prefer individual imports (`NgIf`, `NgFor`, `AsyncPipe`) or rely on built-in control flow
- Remove `FormsModule` / `ReactiveFormsModule` from modules that no longer need them
- Delete empty `*.module.ts` files left over from standalone migration
- Update `tsconfig.json` target to `ES2022` if not already set (required by Angular 20)

## Common Issues and Fixes

| Error | Fix |
|-------|-----|
| `NG0203: inject() must be called from an injection context` | Move `inject()` calls to class field declarations, not inside methods |
| Template parse error after control-flow migration | Check for orphaned `ng-template` or whitespace-sensitive wrappers |
| `NullInjectorError: No provider for X` after standalone | Add `X` to the `providers` array in `app.config.ts` or the component's `providers` |
| `RouterModule` not found | Use `provideRouter(routes)` in `app.config.ts` and import `RouterOutlet`, `RouterLink` directly in components |
| `HttpClientModule` not found | Use `provideHttpClient(withInterceptorsFromDi())` in `app.config.ts` |
| Signal input read as plain value | Call the signal: `this.myInput()` not `this.myInput` |
| `QueryList` type errors after query migration | Update to `Signal<T[]>` — access with `.()` and replace `.changes` observable with `effect()` |

## Guidelines

- Never skip a major version — always go 18 → 19 → 20
- Run `ng build` after every schematic to catch errors before stacking changes
- Commit after each step so individual steps are reversible
- For large codebases, migrate one feature module at a time using `--path` flag on schematics
- Do not manually edit files a schematic will modify — run the schematic first, then patch the result
- After standalone migration, search for remaining `NgModule` imports and clean them up
