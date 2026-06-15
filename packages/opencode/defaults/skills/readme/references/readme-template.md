# README Reference

This file contains three things: the boilerplate detection signatures, the Full README structure, and the doc-linking rules.

---

## Part 1 — Boilerplate Detection Signatures

A README is **boilerplate/default** if ANY of the following strong multi-word phrases appear verbatim in its content:

| Framework | Signature phrase |
|-----------|-----------------|
| Angular CLI | `This project was generated` AND (`Angular CLI` or `AngularCLI`) |
| Create React App | `This project was bootstrapped with [Create React App]` |
| Vite + React | `This template provides a minimal setup to get React working in Vite` |
| Vue (create-vue) | `This template should help get you started developing with Vue 3` |
| Vite generic | `Vite + ` followed by framework name as the entire first heading |
| Next.js | `bootstrapped with [\`create-next-app\`]` (backtick) OR `bootstrapped with [create-next-app]` (no backtick) |
| NestJS | `Nest framework TypeScript starter repository` |
| Spring Boot | `Spring Boot Maven Plugin Reference Guide` OR `CREATE BASE PROJECT UNTUK SERVICES` |
| Nuxt | `Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.` |
| SvelteKit | `Everything you need to build a Svelte project, powered by [\`create-svelte\`]` |

**Stub rule:** A README that is title-only OR has ≤ 8 non-empty lines of content (not counting blank lines and the title line itself) is treated as a stub → classify as **default**.

**Safety rule:** If the README has content that does not match any signature AND is more than a stub, classify as **customized** even if you are unsure. The safe path is to never lose human-written content.

---

## Part 2 — Full README Structure

Emit this structure exactly, substituting real values for every `[bracket token]`. Do not leave bracket tokens in the output.

```markdown
# [Project Name]

> [One-line project description — see description rules below]

<!-- Version badge: emit ONLY if a real non-default version was found — see version badge rules below -->

## Tech Stack

- **[Platform]** [version] — e.g. Angular 19, Spring Boot 3.3, Node.js 22
- **[Runtime/Language]** [version] — e.g. TypeScript 5, Java 21
- [any other major dep detected from package.json / pom.xml / build.gradle]

## Getting Started

### Prerequisites

- [Runtime] [version] — e.g. Node.js >= [engines.node value] (or from .nvmrc)
- [Package manager] — e.g. npm / bun / Maven / Gradle

### Installation

```bash
[exact install command from package.json scripts or project convention]
# e.g.:  npm install   OR   bun install   OR   ./mvnw install -DskipTests
```

### Running locally

```bash
[exact dev/serve command]
# e.g.:  npm start   OR   ng serve   OR   ./mvnw spring-boot:run
```

### Building

```bash
[exact build command]
# e.g.:  npm run build   OR   ng build   OR   ./gradlew build
```

### Testing

```bash
[exact test command]
# e.g.:  npm test   OR   ng test   OR   ./gradlew test
```

## Project Structure

| Directory | Purpose |
|-----------|---------|
| `[path]` | [what lives here — read from actual directories] |
| `[path]` | [what lives here] |

<!-- If an FFL was generated, reuse its §1.2 Key Directories table here -->

## Documentation

[list of discovered docs — see Part 3 for the links to include]

[if FFL.md was found]
## API Overview

[N] endpoints across [M] domains. Full request/response shapes, Mermaid flow diagrams, and architecture details are in [FFL.md](./FFL.md).
```

**Notes on specific sections:**

### Description rules

The description is a **synthesized summary** — not a regurgitated fact. Priority order:

1. Use `package.json .description` / `pom.xml <description>` / `composer.json description` if it is **present and non-empty**.
2. Otherwise, **write a 1–2 sentence description derived from the code**:
   - If `FFL.md` exists: use the §1.1 System Architecture paragraph as the basis.
   - Otherwise: infer from the project name + detected platform + the main routes/controllers/features found while scanning. Example: *"Angular dashboard for managing settings — provides setting list, detail, and edit screens backed by a REST API."*
