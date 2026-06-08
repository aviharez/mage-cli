// Hub marketplace data
// Seed list — curate / expand as the ecosystem grows.

export type HubItemKind = "mcp" | "skill" | "plugin"

export interface HubItem {
  name: string
  author: string
  description: string
  kind: HubItemKind
  /** npm package, config block id, or skill folder name */
  install: string
  /** how to install it */
  installKind: "npm" | "config" | "file"
  source?: string
  tags?: string[]
  featured?: boolean
  glyph: string
  bg: string
  fg: string
}

// Derive a compact glyph from a package name
function glyph(name: string): string {
  const clean = name.replace(/^[@/][^/]+\//, "").replace(/^opencode-/, "")
  return clean.slice(0, 2).toUpperCase()
}

// ---- MCP Servers -------------------------------------------------------
const MCP: HubItem[] = [
  {
    name: "filesystem",
    author: "mage/official",
    description: "Read, write, and search files in the working directory. Sandboxed to the session root.",
    kind: "mcp",
    install: "filesystem",
    installKind: "config",
    featured: true,
    glyph: "FS",
    bg: "#1d1730",
    fg: "#a78bfa",
    tags: ["official", "core"],
  },
  {
    name: "github",
    author: "github/mcp",
    description: "Issues, pull requests, code search, and releases. OAuth flows through the gateway.",
    kind: "mcp",
    install: "github",
    installKind: "config",
    featured: true,
    glyph: "GH",
    bg: "#0d1117",
    fg: "#e6edf3",
    tags: ["official", "devtools"],
    source: "https://github.com/github/github-mcp-server",
  },
  {
    name: "shell",
    author: "mage/official",
    description: "Execute shell commands with optional sandboxing. Auto-approves a curated allow-list.",
    kind: "mcp",
    install: "shell",
    installKind: "config",
    glyph: "SH",
    bg: "#1a2e1a",
    fg: "#6ee7b7",
    tags: ["official", "core"],
  },
  {
    name: "git",
    author: "mage/official",
    description: "Stage, diff, commit, branch, and rebase. Returns structured diffs the agent can reason about.",
    kind: "mcp",
    install: "git",
    installKind: "config",
    glyph: "GT",
    bg: "#2a1f1a",
    fg: "#f5b76c",
    tags: ["official", "core"],
  },
  {
    name: "postgres",
    author: "community",
    description: "Run read-only queries and inspect schemas. Connection strings stored in the gateway vault.",
    kind: "mcp",
    install: "postgres",
    installKind: "config",
    featured: true,
    glyph: "PG",
    bg: "#172d4d",
    fg: "#7fb3ff",
    tags: ["data"],
    source: "https://github.com/modelcontextprotocol/servers",
  },
  {
    name: "playwright",
    author: "microsoft",
    description: "Drive a headless browser for end-to-end tests, screenshots, and DOM inspection.",
    kind: "mcp",
    install: "playwright",
    installKind: "config",
    glyph: "PW",
    bg: "#1f1f2a",
    fg: "#79e6c1",
    tags: ["devtools"],
    source: "https://github.com/microsoft/playwright-mcp",
  },
  {
    name: "linear",
    author: "linear/mcp",
    description: "Read and create issues, comment on threads, transition statuses. Scoped by team.",
    kind: "mcp",
    install: "linear",
    installKind: "config",
    glyph: "LN",
    bg: "#2a1d40",
    fg: "#c4a8ff",
    tags: ["productivity"],
    source: "https://github.com/linear/linear-mcp",
  },
  {
    name: "slack",
    author: "slack/mcp",
    description: "Search messages, post in channels, fetch threads. Posts require explicit confirmation.",
    kind: "mcp",
    install: "slack",
    installKind: "config",
    glyph: "SL",
    bg: "#2a1f3a",
    fg: "#c4a8ff",
    tags: ["productivity"],
    source: "https://github.com/modelcontextprotocol/servers",
  },
  {
    name: "notion",
    author: "notion/mcp",
    description: "Page search, block-level reads/writes, database queries. Workspace token via gateway.",
    kind: "mcp",
    install: "notion",
    installKind: "config",
    glyph: "NT",
    bg: "#1a1a1a",
    fg: "#e6e6e6",
    tags: ["productivity"],
    source: "https://github.com/makenotion/notion-mcp-server",
  },
  {
    name: "docker",
    author: "community",
    description: "List containers, exec, view logs, and build images. Read-only by default.",
    kind: "mcp",
    install: "docker",
    installKind: "config",
    glyph: "DK",
    bg: "#0c2436",
    fg: "#7fb3ff",
    tags: ["devtools", "cloud"],
  },
  {
    name: "sentry",
    author: "sentry/mcp",
    description: "Issue search, stack trace decoding, release tracking. Read-only.",
    kind: "mcp",
    install: "sentry",
    installKind: "config",
    glyph: "SN",
    bg: "#3a2a1a",
    fg: "#fbbf24",
    tags: ["cloud"],
    source: "https://github.com/getsentry/sentry-mcp",
  },
]

// ---- Plugins (from ecosystem.mdx) -------------------------------------
const PLUGINS: HubItem[] = [
  {
    name: "opencode-helicone-session",
    author: "H2Shami",
    description: "Automatically inject Helicone session headers for request grouping.",
    kind: "plugin",
    install: "opencode-helicone-session",
    installKind: "npm",
    glyph: glyph("opencode-helicone-session"),
    bg: "#1a2e2e",
    fg: "#6ee7b7",
    source: "https://github.com/H2Shami/opencode-helicone-session",
    tags: ["observability"],
  },
  {
    name: "opencode-wakatime",
    author: "angristan",
    description: "Track Mage usage with Wakatime.",
    kind: "plugin",
    install: "opencode-wakatime",
    installKind: "npm",
    glyph: glyph("opencode-wakatime"),
    bg: "#1a1a2e",
    fg: "#a78bfa",
    source: "https://github.com/angristan/opencode-wakatime",
    tags: ["productivity"],
  },
  {
    name: "opencode-vibeguard",
    author: "inkdust2021",
    description: "Redact secrets/PII into VibeGuard-style placeholders before LLM calls; restore locally.",
    kind: "plugin",
    install: "opencode-vibeguard",
    installKind: "npm",
    featured: true,
    glyph: glyph("opencode-vibeguard"),
    bg: "#2a1f1a",
    fg: "#fbbf24",
    source: "https://github.com/inkdust2021/opencode-vibeguard",
    tags: ["security"],
  },
  {
    name: "opencode-morph-fast-apply",
    author: "JRedeker",
    description: "10x faster code editing with Morph Fast Apply API and lazy edit markers.",
    kind: "plugin",
    install: "opencode-morph-fast-apply",
    installKind: "npm",
    glyph: glyph("opencode-morph-fast-apply"),
    bg: "#1a1a2e",
    fg: "#c4a8ff",
    source: "https://github.com/JRedeker/opencode-morph-fast-apply",
    tags: ["performance"],
  },
  {
    name: "opencode-dynamic-context-pruning",
    author: "Tarquinen",
    description: "Optimize token usage by pruning obsolete tool outputs.",
    kind: "plugin",
    install: "opencode-dynamic-context-pruning",
    installKind: "npm",
    featured: true,
    glyph: glyph("opencode-dynamic-context-pruning"),
    bg: "#1a2e1a",
    fg: "#6ee7b7",
    source: "https://github.com/Tarquinen/opencode-dynamic-context-pruning",
    tags: ["performance", "tokens"],
  },
  {
    name: "opencode-supermemory",
    author: "supermemoryai",
    description: "Persistent memory across sessions using Supermemory.",
    kind: "plugin",
    install: "opencode-supermemory",
    installKind: "npm",
    glyph: glyph("opencode-supermemory"),
    bg: "#2a1d40",
    fg: "#c4a8ff",
    source: "https://github.com/supermemoryai/opencode-supermemory",
    tags: ["memory"],
  },
  {
    name: "opencode-notificator",
    author: "panta82",
    description: "Desktop notifications and sound alerts for Mage sessions.",
    kind: "plugin",
    install: "opencode-notificator",
    installKind: "npm",
    glyph: glyph("opencode-notificator"),
    bg: "#2a1a2e",
    fg: "#f5b76c",
    source: "https://github.com/panta82/opencode-notificator",
    tags: ["ux"],
  },
  {
    name: "opencode-worktree",
    author: "kdcokenny",
    description: "Zero-friction git worktrees for Mage.",
    kind: "plugin",
    install: "opencode-worktree",
    installKind: "npm",
    glyph: glyph("opencode-worktree"),
    bg: "#1a2e1a",
    fg: "#6ee7b7",
    source: "https://github.com/kdcokenny/opencode-worktree",
    tags: ["git"],
  },
  {
    name: "opencode-scheduler",
    author: "different-ai",
    description: "Schedule recurring jobs using launchd (Mac) or systemd (Linux) with cron syntax.",
    kind: "plugin",
    install: "opencode-scheduler",
    installKind: "npm",
    glyph: glyph("opencode-scheduler"),
    bg: "#1d1730",
    fg: "#a78bfa",
    source: "https://github.com/different-ai/opencode-scheduler",
    tags: ["automation"],
  },
  {
    name: "opencode-firecrawl",
    author: "firecrawl",
    description: "Web scraping, crawling, and search via the Firecrawl CLI.",
    kind: "plugin",
    install: "opencode-firecrawl",
    installKind: "npm",
    glyph: glyph("opencode-firecrawl"),
    bg: "#3a1f1a",
    fg: "#ff8b8b",
    source: "https://github.com/firecrawl/opencode-firecrawl",
    tags: ["web", "data"],
  },
  {
    name: "opencode-shell-strategy",
    author: "JRedeker",
    description: "Instructions for non-interactive shell commands — prevents hangs from TTY-dependent operations.",
    kind: "plugin",
    install: "opencode-shell-strategy",
    installKind: "npm",
    glyph: glyph("opencode-shell-strategy"),
    bg: "#1a2e1a",
    fg: "#6ee7b7",
    source: "https://github.com/JRedeker/opencode-shell-strategy",
    tags: ["shell"],
  },
  {
    name: "opencode-pty",
    author: "shekohex",
    description: "Enables AI agents to run background processes in a PTY, send interactive input to them.",
    kind: "plugin",
    install: "opencode-pty",
    installKind: "npm",
    glyph: glyph("opencode-pty"),
    bg: "#1a2e2e",
    fg: "#79e6c1",
    source: "https://github.com/shekohex/opencode-pty",
    tags: ["shell"],
  },
]

// ---- Skills ------------------------------------------------------------
const SKILLS: HubItem[] = [
  {
    name: "code-review",
    author: "mage/official",
    description: "Review changed code for correctness bugs, simplification, and efficiency at configurable effort levels.",
    kind: "skill",
    install: "code-review",
    installKind: "file",
    featured: true,
    glyph: "CR",
    bg: "#1d1730",
    fg: "#a78bfa",
    tags: ["review", "official"],
  },
  {
    name: "security-review",
    author: "mage/official",
    description: "Complete a security review of the pending changes on the current branch.",
    kind: "skill",
    install: "security-review",
    installKind: "file",
    featured: true,
    glyph: "SR",
    bg: "#3a1818",
    fg: "#ff8b8b",
    tags: ["security", "official"],
  },
  {
    name: "simplify",
    author: "mage/official",
    description: "Review and apply reuse, simplification, and efficiency cleanups to recently modified code.",
    kind: "skill",
    install: "simplify",
    installKind: "file",
    glyph: "SP",
    bg: "#1a2e1a",
    fg: "#6ee7b7",
    tags: ["refactor", "official"],
  },
  {
    name: "init",
    author: "mage/official",
    description: "Initialize a new AGENTS.md file with codebase documentation for a project.",
    kind: "skill",
    install: "init",
    installKind: "file",
    glyph: "IN",
    bg: "#172d4d",
    fg: "#7fb3ff",
    tags: ["setup", "official"],
  },
]

export const HUB_ITEMS: HubItem[] = [...MCP, ...PLUGINS, ...SKILLS]

/** Returns the install snippet text for a hub item */
export function installSnippet(item: HubItem): string {
  switch (item.installKind) {
    case "npm":
      return `// mage.json\n{\n  "plugin": ["${item.install}"]\n}`
    case "config":
      return `// mage.json\n{\n  "mcp": {\n    "${item.install}": {\n      "enabled": true\n    }\n  }\n}`
    case "file":
      return `.mage/skills/${item.install}/SKILL.md`
    default:
      return item.install
  }
}
