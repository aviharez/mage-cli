---
name: functional-flow
description: Generates a Functional Flow (FFL) document for a project — scans the codebase, traces each feature's flow, renders Mermaid sequence + flowchart diagrams, and lists all API endpoints. Trigger when the user asks to generate/create/update an FFL, functional flow doc, flow document, or architecture/endpoint map for an Angular, Spring Boot, or other project.
metadata:
  author: MAGE Team
---

# Functional Flow (FFL) Generator

## Overview

A Functional Flow (FFL) document is a **source-driven** record of how a project works: every feature's full path from user action through UI/controller, service, and API call to response handling. It is the single reference for developers onboarding to a feature, QA tracing a call chain, or architects reviewing coupling.

**The cardinal rule: every value in the output is read from source code — no invented paths, no placeholder base URLs, no fabricated method names. And never surface a value read from a gitignored/untracked file — for externalized config, emit the committed key/env-var name, not the local value.** If a value cannot be found in committed source, note it as `(not found in committed source)` and do not substitute a guess.

The document is written to **`FFL.md` at the root of the scanned project**. After writing `FFL.md`, this skill also delegates to the **`readme` skill** to ensure the README links the FFL — either by generating a proper README (if the existing one is boilerplate/missing) or by non-destructively adding a Documentation section to a customized one.

## When to Use

- User asks to "generate an FFL", "create a functional flow doc", "document the flows", "map the endpoints", or similar.
- Starting a new project and documenting its architecture.
- Onboarding new team members or agents to an existing project.
- After a significant feature addition or refactor, to keep the living doc current.
- Pre-review or pre-release: confirm what each screen does and which endpoints it calls.

**When NOT to use:**
- Do not generate a partial or stub FFL — either produce a complete document or explain why you cannot (missing source, encrypted files, etc.).
- Do not run if the user is asking about a *single function* or *single file* — that is a code-explain task, not an FFL task.
- Do not hallucinate flows for code you have not read. If the project is too large to scan fully in one session, produce sections for what you have scanned and clearly mark the rest as `(not scanned)`.

---

## Workflow

Follow these steps in order. Do not skip any step.

### Step 0 — Respect `.gitignore` (scope the source scan)

**Before reading any source file,** determine which files are safe to read:

- **Git repository (most projects):** run `git ls-files` to enumerate tracked/committed files. Only read files in this list — `git ls-files` automatically excludes gitignored and untracked files. To check a specific path, use `git check-ignore -q <path>` (exit 0 = ignored; exit 1 = not ignored).
- **Non-git project:** read `.gitignore` (root + any nested `.gitignore` files) and skip matching paths manually.

**Never read or emit values from ignored/untracked files.** Regardless of pattern matching, treat these as off-limits for extracting *values*: `.env*`, `application-local.*`, `*-local.{yml,yaml,properties}`, `*secret*`, `*credentials*`, `*.local.ts`.

> This step protects against leaking local secrets (passwords, private URLs, API keys) that teams commonly store in gitignored profile files like `application-local.yml` or `.env.local`.

### Step 1 — Detect platform(s)

Run a quick scan to identify which platform(s) are present:

| Signal to check | Platform |
|-----------------|----------|
| `angular.json` exists **OR** `package.json` contains `"@angular/core"` | **Angular** |
| `build.gradle` or `pom.xml` contains `spring-boot` | **Spring Boot** |
| Neither of the above | **Generic** |

Multiple platforms may match (mono-repo, full-stack project) — emit a section per platform in the output.

Pull the **project version** from:
- Angular → `package.json` `.version`
- Spring Boot → `build.gradle` `version =` or `pom.xml` `<version>` under `<project>`
- Generic → `package.json` `.version`, or `VERSION` file, or `(unknown)`

Pull the **project name** from `package.json` `.name`, `pom.xml` `<artifactId>`, or the root directory name.

### Step 2 — Load the matching scan guide(s)

