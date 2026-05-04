# Mage User Guide

---

## Table of Contents

1. [Installation](#installation)
2. [First-time Setup](#first-time-setup)
3. [Starting Mage](#starting-mage)
4. [The TUI Interface](#the-tui-interface)
5. [Keyboard Shortcuts](#keyboard-shortcuts)
6. [Slash Commands — Built-in](#slash-commands--built-in)
7. [Slash Commands — Mage Custom](#slash-commands--mage-custom)
8. [Attaching Files to Messages](#attaching-files-to-messages)
9. [Sessions](#sessions)
10. [Boilerplate System](#boilerplate-system)
11. [Non-interactive Mode](#non-interactive-mode)
12. [Configuration Reference](#configuration-reference)

---

## Installation

```bash
npm install -g @mybcabisnis/mage \
  --registry https://artifactory.intra.bca.co.id/artifactory/api/npm/MBB-Registry-npm/
```

Or run from source (requires [Bun](https://bun.sh) ≥ 1.1):

```bash
git clone <repo>
cd mage-poc/packages/opencode
bun install
bun run dev
```

---

## First-time Setup

The first time you run `mage`, the onboarding wizard launches automatically:

```
$ mage

  █▄ ▄█ ▄▀▀▄ █▀▀▀ █▀▀▀
  █ ▀ █ ████ █  █ █▀▀▀
  ▀   ▀ ▀  ▀ ▀▀▀▀ ▀▀▀▀

◆ Mage setup
│
◆ BCA domain username
│  u0xxxxx
│
◆ Team boilerplate path (optional)
│  /path/to/team-boilerplate
│
◇ Config saved → /Users/you/.mage/config.json
```

Two prompts:

1. **BCA domain username** — your network/Active Directory username, used to identify requests to the Merlin gateway.
2. **Team boilerplate path** (optional) — local path or git URL to your team's `mage.yaml` boilerplate. Leave empty to skip and configure later.

To re-run the wizard at any time:

```bash
mage init
```

---

## Starting Mage

| Command | Description |
|---------|-------------|
| `mage` | Open the interactive TUI in the current directory |
| `mage /path/to/project` | Open the TUI in a specific directory |
| `mage run "message"` | Send a single message and stream the response (no TUI) |
| `mage run --continue "message"` | Continue the last session from the CLI |
| `mage serve` | Start a headless HTTP server |
| `mage web` | Start the server and open the web UI in a browser |
| `mage attach <url>` | Attach the TUI to an already-running Mage server |
| `mage init` | Re-run the setup wizard |
| `mage models` | List all available models |
| `mage providers` | Manage provider credentials |
| `mage stats` | Show token usage and cost statistics |
| `mage upgrade` | Upgrade to the latest version |

---

## The TUI Interface

The terminal UI has three main areas:

```
┌─────────────────────────────────────────────────┐
│  SIDEBAR          │  CONVERSATION                │
│                   │                              │
│  Sessions list    │  Messages stream here        │
│  or               │                              │
│  File tree        │                              │
│                   ├──────────────────────────────│
│                   │  PROMPT INPUT                │
│                   │  > type here...              │
└─────────────────────────────────────────────────┘
```

- **Sidebar** — toggle with `Ctrl+X B`. Shows session history or project files.
- **Conversation** — scrollable message history. Tool calls, file edits, and thinking blocks appear inline.
- **Prompt** — the input field at the bottom. Supports multi-line input, file attachments, and slash commands.

---

## Keyboard Shortcuts

The **leader key** is `Ctrl+X`. Combine it with another key for quick actions.

### Navigation

| Shortcut | Action |
|----------|--------|
| `Ctrl+P` | Open command palette (search all actions) |
| `Ctrl+X B` | Toggle sidebar |
| `Ctrl+X Right / Left` | Cycle between parent and child sessions |
| `Ctrl+G` / `Home` | Jump to the beginning of the conversation |
| `Ctrl+Alt+G` / `End` | Jump to the most recent message |
| `Page Up / Down` | Scroll the conversation |
| `Escape` | Go to home screen |

### Prompt Input

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift+Enter` / `Ctrl+J` | Insert a newline in the prompt |
| `Ctrl+C` | Clear the input field |
| `Ctrl+V` | Paste an image from clipboard |
| `Ctrl+X E` | Open the prompt in your `$EDITOR` |
| `Ctrl+Z` | Undo in the prompt (or suspend terminal on some systems) |
| `Tab` | Autocomplete slash commands |
| `↑ / ↓` | Browse input history |

### Session Actions

| Shortcut | Action |
|----------|--------|
| `Ctrl+X N` | Start a new session |
| `Ctrl+X L` | List and switch sessions |
| `Ctrl+X X` | Export conversation as Markdown |
| `Ctrl+X Y` | Copy last assistant message to clipboard |
| `Ctrl+X G` | Jump to a specific message (timeline) |
| `Ctrl+X S` | Show system status |
| `Ctrl+X T` | Switch theme |
| `Ctrl+X M` | Switch model |
| `Ctrl+X H` | Toggle code block visibility |

### Display Toggles

| Shortcut | Action |
|----------|--------|
| `Ctrl+X H` | Show help dialog |
| `Ctrl+P` | Open command palette |

---

## Slash Commands — Built-in

Type `/` in the prompt to open the autocomplete list. All built-in commands are available in every session.

### Session Management

| Command | Aliases | Description |
|---------|---------|-------------|
| `/new` | | Start a new conversation session |
| `/sessions` | | List all saved sessions and switch to one |
| `/fork` | | Fork the current session at a chosen message point |
| `/rename` | | Rename the current session |
| `/compact` | `/summarize` | Compact the conversation to save context tokens. Summarises prior messages into a single system note. |
| `/undo` | | Remove the last user message and restore the previous state. The prompt is pre-filled with the undone message. |
| `/redo` | | Re-apply a previously undone message |
| `/timeline` | | Jump to a specific message in the conversation |
| `/export` | | Export the full conversation transcript as a Markdown file |
| `/copy` | | Copy the full conversation transcript to clipboard |

### Display

| Command | Aliases | Description |
|---------|---------|-------------|
| `/thinking` | `/toggle-thinking` | Show or hide the model's thinking/reasoning blocks |
| `/timestamps` | `/toggle-timestamps` | Show or hide message timestamps |
| `/themes` | | Open the theme picker |
| `/models` | | Open the model picker |
| `/status` | | Show system status (provider, model, token usage) |
| `/help` | | Open the help dialog |
| `/editor` | | Open the current prompt in your `$EDITOR` |

---

## Slash Commands — Mage Custom

These commands are defined in `.opencode/command/` and call Mage's boilerplate tools internally.

---

### `/generate <type> <description>`

Generates code using your team's boilerplate patterns.

```
/generate service UserAuthService
/generate repository ProductRepository for the inventory module
/generate controller OrderController with CRUD endpoints
```

**How it works:**
1. Calls `mage_boilerplate_context` with the generator type to fetch the team's instruction and examples.
2. Generates code following those patterns exactly.
3. Asks for confirmation before writing the file to disk.

If the type is not recognised, Mage lists the available generator types from the active boilerplate.

---

### `/test <file>`

Generates tests for a source file following your team's test conventions.

```
/test src/services/UserAuthService.ts
/test src/repositories/ProductRepository.kt
```

**How it works:**
1. Reads the source file.
2. Calls `mage_boilerplate_test_conventions` to get the team's testing framework and naming patterns.
3. Generates tests that mirror the same structure and style.
4. Writes the test file to the appropriate path (mirrors the source path in the test directory), asking for confirmation.

---

### `/review <target>`

Reviews a file or a GitLab merge request.

**File review:**
```
/review src/middleware/auth.ts
/review src/services/PaymentService.kt
```

1. Reads the file.
2. Calls `mage_boilerplate_review_rules` to get the team's review criteria.
3. Returns a structured report grouped by severity: **critical** / **warning** / **suggestion** / **style**.

**GitLab MR review:**
```
/review https://gitlab.company.com/team/repo/-/merge_requests/142
/review team/repo!142
```

Delegates to the `mr-reviewer` Go binary. Returns findings for every changed file in the MR.

---

### `/boilerplate [list|info|use <name>]`

Manages team boilerplate profiles.

| Sub-command | Description |
|-------------|-------------|
| `/boilerplate` | Same as `list` |
| `/boilerplate list` | Show all configured boilerplate profiles |
| `/boilerplate info` | Show details of the active boilerplate (name, generators, conventions) |
| `/boilerplate use <name>` | Switch the active boilerplate profile |

```
/boilerplate list
/boilerplate use android-compose
/boilerplate info
```

---

### `/commit`

Generates a conventional commit message from the current git diff and staged changes, then commits and pushes.

```
/commit
```

The generated message uses a prefix (`feat:`, `fix:`, `docs:`, `tui:`, `core:`, `ci:`) and focuses on the user-facing impact rather than internal implementation details.

---

### `/spellcheck`

Checks spelling and grammar in all unstaged markdown file changes.

```
/spellcheck
```

---

### `/rmslop`

Reviews the diff against the `dev` branch and removes AI-generated code patterns that are inconsistent with the rest of the codebase — unnecessary comments, over-defensive try/catch blocks, redundant type casts, inconsistent style.

```
/rmslop
```

---

### `/learn`

Extracts non-obvious discoveries from the current session and saves them to `AGENTS.md` files at the appropriate directory level for future reference.

```
/learn
/learn focus on the auth module
```

---

### `/changelog`

Generates `UPCOMING_CHANGELOG.md` from a structured commit range input. Used during release preparation.

```
/changelog v1.2.0..HEAD
```

---

---

## Attaching Files to Messages

### Paste from clipboard

Press `Ctrl+V` to paste an image directly into the prompt. Mage will attach it to the next message.

### Mention files inline

Type a file path or name directly in your message — Mage will search for it, read it, and add it to the context automatically before sending to the model.

```
Explain the handleSubmit function in src/ui/App.tsx
Review `PaymentService.kt` for potential null pointer issues
What does config.json contain?
```

Supported formats:
- Full path: `src/services/UserAuth.ts`
- Relative path: `./config.json`
- Backtick-wrapped: `` `App.tsx` ``
- Filename only: `App.tsx` (Mage searches the project)

### Attach via flag (CLI mode)

```bash
mage run "review this file" --file src/services/UserAuth.ts
mage run "summarise these logs" --file app.log --file error.log
```

---

## Sessions

Each conversation is saved as a session in `~/.mage/data/`. Sessions persist across restarts.

| Action | How |
|--------|-----|
| Continue last session | `mage --continue` or `mage -c` |
| Continue a specific session | `mage --session <id>` |
| Fork before continuing | `mage --continue --fork` |
| List sessions | `/sessions` or `mage session list` |
| Export a session | `/export` or `mage export <id>` |

Sessions are automatically titled using the first message. You can rename them with `/rename`.

---

## Boilerplate System

A boilerplate is a directory containing a `mage.yaml` manifest and team convention files. When a boilerplate is active, its `always_include` conventions are injected into every system prompt automatically.

### `mage.yaml` structure

```yaml
name: android-compose
version: "1.0"
platform: android
language: Kotlin

conventions:
  always_include:
    - conventions/architecture.md    # injected into every prompt
  include_for_review:
    - conventions/review.md          # loaded by /review
  include_for_testing:
    - conventions/testing.md         # loaded by /test

generators:
  service:
    instruction: instructions/service.md
    examples:
      - examples/ExampleService.kt
    description: Generate a service class
  repository:
    instruction: instructions/repository.md
    examples: []
    description: Generate a data repository

project_detection:
  markers:
    - build.gradle.kts               # auto-selects this boilerplate when file is present

context:
  max_convention_tokens: 5000
  max_example_tokens: 2000
```

### Registering a boilerplate

Run `mage init` and enter the path, or edit `~/.mage/mage.jsonc` directly:

```jsonc
{
  "provider": {
    "merlin": {
      "options": { "username": "john.doe" }
    }
  },
  "mage": {
    "boilerplate": "/path/to/team-boilerplate"
  }
}
```

Git URLs are also supported:

```jsonc
{
  "mage": {
    "boilerplate": "https://gitlab.company.com/team/boilerplate.git"
  }
}
```

---

## Non-interactive Mode

Use `mage run` to send a single message and get a response without opening the TUI. Useful for scripting or CI.

```bash
# Plain text output
mage run "explain the auth flow"

# Structured JSON events
mage run "explain the auth flow" --format json

# Attach files
mage run "review this service" --file src/services/Auth.ts

# Use a specific model
mage run "summarise the session" --model merlin/qwen3-30b

# Continue the last session
mage run --continue "now refactor it"
```

---

## Configuration Reference

### Files

| Path | Purpose |
|------|---------|
| `~/.mage/mage.jsonc` | Global user config — provider credentials, boilerplate path, model defaults |
| `~/.mage/tui.json` | TUI settings — theme, keybind overrides |
| `.opencode/opencode.jsonc` | Project-level config — MCP servers, tool permissions, model overrides |

### Global config (`~/.mage/mage.jsonc`)

```jsonc
{
  // Merlin provider — BCA internal LLM gateway
  "provider": {
    "merlin": {
      "options": {
        "username": "john.doe"   // your BCA domain username
      }
    }
  },

  // Mage-specific settings
  "mage": {
    "boilerplate": "/path/to/boilerplate",   // active boilerplate path or git URL
    "activeBoilerplate": "default"           // profile name (multi-profile setups)
  },

  // Default model (optional)
  "model": "merlin/qwen3-30b",

  // Log level (optional)
  "logLevel": "INFO"
}
```

### Project config (`.opencode/opencode.jsonc`)

```jsonc
{
  // Override the model for this project
  "model": "merlin/qwen3-30b",

  // MCP server integrations
  "mcp": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  },

  // Tool permission overrides
  "permission": {
    "bash": "auto-approve"
  }
}
```

### TUI config (`~/.mage/tui.json`)

```jsonc
{
  "theme": "opencode",      // built-in theme name
  "keybinds": {
    "session_new": "ctrl+n",
    "command_list": "ctrl+p"
  }
}
```

Run `/themes` inside the TUI to browse all available themes. Keybind overrides use the format `ctrl+x`, `alt+enter`, `shift+tab`, etc.
