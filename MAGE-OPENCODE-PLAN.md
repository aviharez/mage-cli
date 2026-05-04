# Mage on OpenCode — Detailed Execution Plan

**Companion to:** `MAGE-OPENCODE-BRIEF.md` (read first for context and the recommendation)
**Executor:** Claude Sonnet 4.6
**Working dir:** `/Users/bcamaster/Documents/SNZ_Playground/research/mage-cli`
**OpenCode source:** `https://github.com/anomalyco/opencode.git`

---

## How to use this plan

- Each task is a self-contained block: **Goal → Inputs → Steps → Verify → Artifacts**.
- Work top to bottom. Do not skip ahead.
- **Hard stop after Phase 1.** Phase 1 is a proof-of-concept and a go/no-go gate. Report findings to the user before starting Phase 2.
- Prefer the existing Mage codebase (`src/`) as the source of truth for behavior. When porting, treat current Mage files as the spec.
- Use Bun, not Node. Use forward slashes for paths in code; Windows-style only when invoking shell tools that require it.
- If a step's reality diverges from the plan (e.g., OpenCode's directory layout differs), update the plan in-place and continue.
- Do not delete `src/`, `dist/`, `bin/`, `templates/`, `tests/`, `PLAN.md`, `PLAN-DETAILED.md`, or `mage-technical-brief-v4.md` from the existing repo. They are the reference implementation.

---

## Phase 0 — Preflight (1–2 hours)

### Task 0.1 — Confirm OpenCode license + attribution requirements

**Goal:** Make sure forking is legally OK for an internal BCA tool published to artifactory.

**Steps:**
1. Read OpenCode's `LICENSE` file (clone shallow first if needed: `git clone --depth 1 https://github.com/anomalyco/opencode.git ../opencode-upstream`).
2. Confirm it is MIT or similarly permissive.
3. Note the exact attribution string required.
4. Check `package.json` files in OpenCode for any dependencies with copyleft licenses (GPL/AGPL). Flag any.

**Verify:** A short note in `MAGE-OPENCODE-NOTES.md` (create it) listing: license, attribution string, any flagged deps.

**Artifacts:** `MAGE-OPENCODE-NOTES.md` started.

---

### Task 0.2 — Inventory current Mage's differentiators

**Goal:** Produce a single-page list of *exactly* what we must port from current Mage. This is the spec for Phase 4–6.

**Steps:**
1. Read these files end-to-end and summarize each in 2–4 lines:
   - `src/llm/qwen3.ts` — Qwen3/Merlin request shape, streaming, thinking mode handling.
   - `src/binary/runner.ts`, `src/binary/progress.ts`, `src/binary/types.ts` — Go binary spawn, stderr `[progress]` parsing, JSON output schema.
   - `src/boilerplate/manifest.ts`, `src/boilerplate/loader.ts`, `src/boilerplate/detector.ts`, `src/boilerplate/profiles.ts` — boilerplate format, project auto-detection, profile switching.
   - `src/llm/prompt-builder.ts` — how conventions, examples, project files, and user prompt are assembled.
   - `src/core/file-writer.ts`, `src/utils/diff.ts` — file write confirmation flow and diff rendering.
   - `src/ui/OnboardingWizard.tsx` — first-run setup steps.
   - `scripts/build.ts`, `bin/mage.cjs`, `bin/postinstall.cjs` — BCA artifactory packaging.
2. Append the summary to `MAGE-OPENCODE-NOTES.md` under a `## Mage Differentiators` heading.

**Verify:** `MAGE-OPENCODE-NOTES.md` has 7 short sections, one per concern above.

**Artifacts:** Updated `MAGE-OPENCODE-NOTES.md`.

---

### Task 0.3 — Inventory OpenCode's relevant subsystems

**Goal:** Map each Mage differentiator to the OpenCode extension point that will host it.

