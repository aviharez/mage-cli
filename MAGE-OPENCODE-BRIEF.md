# Mage on OpenCode — Decision Brief

**Version:** 1.0
**Date:** 2026-04-20
**Author:** Syifa (with Opus 4.7)
**Audience:** Sonnet 4.6 (execution model) + project owner
**Companion doc:** `MAGE-OPENCODE-PLAN.md` (executable task plan)

---

## 1. The Question

We have two viable paths to ship Mage as a production developer assistant:

- **A — Continue building Mage from scratch** (current path: ~4,600 LOC in `src/`, Phase 1–3 of `PLAN-DETAILED.md` complete, Phase 4 partial).
- **B — Fork OpenCode** (`https://github.com/anomalyco/opencode.git`) and re-skin / re-target it for our internal needs (Qwen3 via Merlin, Go binary MR review, boilerplate-driven generation, BCA artifactory packaging).

This brief recommends a path and frames the work so Sonnet 4.6 can execute it without re-deriving the analysis.

---

## 2. What We Have Today (Mage v0.0.4)

Build status from the working tree:

| Area | State |
|---|---|
| CLI entry, citty subcommands | ✅ Working (`src/cli.ts`) |
| Config (Zod, `~/.mage/config.json`) | ✅ Working (`src/config/`) |
| Step tracker + Ink step log | ✅ Working (`src/core/steps.ts`, `src/ui/StepLog.tsx`) |
| Qwen3 / Merlin client (streaming + thinking mode) | ✅ Working (`src/llm/qwen3.ts`, 192 LOC) |
| Interactive Ink chat UI | ✅ Working (`src/ui/App.tsx`, 503 LOC) |
| Slash commands (`/generate`, `/test`, `/review`, `/clear`, etc.) | ✅ Working (`src/core/commands.ts`, 653 LOC) |
| Local file review via Qwen3 | ✅ Working (`src/review/local.ts`) |
| MR review via Go binary spawn | ✅ Working (`src/review/mr.ts`, `src/binary/runner.ts`) |
| Boilerplate loader (local + git, mage.yaml) | ✅ Working (`src/boilerplate/`) |
| File write + diff display | ✅ Working (`src/core/file-writer.ts`, `src/utils/diff.ts`) |
| Onboarding wizard | ✅ Working (`src/ui/OnboardingWizard.tsx`) |
| BCA artifactory publish (`@mybcabisnis/mage`) | ✅ Working (`scripts/build.ts`, `bin/`) |

What we **don't** have (and would have to build from scratch on path A):

- Tool calling / function calling loop (read file, write file, run bash, search code) — the agentic primitive.
- File-system tools the model can invoke autonomously (today the model only emits text; the user accepts/rejects file writes).
- LSP integration (diagnostics, go-to-def, hover) for grounded edits.
- MCP client support (so we can plug in third-party tool servers).
- Multi-provider abstraction beyond Qwen3 (useful for local dev with Ollama/Claude).
- Persistent session storage and resume.
- Permission system (per-tool allow/deny, like Claude Code).
- Plugin system (currently stubbed in `src/plugins/` but not implemented).
- Sub-agents / agent orchestration (a "review" sub-agent, a "planner" sub-agent).

These are **the bulk of what makes a modern AI coding assistant useful in 2026**. Building them well is each a multi-week effort.

---

## 3. What OpenCode Brings

From inspecting the repo structure (`packages/opencode/src/`):

**Core packages we'd inherit:**

- `provider/` — multi-provider LLM abstraction (Claude, OpenAI, Google, local).
- `session/` — chat session state, persistence, resume.
- `tool/` — tool calling loop (file read/write, bash, search, edit).
- `agent/` — agent orchestration (build agent, plan agent, sub-agents).
- `command/` + `cli/` — slash commands and CLI parsing.
- `mcp/` — Model Context Protocol client.
- `lsp/` — Language Server Protocol integration.
- `permission/` — per-tool permission gates.
- `plugin/` — plugin loading.
- `auth/`, `config/`, `storage/`, `git/`, `shell/`, `pty/` — supporting infra.
- `server/` — client/server split (TUI talks to a local server).

**Other packages:** `ui` (TUI), `web` (web app), `desktop` / `desktop-electron`, `sdk`, `extensions/zed`, `enterprise`. We would only adopt what we need.

**Non-trivial:** OpenCode is TypeScript + Bun (matches our stack) and MIT-licensed (compatible with closed internal use, attribution required). The architecture is a monorepo with strong package boundaries, which means we can adopt a subset.

---

## 4. Tradeoffs

