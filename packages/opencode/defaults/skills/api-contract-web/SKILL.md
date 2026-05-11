---
name: api-contract-web
description: Generate a versioned API contract markdown for an Angular project by crawling HTTP service files. Creates an initial contract when none exists, or a change-only update contract when a source file is provided.
---

# API Contract Generator — Angular Web

Crawl Angular HTTP service files and produce a structured API contract document. Two modes:

- **Init mode** — no `api-contract/` folder exists. Generates `API-Contract-Init-[date].md` with the full API inventory.
- **Update mode** — `api-contract/` folder exists and a `update-source-[date].md` file is present. Generates `API-Contract-Update-[date].md` containing only the changed APIs.

---

## CONTRACT

**No text output until Step 8 (init) or Step 7 (update).** All work before the final write must be tool calls only (Write/Edit/Read/Bash). Do NOT summarize, narrate, or print findings as chat messages.

- Do NOT stop between steps unless a file read fails critically.
- Write intermediate findings to `[SCRATCH]` using Write/Edit tool calls — never as text.
- Do NOT ask the user anything unless explicitly instructed by a step.
- The task is complete when the output markdown file exists on disk.

---

## Step 0a — Detect OS and Shell

**Run:**
```
node -e "console.log(process.platform)"
```

- `darwin` / `linux` → write `OS=unix SHELL=bash`. Use **bash** commands.
- `win32` → run:
  ```
  node -e "console.log(process.env.PSModulePath ? 'powershell' : 'cmd')"
  ```
  - `powershell` → write `OS=win32 SHELL=powershell`. Use **PowerShell** commands.
  - `cmd` → write `OS=win32 SHELL=cmd`. Use **CMD** commands.

Resolve scratch file path:
```
node -e "const p=require('path'),o=require('os'); console.log(p.join(o.tmpdir(),'api-contract-scratch.md'))"
```

Write `OS=[...] SHELL=[...] SCRATCH=[resolved path]` to the scratch file using the Write tool. Use the full resolved path for every subsequent scratch file operation. Go to Step 0b.

---

## Step 0b — Validate Angular project

Check that `angular.json` exists in the current directory.

**bash:**
```bash
[ -f angular.json ] && echo "OK" || echo "NOT_FOUND"
```
**PowerShell:**
```powershell
if (Test-Path angular.json) { "OK" } else { "NOT_FOUND" }
```
**CMD:**
```cmd
if exist angular.json (echo OK) else (echo NOT_FOUND)
```

If `NOT_FOUND`, **abort immediately**:
> This skill must be run from an Angular project root. `angular.json` was not found in the current directory.

Go to Step 0c.

---

## Step 0c — Detect mode

Check whether the `api-contract/` folder exists.

**bash:**
```bash
[ -d api-contract ] && echo "UPDATE" || echo "INIT"
```
**PowerShell:**
```powershell
if (Test-Path api-contract -PathType Container) { "UPDATE" } else { "INIT" }
```
**CMD:**
```cmd
if exist api-contract\ (echo UPDATE) else (echo INIT)
```

- Result `INIT` → write `MODE=init` to `[SCRATCH]`. Go to Step 1.
- Result `UPDATE` → write `MODE=update` to `[SCRATCH]`. Go to Step 1.

---

## Step 1 — Read project metadata

Read `package.json` using the Read tool. Extract:
- `name` — project name (used in the document title)
- `version` — project version

Append to `[SCRATCH]` under `# Meta`:
```
PROJECT_NAME=<name>
PROJECT_VERSION=<version>
```

Go to Step 2.

---

## Step 2 — Read base URL

Read the environment file in full using the Read tool:

**bash:**
```bash
cat src/environments/environment.ts 2>/dev/null
```
**PowerShell:**
```powershell
Get-Content src/environments/environment.ts -ErrorAction SilentlyContinue
```
**CMD:**
```cmd
type src\environments\environment.ts 2>nul
```

If empty, find all environment files:

**bash:**
```bash
find src -name "environment*.ts" | head -5
```
**PowerShell:**
```powershell
Get-ChildItem -Path src -Recurse -Include "environment*.ts" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName | Select-Object -First 5
```
**CMD:**
```cmd
dir /s /b src\environment*.ts 2>nul
```