**Steps:**
1. From the cloned `../opencode-upstream` (Task 0.1), list the contents of `packages/opencode/src/{provider,tool,agent,plugin,command,cli,config,session,permission,mcp,lsp}`.
2. For each Mage differentiator from Task 0.2, identify the OpenCode subsystem most likely to host it. Suggested mapping (verify against actual code):
   - Qwen3/Merlin client → `provider/` (custom provider implementation).
   - Go binary MR review → `tool/` (custom tool that spawns the binary) **or** `plugin/` (slash command + tool).
   - Boilerplate system → `plugin/` (loader plugin) + `command/` (slash command for switching).
   - Onboarding wizard → `cli/` first-run hook **or** a custom `command/` registered as `mage init`.
   - File write + diff → already exists in OpenCode tools — use upstream version, drop ours.
   - BCA artifactory packaging → root `package.json` + a build script in our fork.
3. Append the mapping to `MAGE-OPENCODE-NOTES.md` under `## Subsystem Mapping`.

**Verify:** Mapping table covers every Mage differentiator and points to a real OpenCode directory or file.

**Artifacts:** Updated `MAGE-OPENCODE-NOTES.md`.

---

## Phase 1 — Proof of Concept (3–5 days) — STOP-AND-REPORT GATE

The goal of Phase 1 is to **prove that OpenCode can host our two hardest customizations** — Qwen3/Merlin provider and Go binary tool — without fighting the framework. Everything else (boilerplate, branding, packaging) can be assumed feasible if these two work.

Do this in a sibling directory, **not** in the existing `mage-cli/`:

```
/Users/bcamaster/Documents/SNZ_Playground/research/
├── mage-cli\           ← keep untouched
└── mage-poc\           ← new, fork of OpenCode
```

### Task 1.1 — Fork and bootstrap

**Goal:** Standalone OpenCode fork that builds and runs.

**Steps:**
1. From `/Users/bcamaster/Documents/SNZ_Playground/research`, clone OpenCode:
   ```
   git clone https://github.com/anomalyco/opencode.git mage-poc
   cd mage-poc
   ```
2. Pin to a known commit: `git log -1 --format="%H %s"`, record the SHA in `MAGE-OPENCODE-NOTES.md` under `## Pinned Upstream`.
3. Install: `bun install` (use Bun per project CLAUDE.md).
4. Build whatever the upstream's "build TUI / CLI" target is (look in root `package.json` scripts or `packages/opencode/package.json`). Try `bun run build`, `bun run dev`, or follow upstream README.
5. Launch the TUI / CLI once with a stub provider (whichever upstream ships by default). Confirm it boots into a chat prompt.

**Verify:** `bun run dev` (or upstream equivalent) drops you into a working OpenCode chat UI.

**Artifacts:** `mage-poc/` directory with a working build, SHA recorded.

---

### Task 1.2 — Build a Qwen3 / Merlin provider

**Goal:** OpenCode talks to our internal Qwen3 endpoint, including thinking-mode handling, using the same request/response shape as `mage-cli/src/llm/qwen3.ts`.

**Steps:**
1. Read `mage-cli/src/llm/qwen3.ts` (it is the spec). Note:
   - Request shape: `{ temperature, username, prompt: { system, messages, enable_thinking, top_p, top_k, min_p } }`.
   - Response shape: `{ content, reasoning_content?, usage? }`.
   - Streaming via SSE (`data: {...}` lines, `[DONE]` sentinel, `delta.reasoning_content` vs `delta.content`).
   - Task-based parameter selection: `chat` → temp 0.7 / topP 0.8 / no thinking; `review|generate|test` → temp 0.6 / topP 0.95 / thinking on.
   - Reasoning trace must NOT be persisted in chat history.
2. In `mage-poc/`, locate the provider abstraction in `packages/opencode/src/provider/`. Read its existing OpenAI / Anthropic providers to understand the shape (constructor, `chat`, `stream`, message conversion).
3. Create a new provider file: `packages/opencode/src/provider/qwen3.ts` (or wherever the convention is). Implement it against the OpenCode interface. Internally, port the request/response logic from Mage. Drop the dependency on Mage's `LlmProvider` interface and use OpenCode's.
4. Register the provider in OpenCode's provider registry (look for a `providers.ts` or similar index).
5. Add a config example showing how a user selects `qwen3` as the active provider with the Merlin endpoint URL.

**Verify:**
- Launch the TUI, set provider to `qwen3`, send `Hello`. The Merlin endpoint receives the request (check network logs / endpoint logs), and the response renders.
- Send a "review" or "generate" task and confirm thinking mode is enabled (look for `reasoning_content` in the raw response and confirm OpenCode separates it from displayed content).
- Confirm reasoning trace is not echoed back into the next user→assistant turn's history.

