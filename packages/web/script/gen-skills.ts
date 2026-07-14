#!/usr/bin/env bun

/**
 * gen-skills.ts
 * Reads packages/mage/defaults/skills/*\/SKILL.md and extracts the name +
 * description from each file's YAML frontmatter, then writes the result to
 * packages/web/src/data/builtin-skills.json so the hub page can list all
 * built-in skills at build time.
 *
 * Safe to run in standalone / Docker builds: if the skills directory doesn't
 * exist (monorepo not present), the script exits without touching the
 * committed fallback JSON.
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const skillsDir = path.resolve(__dirname, "../../mage/defaults/skills")
const outFile = path.resolve(__dirname, "../src/data/builtin-skills.json")

if (!fs.existsSync(skillsDir)) {
  console.log("gen-skills: skills dir not found (standalone build) — skipping")
  process.exit(0)
}

/** Extract a scalar string value from a YAML frontmatter line: `key: value` */
function extractField(frontmatter: string, key: string): string {
  const re = new RegExp(`^${key}:\\s*(.+)$`, "m")
  const m = frontmatter.match(re)
  if (!m) return ""
  // Strip optional surrounding single or double quotes
  return m[1].trim().replace(/^['"]|['"]$/g, "")
}

/**
 * Extract `metadata.author` — the value is indented under a `metadata:` block,
 * so we must match with leading whitespace to avoid colliding with top-level keys.
 */
function extractMetadataAuthor(frontmatter: string): string {
  const m = frontmatter.match(/^\s+author:\s*(.+)$/m)
  if (!m) return ""
  return m[1].trim().replace(/^['"]|['"]$/g, "")
}

/** Parse the first --- ... --- block from a SKILL.md file */
function parseFrontmatter(content: string): {
  name: string
  description: string
  author?: string
  license?: string
} | null {
  const start = content.indexOf("---")
  if (start === -1) return null
  const end = content.indexOf("---", start + 3)
  if (end === -1) return null
  const fm = content.slice(start + 3, end)
  const name = extractField(fm, "name")
  const description = extractField(fm, "description")
  if (!name) return null
  const author = extractMetadataAuthor(fm)
  const license = extractField(fm, "license")
  return {
    name,
    description,
    ...(author  ? { author }  : {}),
    ...(license ? { license } : {}),
  }
}

type SkillEntry = { name: string; description: string; author?: string; license?: string }

const entries: SkillEntry[] = []

for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const skillFile = path.join(skillsDir, entry.name, "SKILL.md")
  if (!fs.existsSync(skillFile)) continue
  const content = fs.readFileSync(skillFile, "utf8")
  const parsed = parseFrontmatter(content)
  if (!parsed) {
    console.warn(`gen-skills: could not parse frontmatter in ${skillFile}`)
    continue
  }
  entries.push(parsed)
}

// Sort alphabetically by name for stable output
entries.sort((a, b) => a.name.localeCompare(b.name))

// Ensure output dir exists
fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, JSON.stringify(entries, null, 2) + "\n")

console.log(`gen-skills: wrote ${entries.length} built-in skills → src/data/builtin-skills.json`)
