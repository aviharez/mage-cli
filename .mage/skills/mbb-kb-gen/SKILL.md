---
name: mbb-kb-gen
description: Generate a versioned knowledge base (KB) document for the @mybcabisnis/lib Angular component library by crawling component TypeScript sources and extracting selectors, inputs, outputs, types, services, and utilities. Stores KB locally and pushes to GitLab.
---

# MBB Component Library — Knowledge Base Generator

Crawl the `@mybcabisnis/lib` Angular library source and produce a structured, versioned KB file. Saves the KB to the local cache and pushes it to GitLab so all team members can fetch it via `mbb-qna`.

## CONTRACT

- **No text output until Step 8a.** All work before Step 8a must be tool calls only (Write/Edit/Read/Bash). Do NOT summarize, narrate, or print findings as chat messages.
- Do NOT stop between steps unless a file read fails critically.
- Write intermediate findings to `[SCRATCH]` using the **Write/Edit tool** — never as text output.
- **MUST pause at Step 8a** — show the user a preview of the generated KB and wait for explicit confirmation before pushing.
- Do NOT push to GitLab without user confirmation.
- The task is complete when either: (a) `MBB-KB-[version].md` is confirmed and pushed to GitLab, or (b) the user declines the push and the local file is saved.

---

## Configuration

### Lib source

```
LIB_ROOT=packages/mybcabisnis
```

The skill always runs inside the mbb-lib project. `LIB_ROOT` is relative to the project root. Do not change this unless the user provides an override.

### Local cache directory

```
KB_CACHE=~/.mage/knowledge/mbb-lib
```

On Windows:
- **PowerShell:** `$env:USERPROFILE\.mage\knowledge\mbb-lib`
- **CMD:** `%USERPROFILE%\.mage\knowledge\mbb-lib`

### GitLab Generic Package Registry settings

These values are used in Step 9. They may be loaded from `.mage/secrets.env` (see Step 0c).

```
GITLAB_HOST=git.intra.bca.co.id
GITLAB_PROJECT_ID=<numeric-project-id>
GITLAB_PACKAGE_NAME=mbb-kb
GITLAB_PRIVATE_TOKEN=$GITLAB_PRIVATE_TOKEN   # loaded from .mage/secrets.env or env
```

### Project-level secrets file

Create `.mage/secrets.env` in the mbb-lib project root with:

```
GITLAB_PRIVATE_TOKEN=<your-token>
GITLAB_PROJECT_ID=<numeric-project-id>
```

**Security:** Add `.mage/secrets.env` to the project's `.gitignore` — never commit this file. The token needs at least **api** scope.

If `GITLAB_PRIVATE_TOKEN` is not set in the environment and `.mage/secrets.env` does not exist or does not contain it, stop and tell the user:
> Create `.mage/secrets.env` in the project root with `GITLAB_PRIVATE_TOKEN=<your-token>`, or run `export GITLAB_PRIVATE_TOKEN=<your-token>` in your shell.

---

## Step 0a — Detect OS and Shell

**Run:**
```
node -e "console.log(process.platform)"
```

- `darwin` / `linux` → **Unix**: write `OS=unix SHELL=bash` to `[SCRATCH]`. Use **bash** commands.
- `win32` → **Windows**: run:
  ```
  node -e "console.log(process.env.PSModulePath ? 'powershell' : 'cmd')"
  ```
  - `powershell` → write `OS=win32 SHELL=powershell`. Use **PowerShell** commands.
  - `cmd` → write `OS=win32 SHELL=cmd`. Use **CMD** commands.

Resolve the scratch file path:

**bash / PowerShell / CMD:**
```
node -e "const p=require('path'),o=require('os'); console.log(p.join(o.tmpdir(),'mbb-kb-scratch.md'))"
```

Write `SCRATCH=[resolved path]` to the scratch file at that path. Use this full path for every subsequent Write/Edit/Read tool call on the scratch file. Go to Step 0b.

---

## Step 0b — Validate project