**Artifacts:** New provider file, updated provider registry, working chat against Merlin.

---

### Task 1.3 — Build a Go binary "mr-review" tool

**Goal:** A user can type `/review <MR_URL>` (or invoke a tool by name from chat) and OpenCode spawns the existing `mr-reviewer` Go binary, streams `[progress]` lines as sub-steps, and renders the JSON findings.

**Steps:**
1. Read `mage-cli/src/binary/runner.ts`, `src/binary/progress.ts`, `src/binary/types.ts`, and `src/review/mr.ts` end-to-end. They are the spec.
2. In `mage-poc/`, locate the tool abstraction in `packages/opencode/src/tool/`. Read 1–2 existing tools (e.g., `bash`, `read`) to understand:
   - Tool definition (name, description, JSON-schema args).
   - How tools are registered.
   - How tools stream progress to the UI.
3. Create `packages/opencode/src/tool/mr-review.ts`. Implement:
   - `name: "mr-review"`, args: `{ url: string, postComments?: boolean }`.
   - `execute()`: spawn the Go binary via `Bun.spawn`, stream stderr line-by-line, parse `[progress] ...` to sub-step events, capture stdout, parse JSON, return structured findings.
   - Reuse the JSON schema from `mage-cli/src/binary/types.ts`.
4. Register the tool in OpenCode's tool registry.
5. Either (a) wire a slash command `/review` that calls this tool when input matches the MR URL pattern, or (b) document that the user types "review this MR: <url>" and the agent decides to call the tool. Pick whichever is idiomatic in OpenCode.
6. Configure the binary path (default `mr-reviewer`) and `GITLAB_TOKEN` env var via OpenCode's config layer (mirror the schema in `mage-cli/src/config/schema.ts`'s `GoBinaryConfigSchema`).

**Verify:**
- With a real MR URL (or a mock binary that emits the expected `[progress]` lines + JSON), invoke `/review <MR_URL>`.
- Sub-steps render as the binary progresses (stderr `[progress]` lines become visible steps).
- Final findings render with severity, file, line, recommendation.
- Exit code != 0 surfaces a clear error.

**Artifacts:** New tool file, registration, working MR review demo.

---

### Task 1.4 — PoC report

**Goal:** A short go/no-go report for the user.

**Steps:**
1. Append to `MAGE-OPENCODE-NOTES.md` a `## PoC Findings` section answering:
   - Did Qwen3 provider integrate cleanly? Any abstraction we had to break?
   - Did the Go binary tool integrate cleanly? Any abstraction we had to break?
   - Estimated total LOC of our additions vs. LOC inherited.
   - Top 3 risks discovered during the PoC.
   - Recommendation: PROCEED to Phase 2, ITERATE on PoC, or ABORT and stay on current Mage.
2. **STOP and report to user.** Do not proceed to Phase 2 without explicit go-ahead.

**Verify:** User has the report, has answered "proceed" or "abort".

**Artifacts:** Updated `MAGE-OPENCODE-NOTES.md` with `## PoC Findings`.

---

## Phase 2 — Adopt the Fork (1–2 days, after go-ahead)

### Task 2.1 — Promote the PoC to the canonical fork

**Goal:** The fork is the new home of Mage. Move it into a permanent location and wire git remotes.

**Steps:**
1. With user agreement, rename / move `mage-poc/` to `mage-on-opencode/` (or another agreed name).
2. Add the upstream as a remote: `git remote add upstream https://github.com/anomalyco/opencode.git`.
3. The default branch (`origin/main` or `origin/master`) becomes our integration branch. Create a long-lived branch `mage/main` for our customizations:
   ```
   git checkout -b mage/main
   git push -u origin mage/main
   ```
4. Document the rebase strategy in `MAGE-OPENCODE-NOTES.md` (`## Rebase Strategy`): pin to a SHA, rebase quarterly, run full test suite after each rebase.

**Verify:** `git log mage/main` shows our PoC commits on top of the pinned upstream SHA.

**Artifacts:** Promoted repo, branch structure, rebase strategy documented.

---

### Task 2.2 — Strip packages we don't need

**Goal:** Smaller surface area, faster builds.

