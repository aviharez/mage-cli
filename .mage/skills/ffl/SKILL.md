---
name: ffl
description: Generate a Functional Flow Document (FFL) in Markdown from source code — covers architecture overview, functional flows, and API endpoint list for Angular, Android, iOS (SwiftUI), and Spring Boot projects
---

# Functional Flow Document (FFL) Generator

## CONTRACT — read this first

This task has exactly one completion condition: the file `FFL-[ProjectName]-[YYYY-MM-DD].md` must exist on disk.

Until that file is written:
- Do NOT produce any text response to the user.
- Do NOT summarize findings in text.
- Do NOT ask the user anything.
- Do NOT stop between steps.
- Write intermediate findings to `ffl-scratch.md` (a tool call, not text).
- Always use FULL paths when reading files — never bare filenames.

The only acceptable output is tool calls, until `FFL-[ProjectName]-[YYYY-MM-DD].md` is written.

---

## Step 0 — Detect OS

```
node -e "console.log(process.platform)"
```

- `win32` → **Windows**: use PowerShell commands in every step below.
- `darwin` / `linux` → **Unix**: use bash commands in every step below.

Write `OS=[result]` to `ffl-scratch.md`. Go to Step 1.

---

## Step 1 — List project root

**bash:** `ls`
**PowerShell:** `Get-ChildItem -Name`

Append to `ffl-scratch.md` under `# Detection`. Go to Step 2.

---

## Step 2 — Detect platforms

**bash:**
```
find . -maxdepth 4 -name "angular.json" -o -name "AndroidManifest.xml" -o -name "*.xcodeproj"
```
**PowerShell:**
```
Get-ChildItem -Recurse -Depth 4 -Include "angular.json","AndroidManifest.xml","*.xcodeproj" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Select-Object -First 10
```

Append to `ffl-scratch.md`. Go to Step 3.

---

## Step 3 — Detect Spring Boot

**bash:**
```
find . -maxdepth 5 -name "Application.kt" -o -name "Application.java"
```
**PowerShell:**
```
Get-ChildItem -Recurse -Depth 5 -Include "Application.kt","Application.java" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Select-Object -First 5
```

Append to `ffl-scratch.md`. Note which platforms are present. Go to Step 4.

---

## Step 4 — Architecture

Run every block whose platform was detected. Limit output to 30 lines. Append to `ffl-scratch.md` under `# Architecture`. Run all that apply, then go to Step 5.

### Angular

**bash:**
```
find src/app -maxdepth 2 -type d | head -30
```
**PowerShell:**
```
Get-ChildItem -Path src/app -Depth 2 -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Select-Object -First 30
```

**bash:**
```
find src -name "*.service.ts" | head -30
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Filter "*.service.ts" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Select-Object -First 30
```

**bash:**
```
grep -rl "StoreModule\|createReducer\|BehaviorSubject\|signal" src --include="*.ts" | head -10
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "StoreModule|createReducer|BehaviorSubject|signal" -List | Select-Object -ExpandProperty Path | Select-Object -First 10
```

### Spring Boot

**bash:**
```
find src/main -name "*Controller*" -o -name "*UseCase*" -o -name "*Repository*" -o -name "*Service*" | head -30
```
**PowerShell:**
```
Get-ChildItem -Path src/main -Recurse -Include "*Controller*","*UseCase*","*Repository*","*Service*" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Select-Object -First 30
```

**bash:**
```
cat settings.gradle.kts 2>/dev/null || cat settings.gradle 2>/dev/null
```
**PowerShell:**
```
Get-Content settings.gradle.kts -ErrorAction SilentlyContinue -TotalCount 30
```

### Android

**bash:**
```
find app/src/main -type d | head -20
```
**PowerShell:**
```
Get-ChildItem -Path app/src/main -Recurse -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Select-Object -First 20
```

**bash:**
```
grep -rl "HiltViewModel\|@Inject\|@Module" app/src --include="*.kt" | head -10
```
**PowerShell:**
```
Get-ChildItem -Path app/src -Recurse -Include "*.kt" -ErrorAction SilentlyContinue | Select-String -Pattern "HiltViewModel|@Inject|@Module" -List | Select-Object -ExpandProperty Path | Select-Object -First 10
```

