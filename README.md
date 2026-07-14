# Mage

AI coding assistant for the terminal, powered by GAIA.

Current version: **v1.2.11**

---

## Installation

**macOS / Linux**
```bash
curl -fsSL https://mage.apps.ocpdevgra.dti.co.id/install | bash
```

**Windows PowerShell**
```powershell
irm https://mage.apps.ocpdevgra.dti.co.id/install.ps1 | iex
```

**Windows cmd** — download [`install.cmd`](install.cmd) and double-click it, or run:
```bat
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://mage.apps.ocpdevgra.dti.co.id/install.ps1 | iex"
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

When you run `mage` for the first time, the onboarding wizard launches automatically. It collects **Domain username** — used to identify your requests to the GAIA gateway

Config is saved to `~/.mage/mage.json`.

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
mage web              # open the web interface in your browser
```

---

## Configuration

All configuration lives under `~/.mage/`:

| Path | Contents |
|------|----------|
| `~/.mage/mage.json` | Main config (created by `mage init`) |
| `~/.mage/tui.json` | TUI settings (theme, keybinds) |
| `~/.mage/data/` | Session database and history |
| `~/.mage/cache/` | Cache and tool binaries (ripgrep, LSP) |
| `~/.mage/state/` | Runtime state |

Per-project config lives in `.mage/mage.json` at the repository root.

---

## Build and Publish

```bash
# Build the mage CLI
bun run build:mage

# Publish to BCA Artifactory
bun run publish:mage

# Or run directly in packages/mage:
cd packages/mage
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