**Steps:**
1. From the OpenCode `packages/` directory, identify packages that are clearly out-of-scope (per `MAGE-OPENCODE-BRIEF.md` §7):
   - `desktop-electron/`, `desktop/`, `web/`, `slack/`, `extensions/zed/`, `enterprise/`, `storybook/`, `containers/` — likely candidates.
2. For each candidate, confirm nothing in `packages/opencode/` (the core CLI) imports from it. Use grep.
3. Delete the package directory.
4. Remove its entry from the root `package.json` workspaces / `bun-workspaces` config.
5. Run `bun install` and `bun run build` to confirm nothing breaks.
6. Commit each deletion separately (one package per commit) so reverting is cheap.

**Verify:** Build still passes. CLI still launches.

**Artifacts:** Trimmed `packages/`, smaller `bun.lock`.

---

## Phase 3 — Branding (1 day)

### Task 3.1 — Rename `opencode` → `mage`

**Goal:** The CLI binary, the package name, and user-visible strings all say "mage".

**Steps:**
1. In root `package.json`: rename `"name"` to `"@mybcabisnis/mage"` (matches current `mage-cli/package.json`).
2. In `packages/opencode/package.json`: rename to whatever maps to the published binary name. Set `"bin": { "mage": "..." }`.
3. Update the published binary's source (find via `bin` in `packages/opencode/package.json`). Most likely `cli/index.ts` or `cli/main.ts`. Replace user-facing strings (`opencode` → `mage`, app banner, version label).
4. Search-and-replace `opencode` → `mage` only in user-visible strings. **Do NOT mass-rename code identifiers, file paths, or imports** — that breaks upstream parity and makes rebases painful. Use targeted edits.
5. Replace any logo / ASCII banner with the Mage banner from `mage-cli/src/ui/Banner.tsx`.

**Verify:** `bun run dev` boots into a TUI labeled "Mage". `mage --version` prints our version. Help text says "mage".

**Artifacts:** Renamed CLI, ported banner.

---

### Task 3.2 — Port Mage's onboarding wizard

**Goal:** First-run UX matches today's Mage onboarding.

**Steps:**
1. Read `mage-cli/src/ui/OnboardingWizard.tsx`. Note the steps it asks (username).
2. In the fork, find where OpenCode handles first-run config. Either:
   - Replace it with a port of `OnboardingWizard.tsx`, or
   - Register a `mage init` command that runs the wizard and writes the config to whatever path OpenCode reads from.
3. Make sure the wizard writes a config that the Qwen3 provider (Task 1.2) and Go binary tool (Task 1.3) can both read.

**Verify:** Fresh machine: `mage init` → wizard prompts → config written → `mage` launches into chat with Qwen3 provider active.

**Artifacts:** Ported onboarding flow.

---

## Phase 4 — Boilerplate System (3–5 days)

### Task 4.1 — Port the manifest schema and loader

**Goal:** OpenCode loads `mage.yaml` boilerplates the same way current Mage does.

**Steps:**
1. Read these files end-to-end:
   - `mage-cli/src/boilerplate/manifest.ts` (Zod schema for `mage.yaml`).
   - `mage-cli/src/boilerplate/loader.ts` (load from disk + git).
   - `mage-cli/src/boilerplate/detector.ts` (project marker detection).
   - `mage-cli/src/boilerplate/profiles.ts` (multi-profile management).
2. Decide where these live in the fork. Reasonable choices, in order of preference:
   - As a plugin: `packages/opencode/src/plugin/boilerplate/` (most idiomatic if OpenCode has a plugin API).
   - As a first-class module under `packages/opencode/src/boilerplate/` (if plugin API is too restrictive).
3. Port the four files. Keep the same `mage.yaml` format unchanged — this is the contract with users' existing boilerplate repos.
4. Wire the loader into the chat prompt assembly so that for a `chat` or `generate` request, the active boilerplate's `conventions/always_include` files are prepended to the system prompt (this is how Mage gives the model project context).

**Verify:**
- Place a known `mage.yaml` boilerplate in `~/.mage/boilerplates/android-mvvm/`.
- Launch Mage in an Android project directory. The status bar / context shows the boilerplate is auto-detected and active.
- Send a chat: "what conventions am I following?" — the model's answer reflects the boilerplate's conventions.