**bash:**
```
grep -rl "@Composable\|setContent" app/src --include="*.kt" | head -10
```
**PowerShell:**
```
Get-ChildItem -Path app/src -Recurse -Include "*.kt" -ErrorAction SilentlyContinue | Select-String -Pattern "@Composable|setContent" -List | Select-Object -ExpandProperty Path | Select-Object -First 10
```

### iOS

**bash:**
```
find . -maxdepth 4 -type d -not -path "*/.git/*" -not -path "*/Pods/*" | head -30
```
**PowerShell:**
```
Get-ChildItem -Depth 4 -Directory -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch "\.git|Pods" } | Select-Object -ExpandProperty FullName | Select-Object -First 30
```

**bash:**
```
grep -rl "@Observable\|ObservableObject\|ViewModel" . --include="*.swift" | head -10
```
**PowerShell:**
```
Get-ChildItem -Recurse -Include "*.swift" -ErrorAction SilentlyContinue | Select-String -Pattern "@Observable|ObservableObject|ViewModel" -List | Select-Object -ExpandProperty Path | Select-Object -First 10
```

---

## Step 5 — Read routing / navigation files in full

Find routing files and READ EACH ONE IN FULL. This is mandatory — do not skip. Append all content to `ffl-scratch.md` under `# Routes`.

### Angular

**bash:**
```
find src -name "*.routes.ts" -o -name "*-routing.module.ts" -o -name "app.routes.ts" | head -10
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.routes.ts","*-routing.module.ts","app.routes.ts" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Select-Object -First 10
```

Read every file returned. Extract from each file: route paths, component names, canActivate guards, resolve resolvers, loadChildren or loadComponent targets.

### Spring Boot

**bash:**
```
grep -rn "@GetMapping\|@PostMapping\|@PutMapping\|@DeleteMapping\|@PatchMapping\|@RequestMapping" src/main --include="*.java" --include="*.kt" -l | head -15
```
**PowerShell:**
```
Get-ChildItem -Path src/main -Recurse -Include "*.java","*.kt" -ErrorAction SilentlyContinue | Select-String -Pattern "@GetMapping|@PostMapping|@PutMapping|@DeleteMapping|@PatchMapping|@RequestMapping" -List | Select-Object -ExpandProperty Path | Select-Object -First 15
```

Read every controller file returned. Extract from each file: class-level `@RequestMapping`, method-level mappings, `@PathVariable`, `@RequestParam`, `@RequestBody` type, return type.

### Android

**bash:**
```
find app/src -name "nav_graph*.xml" -o -name "navigation*.xml" | head -5
```
**PowerShell:**
```
Get-ChildItem -Path app/src -Recurse -Include "nav_graph*.xml","navigation*.xml" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Select-Object -First 5
```

Read every nav graph file returned.

**bash:**
```
grep -rn "NavHost\|composable(\|navigate(" app/src --include="*.kt" | head -30
```
**PowerShell:**
```
Get-ChildItem -Path app/src -Recurse -Include "*.kt" -ErrorAction SilentlyContinue | Select-String -Pattern "NavHost|composable\(|navigate\(" | Select-Object Path, LineNumber, Line | Select-Object -First 30
```

### iOS

**bash:**
```
grep -rn "NavigationStack\|NavigationLink\|\.sheet(\|\.fullScreenCover(" . --include="*.swift" | head -30
```
**PowerShell:**
```
Get-ChildItem -Recurse -Include "*.swift" -ErrorAction SilentlyContinue | Select-String -Pattern "NavigationStack|NavigationLink|\.sheet\(|\.fullScreenCover\(" | Select-Object Path, LineNumber, Line | Select-Object -First 30
```

After reading all routing files, go to Step 6.

---

## Step 6 — Read service / API files in full

This step is MANDATORY. Read the actual source files to extract real endpoint URLs and method names. Do not guess or infer — only write what you read.

### Angular — read environment file (REQUIRED)

Read this file in full — this gives the real base URL:

**bash:**
```
cat src/environments/environment.ts
```
**PowerShell:**
```
Get-Content src/environments/environment.ts -ErrorAction SilentlyContinue
```

If that returns nothing, try:

**bash:**
```
find src -name "environment*.ts" | head -5
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "environment*.ts" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Select-Object -First 5
```

Read every environment file found. Append the base URL to `ffl-scratch.md` under `# BaseURL`.

### Angular — read all service files that make HTTP calls

