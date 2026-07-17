// Hub marketplace data
// Built-in skills are auto-generated from packages/mage/defaults/skills/*/SKILL.md
// by packages/wiki/script/gen-skills.ts (run via `bun run gen:skills` or automatically
// during `bun run build` via the prebuild hook). The committed JSON is the fallback
// for standalone / Docker builds where the monorepo is not present.

import builtinSkillsRaw from "../data/builtin-skills.json"
import { SKILL_HOWTO } from "../data/skill-howto"

export type HubItemKind = "mcp" | "skill"

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
  glyph: string
  bg: string
  fg: string
  /** true = ships with Mage (no install needed), false = downloadable */
  builtin?: boolean
  /** per-skill "Cara Kerja" prose in Bahasa Indonesia (built-in skills only) */
  howto?: string
  /** SPDX or human-readable license string from SKILL.md */
  license?: string
}

// Derive a compact glyph from a package name
function glyph(name: string): string {
  const clean = name.replace(/^[@/][^/]+\//, "").replace(/^mage-/, "")
  return clean.slice(0, 2).toUpperCase()
}

// Small deterministic palette so each built-in skill gets a consistent color.
// Keyed by a simple hash of the skill name → one of 6 hue families.
const PALETTE: { bg: string; fg: string }[] = [
  { bg: "#1d1730", fg: "#a78bfa" }, // violet
  { bg: "#1a2e1a", fg: "#6ee7b7" }, // emerald
  { bg: "#172d4d", fg: "#7fb3ff" }, // blue
  { bg: "#2a1f1a", fg: "#f5b76c" }, // amber
  { bg: "#3a1818", fg: "#ff8b8b" }, // red
  { bg: "#1a2e2e", fg: "#79e6c1" }, // teal
]

function pickPalette(name: string): { bg: string; fg: string } {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return PALETTE[hash % PALETTE.length]
}

// ---- Built-in skills (ship with Mage, no install needed) -------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BUILTIN_SKILLS: HubItem[] = (builtinSkillsRaw as any[]).map((raw) => ({
  name:        raw.name as string,
  author:      (raw.author as string | undefined) || "mage/official",
  description: raw.description as string,
  kind:        "skill" as const,
  install:     raw.name as string,
  installKind: "file" as const,
  glyph:       glyph(raw.name as string),
  builtin:     true,
  howto:       SKILL_HOWTO[raw.name as string],
  ...(raw.license ? { license: raw.license as string } : {}),
  ...pickPalette(raw.name as string),
}))

// ---- Downloadable skills (from the catalog registry) -----------------------
// Curated hand-picked list; will expand once the registry has entries.
const DOWNLOADABLE_SKILLS: HubItem[] = [
  // {
  //   name: "mage-aws-expert",
  //   author: "community",
  //   description:
  //     "Expert guidance for AWS infrastructure — IAM policies, CDK stacks, Lambda, ECS, and cost optimization recommendations.",
  //   kind: "skill",
  //   install: "mage-aws-expert",
  //   installKind: "file",
  //   glyph: "AW",
  //   bg: "#2a1f1a",
  //   fg: "#f5b76c",
  //   tags: ["cloud", "aws"],
  // },
  // {
  //   name: "spring-boot-developer",
  //   author: "community",
  //   description:
  //     "Spring Boot 3 development — REST APIs, JPA, security configuration, dependency injection, and Jakarta EE migration.",
  //   kind: "skill",
  //   install: "spring-boot-developer",
  //   installKind: "file",
  //   glyph: "SB",
  //   bg: "#1a2e1a",
  //   fg: "#6ee7b7",
  //   tags: ["java", "backend"],
  // },
  // {
  //   name: "data-analysis",
  //   author: "community",
  //   description:
  //     "Exploratory data analysis, SQL query optimization, pandas/polars workflows, and chart recommendations.",
  //   kind: "skill",
  //   install: "data-analysis",
  //   installKind: "file",
  //   glyph: "DA",
  //   bg: "#172d4d",
  //   fg: "#7fb3ff",
  //   tags: ["data", "sql"],
  // },
  // {
  //   name: "mobile-rn-developer",
  //   author: "community",
  //   description:
  //     "React Native and Expo development — navigation, state management, platform-specific APIs, and release builds.",
  //   kind: "skill",
  //   install: "mobile-rn-developer",
  //   installKind: "file",
  //   glyph: "RN",
  //   bg: "#2a1d40",
  //   fg: "#c4a8ff",
  //   tags: ["mobile", "react-native"],
  // },
]