Read the relevant reference file(s) from this skill's `references/` directory:

- Angular → Read `references/scan-angular.md`
- Spring Boot → Read `references/scan-spring-boot.md`
- Generic fallback → Read `references/scan-generic.md`

Also read `references/output-template.md` (the exact structure to emit) and `references/mermaid-escaping.md` (escaping rules — mandatory before writing any diagram).

### Step 3 — Enumerate features and flows

**First, build a complete inventory of all entry points before writing any diagram:**

- **Spring Boot:** list every `@RestController` / `@Controller` class found by scanning `src/main/java/` or `src/main/kotlin/`.
- **Angular:** list every route entry (path → component) from all routing files.
- **Generic:** list every route-handler group (Express router, NestJS controller, Django URL group, etc.).

**Coverage mandate — one `### 2.x` section per controller / routed feature:**
1. Emit exactly **one `### 2.x` section per controller** (Spring) / **per routed feature** (Angular/generic). The count of `### 2.x` sections must equal the number of controllers/routed features found. Never merge multiple controllers into a single section or diagram.
2. Within a section, if the controller's endpoints have **materially different flows** (different service/repository/downstream call, different `@PreAuthorize` / guard, or different response shape), give each endpoint its own `#### 2.x.y [METHOD /path]` Sequence + Flow diagram pair.
3. If a controller's endpoints share a flow shape (e.g. standard CRUD all going through one service + one repo), a single Sequence + Flow pair for the section is sufficient — list all the endpoints under "Endpoints called".
4. A large project means a long document — that is expected and correct. If the project is too large to finish in one pass, produce sections for what you have scanned and mark the rest `(not scanned)` — but never silently merge controllers to shorten the output.

For each entry in the inventory, trace the full path using the scan guide:

1. **Entry point** — route path / controller class name + class-level `@RequestMapping`.
2. **Method-level mappings** — each `@GetMapping`, `@PostMapping`, etc. (Spring) or component lifecycle hook / event handler (Angular).
3. **Services** — every service method the controller/component calls; follow to the service file.
4. **HTTP calls / Repositories** — exact HTTP verb + path (Angular service) or repository method (Spring service). Copy verbatim.
5. **Response handling** — success branch, 4xx, 5xx, and any exception handler (`@ControllerAdvice`) branches.
6. **Guards / Interceptors / Middleware** — `canActivate` guards, auth interceptors, Spring `@PreAuthorize` / `@Secured`.

### Step 4 — Collect the endpoint inventory

For every HTTP call found:

| Field | Where to read it |
|-------|-----------------|
| Method | `this.http.get/post/put/delete` or `@GetMapping/@PostMapping/...` |
| Path | The exact string argument — include the base URL segment |
| Called by | `ServiceName.methodName()` |
| Request body | `@RequestBody` parameter type / the JS object literal passed to `http.post` |
| Response shape | Return type / `.pipe(map(...))` / DTO |
| Base URL | `environment.ts` / `application.yml` / `application.properties` — **committed files only** (Step 0). If the real value lives in a gitignored profile or is externalized to an env var, emit the **committed key/placeholder** (e.g. `${API_BASE_URL}`, or the `server.servlet.context-path` key) with the note `(externalized — value not committed)`. Never the resolved local/secret value. |

### Step 5 — Render diagrams with Mermaid escaping

Before writing **any** `mermaid` code block, apply the rules from `references/mermaid-escaping.md`:

- Wrap every node label in double quotes: `A["label text"]`.
- Replace `(`, `)`, `{`, `}`, `[`, `]`, `<`, `>`, `#`, `;`, `|`, `&` with their `#NN;` entity codes inside labels.
- Keep node **IDs** alphanumeric only (e.g. `A`, `B1`, `SVC`).
- In sequence diagrams, keep message text after `:` simple; wrap complex text in `"..."`.
- Test mentally: would this label alone break Mermaid parsing? If yes, escape it.