Read every environment file found using the Read tool. Extract the base API URL (look for keys like `apiUrl`, `baseUrl`, `apiBaseUrl`, `baseHref`). If not found, write `BASE_URL=[undocumented]`.

Append to `[SCRATCH]` under `# Meta`:
```
BASE_URL=<value>
```

- If `MODE=init` → go to Step 3i.
- If `MODE=update` → go to Step 3u.

---

# ── INIT MODE ──────────────────────────────────────────────────

## Step 3i — Find service files making HTTP calls

**bash:**
```bash
grep -rl "this\.http\." src --include="*.ts" | sort | head -30
```
**PowerShell:**
```powershell
Get-ChildItem -Path src -Recurse -Include "*.ts" -ErrorAction SilentlyContinue | Select-String -Pattern "this\.http\." -List | Select-Object -ExpandProperty Path | Sort-Object | Select-Object -First 30
```
**CMD:**
```cmd
findstr /s /m /c:"this.http." src\*.ts 2>nul
```

Append the file list to `[SCRATCH]` under `# ServiceFiles`. Go to Step 4i.

---

## Step 4i — Extract API inventory

Read EVERY file from the list in Step 3i using the Read tool.

For each file, extract every HTTP call. For each call record:

1. **Service class name** — the class this method belongs to
2. **Method name** — the TypeScript method name
3. **HTTP verb** — `get`, `post`, `put`, `patch`, `delete`
4. **Endpoint** — the URL string or template literal passed to `this.http.[verb]`
   - If it references a variable (e.g., `this.apiUrl + '/path'`), resolve against the base URL from Step 2
   - If it cannot be resolved, record as `[base-url]/path`
5. **Response type** — the generic type argument `this.http.get<ResponseType>(...)`. Read the corresponding interface/type from its source file if found.
6. **Request body** — the second argument to `post`/`put`/`patch`. Read its type definition.
7. **Query params** — extract from `{ params: { ... } }` in the options argument.

For each call, look up the TypeScript interface or type alias used for request/response. Find it with:

**bash:**
```bash
grep -rn "export interface [TypeName]\|export type [TypeName]" src --include="*.ts" | head -5
```
**PowerShell:**
```powershell
Get-ChildItem -Path src -Recurse -Include "*.ts" | Select-String -Pattern "export interface [TypeName]|export type [TypeName]" | Select-Object Path, Line | Select-Object -First 5
```
**CMD:**
```cmd
findstr /s /n /c:"export interface [TypeName]" /c:"export type [TypeName]" src\*.ts 2>nul
```

Read the file where the type is defined. Convert the interface shape into a JSON example (use the field type as the value — e.g., `string`, `number`, `boolean`, `[]`).

Append all findings to `[SCRATCH]` under `# APIs`, grouped by service class name:

```
## [ServiceClassName]
### [MethodName]
VERB=[http verb in uppercase]
ENDPOINT=[full endpoint]
QUERY_PARAMS=[name:type:required, ...]  or NONE
REQUEST_BODY_TYPE=[TypeName]
REQUEST_BODY_JSON=
{
  "field": "type"
}
RESPONSE_TYPE=[TypeName]
RESPONSE_JSON=
{
  "field": "type"
}
```

Go to Step 5i.

---

## Step 5i — Find TypeScript model files and enrich types

For any REQUEST_BODY_TYPE or RESPONSE_TYPE that could not be resolved in Step 4i, search for the type definition:

**bash:**
```bash
grep -rn "export interface\|export type\|export enum" src --include="*.ts" | head -40
```
**PowerShell:**
```powershell
Get-ChildItem -Path src -Recurse -Include "*.ts" | Select-String -Pattern "export interface|export type|export enum" | Select-Object Path, Line | Select-Object -First 40
```
**CMD:**
```cmd
findstr /s /n /c:"export interface" /c:"export type" /c:"export enum" src\*.ts 2>nul
```

Read each relevant file using the Read tool and fill in the JSON fields in `[SCRATCH]`. For unresolvable types, write `[undocumented]`. Go to Step 6i.

---

## Step 6i — Create output folder and write initial contract

Create the `api-contract/` folder if it does not exist:

**bash:**
```bash
mkdir -p api-contract
```
**PowerShell:**
```powershell
New-Item -ItemType Directory -Force -Path api-contract | Out-Null
```
**CMD:**
```cmd
if not exist api-contract mkdir api-contract
```