Check that `packages/mybcabisnis/ng-package.json` exists in the current directory.

**bash:**
```bash
[ -f packages/mybcabisnis/ng-package.json ] && echo "OK" || echo "NOT_FOUND"
```
**PowerShell:**
```powershell
if (Test-Path packages/mybcabisnis/ng-package.json) { "OK" } else { "NOT_FOUND" }
```
**CMD:**
```cmd
if exist packages\mybcabisnis\ng-package.json (echo OK) else (echo NOT_FOUND)
```

If the result is `NOT_FOUND`, **abort immediately** and tell the user:
> This skill must be run from inside the mbb-lib project root. The expected marker `packages/mybcabisnis/ng-package.json` was not found in the current directory.

If `OK`, go to Step 0c.

---

## Step 0c — Load secrets and verify token

Load `.mage/secrets.env` if it exists, then check `GITLAB_PRIVATE_TOKEN`:

**bash:**
```bash
[ -f .mage/secrets.env ] && set -a && source .mage/secrets.env && set +a; \
[ -n "$GITLAB_PRIVATE_TOKEN" ] && echo "TOKEN_OK" || echo "TOKEN_MISSING"
```
**PowerShell:**
```powershell
if (Test-Path .mage/secrets.env) {
  Get-Content .mage/secrets.env | ForEach-Object {
    if ($_ -match '^([^#=]+)=(.+)$') { [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim()) }
  }
}
if ($env:GITLAB_PRIVATE_TOKEN) { "TOKEN_OK" } else { "TOKEN_MISSING" }
```
**CMD:**
```cmd
if exist .mage\secrets.env for /f "tokens=1,2 delims==" %i in (.mage\secrets.env) do set %i=%j
if defined GITLAB_PRIVATE_TOKEN (echo TOKEN_OK) else (echo TOKEN_MISSING)
```

If `TOKEN_MISSING`, stop and instruct the user (see Configuration above). Go to Step 0d.

---

## Step 0d — Read lib version and check cache

Read `packages/mybcabisnis/package.json` using the Read tool and extract:
- `name` — package name
- `version` — lib version (used in KB filename as `MBB-KB-[version].md`)
- `peerDependencies["@angular/core"]` — Angular version

Check whether the KB file already exists in the local cache:

**bash:**
```bash
ls ~/.mage/knowledge/mbb-lib/MBB-KB-[version].md 2>/dev/null && echo "EXISTS" || echo "NEW"
```
**PowerShell:**
```powershell
if (Test-Path "$env:USERPROFILE\.mage\knowledge\mbb-lib\MBB-KB-[version].md") { "EXISTS" } else { "NEW" }
```
**CMD:**
```cmd
if exist "%USERPROFILE%\.mage\knowledge\mbb-lib\MBB-KB-[version].md" (echo EXISTS) else (echo NEW)
```

If `EXISTS`, ask the user:
> KB for v[version] already exists locally. Regenerate and overwrite? (yes/no)

If no, stop. If yes, continue.

Ensure the local cache directory exists:

**bash:**
```bash
mkdir -p ~/.mage/knowledge/mbb-lib
```
**PowerShell:**
```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.mage\knowledge\mbb-lib" | Out-Null
```
**CMD:**
```cmd
if not exist "%USERPROFILE%\.mage\knowledge\mbb-lib" mkdir "%USERPROFILE%\.mage\knowledge\mbb-lib"
```

Append to `[SCRATCH]`:

```
# MBB KB Scratch
LIB_ROOT=packages/mybcabisnis
PACKAGE=<name>
VERSION=<version>
ANGULAR=<peer angular version>
KB_FILE=MBB-KB-<version>.md
```

Then read `packages/mybcabisnis/src/public-api.ts` and `packages/mybcabisnis/services/public-api.ts` in full using the Read tool. Append both files' content verbatim to `[SCRATCH]` under `# PublicAPI`.

These two files are the **authoritative export manifests**. Go to Step 1.

---

## Step 1 — Inventory all modules

