# Architecture Conventions — Angular 18

## Project Structure

```
src/app/
├── core/                   # Singleton services, guards, interceptors, app-wide config
│   ├── interceptors/
│   ├── guards/
│   └── services/
├── shared/                 # Reusable standalone components, pipes, directives
│   ├── components/
│   ├── pipes/
│   └── directives/
└── features/               # Feature modules (each is a lazy-loaded route group)
    └── <feature-name>/
        ├── <feature-name>.routes.ts
        ├── components/
        ├── services/
        └── store/
```

## Component Rules

- All components are **standalone** (`standalone: true`). Never use NgModule.
- Always set `changeDetection: ChangeDetectionStrategy.OnPush`.
- Use `inject()` for dependency injection — no constructor injection.
- Use **signals** (`signal()`, `computed()`, `effect()`) for local reactive state.
- Use the **new control flow** syntax (`@if`, `@for`, `@switch`) — never `*ngIf` / `*ngFor`.
- Template files live alongside their component (`.component.html`, `.component.scss`).

## State Management

- Feature state lives in a **signal store** (`<feature>.store.ts`) in `features/<name>/store/`.
- The store is a plain class decorated with `@Injectable({ providedIn: 'root' })` or provided scoped via `providers` in the route.
- Stores expose `readonly` computed signals and mutation methods — no public writable signals.
- Global cross-feature state (auth, user profile) lives in `core/services/`.

## Services

- Services are `@Injectable({ providedIn: 'root' })` unless deliberately scoped.
- All HTTP calls go through a typed service — components never call `HttpClient` directly.
- Return `Observable<T>` from service methods; transform to signals in the component or store with `toSignal()`.

## Forms

- Use **typed reactive forms** (`FormGroup<{...}>`, `FormControl<T>`).
- Never use template-driven forms.
- Put complex form logic in a dedicated `<feature>-form.service.ts`, not in the component.

## Routing

- Each feature exports a `routes` array (`<feature>.routes.ts`) loaded lazily via `loadChildren`.
- Route guards are functional (`CanActivateFn`) — never class-based.
- Resolvers are functional (`ResolveFn<T>`).