Read `[SCRATCH]` in full using the Read tool. Write the initial contract using the **Write tool** to `api-contract/API-Contract-Init-[YYYY-MM-DD].md`.

Use the output structure defined in the **Output: Initial Contract** section below.

After the Write tool confirms success, delete the scratch file:
- **bash / PowerShell:** `rm [SCRATCH]`
- **CMD:** `del [SCRATCH]`

Go to Step 7i.

---

## Step 7i — Show update source format and confirm

Post a single message to the user:

```
✓ API contract written to api-contract/API-Contract-Init-[date].md

To update the contract later, create a source file at:
  api-contract/update-source-[YYYY-MM-DD].md

Use this template:

─────────────────────────────────────────────
# API Contract Update Source

**Date:** YYYY-MM-DD
**Project:** [project name]

---

## Added

### [New API Title]

**Method:** POST
**Endpoint:** /api/v1/new-endpoint

**Request Body:**
\```json
{
  "field": "string",
  "count": "number"
}
\```

**Response:**
\```json
{
  "status": "string",
  "data": {}
}
\```

---

## Modified

### [Existing API Title]

**Was:** GET /api/v1/old-endpoint
**Now:** GET /api/v1/new-endpoint

**Query Parameters (after change):**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `filter` | `string` | No | — | Filter keyword |

**Response (after change):**
\```json
{
  "status": "string",
  "data": []
}
\```

**Change Notes:** Brief description of what changed and why.

---

## Removed

### [Existing API Title]

**Was:** DELETE /api/v1/old-endpoint
**Reason:** Brief reason for removal.
─────────────────────────────────────────────

Then re-run /api-contract-web to generate the update contract.
```

Task complete.

---

# ── UPDATE MODE ────────────────────────────────────────────────

## Step 3u — Locate update source file

**bash:**
```bash
ls api-contract/update-source-*.md 2>/dev/null | sort | tail -5
```
**PowerShell:**
```powershell
Get-ChildItem -Path api-contract -Filter "update-source-*.md" -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -Last 5 -ExpandProperty Name
```
**CMD:**
```cmd
dir /b /o:n api-contract\update-source-*.md 2>nul
```

- If **no files found**: stop and tell the user:
  > No update source file found in `api-contract/`. Create `api-contract/update-source-[YYYY-MM-DD].md` using the template shown after the initial contract was generated, then re-run this skill.
- If **one file found**: use it.
- If **multiple files found**: show the list and ask the user which one to use. Wait for response.

Read the selected update source file in full using the Read tool. Append to `[SCRATCH]` under `# UpdateSource`. Go to Step 4u.

---

## Step 4u — Read existing contract for context

Find the most recent existing contract:

**bash:**
```bash
ls api-contract/API-Contract-*.md 2>/dev/null | sort | tail -1
```
**PowerShell:**
```powershell
Get-ChildItem -Path api-contract -Filter "API-Contract-*.md" -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -Last 1 -ExpandProperty Name
```
**CMD:**
```cmd
dir /b /o:n api-contract\API-Contract-*.md 2>nul
```

Read this file in full using the Read tool. Append to `[SCRATCH]` under `# ExistingContract`. This is used to carry forward unchanged metadata (base URL, project name) into the update document. Go to Step 5u.

---

## Step 5u — Resolve types for new/modified APIs

For any Added or Modified API in the update source that references a TypeScript type name (instead of inline JSON), find and read the type definition:

**bash:**
```bash
grep -rn "export interface\|export type\|export enum" src --include="*.ts" | head -40
```
**PowerShell:**
```powershell
Get-ChildItem -Path src -Recurse -Include "*.ts" | Select-String -Pattern "export interface|export type|export enum" | Select-Object Path, Line | Select-Object -First 40
```
**CMD:**
```cmd
findstr /s /n /c:"export interface" /c:"export type" /c:"export enum" src\*.ts 2>nul
```

Append resolved types to `[SCRATCH]` under `# ResolvedTypes`. Go to Step 6u.

---

## Step 6u — Write update contract

Read `[SCRATCH]` in full using the Read tool. Write the update contract using the **Write tool** to `api-contract/API-Contract-Update-[YYYY-MM-DD].md`.

Use the output structure defined in the **Output: Update Contract** section below.

