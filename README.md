# Mage

AI coding assistant for the terminal, powered by GAIA — BCA's internal LLM gateway.

---

## Installation

```bash
npm install -g @mybcabisnis/mage --registry https://artifactory.intra.bca.co.id/artifactory/api/npm/MBB-Registry-npm/
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

When you run `mage` for the first time, the onboarding wizard launches automatically. It collects:

1. **Domain username** — used to identify your requests to the GAIA gateway
2. **Team boilerplate path** — local path or git URL (optional)

Config is saved to `~/.mage/mage.jsonc`.

To re-run the wizard at any time:

```bash
mage init
```

---

## Usage

```bash
mage                  # open interactive TUI
mage run "message"    # send a single message without the TUI
mage init             # re-run setup wizard
mage providers        # manage provider credentials
mage models           # list available models
```

### Slash Commands (inside the TUI)

| Command | Action |
|---------|--------|
| `/generate <type> <description>` | Generate code from the team boilerplate |
| `/test <file>` | Generate tests following team conventions |
| `/review <file>` | Review a local file against team rules |
| `/review <MR-URL>` | Review a GitLab MR via the Go binary |
| `/boilerplate list` | List available boilerplate profiles |
| `/boilerplate use <name>` | Switch the active boilerplate |
| `/boilerplate info` | Show details of the active boilerplate |

---

## Boilerplate

A boilerplate is a directory containing a `mage.yaml` manifest and team convention files. When active, conventions are automatically injected into every conversation.

### Directory structure

```
my-boilerplate/
├── mage.yaml
├── conventions/
│   ├── architecture.md      # injected into every prompt
│   ├── review.md            # loaded for /review
│   └── testing.md           # loaded for /test
├── instructions/
│   └── service.md           # generator instruction
└── examples/
    └── ExampleService.ts    # example code
```

### `mage.yaml` format

```yaml
name: my-boilerplate
version: "1.0"
platform: android
language: Kotlin

conventions:
  always_include:
    - conventions/architecture.md
  include_for_review:
    - conventions/review.md
  include_for_testing:
    - conventions/testing.md

generators:
  service:
    instruction: instructions/service.md
    examples:
      - examples/ExampleService.ts
    description: Generate a service class

project_detection:
  markers:
    - build.gradle.kts

context:
  max_convention_tokens: 5000
  max_example_tokens: 2000
```

### Registering a boilerplate

Register via `mage init` or edit `~/.mage/mage.jsonc` directly:

```jsonc
{
  "provider": {
    "merlin": {
      "options": { "username": "john.doe" }
    }
  },
  "mage": {
    "boilerplate": "/path/to/boilerplate"
  }
}
```

---

## Configuration

All configuration lives under `~/.mage/`:

| Path | Contents |
|------|----------|
| `~/.mage/mage.jsonc` | Main config (created by `mage init`) |
| `~/.mage/tui.json` | TUI settings (theme, keybinds) |
| `~/.mage/data/` | Session database and history |
| `~/.mage/cache/` | Cache and tool binaries (ripgrep, LSP) |
| `~/.mage/state/` | Runtime state |

Per-project config lives in `.opencode/opencode.jsonc` at the repository root.

---

## GitLab MR Review

Mage delegates MR review to the `mr-reviewer` binary. Make sure it is available on `PATH`:

```bash
/review https://gitlab.company.com/team/repo/-/merge_requests/142
```

The binary is called with `--url <MR_URL> --format json` and the output is rendered directly in the TUI.

---

## IDE Integration

Mage is available as a VS Code extension. Install from the internal marketplace or run the server manually:

```bash
mage serve   # run a headless server
mage web     # open the web interface
```

---

## Build and Publish

```bash
# Build all platforms (darwin, linux, windows)
cd packages/opencode
bun run build:bca

# Build current platform only (faster)
bun run build:bca -- --single

# Dry run before publishing
bun publish --dry-run

# Publish to BCA artifactory
bun publish
```

---

## License

Internal fork of [OpenCode](https://github.com/anomalyco/opencode) (MIT).  
BCA additions: UNLICENSED — internal use only.