### Step 6 — Write `FFL.md` incrementally

Use `references/output-template.md` as the exact structure. The document is written **progressively** — section by section — so completed work is on disk before any auto-compaction can fire and peak context stays low.

> **Note:** Updating regenerates sections 1–3 from source — manual edits to the body are not preserved between runs. The Changelog section is always preserved and extended.

**What gets replaced vs. preserved on every update run:**

| Part of `FFL.md` | On update |
|------------------|-----------|
| §1 Architecture Overview | **Replaced** — regenerated from source |
| §2 Functional Flows + Mermaid diagrams | **Replaced** — regenerated from source. A changed/renamed/removed endpoint means the diagrams and flow prose update to the new values; old data is discarded. |
| §3 API Endpoint tables | **Replaced** — regenerated from source. The endpoint rows always reflect the current code. |
| `**Last updated:**` | **Replaced** — set to today |
| `## Changelog` rows | **Preserved** — append-only; old rows are never rewritten. One new row is prepended recording what changed. |
| `**Generated:**` date | **Preserved** — the first-creation date; never changed after initial write. |

#### Step 6a — Check for an existing `FFL.md`

Attempt to read `FFL.md` at the project root. If it exists, extract and hold in memory **only** the small preserved pieces:
- `**Generated:**` date (one line)
- The entire `## Changelog` table (a few rows)
- The existing inventory of `### 2.x` section names and `## 3.` endpoint rows (method + path) — for computing the diff at the end.

Discard everything else — the old body is replaced.

#### Step 6b — Write the document skeleton (first operation)

**Immediately write a skeleton `FFL.md`** (using `Write` on first run or `Write` to overwrite on update runs) containing:
- The header block: `**Generated:**`, `**Last updated:**`, `**Platforms:**`
- The `## Changelog` table (with the existing rows if updating, or the placeholder row if first run — the real diff row will be prepended at the very end in Step 6e)
- §1 Architecture Overview (filled in fully — this is already known from Step 1)
- The `## 2. Functional Flows` heading with the preamble quote
- A placeholder line: `<!-- 2.x sections will be inserted here -->`
- The `## 3. API Endpoint List` heading with the placeholder: `<!-- endpoint tables will be inserted here -->`

This creates a valid skeleton on disk immediately. If compaction fires after this step, the skeleton is preserved and the run can be completed on resume.

#### Step 6c — Append each controller / feature section (one at a time)

For **each entry in the Step 3 controller/feature inventory**, in order:

1. Read that controller's source files (and its services, repositories, DTOs as needed per the scan guide).
2. Generate the full `### 2.x [ControllerName / FeatureName]` section — including `#### 2.x.y` per-endpoint sub-diagrams where flows differ (per Addendum 5 rules).
3. **`Edit` `FFL.md`** to replace the `<!-- 2.x sections will be inserted here -->` placeholder with the new section **plus the placeholder again** (so the next controller can be inserted in the same way). On the final controller, insert the section without the placeholder (or remove it after).
4. Accumulate the endpoint rows for this controller into a running **endpoint list** (kept as a short in-context text block — method, path, called-by, request, response).
5. Advance to the next controller. The previous controller's file-read outputs are now eligible for pruning by the runtime.

> If compaction fires mid-way, `FFL.md` already contains every completed `### 2.x` section. Re-running will re-scan and overwrite from the skeleton — no completed work is permanently lost and the resumed run produces the full document.

#### Step 6d — Write §3 endpoint tables

Once all controllers are processed, take the accumulated endpoint list and **`Edit` `FFL.md`** to replace the `<!-- endpoint tables will be inserted here -->` placeholder with the fully-populated §3 tables (one `### 3.x` subsection per domain).

#### Step 6e — Finalize the Changelog

Now that the complete new inventory is known (all `### 2.x` names + all §3 endpoint method+path pairs), compute the diff versus the old inventory parsed in Step 6a:

- `+ControllerName` / `-ControllerName` for added/removed `### 2.x` sections.
- `+METHOD /path` / `-METHOD /path` for added/removed endpoint rows.
- `~METHOD /path` for endpoints whose request body or response shape changed.
- If nothing changed: `No functional changes (re-verified)`.

Build the changelog row: `| [today] | [diff summary] |`

**`Edit` `FFL.md`** to prepend the new row **above** all existing rows in the `## Changelog` table (newest on top). Also update `**Last updated:**` to today if not already set.

On a **first run** (no prior `FFL.md`): replace the placeholder row with `| [today] | Initial FFL document generated |`.

### Step 7 — Make the FFL discoverable from the README

After `FFL.md` has been written, **load the `readme` skill** and let it handle the README.

The `readme` skill is FFL-agnostic — it auto-discovers `FFL.md` (now present at the project root) and will:
- Generate a proper Full README if the existing one is boilerplate/missing, or
- Non-destructively add a `## Documentation` section linking `FFL.md` to a customized README, or
- Do nothing if the README already links `FFL.md`.

**Do not reimplement README logic here.** This step is deliberately thin — just delegate.

---

## Mermaid safety (summary)

```
Node labels  →  always quoted:  A["My Label"]
Parens       →  #40; and #41;   A["getList#40;id#41;"]
Curly        →  #123; and #125; A["map#123;key: val#125;"]
Angle        →  #60; and #62;   A["List#60;User#62;"]
Pipe         →  #124;           A["option#124;other"]
Semicolons   →  #59;
Hash         →  #35;
Ampersand    →  #amp;
Quotes       →  #quot;
```

Full escaping table and before/after examples are in `references/mermaid-escaping.md`.

---

## Verification

Before writing `FFL.md`, check every item:

- [ ] **No placeholders remain** — search the assembled document for `[` … `]` template tokens, `exact/path`, `TODO`, or `(placeholder)`. Replace every one with the real value found in committed source, or mark explicitly `(not found in committed source)`.
- [ ] **Coverage is exhaustive** — there is one `### 2.x` section per controller (Spring) / routed feature (Angular/generic); the count of `### 2.x` sections equals the number of controllers/features found in Step 3. No two controllers were merged into the same section or diagram.
- [ ] **Base URL from committed config** — the base URL value (or committed env-var key) was read from a committed file; no value originates from a gitignored/untracked file. Externalized values show the key/placeholder with the `(externalized — value not committed)` note.
- [ ] **No secrets/local config leaked** — nothing in the FFL was read from a `.gitignore`-matched or untracked file; gitignored profile files (e.g. `application-local.yml`, `.env`) were skipped entirely.
- [ ] **Every endpoint in §3 tables appears in at least one diagram** — cross-check the endpoint list against the `mermaid` blocks.
- [ ] **Paths and methods match source** — spot-verify 2–3 endpoints by re-reading the source file line.
- [ ] **All `mermaid` blocks are syntactically valid** — balanced quotes, no raw `(` `{` `[` `<` `#` `|` `;` `&` inside node labels.
- [ ] **Date is filled** — not `[from package.json]` but the actual value.
- [ ] **Platforms section matches detected stack** — no Angular section if there is no Angular project, etc.
- [ ] **If `FFL.md` pre-existed — body is current:** §2 flows and §3 endpoint tables reflect the current source (a changed endpoint shows its new method/path/request/response, not the old values).
- [ ] **If `FFL.md` pre-existed — changelog/header preserved:** the original `**Generated:**` date is unchanged; all prior changelog rows are intact below the new row; exactly one new row was prepended; `**Last updated:**` is today's date.
- [ ] **Changelog diff is accurate** — every `+`/`-`/`~` item in the new row corresponds to a real change visible in the regenerated §2 or §3.
- [ ] **README links the FFL** — the `readme` skill was invoked (Step 7) and `README.md` now contains a link to `./FFL.md` (either freshly generated or inserted into an existing README).
