# Scan Guide — Angular

Use this guide to locate every piece of information needed for the FFL in an Angular project. Read each source file type listed below; map what you find to the corresponding FFL template field.

---

## 1. Project version & name

**File:** `package.json` at the project root.
**Fields:** `.name` → Project Name, `.version` → Version.
**Angular version:** look for `"@angular/core"` in `.dependencies` or `.devDependencies`.

---

## 2. Base URL

The base URL for all API calls. Read **committed files only** (Step 0 of the FFL workflow). Skip any environment file that is gitignored or untracked (e.g. `environment.local.ts`, `.env`, `.env.local`).

Read **in this priority order** (committed files only):

1. `src/environments/environment.prod.ts` — look for `apiUrl`, `baseUrl`, `API_URL`, `baseURL` (any case). Use this value.
2. `src/environments/environment.ts` — same keys. Use if `environment.prod.ts` is absent or has no URL.
3. `src/app/core/constants.ts`, `src/app/shared/constants.ts`, or any `*constants*` file — look for a URL constant.
4. `src/app/app.config.ts` or `src/app/app.module.ts` — look for `HttpClient` base URL injection.

Copy the **exact string value** from the committed file, e.g. `https://api.mybca.co.id/v1`. Never write "from environment" or a placeholder. **If the URL is injected from the build environment** (e.g. set via `process.env.API_URL` or Angular's `fileReplacements`), emit the env-var key/name with the note `(externalized — value not committed)`. Never use a value read from a gitignored local file as the base URL.

---

## 3. Routes / Entry points

**Coverage rule:** Enumerate **every** route entry (path → component) across all routing files, including lazy-loaded child routes. Each distinct routed feature becomes its own `### 2.x` flow section in the FFL. For a lazy-loaded feature module with multiple routes that share the same component flow shape, one section covers the feature; for routes with materially different call chains, split into `#### 2.x.y` sub-diagrams per route.

Locate the routing files. Common patterns (read all that apply):

| Pattern | How to find |
|---------|-------------|
| Standalone routes | `src/app/app.routes.ts` — `export const routes: Routes = [...]` |
| Module-based | `src/app/app-routing.module.ts` — `const routes: Routes = [...]` |
| Lazy-loaded feature | `src/app/**/**.routes.ts` or `**-routing.module.ts` |

For each route entry, extract:
- `path` → the URL path (Entry point)
- `component` → the component class name (Component)
- `canActivate` → guards array (Guards)
- `loadChildren` / `loadComponent` → follow the lazy import to find the child routes

Build a list: `[route path] → [ComponentName] (guards: [...])`.

---

## 4. Components

For each component identified from the routes, read its `.component.ts` file.

**What to extract:**

| What | Where in the file |
|------|-------------------|
| Class name | `export class FooComponent` |
| Lifecycle hooks | `ngOnInit()`, `ngAfterViewInit()` method bodies |
| Event handlers | `on*()`, button click handlers, form submit handlers |
| Injected services | Constructor parameters: `private fooService: FooService` |
| Navigation calls | `this.router.navigate(['/path'])` |

For each event handler / lifecycle hook, note: **what triggers it** (user action or init) and **which service methods it calls**.

---

## 5. Services

For each service injected in the components you found, read its `.service.ts` file.

**What to extract:**

| What | Where |
|------|-------|
| Class name | `export class FooService` |
| Method names | `getFoo()`, `submitBar(body: BarDto)` |
| HTTP calls | `this.http.get(...)`, `this.http.post(...)`, `this.http.put(...)`, `this.http.delete(...)`, `this.http.patch(...)` |
| Exact path | The first argument to `http.get(...)` — read the full string, including any template literal segments |
| Request body | Second argument to `http.post(url, body)` — note its type |
| Return type / mapping | `.pipe(map(...))` return shape, or the TypeScript return type annotation |

Compose the full endpoint: `[base URL] + [path from service]`. If the path starts with `http`, it is already absolute — use it as-is.

If the path uses a constant or variable (e.g. `this.http.get(this.baseUrl + Endpoints.FOO)`), follow the reference to read the actual string value.

---

## 6. HTTP interceptors

Read any file matching `*interceptor.ts` in `src/app/`:
- Note auth interceptors (attach Bearer token) — mention in the Architecture section.
- Note error interceptors (handle 401 redirect) — include in the flow's error branch.

---

## 7. Guards

For each `canActivate` guard found in routes, read the guard file:
- Note the guard class name and what condition it checks (e.g. `AuthGuard` checks `isAuthenticated()`).
- Note what happens on failure (redirect path).
- Include in the FFL flow's entry step.

---

## 8. State management (optional)

If the project uses NgRx, Akita, or a signals-based store:
- Note the store/state file (e.g. `src/app/store/`).
- For flows that dispatch actions or select from state, include the action/selector name in the flow step instead of a direct service call.
- Pattern: `Component → dispatch(Action)` → `Effect → Service.method → API`.

---

## Mapping to FFL template fields

| FFL field | Source |
|-----------|--------|
| Project Name | `package.json` `.name` |
| Version | `package.json` `.version` |
| Platforms | `Angular [version from @angular/core]` |
| Architecture Pattern | MVVM (or Flux if NgRx) |
| Entry point | `path` from routing file |
| Component | `component` class name from routing file |
| Guards | `canActivate` array from routing file |
| Screens involved | All component names in the flow chain |
| Endpoints called | `HTTP METHOD` + full path from service file |
| Base URL | From `environment.prod.ts` / `environment.ts` |
| Called by | `ServiceName.methodName()` |
| Request Body | Type/shape from service method parameter |
| Response Shape | Return type or `.pipe(map(...))` shape |

---

## Key directories to document in §1.2

| Directory | Purpose |
|-----------|---------|
| `src/app/core/` | Singleton services, interceptors, guards |
| `src/app/shared/` | Reusable components, pipes, directives |
| `src/app/features/` or `src/app/pages/` | Feature modules / standalone feature dirs |
| `src/environments/` | Environment config (including base URL) |
| `src/assets/` | Static assets |
