# Scan Guide — Generic (Heuristic Fallback)

Use this guide when the project does not match the Angular or Spring Boot scan guides — or as a supplementary scan for a mixed-stack project.

**Important:** All values derived heuristically must be verified against source. If a value cannot be confirmed, mark it `(inferred — verify)` in the output document rather than stating it as fact.

---

## 1. Identify the stack

Read these files to understand what you're working with:

| File | What it tells you |
|------|------------------|
| `package.json` | Node.js project; check `dependencies` for framework hints (Express, Fastify, NestJS, Vue, React, Next.js, Nuxt, etc.) |
| `Cargo.toml` | Rust project (Actix, Axum, Rocket, etc.) |
| `go.mod` | Go project |
| `requirements.txt` / `pyproject.toml` / `setup.py` | Python (Django, FastAPI, Flask, etc.) |
| `Gemfile` | Ruby (Rails, Sinatra) |
| `composer.json` | PHP (Laravel, Symfony) |
| `*.csproj` / `*.sln` | .NET / C# (ASP.NET Core, Blazor) |
| `build.gradle` / `pom.xml` | JVM project (if not Spring Boot, check for Micronaut, Quarkus, Vert.x) |

Note the framework/stack in the **Platforms** section of the FFL output.

---

## 2. Find route / endpoint definitions

**Coverage rule:** Enumerate **every** route/handler group. Each distinct controller class or route group becomes its own `### 2.x` flow section in the FFL. Handlers within a group with materially different flows (different service/downstream/auth) get their own `#### 2.x.y` sub-diagrams.

Only search within files returned by `git ls-files` (Step 0 of the FFL workflow). Skip gitignored/untracked files.

Grep for common routing patterns across frameworks:

```bash
# Express / Fastify / Hono (Node.js)
grep -rn "app\.get\|app\.post\|app\.put\|app\.delete\|app\.patch\|router\.get\|router\.post" src/

# NestJS
grep -rn "@Get\|@Post\|@Put\|@Delete\|@Patch\|@Controller" src/

# Django
grep -rn "path(\|url(\|re_path(" */urls.py

# FastAPI / Flask
grep -rn "@app\.get\|@app\.post\|@app\.put\|@app\.delete\|@router\.get\|@router\.post" .

# Ruby on Rails
cat config/routes.rb

# ASP.NET Core
grep -rn "\[HttpGet\]\|\[HttpPost\]\|\[HttpPut\]\|\[HttpDelete\]\|\[Route(" .

# Go (net/http / Gorilla Mux / Gin)
grep -rn "HandleFunc\|\.GET\|\.POST\|\.PUT\|\.DELETE\|\.PATCH" .

# PHP Laravel
cat routes/api.php routes/web.php
```

For each route found, extract:
- HTTP method
- Path string
- Handler function / controller method name

---

## 3. Find HTTP client calls (outgoing requests)

If the project calls external APIs, grep for HTTP client usage:

```bash
# Node.js / TypeScript
grep -rn "fetch(\|axios\.\|http\.get\|http\.post\|https\.request\|got(" src/

# Python
grep -rn "requests\.get\|requests\.post\|httpx\.\|aiohttp\." .

# Java (OkHttp, RestTemplate, WebClient)
grep -rn "restTemplate\.\|webClient\.\|OkHttpClient\|new Request\.Builder" src/

# Go
grep -rn "http\.Get\|http\.Post\|http\.NewRequest" .

# C# / .NET
grep -rn "HttpClient\|GetAsync\|PostAsync\|PutAsync\|DeleteAsync" .
```

For each call found, record the HTTP method and URL. If the URL is in a variable or constant, follow the reference to read the actual string.

---

## 4. Find the base URL / API config

**Read committed config files only** (Step 0). `.env` files are almost always gitignored — read the **keys** defined there (they tell you the config shape) but never emit the *values* from a gitignored `.env`. Only use values from committed config files.

Common locations (read the committed version):

| Framework | Committed config location |
|-----------|--------------------------|
| Express / Fastify | `config/` directory, `src/config.ts` (NOT `.env`) |
| NestJS | `src/config/`, `@nestjs/config` module (NOT `.env`) |
| Django | `settings.py` — `BASE_URL`, `ALLOWED_HOSTS` |
| FastAPI | `app/core/config.py` (NOT `.env`) |
| Rails | `config/environments/production.rb`, `config/application.rb` |
| .NET | `appsettings.json`, `appsettings.Production.json` (NOT `appsettings.Development.json` if gitignored) |
| Go | `config.yaml`, `main.go` constants (NOT `.env`) |
| PHP Laravel | `config/app.php` `url` (NOT `.env` — read `APP_URL` key name only) |

Read the committed production/environment config and extract the base API URL as an exact string. If the value is injected at runtime from an env var (e.g. `${API_URL}`), emit the placeholder with the note `(externalized — value not committed)`.

---

## 5. Find entry points (frontend)

For non-Angular SPA frameworks:

| Framework | Entry points |
|-----------|-------------|
| React (React Router) | `src/App.tsx`, `src/router.tsx`, or files using `<Route path=` |
| Vue 3 (Vue Router) | `src/router/index.ts` — `routes: [{ path: '...', component: ... }]` |
| Nuxt | `pages/` directory — file name = route path |
| Next.js | `app/` directory (App Router) or `pages/` directory (Pages Router) — file name = route path |
| Svelte (SvelteKit) | `src/routes/` — file/directory name = route path |
| Remix | `app/routes/` — file name = route path |

---

## 6. Identify layers

Try to identify the project's layered structure by looking at the top-level source directories:

| Directory name hint | Likely responsibility |
|--------------------|-----------------------|
| `controllers/`, `handlers/`, `routes/` | Entry point / routing layer |
| `services/`, `usecases/`, `domain/` | Business logic layer |
| `repositories/`, `dao/`, `data/` | Data access layer |
| `models/`, `entities/`, `schemas/` | Data models |
| `middleware/`, `interceptors/` | Cross-cutting concerns |
| `utils/`, `helpers/`, `lib/` | Shared utilities |
| `config/`, `settings/` | Configuration |

Document the ones you find in §1.2 Key Directories.

---

## 7. Identify authentication pattern

Check for common auth patterns:

- **JWT:** look for `jwt.sign`, `jwt.verify`, `@nestjs/jwt`, `PyJWT`, `jwtDecode`, etc.
- **Session:** look for `express-session`, `django.contrib.sessions`, `Rack::Session`.
- **OAuth2 / OIDC:** look for `passport`, `spring-security-oauth2`, `authlib`, etc.
- **API Key:** look for `X-API-Key` header check in middleware.

Note the auth pattern in the Architecture section and include it in the flow diagrams' guard/interceptor step.

---

## Producing the FFL for an unknown stack

When the stack is not covered by a dedicated scan guide:

1. **Document what you found** — in §1.1 System Architecture, briefly describe the stack and your confidence level.
2. **List all endpoints** you found with their handlers — even if you can't fully trace the flow for every one.
3. **For flows you can trace** — follow the full call chain and produce sequence + flowchart diagrams.
4. **For flows you cannot trace** — add the endpoint row to §3 but note `(handler not traced)` in the "Called by" column.
5. **Mark all inferred values** — anything you read from a grep result but didn't verify by reading the source file should be marked `(inferred — verify)`.
6. **Note the stack detection result** in the Platforms field: e.g. `Express 4.x (Node.js)` or `FastAPI 0.110 (Python)`.

This produces a best-effort FFL that the team can validate and fill in, rather than a fabricated one.
