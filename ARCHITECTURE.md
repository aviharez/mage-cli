# Architecture

Mage is a monorepo built on [Bun](https://bun.sh) workspaces. The main application lives in `packages/opencode` and is a heavily extended fork of [OpenCode](https://github.com/anomalyco/opencode).

---

## Repository Layout

```
mage-poc/
├── packages/
│   ├── opencode/        # Main application (CLI, TUI, server, AI engine)
│   ├── plugin/          # Plugin SDK — types and interfaces for extensions
│   ├── script/          # Shared build utilities
│   ├── sdk/js/          # Public JavaScript SDK for external consumers
│   └── shared/          # Shared utilities (glob, filesystem, error handling)
├── sdks/
│   └── vscode/          # VS Code extension
├── .opencode/           # Project-level Mage config (commands, tools, plugins)
├── specs/               # OpenAPI specifications
├── infra/               # Deployment configuration
├── nix/                 # Nix flake for reproducible dev environments
└── script/              # Root-level utility scripts
```

---

## packages/opencode

The core package. Produces a self-contained binary (`mage`) that embeds the Bun runtime. All paths below are relative to `packages/opencode/`.

### Entry Points

| File | Purpose |
|------|---------|
| `src/index.ts` | Main entry point. Registers all CLI commands with yargs and starts the process. |
| `src/node.ts` | Node.js-compatible runtime entrypoint. |
| `bin/mage.cjs` | Node.js launcher used after `npm install`. Resolves the correct platform binary from `dist/` and spawns it. |
| `bin/postinstall.cjs` | Post-install hook that `chmod 755`s the platform binary on Unix. |
| `bin/opencode` | Original upstream launcher (npm optional-packages model, kept for reference). |

### Build Scripts (`script/`)

| File | Purpose |
|------|---------|
| `build.ts` | Upstream multi-platform build (produces optional npm packages per platform). |
| `build-bca.ts` | BCA-specific build. Outputs flat `dist/mage-{os}-{arch}` binaries for artifactory publishing. Embeds the Web UI and Bun runtime. |
| `generate.ts` | Generates Zod schemas and TypeScript types from specs. |
| `schema.ts` | Schema generation utilities. |
| `check-migrations.ts` | Validates database migrations before build. |
| `fix-node-pty.ts` | Post-install fix for `node-pty` native bindings. |
| `upgrade-opentui.ts` | Helper to bump the `@opentui` dependency. |
| `publish.ts` | npm registry publish helper. |
| `trace-imports.ts` | Dependency graph analyser for debugging bundle size. |

---

## src/ Module Map

### CLI (`src/cli/`)

The command-line interface layer. All user-facing commands live here.

| File | Purpose |
|------|---------|
| `cli/ui.ts` | Renders the MAGE block-art logo and shared UI helpers (error/info formatting). |
| `cli/logo.ts` | Logo split used in the startup splash screen. |
| `cli/error.ts` | Maps internal errors to user-readable CLI messages. |
| `cli/network.ts` | Network option parsing; mDNS default domain (`mage.local`). |
| `cli/upgrade.ts` | Version upgrade checker and installer. |
| `cli/heap.ts` | Memory diagnostics helper. |
| `cli/bootstrap.ts` | CLI bootstrap sequence (loads config, sets up Effect runtime). |

#### Commands (`src/cli/cmd/`)

| File | Purpose |
|------|---------|
| `init.ts` | `mage init` — onboarding wizard (username + boilerplate). Exports `isFirstRun()` and `runInitWizard()` used for auto first-run detection. |
| `run.ts` | `mage run` — sends a single message and streams the response without the TUI. |
| `serve.ts` | `mage serve` — starts a headless HTTP server. |
| `web.ts` | `mage web` — starts the server and opens the web UI in a browser. |
| `models.ts` | `mage models` — lists all models available for the configured providers. |
| `providers.ts` | `mage providers` — manages provider credentials (login/logout/list). |
| `agent.ts` | `mage agent` — manages named agents. |
| `mcp.ts` | `mage mcp` — manages MCP (Model Context Protocol) server configs. |
| `session.ts` | `mage session` — lists and manages saved sessions. |
| `stats.ts` | `mage stats` — shows token usage and cost statistics. |
| `export.ts` | `mage export` — exports session data as JSON. |
| `import.ts` | `mage import` — imports session data from a file or URL. |
| `upgrade.ts` | `mage upgrade` — upgrades the binary to a newer version. |
| `uninstall.ts` | `mage uninstall` — removes the binary and all related files. |
| `pr.ts` | `mage pr` — checks out a GitHub PR branch and opens Mage in that context. |
| `github.ts` | `mage github` — GitHub agent management. |
| `db.ts` | `mage db` — database inspection and migration tools. |
| `debug.ts` | `mage debug` — dumps diagnostics for bug reports. |
| `plug.ts` | `mage plugin` — installs a plugin and updates config. |
| `completion.ts` | `mage completion` — generates shell completion scripts. |

#### TUI (`src/cli/cmd/tui/`)

The terminal UI is built with [Solid.js](https://www.solidjs.com/) via the `@opentui` renderer. It runs in a two-process model: a main thread and a worker.

| File | Purpose |
|------|---------|
| `thread.ts` | TUI entry handler. Checks for first-run (`isFirstRun()`), spawns the worker process, sets up RPC, and hands off to the Solid app. |
| `worker.ts` | Worker process. Runs the HTTP server and Effect runtime; communicates with the main thread via RPC. |
| `app.ts` | Solid.js application root. Mounts all TUI panels. |
| `event.ts` | Cross-thread event bridge (Worker ↔ main). |
| `attach.ts` | `mage attach` — attaches to an already-running Mage server. |
| `win32.ts` | Windows-specific Ctrl+C and input handling. |
| `config/tui.ts` | Reads and validates `tui.json` (keybinds, theme, layout). |

`feature-plugins/` contains the individual UI panels (chat, sessions, home/tips, settings, diff viewer, etc.) as Solid components.

---

### Configuration (`src/config/`)

| File | Purpose |
|------|---------|
| `config.ts` | Main config schema (Effect Schema + Zod strict). Defines all valid keys including the `mage` block (`boilerplate`, `activeBoilerplate`). Loads and merges global (`~/.mage/mage.jsonc`) and project-level (`.opencode/opencode.jsonc`) config files. |
| `paths.ts` | Resolves `.opencode/` config directory candidates by walking up the filesystem from CWD. |
| `plugin.ts` | Scans `{plugin,plugins}/*.{ts,js}` in each config dir and returns plugin specs. Skips `*.test.ts` files. |
| `provider.ts` | Schema for provider config blocks (`id`, `name`, `env`, `options`, `models`). |
| `agent.ts` | Schema for agent config (model, tools, instructions, permissions). |
| `command.ts` | Schema for custom slash command definitions. |
| `mcp.ts` | Schema for MCP server config (stdio, sse, http transports). |
| `lsp.ts` | Schema for LSP server config. |
| `permission.ts` | Schema for tool permission overrides. |
| `keybinds.ts` | Schema for TUI keybind overrides. |
| `model-id.ts` | `provider/model` string validation. |
| `managed.ts` | Reads MDM/managed preferences on macOS (enterprise policy). |
| `skills.ts` | Schema for additional skill folder paths. |
| `error.ts` | Config validation error formatting. |

---

### Global State (`src/global/`)

| File | Purpose |
|------|---------|
| `index.ts` | Defines all filesystem paths under `~/.mage/`: `config` (`~/.mage`), `data` (`~/.mage/data`), `cache` (`~/.mage/cache`), `state` (`~/.mage/state`), `log` (`~/.mage/data/log`), `bin` (`~/.mage/cache/bin`). Creates directories on startup. |

---

### AI Providers (`src/provider/`)

| File | Purpose |
|------|---------|
| `provider.ts` | Multi-provider registry. Discovers providers from config and environment, exposes model lists, and routes generation requests. `BUNDLED_PROVIDERS` includes `@mage/merlin-provider`. |
| `merlin.ts` | Merlin provider adapter. Implements the Vercel AI SDK `LanguageModelV3` interface for BCA's internal LLM gateway. Wraps requests in the `{client_id, domain_id, config, new_session, file}` envelope. |
| `models.ts` | Model metadata cache (fetches and persists available models per provider). |
| `schema.ts` | Provider and model schema types. |
| `auth.ts` | OAuth/credential storage for external providers. |
| `transform.ts` | Request/response transformation utilities (streaming, tool call normalisation). |
| `error.ts` | Maps provider API errors to internal error types. |
| `openai-compatible-*.ts` | OpenAI-compatible provider adapters (Anthropic, Google, Mistral, etc.). |
| `copilot-provider.ts` | GitHub Copilot provider adapter. |

Tool-augmented providers (web search, code interpreter, file search) live as separate files under `provider/`.

---

### Tools (`src/tool/`)

Built-in tools exposed to the agent during conversations.

| File | Purpose |
|------|---------|
| `registry.ts` | Discovers and registers all built-in and custom tools. Scans `{tool,tools}/*.{js,ts}` in each config dir (skipping `*.test.ts`). |
| `bash.ts` | Execute shell commands with sandboxing and permission checks. |
| `read.ts` | Read file contents with line-range support. |
| `write.ts` | Write or overwrite files on disk. |
| `edit.ts` | Apply targeted string replacements to files. |
| `multiedit.ts` | Apply multiple edits to a file in one call. |
| `apply_patch.ts` | Apply unified diff patches. |
| `glob.ts` | Glob file search. |
| `grep.ts` | Ripgrep-powered content search. |
| `webfetch.ts` | Fetch a URL and return its content. |
| `websearch.ts` | Web search via configured search provider. |
| `lsp.ts` | LSP-powered code intelligence (hover, diagnostics, references). |
| `skill.ts` | Invoke a named skill. |
| `task.ts` | Spawn a sub-agent for a discrete task. |
| `todo.ts` | Read and update the session TODO list. |
| `plan.ts` | Read and update the session plan. |
| `question.ts` | Ask the user a question and wait for input. |
| `mcp-exa.ts` | Exa search via MCP. |
| `schema.ts` | Tool definition schema types. |
| `truncate.ts` | Truncates oversized tool output before sending to the model. |
| `invalid.ts` | Placeholder for invalid/disabled tools. |

---

### Agent (`src/agent/`)

| File | Purpose |
|------|---------|
| `agent.ts` | Agent configuration and execution model. Resolves which model, tools, instructions, and permissions apply to a named agent. Defines the built-in agent roster (build, plan, general, explore, title, summary, compaction). |

---

### Session & Conversation (`src/session/`)

| File | Purpose |
|------|---------|
| `session.ts` | Session store: create, load, persist sessions; manages the active session state. |
| `message.ts` / `message-v2.ts` | Message schema and mutation helpers (append, update, revert). |
| `llm.ts` | Drives the LLM request loop: builds the prompt, calls the provider, streams parts back, dispatches tool calls. |
| `prompt.ts` | Assembles the system prompt from instructions, conventions, and context layers. |
| `processor.ts` | Processes streamed LLM output parts (text, tool calls, thinking blocks) into structured message parts. |
| `compaction.ts` | Compacts long conversations to stay within token limits. |
| `summary.ts` | Generates session title and summary using a small model. |
| `instruction.ts` | Loads and merges instruction files from config and project dirs. |
| `system.ts` | Builds the final system prompt string, including plugin-injected content. |
| `status.ts` | Tracks session status (idle, running, waiting). |
| `revert.ts` | Reverts file changes made during a session turn. |
| `retry.ts` | Retries a failed or partial LLM response. |
| `todo.ts` | Session-scoped TODO list management. |
| `overflow.ts` | Handles context overflow events. |

---

### Server (`src/server/`)

An HTTP server built on [Hono](https://hono.dev/), used by the TUI worker and headless `mage serve` mode.

| File | Purpose |
|------|---------|
| `server.ts` | Creates and starts the Hono server, mounts all routes, handles auth middleware. |
| `adapter.bun.ts` / `adapter.node.ts` | Platform-specific server adapters. |
| `event.ts` | Server-Sent Events (SSE) stream for pushing updates to the TUI. |
| `mdns.ts` | mDNS service advertisement (`mage.local`). |
| `middleware.ts` | Auth, CORS, and logging middleware. |
| `proxy.ts` | Reverse proxy for remote server mode. |
| `workspace.ts` | Workspace-aware server setup. |

Routes are under `server/routes/` and expose the full REST + SSE API consumed by the TUI and SDK.

---

### Storage (`src/storage/`)

| File | Purpose |
|------|---------|
| `storage.ts` | Main storage service. Wraps the database with Effect and exposes typed query methods. |
| `db.bun.ts` | Bun SQLite adapter (uses `bun:sqlite`). |
| `db.node.ts` | Node.js SQLite adapter (uses `better-sqlite3`). |
| `schema.ts` / `schema.sql.ts` | Database schema definitions (sessions, messages, events, accounts). |
| `json-migration.ts` | Migrates legacy JSON-file storage to SQLite. |

---

### LSP (`src/lsp/`)

| File | Purpose |
|------|---------|
| `lsp.ts` | LSP service orchestrator. Manages LSP server lifecycles per language. |
| `server.ts` | Downloads, installs, and launches LSP servers (gopls, ESLint, etc.) into `~/.mage/cache/bin/`. |
| `client.ts` | JSON-RPC client that communicates with a running LSP server. |
| `diagnostic.ts` | Formats LSP diagnostic messages for the tool output. |
| `language.ts` | Maps file extensions to language IDs. |

---

### MCP (`src/mcp/`)

| File | Purpose |
|------|---------|
| `index.ts` | MCP client: connects to configured MCP servers, discovers their tools, and exposes them to the agent. |
| `oauth-provider.ts` / `oauth-callback.ts` | OAuth flow for MCP servers that require authentication. |
| `auth.ts` | Stores and retrieves MCP server credentials. |

---

### Plugin System (`src/plugin/`)

| File | Purpose |
|------|---------|
| `index.ts` | Plugin loader: imports plugin modules, calls their `server` export with the app context, and registers returned hooks and tools. |
| `install.ts` | Installs a plugin from npm or a local path and writes it to config. |
| `meta.ts` | Reads and writes the plugin metadata cache (`~/.mage/state/plugin-meta.json`). |
| `loader.ts` | Resolves plugin specifiers to absolute paths or npm packages. |
| `shared.ts` | Shared plugin utilities. |

---

### File Operations (`src/file/`)

| File | Purpose |
|------|---------|
| `watcher.ts` | Watches the filesystem for changes using Chokidar; notifies the session when relevant files change. |
| `ripgrep.ts` | Downloads and manages the `rg` binary; provides a typed wrapper for content search. |
| `ignore.ts` | Parses `.gitignore` and `.opencodeignore` files to build exclusion patterns. |
| `protected.ts` | Detects files that should not be modified (e.g., `package-lock.json` under certain conditions). |

---

### Utilities (`src/util/`)

General-purpose utilities used across the codebase.

| File | Purpose |
|------|---------|
| `log.ts` | Structured logger (writes to `~/.mage/data/log/`). |
| `rpc.ts` | Lightweight RPC layer for Worker ↔ main thread communication. |
| `filesystem.ts` | File read/write helpers with Effect wrappers. |
| `error.ts` | Error type normalisation. |
| `token.ts` | Approximate token counting. |
| `network.ts` | Network availability checks. |
| `archive.ts` | Zip/tar extraction helpers. |
| `process.ts` | Process environment and role detection (`OPENCODE_PROCESS_ROLE`). |
| `lock.ts` | File-based distributed locks. |
| `defer.ts` | Deferred promise utility. |
| `which.ts` | `which`-style binary resolution; prepends `~/.mage/cache/bin` to PATH. |

---

### Effect Framework (`src/effect/`)

Mage uses the [Effect](https://effect.website/) library for typed, composable async operations.

| File | Purpose |
|------|---------|
| `app-runtime.ts` | Main Effect runtime for the application layer. |
| `instance-registry.ts` | Registry of active service instances (sessions, providers, etc.). |
| `instance-state.ts` | Per-instance state management. |
| `observability.ts` | OpenTelemetry integration for Effect spans. |
| `bridge.ts` | Bridges Effect programs with standard async/Promise contexts. |
| `logger.ts` | Effect-aware structured logger. |

---

## .opencode/ (Project Configuration)

This directory is loaded by Mage when running inside this repository. It demonstrates the full Mage extension system.

### Commands (`command/`)

Markdown files that define custom slash commands. `$ARGUMENTS` is substituted with the user's input.

| File | Slash Command | Purpose |
|------|--------------|---------|
| `generate.md` | `/generate` | Calls `mage_boilerplate_context` then generates and writes code. |
| `test.md` | `/test` | Reads a source file, calls `mage_boilerplate_test_conventions`, writes tests. |
| `review.md` | `/review` | Routes to `mr_review` (MR URL) or `mage_boilerplate_review_rules` (file). |
| `boilerplate.md` | `/boilerplate` | Routes to `mage_boilerplate_manage` with list/info/use action. |
| `commit.md` | `/commit` | Generates a conventional commit message from staged diff. |
| `changelog.md` | `/changelog` | Generates a CHANGELOG entry from recent commits. |
| `issues.md` | `/issues` | Lists and summarises open issues. |
| `learn.md` | `/learn` | Explains a concept or codebase area. |
| `spellcheck.md` | `/spellcheck` | Spell-checks a file or selection. |
| `rmslop.md` | `/rmslop` | Removes AI-generated verbosity from prose. |
| `ai-deps.md` | `/ai-deps` | Analyses AI-related dependencies in a project. |

### Tools (`tool/`)

TypeScript files auto-loaded as drop-in tools.

| File | Tool Name | Purpose |
|------|-----------|---------|
| `mr-review.ts` | `mr_review` | Calls the `mr-reviewer` Go binary to review a GitLab MR; parses JSON output and formats findings. |
| `github-triage.ts` | `github_triage` | Triages GitHub issues using labels and priority heuristics. |
| `github-pr-search.ts` | `github_pr_search` | Searches open GitHub PRs by keyword or label. |
| `mr-review.test.ts` | — | Unit tests for `mr-review.ts` (not loaded as a tool — skipped by the scanner). |

### Plugins (`plugin/`)

TypeScript files auto-loaded as server plugins.

| File | Purpose |
|------|---------|
| `boilerplate.ts` | Boilerplate system plugin. Reads `mage.yaml` manifests, injects conventions into every system prompt via the `experimental.chat.system.transform` hook, and registers four tools: `mage_boilerplate_context`, `mage_boilerplate_review_rules`, `mage_boilerplate_test_conventions`, `mage_boilerplate_manage`. |
| `boilerplate.test.ts` | Unit tests for `boilerplate.ts` (not loaded as a plugin — skipped by the scanner). |

### Agents (`agent/`)

Markdown files defining autonomous scheduled agents.

| File | Agent | Purpose |
|------|-------|---------|
| `triage.md` | Triage | Triages new issues automatically. |
| `translator.md` | Translator | Translates documentation or comments. |
| `duplicate-pr.md` | Duplicate PR | Detects duplicate pull requests. |

---

## Key Architectural Patterns

### Two-Process TUI Model

When `mage` (TUI mode) starts, `thread.ts` spawns a Bun Worker running `worker.ts`. The worker owns the Effect runtime and HTTP server; the main thread owns the Solid.js terminal renderer. They communicate over a typed RPC channel (`src/util/rpc.ts`).

```
main thread (Solid TUI)  ←── RPC ──→  worker (Effect + Hono server)
```

### Effect-Based Service Layer

All stateful services (config, session, provider, storage, LSP, MCP) are implemented as Effect services. They are composed into a single `AppRuntime` and injected via context rather than global singletons.

### Plugin Hook System

Plugins export a `server` function that receives the app context and returns a `Hooks` object. Available hooks:

- `experimental.chat.system.transform` — injects content into the system prompt before every LLM call
- `tool` — registers additional tools available to the agent

Plugins are auto-discovered from `{plugin,plugins}/*.{ts,js}` in each config directory (project and global).

### Config Merge Order

Config is loaded and merged in this priority order (later entries win):

1. Global: `~/.mage/mage.jsonc` (or legacy `opencode.jsonc` / `config.json`)
2. Project: `.opencode/opencode.jsonc` (walking up from CWD)
3. Managed: macOS MDM preferences (enterprise)

### Path Layout (`~/.mage/`)

```
~/.mage/
├── mage.jsonc          # global user config (written by mage init)
├── tui.json            # TUI settings (theme, keybinds)
├── data/
│   ├── *.db            # SQLite session database
│   └── log/            # application logs
├── cache/
│   ├── bin/            # downloaded tool binaries (rg, gopls, etc.)
│   └── version         # cache invalidation marker
└── state/
    ├── model.json       # last-used model
    └── plugin-meta.json # installed plugin metadata
```