**Artifacts:** Ported boilerplate module, working auto-detection.

---

### Task 4.2 — Port the `/generate` command

**Goal:** `/generate <type> <description>` produces code grounded in the boilerplate's generator file + examples + project files, identical to current Mage behavior.

**Steps:**
1. Read `mage-cli/src/llm/prompt-builder.ts` and `mage-cli/src/core/commands.ts` (the `/generate` handler).
2. In the fork, register `/generate` as a slash command (per OpenCode's command system).
3. The handler: load the active boilerplate's generator manifest entry for `<type>`, load the instruction MD, load examples, scan project for related files, assemble the prompt with the same token budget as Mage (`max_convention_tokens`, `max_example_tokens` from the manifest's `context` block), and submit via the Qwen3 provider with `task: 'generate'`.
4. Render the result with file-write confirmation. Use OpenCode's existing file-write tool if it provides a confirmation UI; otherwise port `mage-cli/src/core/file-writer.ts` and `src/utils/diff.ts`.

**Verify:** With android-mvvm boilerplate active, `/generate service UserAuth` produces a Kotlin file matching the team's conventions, prompts to write to `domain/service/UserAuthService.kt`.

**Artifacts:** Working `/generate`, ported file-writer if needed.

---

### Task 4.3 — Port the `/test`, `/review` (local), and `/boilerplate` commands

**Goal:** Slash command parity with current Mage.

**Steps:**
1. `/test <file>`: read source, load boilerplate's `test` generator entry, build prompt, submit, write output. Spec: `mage-cli/src/core/commands.ts` test handler.
2. `/review <file>` (when arg is a path, not an MR URL): load boilerplate's `review/rules.md`, build review prompt, submit, render findings via the same formatter as MR review. Spec: `mage-cli/src/review/local.ts` and `src/review/formatter.ts`.
3. `/boilerplate list|use|info`: switch the active profile, write to config, refresh the loader cache. Spec: `mage-cli/src/boilerplate/profiles.ts`.
4. `/review <MR_URL>`: should already work via Task 1.3's tool. Make sure the URL-vs-path routing is in place (spec: `mage-cli/src/review/router.ts`).

**Verify:** Each command runs end-to-end against a real or mock setup. Output matches current Mage for the same input within reason (model nondeterminism aside).

**Artifacts:** All slash commands ported.

---

## Phase 5 — Packaging (1–2 days)

### Task 5.1 — Reproduce the BCA artifactory build

**Goal:** `bun publish` (or equivalent) pushes a working binary to `https://artifactory.intra.bca.co.id/...`, installable via `npm install @mybcabisnis/mage`.

**Steps:**
1. Read the current build pipeline:
   - `mage-cli/scripts/build.ts` (compiles TS, bundles, places output in `dist/`).
   - `mage-cli/bin/mage.cjs` (Node-side launcher that delegates to Bun).
   - `mage-cli/bin/postinstall.cjs` (installs platform-specific binaries).
2. Adapt these scripts to the OpenCode fork's directory structure. Key difference: the fork is a monorepo, so the publishable package likely lives in `packages/opencode/`.
3. Update the root or package-level `package.json`:
   - `name`: `@mybcabisnis/mage`.
   - `version`: bump from current `0.0.4` to `0.1.0` to mark the OpenCode-based release.
   - `publishConfig.registry`: BCA artifactory URL.
   - `bin`, `files`, `scripts.prepublishOnly`: mirror current Mage.
4. Test publish to a staging registry first if available; otherwise document the dry-run command.

**Verify:** `bun run build` produces `dist/`. `bun publish --dry-run` shows the expected files. (Do NOT publish for real without user approval.)

**Artifacts:** Working build, dry-run output captured.

---

## Phase 6 — Cleanup and Cutover (1 day)

### Task 6.1 — Smoke test against the spec

**Goal:** Side-by-side comparison with current Mage.

**Steps:**
1. In separate terminals, run current `mage-cli` and the new `mage-on-opencode`.
2. Run the same scenarios in each:
   - First-run init.
   - Boilerplate auto-detect in an Android project.
   - `/generate service Foo`.
   - `/review src/foo.kt`.
   - `/review <MR_URL>` (with the Go binary).
   - `/boilerplate use angular-standalone`.
   - Plain `--plain` mode (if OpenCode supports a non-TUI fallback; if not, document as a regression).
