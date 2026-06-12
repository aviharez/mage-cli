---
name: readme
description: Generates or updates a project's README — detects boilerplate/default READMEs (Angular CLI, create-next-app, Vite, Vue, NestJS, Spring Boot) and replaces them with a real README, auto-discovers and links existing docs (FFL.md, CHANGELOG, docs/, ADRs), never overwrites a customized README (only adds missing doc links). Trigger when the user asks to generate/create/update/improve a README, or when invoked by another skill (e.g. functional-flow) to wire docs into the README.
metadata:
  author: MAGE Team
---

# README Generator

## Overview

A README is the front door of a project. A boilerplate or missing README tells newcomers nothing about how to build, run, or understand the code. This skill:

1. **Detects** whether the README is real (human-written) or just a framework scaffold/missing.
2. **Generates** a Full README from source when the existing one is boilerplate or absent.
3. **Never overwrites** a customized README — it only adds a `## Documentation` section with links to discovered docs if that section is missing.
4. **Auto-discovers** key docs in the repo (`FFL.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `docs/`, ADRs) and links them regardless of whether they were created by the user, a CI process, or another skill.

**Two rules that govern what the agent reads vs. synthesizes:**

- **Facts — never invent:** install/run/build/test commands, endpoint paths, HTTP methods, base URLs, dependency versions. These must be read verbatim from source.
- **Summaries — synthesize from code:** the project description. When no description field exists in `package.json`/`pom.xml`, **write one** by reading what the project actually does — its routes, components, controllers, and main features. A synthesized description is always better than a placeholder.

## When to Use

- User asks to "generate a README", "create a README", "update the README", "improve the README", or "set up docs".
- A new project was just scaffolded and the README is still the framework default.
- After generating an `FFL.md` (or other key docs) and wanting them discoverable from the README.
- Called by another skill that just produced a doc file and wants the README updated.

**When NOT to use:**
- Do not run if the README is clearly complete and real AND the user is not asking about the README — e.g. they asked for an FFL and did not mention the README.
- Do not invent **commands** — they must come from source. But **do synthesize a description** when none is in the manifest — read the code and write what the project does. Never leave a `_(description not available)_` placeholder.
- Do not delete or restructure sections of a customized README — only append the Documentation section.

---

## Workflow

Follow these steps in order.

### Step 1 — Detect the stack

Lightweight detection (same signals as the functional-flow skill):

| Signal | Stack |
|--------|-------|
| `angular.json` or `package.json` has `"@angular/core"` | Angular |
| `build.gradle`/`pom.xml` contains `spring-boot` | Spring Boot |
| `package.json` exists, no Angular | Node.js (check for framework in dependencies) |
| Neither | Generic |

**Read committed files only.** Use `git ls-files` (if the project is a git repo) to scope what you read. Never read `.env` files, `application-local.*`, or any gitignored/untracked file for values — if a config key appears in such a file, emit the key name only, not the value.

Read the **real run/build/test commands**:
- **Angular:** `ng serve` / `ng build` / `ng test` (or from `package.json` scripts `start`/`build`/`test` if overridden).
- **Spring Boot:** `./mvnw spring-boot:run` or `./gradlew bootRun`; `./mvnw package` or `./gradlew build`; `./mvnw test` or `./gradlew test`.
- **Node.js:** read `package.json` scripts — `start`/`dev`, `build`, `test`. Use the key name exactly as it appears (`npm run dev`, not `npm start`).
- **Generic:** look for `Makefile`, `scripts/`, or build tool configs.

Also read:
- **Prerequisites:** `engines.node` in `package.json` → Node version; `.nvmrc` → exact version; `sourceCompatibility` / `java.toolchain.languageVersion` in build.gradle → Java version.
- **Project name + description:** `package.json` `.name`/`.description`, or `pom.xml` `<name>`/`<description>`, or `settings.gradle` `rootProject.name`.
- **Project version:** `package.json` `.version` or `build.gradle`/`pom.xml` equivalent.

### Step 2 — Load the README reference

Read `references/readme-template.md` — it contains:
- Boilerplate detection signatures (to classify the README in Step 3).
- The Full README structure to emit.
- The doc auto-discovery and non-destructive link insertion rule.

### Step 3 — Locate and classify the README

1. Look for `README.md` at the project root (case-insensitive). If only a Spring Boot `HELP.md` exists, treat the README as **missing**.
2. Classify using the signatures from `references/readme-template.md`:
   - **Missing** → will generate Full README.
   - **Default/boilerplate** (signature match or stub ≤ ~8 non-empty lines) → will generate Full README (overwrite — no human content is lost).
   - **Customized** (real content, no strong signature, > stub) → will keep intact, add doc links only.
   - **If uncertain** → treat as customized (safe path).

### Step 4 — Auto-discover docs

Scan the project root and `docs/` for these files (check if they exist):

| File / path | Link label |
|-------------|-----------|
| `FFL.md` | `[Functional Flow Document](./FFL.md)` |
| `CHANGELOG.md` or `CHANGELOG` | `[Changelog](./CHANGELOG.md)` |
| `CONTRIBUTING.md` | `[Contributing Guide](./CONTRIBUTING.md)` |
| `docs/` directory (non-empty) | `[Documentation](./docs/)` |
| `docs/decisions/` (ADRs) | `[Architecture Decision Records](./docs/decisions/)` |

Collect only the ones that exist. If none exist, the Documentation section still appears but with a note: `(no additional documentation found — run the functional-flow skill to generate FFL.md)`.

### Step 5 — Generate or update

**If generating Full README** (missing or boilerplate): use the Full README structure from `references/readme-template.md`. Fill every section from source — no placeholders. Include `## API Overview` only if `FFL.md` was found in Step 4 (use the endpoint count from that file's §3 tables if readable, or omit the count and just link). Write to `README.md`.

**If updating a customized README** (add doc links only):
1. Check if a `## Documentation` section (or a heading containing "Docs", "Documentation") already exists.
2. If it exists: add only the missing links to it (skip any already present; no duplicates).
3. If it does not exist: append the full `## Documentation` section at the end of the file.
4. Do not change any other content.

### Step 6 — Report

State the action taken clearly:
- `README.md generated (replaced boilerplate)` — or `README.md generated (was missing)`
- `README.md updated — added doc links: FFL.md, CHANGELOG.md` (list what was added)
- `README.md already up to date — no changes made`

---

## Verification

Before finishing, check every item:

- [ ] **Stack detection is correct** — README section headers and tech stack match the actual project type.
- [ ] **No placeholder commands** — install/run/build/test commands are real scripts from the source, not `npm install` / `mvn install` guesses unless confirmed.
- [ ] **Description is real, not a placeholder** — a non-empty, meaningful description appears. If `package.json`/`pom.xml` had one, it was used; if not, a description synthesized from the code is present. The string `_(description not available` must **not** appear anywhere in the output.
- [ ] **No `0.0.0` version badge** — if the detected version is `0.0.0`, empty, or unset, the version badge line is omitted entirely from the README.
- [ ] **Customized README left intact** — if the existing README had real content, no lines were removed or reordered; only the Documentation section was added/updated.
- [ ] **No duplicate doc links** — if a link to `FFL.md` already existed anywhere in the README, it was not added again.
- [ ] **Discovered docs all linked** — every file that exists from the discovery list in Step 4 appears in the Documentation section.
- [ ] **API Overview present only when FFL.md exists** — if `FFL.md` does not exist at the project root, the `## API Overview` section is absent.
- [ ] **Action reported** — the outcome (generated / updated / no change) was stated clearly.
- [ ] **No gitignored values** — every value in the README (commands, URLs, versions) was read from a committed file; no value originates from a `.gitignore`-matched or untracked file (`.env`, `application-local.*`, etc.).