**bash:**
```bash
find packages/mybcabisnis/modules -type d -mindepth 2 -maxdepth 2 | sort
```
**PowerShell:**
```powershell
Get-ChildItem -Path packages/mybcabisnis/modules -Directory -Depth 2 | Where-Object { $_.FullName -split '[\\/]' | Measure-Object | Select-Object -ExpandProperty Count | ForEach-Object { $_ -ge 3 } } | Sort-Object FullName | Select-Object -ExpandProperty FullName
```
**CMD:**
```cmd
dir /s /b /ad packages\mybcabisnis\modules 2>nul
```

Append the inventory to `[SCRATCH]` under `# Inventory`. Go to Step 2.

---

## Step 2 — Extract base components

For each directory under `packages/mybcabisnis/modules/bases/`:

1. Read the component TypeScript file (`component/*.component.ts`) using the Read tool.
2. Read all model type files (`models/*.types.ts`) using the Read tool if they exist.
3. Read `public-api.ts` to confirm which symbols are exported.

For each component, extract and append to `[SCRATCH]` under `# BaseComponents`:

```
### [ComponentName] (`<selector>`)
**Import path:** `@mybcabisnis/lib/modules/bases/<name>`
**File:** `modules/bases/<name>/component/<name>.component.ts`

#### Inputs
| Name | Type | Required | Default |
|------|------|----------|---------|

#### Outputs
| Name | Emits |
|------|-------|

#### Types / Models
```typescript
// paste relevant type aliases and interfaces from models/*.types.ts
```
```

Rules for extracting inputs and outputs:
- `input<T>(defaultValue)` → optional, default = defaultValue
- `input.required<T>()` → required, no default
- `input<T>()` → optional, default = undefined
- `output<T>()` → output emitting T
- Ignore `signal()` and `computed()` — those are internal state

Process all base component directories:
alert, badge, bottom-sheet, bridging-page, button, calendar, card, checkbox, chip, currency, dialog-base, draggable-list, dropdown, dropdown-panel, error-section, expand-collapse, icon, loader, modify-panel, pagination, preview-file, radio-button, search-bar, stepper, table, tabs, text, text-field, toggle, tooltip, tooltip-box, upload-file

---

## Step 3 — Extract composite components

For each directory under `packages/mybcabisnis/modules/components/`:

Same extraction process as Step 2. Append results to `[SCRATCH]` under `# CompositeComponents`.

Composite component directories:
authentication, dialog, expandable-table, floating-button, header, klausula, menu-tree, multi-list, notes, option-box, orderable-table, popup, workflow

---

## Step 4 — Extract page components

For each directory under `packages/mybcabisnis/modules/pages/`:

Same extraction process. Append results to `[SCRATCH]` under `# Pages`.

Page directories: resend-email, summary

---

## Step 5 — Extract shared types, models, pipes, modules, and utilities

### Models (`packages/mybcabisnis/src/lib/models/`)
Read all `.ts` files using the Read tool. Extract every type alias, interface, enum, and const array.
Files: `general.types.ts`, `general-enum.ts`, `platform-service-enum.ts`, `reusable.store.ts`, `mbb-response.ts`

### Pipes (`packages/mybcabisnis/src/lib/pipes/`)
For each pipe extract: `@Pipe({ name })` and `transform()` signature.
Files: `date.pipe.ts`, `mask.pipe.ts`, `safe-html.pipe.ts`

### Modules (`packages/mybcabisnis/src/lib/modules/`)
Read each module file fully. Extract the class name, what it provides, and when to use it.
Files: `initializer.module.ts`, `translation.module.ts`

### Utils (`packages/mybcabisnis/src/lib/utils/`)
Read all files. Extract exported functions, constants, and injection tokens.
Files: `helpers/tokens.ts`, `helpers/platform-style.ts`, `translation.loader.ts`

Append all findings to `[SCRATCH]` under `# SharedTypes`. Go to Step 6.

---

## Step 6 — Extract services

