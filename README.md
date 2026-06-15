# Mage

AI coding assistant for the terminal, powered by GAIA.

Current version: **v1.2.4**

---

## Installation

**macOS / Linux**
```bash
curl -fsSL https://mybcabisnis-mage.apps.ocpdevgra.dti.co.id/install | bash
```

**Windows PowerShell**
```powershell
irm https://mybcabisnis-mage.apps.ocpdevgra.dti.co.id/install.ps1 | iex
```

**Windows cmd** — download [`install.cmd`](install.cmd) and double-click it, or run:
```bat
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://mybcabisnis-mage.apps.ocpdevgra.dti.co.id/install.ps1 | iex"
```

The installer configures your `~/.npmrc` with the BCA Artifactory registry and runs
`npm install -g @mybcabisnis/mage` automatically. Node.js ≥ 18 must be installed first
([download](https://nodejs.org/en/download)).

<details>
<summary>Manual install (if you prefer to configure <code>.npmrc</code> yourself)</summary>

Add these lines to your `~/.npmrc` (create the file if it doesn't exist):

```
@mybcabisnis:registry=https://artifactory.intra.bca.co.id/artifactory/api/npm/MBB-Registry-npm/
noproxy[]=artifactory.intra.bca.co.id
always-auth=true
strict-ssl=false
//artifactory.intra.bca.co.id/artifactory/api/npm/MBB-Registry-npm/:_auth=dXNlcm1iYjpCY2FiY2ExMjM=
```

Then install globally:

```bash
npm install -g @mybcabisnis/mage
```
</details>

Or run from source (requires [Bun](https://bun.sh) ≥ 1.1):

```bash
git clone <repo>
cd new-mage
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
mage web              # open the web interface in your browser
```

### Slash Commands (inside the TUI)

| Command | Description |
|---------|-------------|
| `/init` | Guided AGENTS.md setup for the current project |
| `/review [commit\|branch\|pr]` | Review changes — defaults to uncommitted |

Skills (auto-triggered from your prompt) and any commands defined in `mage.jsonc` also appear as `/commands` in the TUI.

---

## Boilerplate

A boilerplate is a local directory or git URL containing team conventions. When set, its content is automatically injected into every conversation.

### Registering a boilerplate

Set the path in `~/.mage/mage.jsonc`:

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

Or use a git URL:

```jsonc
{
  "mage": {
    "boilerplate": "https://gitlab.company.com/team/conventions.git"
  }
}
```

### Named profiles

Multiple profiles can be defined and switched between:

```jsonc
{
  "mage": {
    "profiles": [
      { "name": "android", "boilerplate": "/path/to/android-conventions" },
      { "name": "backend", "boilerplate": "/path/to/backend-conventions" }
    ],
    "activeBoilerplate": "android"
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

Per-project config lives in `.mage/mage.json(c)` at the repository root.

---

## Editor Integration

Mage has an extension for **Zed** (`packages/extensions/zed`). Install it from the Zed extension panel.

You can also run a headless server or open the web interface:

```bash
mage serve   # start a headless API server
mage web     # open the web interface in your browser
```

---

## Build and Publish

```bash
# Build the mage CLI
bun run build:mage

# Publish to BCA Artifactory
bun run publish:mage

# Or run directly in packages/opencode:
cd packages/opencode
bun run build
bun run publish
```

---

## Versioning

All packages share a single version number. To bump the version across the entire monorepo:

```bash
# Print current version
bun script/version.ts

# Set an exact version
bun script/version.ts 1.3.0

# Bump by increment type
bun script/version.ts patch   # 1.2.4 → 1.2.5
bun script/version.ts minor   # 1.2.4 → 1.3.0
bun script/version.ts major   # 1.2.4 → 2.0.0

# Or via npm script
bun run version:set 1.3.0
```

This updates every `packages/*/package.json`, `packages/web/config.mjs`, the landing page eyebrow in `packages/web/src/content/i18n/id.json`, and the terminal demo in `packages/web/src/components/Lander.astro`.

---

## License

Internal fork of [OpenCode](https://github.com/anomalyco/opencode) (MIT).  
BCA additions: UNLICENSED — internal use only.