**bash:**
```
grep -rl "this\.http\." src --include="*.ts" | head -20
```
**PowerShell:**
```
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "this\.http\." -List | Select-Object -ExpandProperty Path | Select-Object -First 20
```

Read EVERY file returned. For each file, extract:
- The service class name
- Every method that calls `this.http.get/post/put/delete/patch`
- The exact URL string or template literal passed to each call
- The request body type if any

Append all findings to `ffl-scratch.md` under `# ServiceMethods`.

### Spring Boot — read all controller files

Read each controller file found in Step 5 in full. For each file extract the exact endpoint paths and types.

### Android — read Retrofit interface files

**bash:**
```
grep -rl "@GET\|@POST\|@PUT\|@DELETE\|@PATCH" app/src --include="*.kt" | head -15
```
**PowerShell:**
```
Get-ChildItem -Path app/src -Recurse -Include "*.kt" -ErrorAction SilentlyContinue | Select-String -Pattern "@GET|@POST|@PUT|@DELETE|@PATCH" -List | Select-Object -ExpandProperty Path | Select-Object -First 15
```

Read every file returned. Extract each annotated method: HTTP method, path, `@Body`, `@Path`, `@Query` parameters, return type.

Also find and read the Retrofit base URL config:

**bash:**
```
grep -rn "BASE_URL\|baseUrl\|Retrofit\.Builder\|HttpLoggingInterceptor" app/src --include="*.kt" | head -10
```
**PowerShell:**
```
Get-ChildItem -Path app/src -Recurse -Include "*.kt" -ErrorAction SilentlyContinue | Select-String -Pattern "BASE_URL|baseUrl|Retrofit\.Builder" | Select-Object Path, LineNumber, Line | Select-Object -First 10
```

### iOS — read network files

**bash:**
```
find . -name "*API*.swift" -o -name "*Service*.swift" -o -name "*Network*.swift" | grep -v "Test\|Mock" | head -10
```
**PowerShell:**
```
Get-ChildItem -Recurse -Include "*API*.swift","*Service*.swift","*Network*.swift" -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch "Test|Mock" } | Select-Object -ExpandProperty FullName | Select-Object -First 10
```

Read every file returned. Extract endpoint paths and HTTP methods.

After reading all service files, go to Step 7.

---

## Step 7 — Version info

**bash:**
```
head -20 package.json 2>/dev/null
```
**PowerShell:**
```
Get-Content package.json -ErrorAction SilentlyContinue -TotalCount 20
```

**bash:**
```
head -20 build.gradle.kts 2>/dev/null
```
**PowerShell:**
```
Get-Content build.gradle.kts -ErrorAction SilentlyContinue -TotalCount 20
```

**bash:**
```
head -20 pom.xml 2>/dev/null
```
**PowerShell:**
```
Get-Content pom.xml -ErrorAction SilentlyContinue -TotalCount 20
```

Append version and project name to `ffl-scratch.md` under `# Meta`. Go to Step 8.

---

## Step 8 — Write the FFL document

Read `ffl-scratch.md` in full. Write `FFL-[ProjectName]-[YYYY-MM-DD].md` using the structure below. Delete `ffl-scratch.md`. This is the only step that produces user-visible output.

Use ONLY information read from actual files. If an endpoint URL or base URL was not found in any file, write `[undocumented]` — do not guess or use placeholder values like `https://api.example.com`.

---

## Output structure

```markdown
# Functional Flow Document — [Project Name]

**Version:** [from package.json / build.gradle / pom.xml]
**Generated:** [today's date]
**Platforms:** [detected platforms]

---

## 1. Architecture Overview

### 1.1 System Architecture
[One paragraph: how platforms connect and communicate]

### 1.2 [Platform] Architecture
**Pattern:** [MVVM / Clean Architecture / MVC / etc.]
**Layers:**
- `[layer]` — [responsibility]

**Key Directories:**
| Directory | Purpose |
|-----------|---------|
| `path/to/dir` | [what lives here] |

---

## 2. Functional Flows

> Each flow traces the full path from user action → component → service method → API call → response handling.
> API endpoints must appear explicitly in both diagrams — not just in the endpoint table.

### 2.1 [Feature Name]

**Entry point:** [route path from routing file]
**Component:** [ComponentName read from routing file]
**Guards:** [canActivate guards if any]
**Screens involved:** [list read from routing/component files]
**Endpoints called:** [exact HTTP method + path read from service files]

#### Sequence Diagram

```mermaid
sequenceDiagram
    actor User
    participant UI as [ComponentName]
    participant SVC as [ServiceName]
    participant API as Backend API

    User->>UI: [user action, e.g. navigate to /path or tap button]
    UI->>SVC: [exact method name, e.g. getSettingList()]
    SVC->>API: [HTTP METHOD /exact/path/from/code]
    API-->>SVC: 200 { [response shape from code] }
    SVC-->>UI: [data or observable]
    UI-->>User: [what the user sees]

    Note over SVC,API: On failure
    API-->>SVC: [error code, e.g. 401 / 500]
    SVC-->>UI: [how the error surfaces]
    UI-->>User: [error message or redirect]