### Internal services (`packages/mybcabisnis/src/lib/internal-services/`)
For each subdirectory read both the `*.service.ts` and its companion type file.
Subdirectories: alert, config, data, do-on-unmount, encrypt, gateway, general, language, loader, native-data, navigation, translation, localization, platform-theme.
Extract: class name, `@Injectable` scope, all public method signatures.

### Single-SPA integration (`packages/mybcabisnis/src/lib/single-spa/`)
Read all three files. Extract `PropsService`, `SingleSpaProps` type, and all `ServiceProps` properties.

### Guards (`packages/mybcabisnis/src/lib/guards/`)
Read each file. Extract guard class name and its purpose.
Files: `component.guard.ts`, `deactivate.guard.ts`, `translate.guard.ts`

### Helper services (`packages/mybcabisnis/helper/`)
Read all three files. Extract class name and public methods.
Files: `auto-scroll.service.ts`, `check-access.service.ts`, `general.service.ts`

### Feature services (`packages/mybcabisnis/services/`)
Read: `dayjs/`, `environment/`, `feature-data/`

Append all findings to `[SCRATCH]` under `# Services`. Go to Step 7.

---

## Step 7 — Document themes

**bash:**
```bash
find packages/mybcabisnis/src/lib/themes -name "*.scss" | sort
```
**PowerShell:**
```powershell
Get-ChildItem -Path packages/mybcabisnis/src/lib/themes -Recurse -Filter "*.scss" | Sort-Object Name | Select-Object -ExpandProperty FullName
```
**CMD:**
```cmd
dir /s /b packages\mybcabisnis\src\lib\themes\*.scss 2>nul
```

Document the three theme names (web, lite, archi) and their SCSS import paths.
Append to `[SCRATCH]` under `# Themes`. Go to Step 8.

---

## Step 8 — Write the local KB file

**MANDATORY: Use the Write tool to write the KB file to disk. Do NOT print the document content as a chat message.**

1. Read `[SCRATCH]` in full using the Read tool.
2. Call the **Write tool** to write the KB file to the local cache:
   - **bash:** `~/.mage/knowledge/mbb-lib/MBB-KB-[version].md`
   - **PowerShell:** `$env:USERPROFILE\.mage\knowledge\mbb-lib\MBB-KB-[version].md`
   - **CMD:** `%USERPROFILE%\.mage\knowledge\mbb-lib\MBB-KB-[version].md`
3. Delete the scratch file using the detected shell:
   - **bash / PowerShell:** `rm [SCRATCH]`
   - **CMD:** `del [SCRATCH]`

Use this structure for the KB file:

```markdown
# @mybcabisnis/lib Knowledge Base — v[version]

**Generated:** [today's date]
**Package:** [package name]
**Library version:** [version]
**Angular peer:** [angular version]

---

## Public Export Surface

Two main entry points:
- `@mybcabisnis/lib` — services, guards, pipes, models, modules, single-spa
- `@mybcabisnis/lib/services` — DayJS, EnvironmentService, FeatureDataService
- `@mybcabisnis/lib/modules/bases/<name>` — individual base components
- `@mybcabisnis/lib/modules/components/<name>` — individual composite components

[Paste # PublicAPI section from scratch]

---

## Base Components

[Paste # BaseComponents section from scratch]

---

## Composite Components

[Paste # CompositeComponents section from scratch]

---

## Page Components

[Paste # Pages section from scratch]

---

## Shared Types, Pipes & Modules

[Paste # SharedTypes section from scratch]

---

## Services & Helpers

[Paste # Services section from scratch]

---

## Themes

[Paste # Themes section from scratch]

---

## Common Patterns

### idName convention
Every component has `idName = input.required<string>()`.
```html
<mbb-button idName="feature-name-action-button" label="Submit" (onClicked)="submit()" />
```

### Library initialization
```typescript
import { InitializerModule } from '@mybcabisnis/lib';
```

### Platform variants
Platform is injected via `DataService.getMbbPlatform()` — not an input.

### Signal-based API
```typescript
const val = this.myInput(); // not this.myInput
```

### Single-SPA host contract
The host app passes `SingleSpaProps` via `singleSpaPropsSubject`.
`DataService` and `GatewayService` read from it.
```