After the Write tool confirms success, delete the scratch file:
- **bash / PowerShell:** `rm [SCRATCH]`
- **CMD:** `del [SCRATCH]`

Post a single message to the user:
```
✓ API contract update written to api-contract/API-Contract-Update-[date].md
  Source: api-contract/update-source-[date].md
```

Task complete.

---

# ── OUTPUT STRUCTURES ──────────────────────────────────────────

## Output: Initial Contract

File: `api-contract/API-Contract-Init-[YYYY-MM-DD].md`

```markdown
# API Contract — [Project Name]

**Project:** `[name from package.json]`
**Version:** `[version from package.json]`
**Base URL:** `[value from environment.ts — never a placeholder]`
**Generated:** [YYYY-MM-DD]

---

## Table of Contents

- [ServiceClassName1](#serviceclassname1)
  - [MethodName](#methodname)
- [ServiceClassName2](#serviceclassname2)

---

## [ServiceClassName]

### [Method Title — human-readable name derived from the method name]

| | |
|---|---|
| **Method** | `GET` |
| **Endpoint** | `/api/v1/path` |
| **Called by** | `ServiceClassName.methodName()` |

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | `number` | No | `1` | Page number |
| `size` | `number` | No | `10` | Items per page |

*(Omit this section entirely if the endpoint has no query parameters.)*

#### Request Body

*(Omit this section for GET and DELETE requests.)*

```json
{
  "field": "string",
  "count": "number",
  "active": "boolean",
  "items": "array"
}
```

#### Response

```json
{
  "status": "string",
  "message": "string",
  "data": {
    "items": "array",
    "total": "number",
    "page": "number"
  }
}
```

---

### [Next Method Title]

...

---

## [Next ServiceClassName]

...
```

Rules for the initial contract output:
- Group APIs under their service class name as a `##` heading.
- Use the TypeScript method name to produce a human-readable title (e.g., `getUserList` → `Get User List`).
- JSON values show the **type**, not example values (e.g., `"field": "string"`, not `"field": "John"`).
- Nested objects expand to show their fields.
- If a type could not be resolved, write `"[field]": "[undocumented]"`.
- If a base URL could not be found, write `[undocumented]` in the Base URL field.
- Omit empty sections (no query params → omit the section; GET/DELETE → omit Request Body).

---

## Output: Update Contract

File: `api-contract/API-Contract-Update-[YYYY-MM-DD].md`

```markdown
# API Contract Update — [Project Name]

**Project:** `[name]`
**Base URL:** `[from existing contract]`
**Generated:** [YYYY-MM-DD]
**Source:** `api-contract/update-source-[source date].md`

> This document contains only changed APIs. For the full contract, refer to the most recent `API-Contract-Init-*.md` or previous `API-Contract-Update-*.md`.

---

## Added

### [New API Title]

| | |
|---|---|
| **Method** | `POST` |
| **Endpoint** | `/api/v1/new-endpoint` |

#### Request Body

```json
{}
```

#### Response

```json
{}
```

---

## Modified

### [Changed API Title]

| | |
|---|---|
| **Was** | `GET /api/v1/old-endpoint` |
| **Now** | `GET /api/v1/new-endpoint` |

#### Query Parameters (after change)

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|

#### Response (after change)

```json
{}
```

**Change Notes:** [from the source file]

---

## Removed

### [Removed API Title]

| | |
|---|---|
| **Was** | `DELETE /api/v1/old-endpoint` |

**Reason:** [from the source file]

---
```

Rules for the update contract output:
- Only include APIs that appear in the source file (Added / Modified / Removed).
- Omit empty sections (e.g., if nothing was removed, omit the Removed section).
- For Modified entries, show the state **after** the change in the body/params/response blocks.
- Preserve the Change Notes and Reason fields verbatim from the source file.
- If the source file contains inline JSON, use it as-is. If it references a type name, use the resolved JSON from Step 5u.

---

## Diagram rules

- Never invent endpoint paths. Use only what was read from source files (init) or the update source file (update).
- Never use placeholder URLs like `/api/example`. Write `[undocumented]` for unresolvable paths.
- JSON type values use lowercase TypeScript primitives: `"string"`, `"number"`, `"boolean"`, `"array"`, `"object"`.
- For enum fields, list the allowed values: `"status": "active | inactive | pending"`.