| Dimension | Continue Mage (Path A) | Fork OpenCode (Path B) |
|---|---|---|
| Time to feature parity with modern AI assistants | 6–12 months of greenfield work | 2–4 weeks of integration + branding |
| Code we own and understand | 100% (4.6 KLOC, all in head) | Initially ~5%, ramps up as we touch code |
| Code we maintain | Small, focused | Larger surface, but most of it is "free" (upstream maintains it) |
| Upstream churn risk | None | High — OpenCode evolves fast; rebasing or pinning required |
| Customization difficulty | Trivial (it's our code) | Medium — must work within OpenCode's abstractions |
| Risk of misaligned upstream priorities | None | Medium — if AnomalyCo pivots we may have to harden a fork |
| Differentiators we must build either way | Qwen3 provider, Go binary MR review, boilerplate system, BCA packaging | Same three, plus an "OpenCode → Mage" rebrand |
| Match with team's stated direction | Already invested, working product | Bigger leap, but unlocks "Claude Code-class" UX |
| Cost of being wrong | Months of work, but recoverable | Weeks of fork setup, then commit to the upstream's worldview |

**The deciding question:** *Do we want Mage to be a thin internal wrapper around Qwen3+Go-binary, or do we want it to be a real coding agent (tools, LSP, MCP, agents) with internal-Qwen3 as one provider?*

If the former, **stay on Path A.** Mage is already 70%+ done.

If the latter, **switch to Path B.** The cost of building tools/LSP/MCP/agents from scratch dwarfs the cost of forking and integrating.

---

## 5. Recommendation

**Fork OpenCode (Path B)**, with three guard-rails:

1. **Time-box a 1-week proof-of-concept** before fully committing. The PoC must demonstrate (a) a custom Qwen3/Merlin provider plugged into OpenCode's provider interface, and (b) a Go binary tool callable by an OpenCode agent. If either fails or feels structurally wrong, fall back to Path A.
2. **Keep the current Mage repo as-is** during the PoC. Don't delete anything until Path B is validated. The Qwen3 client, Go binary runner, boilerplate manifest format, and onboarding flow are all directly portable as reference implementations.
3. **Plan to fork, not contribute upstream.** The customizations (BCA-only Qwen3 endpoint, internal artifactory, MR Go binary, boilerplate system) are not generally useful, so PRs back are unlikely. Pin to a known-good OpenCode commit and rebase deliberately on a quarterly cadence.

**Why this recommendation:**

- The "tool calling loop + sub-agents + LSP + MCP" gap between Mage today and a modern coding assistant is wide, and closing it from scratch is the dominant cost in either path.
- Our differentiators (Qwen3 endpoint, Go binary, boilerplate) are surface-level integrations — they fit naturally into OpenCode's provider/tool/plugin extension points.
- The current Mage codebase becomes the spec / reference: porting from "working Mage" into "Mage-on-OpenCode" is concrete, not speculative.

**Risks of this recommendation:**

- OpenCode's abstractions may not bend the way we want (e.g., the boilerplate-driven prompt assembly might be awkward to express as a "plugin"). Mitigation: PoC.
- License attribution and any upstream dependencies must be cleared with BCA legal before publishing internally. Mitigation: Phase 0 task in the plan.
- Team has to learn the OpenCode codebase. Mitigation: rebrand and integration are good ramp-up tasks.

---

## 6. Success Criteria

The migration is "done" when:

1. `mage` (the binary, installed from BCA artifactory) launches an OpenCode-derived TUI.
2. The default provider is Qwen3 via the corporate Merlin endpoint, with thinking mode handling preserved.
3. `/review <MR_URL>` invokes the Go binary as a tool and renders results identically to today's Mage.
4. `/generate <type> <description>` loads the active boilerplate (mage.yaml) and produces code grounded in conventions + examples — feature parity with current Mage.
5. Users can still run `mage init` to onboard, `mage boilerplate use <name>` to switch, and `mage --plain` for non-Ink fallback.
6. We gain — for free — tool calling, file read/write/edit tools, bash tool, LSP-grounded edits, and at least one MCP integration demo.
7. Total LOC we own (excluding vendored OpenCode) stays under ~3,000 LOC for the differentiator layer.

---

## 7. Out of Scope for This Migration

- Web app, desktop Electron app, Slack integration, Zed extension (drop these packages from the fork).
- Multi-tenant enterprise features.
- Anything that requires AnomalyCo's hosted services.
- Replacing the Go binary with native code (it stays as a child-process tool).

---

## 8. Handoff to Sonnet 4.6

The accompanying `MAGE-OPENCODE-PLAN.md` is the executable plan. Each phase has discrete, verifiable tasks. Read this brief first for the *why*, then work the plan top-to-bottom. **Stop after Phase 1 (the PoC) and report back** before continuing into Phase 2+ — the PoC is the go/no-go gate.

If at any point the plan conflicts with reality on the ground (OpenCode's actual code shape differs from what we assumed), prefer reality and update the plan rather than forcing the steps.
