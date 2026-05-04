---
name: mbb-kb-gen
description: Generate a versioned knowledge base (KB) document for the @mybcabisnis/lib Angular component library by crawling component TypeScript sources and extracting selectors, inputs, outputs, types, services, and utilities. Stores KB locally and pushes to GitLab.
---

# MBB Component Library — Knowledge Base Generator

Crawl the `@mybcabisnis/lib` Angular library source and produce a structured, versioned KB file. Saves the KB to the local cache and pushes it to GitLab so all team members can fetch it via `mbb-qna`.

## CONTRACT

- Do NOT stop between steps unless a file read fails critically.
- Write intermediate findings to `/tmp/mbb-kb-scratch.md` using tool calls.
- **MUST pause at Step 8a** — show the user a preview of the generated KB and wait for explicit confirmation before pushing.
- Do NOT push to GitLab without user confirmation. Stopping after local write is an acceptable outcome if the user declines.
- The task is complete when either: (a) `MBB-KB-[version].md` is confirmed and pushed to GitLab, or (b) the user declines the push and the local file is saved.

---

## Configuration

### Lib source

```
LIB_ROOT=../mbb-component/projects/mybcabisnis
```

If the user provides a different path, use that instead.

### Local cache directory

```
KB_CACHE=~/.mage/knowledge/mbb-lib
```

### GitLab Generic Package Registry settings

Fill these values in before running. They are used in Step 9.

```
GITLAB_HOST=git.intra.bca.co.id          # your company GitLab hostname
GITLAB_PROJECT_ID=<numeric-project-id>   # project ID that hosts the package registry
GITLAB_PACKAGE_NAME=mbb-kb               # package name in the registry
GITLAB_PRIVATE_TOKEN=$GITLAB_PRIVATE_TOKEN  # read from env var
```

To find `GITLAB_PROJECT_ID`: open the GitLab project page → Settings → General → Project ID.

If `GITLAB_PRIVATE_TOKEN` is not set in the environment, stop and tell the user:
> Set your GitLab personal access token: `export GITLAB_PRIVATE_TOKEN=<your-token>`
> The token needs at least **api** scope.

---

## Step 0 — Verify prerequisites and read lib version

Check that the local cache directory exists, create it if not:

**bash:**
```bash
mkdir -p ~/.mage/knowledge/mbb-lib
```

Check that the GitLab token is set:

**bash:**
```bash
[ -n "$GITLAB_PRIVATE_TOKEN" ] && echo "OK" || echo "MISSING"
```

If `MISSING`, stop and instruct the user (see Configuration above).

Read `[LIB_ROOT]/package.json` and extract:
- `name` — package name
- `version` — lib version (used in KB filename as `MBB-KB-[version].md`)
- `peerDependencies["@angular/core"]` — Angular version

Check whether the KB file already exists in the local cache:

**bash:**
```bash
ls ~/.mage/knowledge/mbb-lib/MBB-KB-[version].md 2>/dev/null
```

If it already exists, ask the user:
> KB for v[version] already exists locally. Regenerate and overwrite? (yes/no)

If no, stop. If yes, continue.

Write to `/tmp/mbb-kb-scratch.md`:

```
# MBB KB Scratch
LIB_ROOT=<resolved path>
PACKAGE=<name>
VERSION=<version>
ANGULAR=<peer angular version>
KB_FILE=MBB-KB-<version>.md
```

Then read `[LIB_ROOT]/src/public-api.ts` and `[LIB_ROOT]/services/public-api.ts` in full.

These two files are the **authoritative export manifests** — they define exactly what is publicly accessible to consumers of `@mybcabisnis/lib`. Append both files' content verbatim to `/tmp/mbb-kb-scratch.md` under `# PublicAPI`. Go to Step 1.

---

## Step 1 — Inventory all modules

Run the following to list every base component, composite component, and page:

**bash:**
```bash
find [LIB_ROOT]/modules -type d -mindepth 2 -maxdepth 2 | sort
```

Append the inventory to `/tmp/mbb-kb-scratch.md` under `# Inventory`. Go to Step 2.

---

## Step 2 — Extract base components

For each directory under `[LIB_ROOT]/modules/bases/`:

1. Read the component TypeScript file (`component/*.component.ts`).
2. Read all model type files (`models/*.types.ts`) if they exist.
3. Read `public-api.ts` to confirm which symbols are exported.

For each component, extract and append to `/tmp/mbb-kb-scratch.md` under `# BaseComponents`:

```
### [ComponentName] (`<selector>`)
**Import path:** `@mybcabisnis/lib/modules/bases/<name>`
**File:** `modules/bases/<name>/component/<name>.component.ts`

#### Inputs
| Name | Type | Required | Default |
|------|------|----------|---------|
| ... | ... | yes/no | ... |

#### Outputs
| Name | Emits |
|------|-------|
| ... | ... |

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

For each directory under `[LIB_ROOT]/modules/components/`:

Same extraction process as Step 2. Append results to `/tmp/mbb-kb-scratch.md` under `# CompositeComponents`.

Composite component directories:
authentication, dialog, expandable-table, floating-button, header, klausula, menu-tree, multi-list, notes, option-box, orderable-table, popup, workflow

---

## Step 4 — Extract page components

For each directory under `[LIB_ROOT]/modules/pages/`:

Same extraction process. Append results to `/tmp/mbb-kb-scratch.md` under `# Pages`.

Page directories: resend-email, summary

---

## Step 5 — Extract shared types, models, pipes, modules, and utilities

### Models (`[LIB_ROOT]/src/lib/models/`)
Read all `.ts` files. Extract every type alias, interface, enum, and const array.
Files: `general.types.ts`, `general-enum.ts`, `platform-service-enum.ts`, `reusable.store.ts`, `mbb-response.ts`

### Pipes (`[LIB_ROOT]/src/lib/pipes/`)
For each pipe extract: `@Pipe({ name })` and `transform()` signature.
Files: `date.pipe.ts`, `mask.pipe.ts`, `safe-html.pipe.ts`

### Modules (`[LIB_ROOT]/src/lib/modules/`)
Read each module file fully. Extract the class name, what it provides, and when to use it.
Files: `initializer.module.ts`, `translation.module.ts`

### Utils (`[LIB_ROOT]/src/lib/utils/`)
Read all files. Extract exported functions, constants, and injection tokens.
Files: `helpers/tokens.ts`, `helpers/platform-style.ts`, `translation.loader.ts`

Append all findings to `/tmp/mbb-kb-scratch.md` under `# SharedTypes`. Go to Step 6.

---

## Step 6 — Extract services

### Internal services (`[LIB_ROOT]/src/lib/internal-services/`)
For each subdirectory read both the `*.service.ts` and its companion type file.
Subdirectories: alert, config, data, do-on-unmount, encrypt, gateway, general, language, loader, native-data, navigation, translation, localization, platform-theme.
Extract: class name, `@Injectable` scope, all public method signatures.

### Single-SPA integration (`[LIB_ROOT]/src/lib/single-spa/`)
Read all three files. Extract `PropsService`, `SingleSpaProps` type, and all `ServiceProps` properties.

### Guards (`[LIB_ROOT]/src/lib/guards/`)
Read each file. Extract guard class name and its purpose.
Files: `component.guard.ts`, `deactivate.guard.ts`, `translate.guard.ts`

### Helper services (`[LIB_ROOT]/helper/`)
Read all three files. Extract class name and public methods.
Files: `auto-scroll.service.ts`, `check-access.service.ts`, `general.service.ts`

### Feature services (`[LIB_ROOT]/services/`)
Read: `dayjs/`, `environment/`, `feature-data/`

Append all findings to `/tmp/mbb-kb-scratch.md` under `# Services`. Go to Step 7.

---

## Step 7 — Document themes

List SCSS theme files:

**bash:**
```bash
find [LIB_ROOT]/src/lib/themes -name "*.scss" | sort
```

Document the three theme names (web, lite, archi) and their SCSS import paths.
Append to `/tmp/mbb-kb-scratch.md` under `# Themes`. Go to Step 8.

---

## Step 8 — Write the local KB file

Read `/tmp/mbb-kb-scratch.md` in full. Write the KB file to:

```
~/.mage/knowledge/mbb-lib/MBB-KB-[version].md
```

Use this structure:

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

Delete `/tmp/mbb-kb-scratch.md` after the file is written. Go to Step 8a.

---

## Step 8a — Review and confirm before pushing

**This step produces the only user-visible output before the final result.**

Show the user a preview of the generated KB:

**bash:**
```bash
head -60 ~/.mage/knowledge/mbb-lib/MBB-KB-[version].md
```

Then print the following summary and wait for the user's response:

```
─────────────────────────────────────────────
KB Preview — MBB-KB-[version].md
[paste the head -60 output above]
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
  > KB v[version] saved locally at `~/.mage/knowledge/mbb-lib/MBB-KB-[version].md`. Not pushed to GitLab. You can push it manually later or rerun this skill.
- If the user asks to **edit** something first → apply the requested edits to the local file, then re-show the preview and ask again.

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

Expected responses:
- HTTP `201` → success, file created in the registry.
- HTTP `200` → success, file updated (version already existed).
- Any other code → failure. Report the status code and response body to the user. The local file is still intact.

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