Go to Step 8a.

---

## Step 8a — Review and confirm before pushing

**This step produces the first user-visible output.**

Read the first 60 lines of the KB file using the Read tool (limit: 60), then print:

```
─────────────────────────────────────────────
KB Preview — MBB-KB-[version].md
[paste the first 60 lines from the Read tool output]
─────────────────────────────────────────────
File saved locally: ~/.mage/knowledge/mbb-lib/MBB-KB-[version].md

Push this KB to the GitLab Package Registry?
  Registry : https://[GITLAB_HOST] (project ID: [GITLAB_PROJECT_ID])
  Package  : [GITLAB_PACKAGE_NAME] @ [version]
  File     : MBB-KB-[version].md

Reply with yes to push, or no to keep it local only.
```

- If the user replies **yes** → go to Step 9.
- If the user replies **no** → stop and confirm:
  > KB v[version] saved locally at `~/.mage/knowledge/mbb-lib/MBB-KB-[version].md`. Not pushed to GitLab.
- If the user asks to **edit** something first → apply the requested edits to the local file using the Edit tool, then re-show the preview and ask again.

---

## Step 9 — Push to GitLab Generic Package Registry

Upload the KB file using the Generic Packages API:

**bash:**
```bash
curl --silent --write-out "\n%{http_code}" \
  --header "PRIVATE-TOKEN: $GITLAB_PRIVATE_TOKEN" \
  --upload-file ~/.mage/knowledge/mbb-lib/MBB-KB-[version].md \
  "https://[GITLAB_HOST]/api/v4/projects/[GITLAB_PROJECT_ID]/packages/generic/[GITLAB_PACKAGE_NAME]/[version]/MBB-KB-[version].md"
```
**PowerShell:**
```powershell
$file = "$env:USERPROFILE\.mage\knowledge\mbb-lib\MBB-KB-[version].md"
$uri  = "https://[GITLAB_HOST]/api/v4/projects/[GITLAB_PROJECT_ID]/packages/generic/[GITLAB_PACKAGE_NAME]/[version]/MBB-KB-[version].md"
$res  = Invoke-WebRequest -Method Put -Uri $uri -InFile $file -Headers @{ "PRIVATE-TOKEN" = $env:GITLAB_PRIVATE_TOKEN } -UseBasicParsing
$res.StatusCode
```
**CMD:**
```cmd
curl.exe --silent --write-out "\n%%{http_code}" ^
  --header "PRIVATE-TOKEN: %GITLAB_PRIVATE_TOKEN%" ^
  --upload-file "%USERPROFILE%\.mage\knowledge\mbb-lib\MBB-KB-[version].md" ^
  "https://[GITLAB_HOST]/api/v4/projects/[GITLAB_PROJECT_ID]/packages/generic/[GITLAB_PACKAGE_NAME]/[version]/MBB-KB-[version].md"
```

Expected responses:
- HTTP `201` → success, file created.
- HTTP `200` → success, file updated.
- Any other code → failure. Report the status code and response body. The local file is still intact.

On success, report:
```
✓ KB pushed to GitLab Package Registry
  URL: https://[GITLAB_HOST]/api/v4/projects/[GITLAB_PROJECT_ID]/packages/generic/[GITLAB_PACKAGE_NAME]/[version]/MBB-KB-[version].md
  Local cache: ~/.mage/knowledge/mbb-lib/MBB-KB-[version].md

Team members can now fetch it automatically via /mbb-qna.
```

---

## Guidelines

- Run this skill whenever a new version of `@mybcabisnis/lib` is published.
- Keep one KB file per version — do not overwrite older ones without regenerating.
- Always use `src/public-api.ts` as the ground truth for what consumers can import from `@mybcabisnis/lib`.
- The `mbb-qna` skill fetches KB files from GitLab when they are missing from local cache.