// ---- MCP Servers -----------------------------------------------------------
const MCP: HubItem[] = [
  // {
  //   name: "filesystem",
  //   author: "mage/official",
  //   description: "Read, write, and search files in the working directory. Sandboxed to the session root.",
  //   kind: "mcp",
  //   install: "filesystem",
  //   installKind: "config",
  //   glyph: "FS",
  //   bg: "#1d1730",
  //   fg: "#a78bfa",
  //   tags: ["official", "core"],
  // },
  // {
  //   name: "github",
  //   author: "github/mcp",
  //   description: "Issues, pull requests, code search, and releases. OAuth flows through the gateway.",
  //   kind: "mcp",
  //   install: "github",
  //   installKind: "config",
  //   glyph: "GH",
  //   bg: "#0d1117",
  //   fg: "#e6edf3",
  //   tags: ["official", "devtools"],
  //   source: "https://github.com/github/github-mcp-server",
  // },
  // {
  //   name: "shell",
  //   author: "mage/official",
  //   description: "Execute shell commands with optional sandboxing. Auto-approves a curated allow-list.",
  //   kind: "mcp",
  //   install: "shell",
  //   installKind: "config",
  //   glyph: "SH",
  //   bg: "#1a2e1a",
  //   fg: "#6ee7b7",
  //   tags: ["official", "core"],
  // },
  // {
  //   name: "git",
  //   author: "mage/official",
  //   description: "Stage, diff, commit, branch, and rebase. Returns structured diffs the agent can reason about.",
  //   kind: "mcp",
  //   install: "git",
  //   installKind: "config",
  //   glyph: "GT",
  //   bg: "#2a1f1a",
  //   fg: "#f5b76c",
  //   tags: ["official", "core"],
  // },
  // {
  //   name: "postgres",
  //   author: "community",
  //   description: "Run read-only queries and inspect schemas. Connection strings stored in the gateway vault.",
  //   kind: "mcp",
  //   install: "postgres",
  //   installKind: "config",
  //   glyph: "PG",
  //   bg: "#172d4d",
  //   fg: "#7fb3ff",
  //   tags: ["data"],
  //   source: "https://github.com/modelcontextprotocol/servers",
  // },
  // {
  //   name: "playwright",
  //   author: "microsoft",
  //   description: "Drive a headless browser for end-to-end tests, screenshots, and DOM inspection.",
  //   kind: "mcp",
  //   install: "playwright",
  //   installKind: "config",
  //   glyph: "PW",
  //   bg: "#1f1f2a",
  //   fg: "#79e6c1",
  //   tags: ["devtools"],
  //   source: "https://github.com/microsoft/playwright-mcp",
  // },
  // {
  //   name: "linear",
  //   author: "linear/mcp",
  //   description: "Read and create issues, comment on threads, transition statuses. Scoped by team.",
  //   kind: "mcp",
  //   install: "linear",
  //   installKind: "config",
  //   glyph: "LN",
  //   bg: "#2a1d40",
  //   fg: "#c4a8ff",
  //   tags: ["productivity"],
  //   source: "https://github.com/linear/linear-mcp",
  // },
  // {
  //   name: "slack",
  //   author: "slack/mcp",
  //   description: "Search messages, post in channels, fetch threads. Posts require explicit confirmation.",
  //   kind: "mcp",
  //   install: "slack",
  //   installKind: "config",
  //   glyph: "SL",
  //   bg: "#2a1f3a",
  //   fg: "#c4a8ff",
  //   tags: ["productivity"],
  //   source: "https://github.com/modelcontextprotocol/servers",
  // },
  // {
  //   name: "notion",
  //   author: "notion/mcp",
  //   description: "Page search, block-level reads/writes, database queries. Workspace token via gateway.",
  //   kind: "mcp",
  //   install: "notion",
  //   installKind: "config",
  //   glyph: "NT",
  //   bg: "#1a1a1a",
  //   fg: "#e6e6e6",
  //   tags: ["productivity"],
  //   source: "https://github.com/makenotion/notion-mcp-server",
  // },
  // {
  //   name: "docker",
  //   author: "community",
  //   description: "List containers, exec, view logs, and build images. Read-only by default.",
  //   kind: "mcp",
  //   install: "docker",
  //   installKind: "config",
  //   glyph: "DK",
  //   bg: "#0c2436",
  //   fg: "#7fb3ff",
  //   tags: ["devtools", "cloud"],
  // },
  // {
  //   name: "sentry",
  //   author: "sentry/mcp",
  //   description: "Issue search, stack trace decoding, release tracking. Read-only.",
  //   kind: "mcp",
  //   install: "sentry",
  //   installKind: "config",
  //   glyph: "SN",
  //   bg: "#3a2a1a",
  //   fg: "#fbbf24",
  //   tags: ["cloud"],
  //   source: "https://github.com/getsentry/sentry-mcp",
  // },
]

export const HUB_ITEMS: HubItem[] = [...BUILTIN_SKILLS, ...DOWNLOADABLE_SKILLS, ...MCP]

/** Returns the install snippet text for a hub item */
export function installSnippet(item: HubItem): string {
  if (item.builtin) {
    return `// Sudah termasuk dalam Mage\n// Panggil dengan: /${item.install}`
  }
  switch (item.installKind) {
    case "config":
      return `// mage.json\n{\n  "mcp": {\n    "${item.install}": {\n      "enabled": true\n    }\n  }\n}`
    case "file":
      return `.mage/skills/${item.install}/SKILL.md`
    default:
      return item.install
  }
}
