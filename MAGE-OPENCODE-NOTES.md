# Mage on OpenCode — Running Notes

_Created during Phase 0 preflight. Append findings as work progresses._

---

## License (Task 0.1)

- **License**: MIT
- **Attribution string**: `Copyright (c) 2025 opencode`
- **Required action**: Include the above copyright notice and the MIT license text in all copies or substantial portions of the fork. Add to our fork's `LICENSE` file as a secondary notice alongside our own.
- **Copyleft scan**: No GPL or AGPL dependencies found. All major deps (`effect`, `ai`/Vercel AI SDK, `@ai-sdk/*`, `@modelcontextprotocol/sdk`) are MIT or Apache 2.0. Safe to publish internally.

---

## Pinned Upstream (Task 0.1 / Task 1.1)

| Field | Value |
|---|---|
| Upstream shallow clone | `research/opencode-upstream` — SHA `bd1bdc4f` |
| PoC clone | `research/mage-poc` — full clone |
| PoC pinned SHA | `06dde3afd3cc2a70545f42554d3e208ac98dd504` |
| PoC tag | `poc-base` |
| Commit message | `chore: generate` |
| Clone date | 2026-04-21 |
| Boot verified | ✅ `bun run --conditions=browser ./src/index.ts --help` shows full command menu |

---

## Mage Differentiators (Task 0.2)

### 1. Qwen3/Merlin Client (`src/llm/qwen3.ts`)

Wraps the internal Cloud Merlin API, which is **not OpenAI-compatible**. Request shape: `{ client_id, domain_id, config: { persona, temperature, model_name, … }, new_session: 'True', prompt: string, file: '' }`. Response: `{ output_schema: { result: { answer } } }`. No streaming — the API returns full responses; the current provider fakes streaming by yielding a single token. Task type selects a persona string (Indonesian language system prompt) from `PERSONAS` map. No separate `reasoning_content` field — thinking mode is embedded in the persona prompt, not a protocol feature. Reasoning traces are absent from the API's response schema.

### 2. Go Binary Spawn (`src/binary/runner.ts`, `progress.ts`, `types.ts`)

`GoBinaryRunner.reviewMr()` spawns the `mr-reviewer` Go binary via `Bun.spawn`, streams stderr line-by-line, parses `[progress] …` / `[error] …` lines into sub-steps on a `StepTracker`, and captures stdout as JSON. The `MrReviewOutputSchema` (Zod) validates `{ status, mr, findings[], summary, comments_posted }` where each finding has `{ severity, file, line?, title, description, recommendation }`. Exit code != 0 is surfaced to the user. Binary path and `GITLAB_TOKEN` env var come from `GoBinaryConfig` in the app config.

### 3. Boilerplate System (`src/boilerplate/manifest.ts`, `loader.ts`, `detector.ts`, `profiles.ts`)

`mage.yaml` format: `{ name, version, platform, language, conventions: { always_include[], include_for_review?, include_for_testing? }, generators: { [type]: { instruction, examples[], description? } }, project_detection: { markers[] }, context: { max_convention_tokens, max_example_tokens } }`. Loader reads the yaml, resolves instruction files and example files from disk (or git clone via `src/boilerplate/git.ts`), respects token budgets per category. Detector walks configured profiles and checks if all `project_detection.markers` exist in the CWD. Profile manager is pure functions over `MageConfig` (list/add/remove/use/getActive).

### 4. Prompt Assembly (`src/llm/prompt-builder.ts`)

`PromptBuilder` has four task-specific builders: `buildForChat`, `buildForGenerate`, `buildForTest`, `buildForReview`. Each assembles a `{ system, messages[], totalTokens }` result. The system prompt starts with a base Mage identity string, then appends `contextManager.buildSystemPrompt()` (which includes boilerplate conventions), then generator instructions + examples for generate/test, or review rules for review. History trimming is oldest-first to fit a token budget. The `ContextManager` (not read here — lives in `src/core/context.ts`) is the bridge between the loaded boilerplate and the prompt.

### 5. File Write + Diff (`src/core/file-writer.ts`, `src/utils/diff.ts`)

`confirmAndWriteFile()` prints the suggested path, asks "Y/n/custom path", then calls `Bun.write`. Minimal interactive flow — no diff preview before accept (diff is for display after generation). `computeUnifiedDiff()` is a home-grown LCS-based diff generator with a 400k-cell cap; returns a `--- / +++` unified diff string suitable for rendering in a ` ```diff ``` ` block.

