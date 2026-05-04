# Code Review Rules — Angular 18

## Critical (must fix before merge)

- **No NgModule**: components must be standalone. Reject any `@NgModule` declaration.
- **No constructor injection**: all DI must use `inject()`. Flag any `constructor(private ...)`.
- **No `*ngIf` / `*ngFor`**: must use `@if` / `@for` / `@switch` control flow.
- **No mutable public signals**: stores must never expose `signal()` directly — wrap in `readonly` computed or expose via method.
- **OnPush required**: every component must have `changeDetection: ChangeDetectionStrategy.OnPush`.
- **No `any` type**: flag all uses of `any`. Use `unknown` with type narrowing, or a proper interface.
- **No direct HttpClient in components**: HTTP calls must go through a service.
- **No `subscribe()` in components without cleanup**: either use `toSignal()`, `async` pipe, or `takeUntilDestroyed()`.

## Warnings (should fix)

- **Missing `trackBy`**: `@for` loops over objects must include `track` expression (e.g. `track item.id`).
- **Untyped forms**: `FormControl` and `FormGroup` must be typed.
- **Magic strings**: route paths, API URLs, and event names should be constants or enums.
- **Fat components**: if a component has more than ~150 lines of logic, extract to a service or store.
- **Nested subscriptions**: flag `subscribe()` inside another `subscribe()`. Refactor with `switchMap` / `mergeMap`.
- **Missing error handling**: HTTP calls must handle errors (`.pipe(catchError(...))`).
- **`console.log` left in**: remove before merge.

## Style (fix if easy)

- Signal fields should not have `Signal` in their name (prefer `products` over `productsSignal`).
- Avoid `ngOnInit` when `inject()` + field initializers handle setup — use `afterNextRender` or `effect()` instead.
- Imports should be grouped: Angular core → Angular common → third-party → local.
- Template bindings: prefer `[class.active]="..."` over `[ngClass]`.
- Use `input()` and `output()` signal-based APIs (Angular 17.1+) instead of `@Input()` / `@Output()`.