```

#### Flow

```mermaid
flowchart TD
    A([User action: navigate to /path]) --> B[[ComponentName.ngOnInit]]
    B --> C[[ServiceName.methodName]]
    C --> D[HTTP METHOD /exact/path/from/code]
    D --> E{Response}
    E -- 200 --> F[[bind response to view]]
    F --> G([User sees rendered data])
    E -- 401 --> H[[redirect to login]]
    E -- 403 --> I[[show access denied]]
    E -- 500 --> J[[show error message]]
```

---

### 2.2 [Next Feature — e.g. a form submit]

**Entry point:** [route path]
**Component:** [ComponentName]
**Endpoints called:** [list]

#### Sequence Diagram

```mermaid
sequenceDiagram
    actor User
    participant UI as [ComponentName]
    participant SVC as [ServiceName]
    participant API as Backend API

    User->>UI: fill form and tap Submit
    UI->>UI: validate form fields
    UI->>SVC: [submitMethod({ field: value })]
    SVC->>API: POST /exact/path { field: value }
    API-->>SVC: 200 { [response] }
    SVC-->>UI: success
    UI-->>User: show success message / navigate

    Note over SVC,API: On failure
    API-->>SVC: 400 { errors }
    SVC-->>UI: validation errors
    UI-->>User: show field errors
```

#### Flow

```mermaid
flowchart TD
    A([User opens form screen]) --> B[[fill form fields]]
    B --> C[[tap Submit]]
    C --> D{Client-side validation}
    D -- invalid --> E[[show field errors]]
    E --> B
    D -- valid --> F[[ServiceName.submitMethod]]
    F --> G[POST /exact/path]
    G --> H{Response}
    H -- 200 --> I[[show success toast]]
    I --> J([navigate to list screen])
    H -- 400 --> K[[show server validation errors]]
    K --> B
    H -- 500 --> L[[show generic error]]
```

---

## 3. API Endpoint List

**Base URL:** `[exact value read from environment.ts / config file — never a placeholder]`

### 3.1 [Domain, e.g. Dashboard]

| Method | Path | Called by | Request Body | Response Shape |
|--------|------|-----------|--------------|----------------|
| GET | `/exact/path` | `ServiceName.methodName()` | — | `{ field: type }` |
| POST | `/exact/path` | `ServiceName.methodName(body)` | `{ field: type }` | `{ field: type }` |

### 3.2 [Next Domain]

| Method | Path | Called by | Request Body | Response Shape |
|--------|------|-----------|--------------|----------------|

---

## 4. Notes

- [Any endpoint URL that could not be confirmed from source — mark as undocumented]
- [Routes with guards that were not traced]
- [Services that make HTTP calls but are not connected to any traced flow]
- [Mismatch between what frontend calls and what backend defines]
```

---

## Diagram rules

**Sequence diagram:**
- Actors: only those present in the actual code
- The API call line must show the exact HTTP method and path from the service file: `SVC->>API: GET /setting/front-office/list`
- Use `->>` for calls, `-->>` for responses
- Show at least one error path using `Note over`
- Do not use generic labels like `GET /api/widgets` — use the real path

**Flowchart:**
- `([text])` for start/end, `{text}` for decisions, `[[text]]` for steps, `[text]` for HTTP call nodes
- HTTP call nodes (e.g. `GET /exact/path`) use plain rectangle `[text]` to distinguish them from logic steps
- Always show the HTTP call as its own node between the service method and the response decision
- Label all response branches with actual HTTP status codes when known

**Never invent.** If the code does not show the exact path, write `[undocumented]`.