### 6. Onboarding Wizard (`src/ui/OnboardingWizard.tsx`)

Ink-based (React) 2-step wizard: (1) domain username (defaults to OS username, used as `domain_id` in Merlin requests), (2) boilerplate path (local path or git URL, optional). Writes a `MageConfig` to `~/.mage/config.json` via `saveConfig`. No Merlin endpoint prompt (it's hardcoded from `CLOUD_MERLIN_CONFIG`). No GitLab host prompt (that was in a previous version; current wizard does not ask).

### 7. BCA Artifactory Packaging (`scripts/build.ts`, `bin/mage.cjs`, `bin/postinstall.cjs`)

`scripts/build.ts` uses `bun build --compile` to produce 5 standalone binaries (win-x64, linux-x64, linux-arm64, darwin-x64, darwin-arm64) in `dist/`. It stubs `ink/build/devtools.js` to avoid a missing `react-devtools-core` dep at compile time, then restores it. `bin/mage.cjs` is a Node launcher that selects the right binary from `dist/` and `spawnSync` it with `stdio: 'inherit'`. `bin/postinstall.cjs` chmods the binary to 0o755 on Unix. Published as `@mybcabisnis/mage` to BCA artifactory.

---

## Subsystem Mapping (Task 0.3)

### OpenCode package layout (relevant subdirs of `packages/opencode/src/`)

```
provider/   — provider.ts (1726 LOC), models.ts, auth.ts, transform.ts, schema.ts, sdk/
tool/       — tool.ts (interface), registry.ts, bash.ts, read.ts, write.ts, edit.ts, glob.ts, grep.ts, …
plugin/     — index.ts (plugin loader + hooks interface), loader.ts, shared.ts, codex.ts, cloudflare.ts
command/    — index.ts (template-based slash commands + MCP prompts + skills)
agent/      — agent.ts (sub-agent orchestration)
session/    — session.ts, message.ts, system.ts, instruction.ts, …
permission/ — index.ts (per-tool allow/deny)
mcp/        — client.ts (MCP client)
lsp/        — server.ts, client.ts, diagnostic.ts (LSP integration)
config/     — agent.ts, command.ts, config.ts, provider.ts, …
cli/        — bootstrap.ts, cmd/ (CLI subcommands), logo.ts
```

### Mapping table

| Mage Differentiator | OpenCode Extension Point | Notes |
|---|---|---|
| Qwen3/Merlin client | `provider/provider.ts` → `custom()` function | Must implement `LanguageModelV3` from `@ai-sdk/provider`. Merlin API is NOT OpenAI-compatible; `@ai-sdk/openai-compatible` won't work out of the box. Requires custom HTTP fetch + response mapping. **Highest PoC risk.** |
| Go binary MR review | `tool/` via drop-in file | Tool registry scans `{tool,tools}/*.{js,ts}` in config dirs. Drop a `mr-review.ts` there — no core modification required. Tool uses `Bun.spawn`, streams stderr, parses `[progress]` lines, returns structured output. |
| Boilerplate system | `plugin/` as workspace plugin | Plugin's `Hooks` interface is the right host. A boilerplate plugin injects conventions into the system prompt via the `session.system` or `tool.definition` hook. Slash commands (`/generate`, `/test`) can't be implemented as simple text templates — they require a tool that loads the boilerplate and calls the LLM. Need to implement them as tools or a custom plugin command handler. |
| Prompt assembly | Handled inside plugin | The plugin reads the active boilerplate and prepends conventions to the system prompt. `ContextManager` from current Mage maps to the plugin's system-prompt injection hook. |
| Onboarding wizard | `cli/cmd/` — new subcommand | Register a `mage init` CLI subcommand in `cli/cmd/`. The wizard writes config to wherever OpenCode's `Config` reads from (verify in `config/config.ts`). Must write keys that the Qwen3 provider and mr-review tool can consume. |
| File write + diff | Already in OpenCode | `tool/write.ts` and `tool/edit.ts` provide full file-write + diff confirmation. DROP `src/core/file-writer.ts` and `src/utils/diff.ts`. No porting needed. |
| BCA artifactory packaging | Root/package scripts | Port `scripts/build.ts` entry point to target OpenCode's `packages/opencode/src` entry. The `bin/mage.cjs` and `bin/postinstall.cjs` pattern is identical — reuse as-is with updated dist paths. |

### Key structural discoveries

1. **Command system is template-based, not code**: `/review`, `/generate`, etc. in OpenCode are prompt templates with `$ARGUMENTS` substitution. They are NOT code handlers. Implementing `/generate <type> <description>` with full boilerplate loading requires either a dedicated tool the agent calls, or a plugin command handler with custom logic. This is a meaningful architectural difference from current Mage.

2. **Provider system uses Vercel AI SDK (`ai`)**: All providers return a `LanguageModelV3` (from `@ai-sdk/provider`). The Merlin API is entirely custom (non-standard request format, always `new_session: 'True'`, flat `prompt` string instead of a `messages` array, custom response envelope). We must implement a full `LanguageModelV3` adapter. There is no thin "just provide a URL" shortcut.

3. **Tool drop-in is the cleanest extension point**: No core modification needed. Place `mr-review.ts` (and any other tools) in a directory that OpenCode's `config.directories()` returns and they are auto-loaded. Ideal for keeping upstream rebases clean.

4. **No streaming in Merlin API**: Current Mage simulates streaming by yielding one token. OpenCode's UI expects streaming text. The `LanguageModelV3` `doStream()` method can do the same simulation — yield the full response as a single delta. This is compatible with OpenCode's rendering.

5. **Packages to strip**: `packages/desktop-electron`, `packages/desktop`, `packages/web`, `packages/slack`, `packages/extensions`, `packages/enterprise`, `packages/storybook`, `packages/containers` — none are imported by `packages/opencode`. Safe to delete in Phase 2.

---

---

## PoC Findings (Task 1.4)

### Did the Qwen3/Merlin provider integrate cleanly?

**Yes, with one important nuance.** The Merlin API is not OpenAI-compatible, but OpenCode's `BUNDLED_PROVIDERS` map accepts any factory that returns a `{ languageModel(id) }` object — so we implemented a full `LanguageModelV3` adapter in `packages/opencode/src/provider/merlin.ts` and registered it with a 1-line edit to `provider.ts`. No other core code was touched.

The only "abstraction we bent": we simulate streaming (`doStream`) by calling `doGenerate` internally and emitting the full response as a single `text-delta` chunk. OpenCode's UI handles this gracefully — it renders the response as one block rather than token-by-token. Acceptable for Merlin since the API is non-streaming.

Verified: `opencode models merlin` shows `merlin/qwen3`. Network call confirmed by "Unable to connect" error (we're outside BCA intranet — proving the request was formed and dispatched). 4 unit tests pass.

### Did the Go binary tool integrate cleanly?

**Yes, cleaner than expected.** The tool drop-in directory (`.opencode/tool/*.ts`) is auto-scanned by the tool registry — zero core modifications needed. The tool implements the `ToolDefinition` shape from `@opencode-ai/plugin`, streams `[progress]` lines as `ctx.metadata({ title })` updates (which surface as live status in the TUI), and returns formatted markdown findings.

Mock binary test (2/2 pass) confirms: progress lines render as metadata updates, JSON output parses correctly, findings format correctly with severity groups.

### Estimated LOC

| Layer | LOC | Notes |
|---|---|---|
| Merlin provider adapter | ~245 | `merlin.ts` incl. types, factory, model class |
| mr-review tool | ~200 | `mr-review.ts` incl. formatter, progress parser |
| Core modification | 1 | `provider.ts` BUNDLED_PROVIDERS entry |
| **Ours total (non-test)** | **~446** | |
| Inherited from OpenCode | ~50,000+ | Provider infra, session, tool registry, LSP, MCP, agent, TUI … |

The 3,000 LOC target for the differentiator layer (from the brief's success criteria §7) is very achievable — Phase 1 alone covers the two hardest pieces in ~446 LOC.

### Top 3 risks discovered

1. **Merlin network access** — The corporate Merlin endpoint is only reachable from BCA's intranet. Development and testing require either VPN or testing with a mock server. All PoC tests were run with unit-test mocks; live end-to-end requires on-network.

2. **OpenCode upstream churn** — OpenCode is actively developed. The `LanguageModelV3` spec is at v3; if it bumps to v4, our `merlin.ts` needs an update. The 1-line `BUNDLED_PROVIDERS` entry will survive most rebases (it's at the top of a large file). Risk is manageable with quarterly rebase cadence.

3. **Command system vs. slash commands** — OpenCode's `/` commands are prompt templates (text substitution), not code. The `/generate`, `/test`, `/boilerplate` commands from current Mage cannot be implemented as templates — they require a custom plugin or additional drop-in tools. This is the biggest remaining architectural gap to close in Phases 3–4, but it's not a blocker for the fork itself.

### Recommendation

**PROCEED to Phase 2.**

Both hard integrations work without fighting the framework. The Go binary is a zero-core-modification drop-in. The Merlin provider is 245 LOC + 1-line core change. OpenCode inherits tools, sessions, LSP, MCP, agents, and permission system for free. The Phase 1 PoC de-risks the migration; the remaining phases (branding, boilerplate, commands) are all straightforward ports.

---

---

## Rebase Strategy (Task 2.1)

| Item | Value |
|---|---|
| Fork location | `research/mage-poc/` |
| Upstream remote | `upstream → https://github.com/anomalyco/opencode.git` |
| Our branch | `mage/main` (all Mage customizations live here) |
| Upstream base branch | `dev` (OpenCode's default) |
| Pinned upstream SHA | `06dde3afd3cc2a70545f42554d3e208ac98dd504` |

**Rebase cadence:** Quarterly. Steps:
1. `git fetch upstream`
2. `git rebase upstream/dev` on `mage/main`
3. Resolve conflicts (expect: `provider.ts` BUNDLED_PROVIDERS line, `.opencode/` files)
4. Run `bun install && bun test` to confirm no regressions
5. Update pinned SHA in this notes file

**Files most likely to conflict on rebase:**
- `packages/opencode/src/provider/provider.ts` (1-line BUNDLED_PROVIDERS addition)
- `.opencode/opencode.jsonc` (provider config)
- Any future edits to `packages/opencode/src/index.ts` (CLI entry)

_Phase 2 Task 2.1 complete._

---

---

## Branding Changes (Phase 3 Task 3.1)

### Files changed

| File | Change |
|---|---|
| `packages/opencode/src/cli/logo.ts` | Replaced 8-letter `opencode` split logo with 4-letter `MAGE` split (MA\|GE) using same block-char draw system |
| `packages/opencode/src/cli/ui.ts` | Replaced `wordmark` array with MAGE 4-letter block art |
| `packages/opencode/src/index.ts` | `.scriptName("opencode")` → `.scriptName("mage")` |
| `packages/opencode/package.json` | `"name": "opencode"` → `"@mybcabisnis/mage"`, `"bin": {"opencode":…}` → `{"mage":…}` |
| Root `package.json` | `"name": "opencode"` → `"mage"` |
| `src/cli/cmd/tui/thread.ts` | Describe string + positional description |
| `src/cli/cmd/run.ts` | Describe strings |
| `src/cli/cmd/serve.ts` | Describe + console.log |
| `src/cli/cmd/upgrade.ts` | Describe + user-facing log messages |
| `src/cli/cmd/uninstall.ts` | Describe string |
| `src/cli/cmd/web.ts` | Describe string |
| `src/cli/cmd/tui/attach.ts` | Describe string |
| `src/cli/cmd/pr.ts` | Describe + spawn calls now invoke `mage` |
| `src/cli/cmd/mcp.ts` | "Add servers with: mage mcp add" message |
| `src/cli/error.ts` | Error message strings |
| `src/cli/network.ts` | mDNS default domain → `mage.local` |
| `src/cli/cmd/tui/feature-plugins/home/tips-view.tsx` | All `opencode run/serve/upgrade/auth/agent/debug` → `mage …`; removed GitHub Actions + Docker tips |

### Intentionally NOT changed (upstream parity)
- `.opencode/` directory paths and `opencode.json` config file names (filesystem convention — Phase 5 if needed)
- `@opencode-ai/` import paths and `OPENCODE_*` env var names
- Code identifiers like `createOpencodeClient`, `opencode-debug`
- `github.ts` GitHub Actions integration (BCA doesn't use)

### Verification
`mage --help` output contains zero "opencode" references. All subcommand descriptions, positional descriptions, mDNS domain default, and user-facing log messages are updated.

_Phase 3 Task 3.1 complete._

---

---

## Onboarding Wizard (Phase 3 Task 3.2)

### Implementation

New file: `packages/opencode/src/cli/cmd/init.ts`  
Registered as `.command(InitCommand)` in `src/index.ts` (placed first in the list).

### Flow

`mage init` — two prompts using `@clack/prompts` (same library as other commands):

1. **BCA domain username** — defaults to `os.userInfo().username`; written to `providers.merlin.options.username`
2. **Team boilerplate path** (optional) — local path or git URL; written to `mage.boilerplate` for Phase 4

### Config write location

`~/.config/opencode/opencode.jsonc` (= `Global.Path.config + "/opencode.jsonc"`)

Written format:
```json
{
  "providers": {
    "merlin": {
      "options": { "username": "<domain_username>" }
    }
  },
  "mage": { "boilerplate": "<optional path>" }
}
```

This merges with the project-level `.opencode/opencode.jsonc` (which holds `api`, `npm`, `clientId`, model definitions). At runtime `provider.ts:1393` spreads `provider.options` directly into the `createMerlin()` call — so `username` from the global config flows into every Merlin request as `domain_id`.

### Why no first-run auto-trigger

OpenCode has no canonical first-run hook. Rather than adding a middleware check, `mage init` is an explicit command. Users run it once after install; the boilerplate profile from `mage-cli/src/ui/OnboardingWizard.tsx` is preserved as `mage.boilerplate` for use by the Phase 4 boilerplate loader.

_Phase 3 Task 3.2 complete._

---

## Boilerplate System (Phase 4)

### Phase 4.1 — Plugin (`boilerplate.ts`)

New file: `.opencode/plugin/boilerplate.ts` (~300 LOC)

Auto-loaded via `ConfigPlugin.load()` — scans `{plugin,plugins}/*.{ts,js}` in each config dir; no `opencode.jsonc` registration needed.

**Reads config from** (in priority order):
1. Project `.opencode/opencode.jsonc` — `mage.boilerplate` key
2. Global `~/.config/opencode/opencode.jsonc` — `mage.boilerplate` key
3. `mage.activeBoilerplate` (for multi-profile setups)

**`mage.yaml` manifest schema** (parsed with the `yaml` npm package — already a transitive dep):
```yaml
name: string
version: string
platform: string
language: string
conventions:
  always_include: string[]       # pushed to every system prompt
  include_for_review: string[]
  include_for_testing: string[]
generators:
  <type>:
    instruction: path            # returned by mage_boilerplate_context
    examples: path[]
    description: string
project_detection:
  markers: string[]
context:
  max_convention_tokens: number
  max_example_tokens: number
```

**Hook registered:**
- `"experimental.chat.system.transform"` — pushes `always_include` convention files as a `## Project Conventions` block into every system prompt

**Tools registered:**
| Tool | Args | Returns |
|---|---|---|
| `mage_boilerplate_context` | `type: string` | instruction + examples for a generator type |
| `mage_boilerplate_review_rules` | — | `include_for_review` convention files |
| `mage_boilerplate_test_conventions` | — | `include_for_testing` convention files |
| `mage_boilerplate_manage` | `action: list\|info\|use`, `name?: string` | profile list / info / switch |

Profile switching (`action: "use"`) writes `mage.activeBoilerplate` to the global config and reloads the manifest.

### Phase 4.2 — `/generate` slash command

`.opencode/command/generate.md` — instructs agent to call `mage_boilerplate_context(type)` then generate code using the returned instruction/examples, confirm path, then `write`.

### Phase 4.3 — `/review`, `/test`, `/boilerplate` slash commands

`.opencode/command/review.md` — routes GitLab MR URLs to `mr_review` tool; file paths to `read` + `mage_boilerplate_review_rules` + structured report.

`.opencode/command/test.md` — reads source file, calls `mage_boilerplate_test_conventions`, generates tests matching team patterns, writes to mirrored test path.

`.opencode/command/boilerplate.md` — routes `list`/`info`/`use <name>` to `mage_boilerplate_manage`.

### Tests

`.opencode/plugin/boilerplate.test.ts` — 6 tests, all pass:
```
 6 pass  0 fail  11 expect() calls  [77ms]
```

Tests cover: export shape, init with no config, system transform injection, context tool (valid type), context tool (unknown type), manage list.

### Key implementation notes

- `yaml` package is already in `.opencode/node_modules` as a transitive dep of `@opencode-ai/plugin`; no new dep needed.
- Plugin is fully self-contained — no imports from `packages/opencode/src/`.
- Token budgeting (`max_convention_tokens`, `max_example_tokens`) is enforced by rough `approxTokens()` estimation; files are dropped if combined content exceeds the budget.

_Phase 4 complete._

---

## BCA Artifactory Packaging (Phase 5)

### Task 5.1 — Build and publish setup

**Strategy:** Ported the flat-`dist/` distribution approach from `mage-cli/` rather than using OpenCode's upstream npm optional-packages model. Simpler for BCA artifactory: one tarball, five binaries.

**New files:**

| File | Purpose |
|---|---|
| `packages/opencode/script/build-bca.ts` | Adapted build outputting `dist/mage-{os}-{arch}[.exe]` flat binaries (keeps Web UI embedding, skips GitHub release upload) |
| `packages/opencode/bin/mage.cjs` | Node.js launcher — resolves platform binary from `../dist/`, no Bun required at runtime |
| `packages/opencode/bin/postinstall.cjs` | `chmod 755` on the platform binary after `npm install` on Unix |

**`package.json` changes** (`packages/opencode/package.json`):

| Field | Old | New |
|---|---|---|
| `version` | `1.14.19` | `0.1.0` |
| `private` | `true` | `false` |
| `bin` | `"mage": "./bin/opencode"` | `"mage": "./bin/mage.cjs"` |
| `files` | (none) | `["dist/", "bin/"]` |
| `publishConfig.registry` | (none) | BCA artifactory URL |
| `scripts.build:bca` | (none) | `bun run script/build-bca.ts` |
| `scripts.prepublishOnly` | (none) | `bun run build:bca` |
| `scripts.postinstall` | (none) | `node bin/postinstall.cjs` |

**Dry-run command** (do NOT run without user approval):
```sh
cd packages/opencode
bun publish --dry-run
```

**Full build command** (all 5 platforms):
```sh
cd packages/opencode
bun run build:bca
```

**Single-platform build** (current machine, faster):
```sh
bun run build:bca -- --single
```

### Key differences from upstream OpenCode build

- OpenCode upstream: platform-specific optional npm packages in `dist/<pkg>-<os>-<arch>/bin/opencode` + optional-dependencies model
- BCA build: flat `dist/mage-<os>-<arch>` binaries + simple `bin/mage.cjs` launcher → works with a plain `npm publish` to artifactory

_Phase 5 complete._

---

## Smoke Test and Regressions (Phase 6)

### Task 6.1 — Smoke test results

All non-interactive checks run against `bun run --conditions=browser ./src/index.ts` in `packages/opencode/`.

#### CLI surface

| Scenario | Result |
|---|---|
| `mage --version` | ✅ prints `local` |
| `mage --help` | ✅ MAGE logo, all commands branded `mage`, zero "opencode" strings in output |
| `mage init --help` | ✅ `set up mage for first use` |
| `mage run --help` | ✅ all options present, no opencode leakage |
| `mage providers --help` | ✅ |
| `mage serve --help` | ✅ |
| `mage run "say hello" --format json` | ✅ server starts, session spawns, `step_start` event streams |
| No "opencode" in any --help output | ✅ CLEAN |

#### Boilerplate plugin

All 6 unit tests pass (83 ms):
- Plugin export shape ✅
- Init with no config ✅
- System transform injects conventions ✅
- `mage_boilerplate_context` valid type ✅
- `mage_boilerplate_context` unknown type error ✅
- `mage_boilerplate_manage list` ✅

#### Interactive TUI scenarios

These require a live Merlin API key + terminal session and cannot be automated:

| Scenario | Status |
|---|---|
| `mage init` — BCA domain username prompt | Not tested in CI — requires TTY |
| Boilerplate auto-detect in Android project | Not tested — requires TTY + Merlin |
| `/generate service Foo` | Not tested — requires TTY + Merlin |
| `/review src/foo.kt` | Not tested — requires TTY + Merlin |
| `/review <MR_URL>` (Go binary) | Not tested — requires TTY + binary |
| `/boilerplate use angular-standalone` | Not tested — requires TTY |

These should be validated during first real deployment against BCA's Merlin endpoint.

### Regressions

#### `--plain` readline mode — ACCEPTED

**Old:** `mage --plain` started a dumb-terminal readline REPL (no Ink, no color, no mouse). Useful for CI log scraping or SSH sessions without a proper PTY.

**New:** Not present. Equivalent: `mage run "..." --format json` streams structured JSON events to stdout — covers the scripting / CI use case.

**Verdict:** Accepted. The readline REPL was Qwen3-specific scaffolding, not a BCA-documented requirement. `mage run --format json` serves the scripting use case. Interactive headless usage is out of scope for the Mage-on-OpenCode target.

_Phase 6 Task 6.1 complete._

---

## Archive (Phase 6 Task 6.2)

- `DEPRECATED.md` added to `mage-cli/` explaining the migration and migration guide
- Committed archival artifacts on `main`: `3ee7423`
- Tagged: `v0.0.4-final` — "Last release before OpenCode-based rewrite"
- Existing published versions on BCA artifactory remain valid; new versions (`>=0.1.0`) ship from `mage-poc`

_Phase 6 complete. Migration done._