3. **Only** if the project is genuinely empty (no routes, no controllers, no components, no code at all): write a minimal honest stack line, e.g. *"An Angular application."*

**Never write `_(description not available — update this line)_` or any placeholder.** A synthesized description derived from real code is always better than a placeholder.

### Version badge rules

- **Emit the badge** only when a real, non-default semver was found (not `0.0.0`, not empty, not `(unknown)`, not missing).
- **Omit the badge** (remove the line entirely) for `0.0.0`, empty, unset, or undetectable versions.

```markdown
<!-- Emit this: -->
![Version](https://img.shields.io/badge/version-1.3.2-blue)

<!-- Omit entirely for 0.0.0 / empty / unknown: -->
```

- **All facts come from committed source only.** Use `git ls-files` to scope what you read. Never read `.env`, `application-local.*`, or any gitignored/untracked file for values. If a URL or secret lives only in a gitignored file, reference the env-var key or config key name only — never the value.
- **Tech Stack:** list only dependencies that are clearly identifiable from the manifest files. Do not invent or guess framework versions — read them from `package.json` or `build.gradle`/`pom.xml`.
- **Getting Started commands:** use the **exact key** from `package.json` scripts. If the script is `"dev": "ng serve"`, write `npm run dev`, not `npm start`. If the key is `"start"`, write `npm start`. For Spring Boot: use the gradle/maven wrapper (`./gradlew` or `./mvnw`) if the wrapper file exists; fall back to `gradle` / `mvn` if it does not.
- **Project Structure:** read the top-level source directories. If FFL.md was already generated, reuse its §1.2 Key Directories table verbatim — do not re-scan.
- **API Overview:** appear **only if** `FFL.md` exists. Count endpoint rows in FFL.md §3 if the file is readable; if not readable just write "Full flow documentation in FFL.md."

---

## Part 3 — Doc Auto-Discovery and Non-Destructive Link Rule

### Docs to discover (in order of insertion)

Check for each of these in the project root (or at the noted path). Only include those that exist:

1. `FFL.md` → `[Functional Flow Document](./FFL.md)` — architecture, flow diagrams, full API list
2. `CHANGELOG.md` or `CHANGELOG` → `[Changelog](./CHANGELOG.md)` — release history
3. `CONTRIBUTING.md` → `[Contributing Guide](./CONTRIBUTING.md)` — how to contribute
4. `docs/` directory (non-empty) → `[Documentation](./docs/)` — extended docs
5. `docs/decisions/` directory (non-empty) → `[Architecture Decision Records](./docs/decisions/)` — ADRs

If none of these exist at the time of README generation, write:

```markdown
## Documentation

_No additional documentation found yet. Run the `functional-flow` skill to generate FFL.md._
```

### Non-destructive link insertion into a customized README

When the README is **customized** and you need to add/update the Documentation section:

1. **Scan for an existing Documentation heading:** look for any of these (case-insensitive): `## Documentation`, `## Docs`, `## Related Docs`, `## Additional Resources`, `### Documentation`.
2. **If found:**
   - Read the existing content of that section.
   - For each discovered doc link (from the list above), check if a link to that exact file already exists anywhere in that section (look for the file path, e.g. `FFL.md` or `./FFL.md`).
   - Add only the missing links as new bullet points at the end of the section.
   - Do not move, remove, or reorder any existing lines in the section.
3. **If NOT found:**
   - Append the following at the very end of the file (add a blank line before it if the file does not end with one):
     ```markdown
     ## Documentation

     - [link1]
     - [link2]
     ...
     ```
   - Only include links for docs that actually exist.

**Never** insert duplicate links. If `FFL.md` already appears anywhere in the README (even under a different heading), do not add it again.

**Never** rewrite, move, or restructure any other section of the README.