3. Note any regressions in `MAGE-OPENCODE-NOTES.md` under `## Regressions`. Fix or accept each.

**Verify:** No critical regressions. All differentiator features work.

**Artifacts:** Regression report.

---

### Task 6.2 — Archive `mage-cli/`

**Goal:** Make it unambiguous that `mage-on-opencode/` is the canonical implementation, while preserving the history.

**Steps:**
1. **Do not delete `mage-cli/`.** It is the spec and a working fallback.
2. Add a `DEPRECATED.md` to `mage-cli/` pointing to the new repo and explaining the migration.
3. Tag the final pre-migration commit in `mage-cli/`: `git tag -a v0.0.4-final -m "Last release before OpenCode-based rewrite"`.
4. Update the BCA artifactory: leave existing published versions in place; new versions ship from the new repo.

**Verify:** Both repos are in known states. `DEPRECATED.md` explains the situation.

**Artifacts:** Deprecation notice, final tag.

---

## Appendix A — Files to Touch in the Existing Repo

This plan does not require deleting code from `/Users/bcamaster/Documents/SNZ_Playground/mage-cli/` until Phase 6.2. The only new files added to it are:

- `MAGE-OPENCODE-BRIEF.md` (already created — the why).
- `MAGE-OPENCODE-PLAN.md` (this file — the how).
- `MAGE-OPENCODE-NOTES.md` (created in Task 0.1 — accumulating findings).

Everything else lives in the new sibling fork directory.

---

## Appendix B — Quick Reference: Mage Differentiators by File

| Differentiator | Spec file(s) in `mage-cli/` |
|---|---|
| Qwen3 / Merlin client | `src/llm/qwen3.ts`, `src/llm/provider.ts` |
| Task-based LLM params | `src/llm/qwen3.ts` (`getParamsForTask`) |
| Reasoning trace stripping | `src/core/session.ts`, `src/llm/qwen3.ts` |
| Go binary spawn + stderr progress | `src/binary/runner.ts`, `src/binary/progress.ts`, `src/binary/types.ts` |
| MR review flow | `src/review/mr.ts` |
| Local file review | `src/review/local.ts` |
| Review URL vs file routing | `src/review/router.ts` |
| Review findings renderer | `src/review/formatter.ts`, `src/ui/ReviewOutput.tsx` |
| Boilerplate manifest schema | `src/boilerplate/manifest.ts` |
| Boilerplate loader (local + git) | `src/boilerplate/loader.ts`, `src/boilerplate/git.ts` |
| Project auto-detection | `src/boilerplate/detector.ts` |
| Multi-profile management | `src/boilerplate/profiles.ts` |
| Prompt assembly | `src/llm/prompt-builder.ts` |
| File write + diff confirm | `src/core/file-writer.ts`, `src/utils/diff.ts` |
| Step tracker model | `src/core/steps.ts` |
| Onboarding wizard | `src/ui/OnboardingWizard.tsx` |
| BCA packaging | `scripts/build.ts`, `bin/mage.cjs`, `bin/postinstall.cjs`, root `package.json` |

---

## Appendix C — Total Effort Estimate

| Phase | Effort | Notes |
|---|---|---|
| Phase 0 — Preflight | 1–2 hours | Read + map. |
| Phase 1 — PoC (gate) | 3–5 days | The riskiest phase. Stop-and-report. |
| Phase 2 — Adopt fork | 1–2 days | Branch hygiene, strip unused packages. |
| Phase 3 — Branding | 1 day | Targeted renames + onboarding port. |
| Phase 4 — Boilerplate | 3–5 days | The biggest port. |
| Phase 5 — Packaging | 1–2 days | Reproduce artifactory build. |
| Phase 6 — Cutover | 1 day | Smoke test + deprecate old repo. |
| **Total** | **~2–3 weeks** | Excludes ops/legal review. |

Compare to "continue greenfield Mage to feature parity with modern coding agents": estimated 6–12 months. The migration's value is not the differentiator features (those exist in current Mage) but the *foundational* features (tools, LSP, MCP, agents, sessions) that we'd otherwise have to build.

---

*End of plan. Sonnet 4.6 — start at Task 0.1, hard-stop at Task 1.4 for go/no-go.*
