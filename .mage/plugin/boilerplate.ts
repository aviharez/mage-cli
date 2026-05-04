/**
 * Mage boilerplate plugin — auto-loaded from .mage/plugin/boilerplate.ts
 *
 * Responsibilities:
 *  1. Inject active boilerplate conventions into every system prompt
 *     (via "experimental.chat.system.transform" hook)
 *  2. Expose tools consumed by /generate, /test, /review, /boilerplate commands:
 *     - mage_boilerplate_context  — fetch generator instruction + examples for a type
 *     - mage_boilerplate_manage   — list / info / use / add profiles
 *
 * Config keys (in ~/.mage/config.json or project .mage/mage.jsonc):
 *   mage.boilerplate        — path to single boilerplate root (from `mage init`)
 *   mage.profiles           — array of { name, path } objects (multi-profile)
 *   mage.activeBoilerplate  — name of the active profile (when using multi-profile)
 *
 * Boilerplates cloned from Git are stored in ~/.mage/boilerplates/<name>/
 */

import type { Plugin, Hooks } from "@mybcabisnis/mage-plugin"
import { tool } from "@mybcabisnis/mage-plugin"
import { z } from "zod"
import path from "path"
import { existsSync, mkdirSync } from "fs"
import { parse as parseYaml } from "yaml"
import os from "os"

// ~/.mage/boilerplates/ — local clone destination for Git-sourced boilerplates
const BOILERPLATES_DIR = path.join(os.homedir(), ".mage", "boilerplates")

// ── mage.yaml Manifest Schema ────────────────────────────────────────────────

const GeneratorDefSchema = z.object({
  instruction: z.string().min(1),
  examples: z.array(z.string()).default([]),
  description: z.string().optional(),
})

const BoilerplateManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string(),
  platform: z.string(),
  language: z.string(),
  description: z.string().optional().default(""),
  conventions: z.object({
    always_include: z.array(z.string()),
    include_for_review: z.array(z.string()).optional(),
    include_for_testing: z.array(z.string()).optional(),
  }),
  generators: z.record(z.string(), GeneratorDefSchema).default({}),
  project_detection: z
    .object({
      markers: z.array(z.string()),
      source_roots: z.array(z.string()).default([]),
      test_roots: z.array(z.string()).default([]),
      ignore: z.array(z.string()).default([]),
    })
    .optional(),
  context: z
    .object({
      max_convention_tokens: z.number().default(2500),
      max_example_tokens: z.number().default(1500),
    })
    .default({ max_convention_tokens: 2500, max_example_tokens: 1500 }),
})

type BoilerplateManifest = z.infer<typeof BoilerplateManifestSchema>

// ── Config reading ───────────────────────────────────────────────────────────

interface MageBoilerplateConfig {
  boilerplate?: string
  profiles?: Array<{ name: string; path: string }>
  activeBoilerplate?: string
}

function globalConfigPath(): string {
  return path.join(os.homedir(), ".mage", "mage.json")
}

async function readMageSection(directory: string): Promise<MageBoilerplateConfig> {
  const home = os.homedir()
  const candidates = [
    globalConfigPath(),
    // path.join(home, ".mage", "mage.json"),
    // path.join(home, ".mage", "mage.jsonc"),
    // path.join(directory, ".mage", "mage.json"),
    // path.join(directory, ".mage", "mage.jsonc"),
  ]

  const merged: MageBoilerplateConfig = {}

  // Read global config first (lower priority), then project config (higher priority)
  for (const candidate of candidates.toReversed()) {
    if (!existsSync(candidate)) continue
    try {
      const text = await Bun.file(candidate).text()
      const stripped = text.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "")
      const config = JSON.parse(stripped)
      if (config?.mage) Object.assign(merged, config.mage)
    } catch {
      // ignore malformed config
    }
  }

  return merged
}

// ── Boilerplate loading ──────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

interface LoadedBoilerplate {
  manifest: BoilerplateManifest
  basePath: string
  conventions: Map<string, string>
  reviewRules: string | null
  testConventions: string | null
}

async function loadBoilerplate(basePath: string): Promise<LoadedBoilerplate | null> {
  const manifestPath = path.join(basePath, "mage.yaml")
  if (!existsSync(manifestPath)) return null

  try {
    const raw = parseYaml(await Bun.file(manifestPath).text())
    const manifest = BoilerplateManifestSchema.parse(raw)

    const maxConventionTokens = manifest.context.max_convention_tokens
    const conventions = new Map<string, string>()
    let conventionTokens = 0

    for (const file of manifest.conventions.always_include) {
      const filePath = path.join(basePath, file)
      if (!existsSync(filePath)) continue
      const content = await Bun.file(filePath).text()
      const tokens = estimateTokens(content)
      if (conventionTokens + tokens > maxConventionTokens) continue
      conventions.set(file, content)
      conventionTokens += tokens
    }

    let reviewRules: string | null = null
    if (manifest.conventions.include_for_review?.length) {
      const parts: string[] = []
      for (const file of manifest.conventions.include_for_review) {
        const filePath = path.join(basePath, file)
        if (existsSync(filePath)) parts.push(await Bun.file(filePath).text())
      }
      if (parts.length > 0) reviewRules = parts.join("\n\n")
    }

    let testConventions: string | null = null
    if (manifest.conventions.include_for_testing?.length) {
      const parts: string[] = []
      for (const file of manifest.conventions.include_for_testing) {
        const filePath = path.join(basePath, file)
        if (existsSync(filePath)) parts.push(await Bun.file(filePath).text())
      }
      if (parts.length > 0) testConventions = parts.join("\n\n")
    }

    return { manifest, basePath, conventions, reviewRules, testConventions }
  } catch {
    return null
  }
}

async function resolveActiveBoilerplatePath(mageConfig: MageBoilerplateConfig): Promise<string | null> {
  // Multi-profile: use activeBoilerplate name to find path in profiles list
  if (mageConfig.activeBoilerplate && mageConfig.profiles?.length) {
    const profile = mageConfig.profiles.find((p) => p.name === mageConfig.activeBoilerplate)
    if (profile) return profile.path
  }
  // Single-path: use mage.boilerplate directly
  if (mageConfig.boilerplate) return mageConfig.boilerplate
  return null
}

async function detectBoilerplate(
  directory: string,
  mageConfig: MageBoilerplateConfig,
): Promise<LoadedBoilerplate | null> {
  const activePath = await resolveActiveBoilerplatePath(mageConfig)
  if (activePath) {
    const loaded = await loadBoilerplate(activePath)
    if (loaded) return loaded
  }

  // Auto-detect: scan all profiles for matching markers
  if (mageConfig.profiles?.length) {
    for (const profile of mageConfig.profiles) {
      const loaded = await loadBoilerplate(profile.path)
      if (!loaded) continue
      const markers = loaded.manifest.project_detection?.markers ?? []
      if (markers.length > 0 && markers.every((m) => existsSync(path.join(directory, m)))) {
        return loaded
      }
    }
  }

  return null
}

// ── Git helpers ──────────────────────────────────────────────────────────────

async function runGit(args: string[], cwd?: string): Promise<{ ok: boolean; output: string }> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })
  await proc.exited
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const output = (stdout + stderr).trim()
  return { ok: proc.exitCode === 0, output }
}

async function gitCloneOrPull(url: string, name: string): Promise<{ path: string; action: string }> {
  const targetPath = path.join(BOILERPLATES_DIR, name)
  mkdirSync(BOILERPLATES_DIR, { recursive: true })

  if (existsSync(path.join(targetPath, ".git", "HEAD"))) {
    const result = await runGit(["pull", "--ff-only"], targetPath)
    if (!result.ok) throw new Error(`git pull failed: ${result.output}`)
    return { path: targetPath, action: result.output.includes("Already up to date") ? "already up to date" : "updated" }
  }

  const result = await runGit(["clone", "--depth", "1", url, targetPath])
  if (!result.ok) throw new Error(`git clone failed: ${result.output}`)
  return { path: targetPath, action: "cloned" }
}

// ── Plugin definition ────────────────────────────────────────────────────────

export const server: Plugin = async (input) => {
  const { directory } = input
  const mageConfig = await readMageSection(directory)

  // Load the active boilerplate at startup (cached for the server's lifetime)
  let boilerplate: LoadedBoilerplate | null = await detectBoilerplate(directory, mageConfig)

  const hooks: Hooks = {
    // Inject conventions into every system prompt
    "experimental.chat.system.transform": async (_inp, output) => {
      if (!boilerplate) {
        boilerplate = await detectBoilerplate(directory, await readMageSection(directory))
      }
      if (!boilerplate || boilerplate.conventions.size === 0) return

      const conventionBlock = [
        `## Project Conventions (${boilerplate.manifest.name})`,
        ...[...boilerplate.conventions.entries()].map(([file, content]) => `### ${file}\n${content}`),
      ].join("\n\n")

      output.system.push(conventionBlock)
    },

    tool: {
      // Get generator instruction + examples for a given generator type
      mage_boilerplate_context: tool({
        description:
          "Get the boilerplate generator instruction and code examples for a given type. " +
          "Call this before generating code to obtain the team's patterns and conventions for that type. " +
          "Returns the generator instruction and any example files.",
        args: {
          type: tool.schema.string().describe("Generator type name (e.g. 'service', 'repository', 'viewmodel')"),
        },
        async execute({ type }) {
          if (!boilerplate) {
            boilerplate = await detectBoilerplate(directory, await readMageSection(directory))
          }
          if (!boilerplate) {
            return "No boilerplate loaded. Run `/boilerplate add [name] [url/path]` to configure a boilerplate path."
          }

          const gen = boilerplate.manifest.generators[type]
          if (!gen) {
            const available = Object.keys(boilerplate.manifest.generators).join(", ")
            return `Generator type "${type}" not found in boilerplate "${boilerplate.manifest.name}".\nAvailable: ${available || "(none)"}`
          }

          // Load instruction file if path references a file
          let instruction = gen.instruction
          const instructionPath = path.join(boilerplate.basePath, gen.instruction)
          if (existsSync(instructionPath)) {
            instruction = await Bun.file(instructionPath).text()
          }

          // Load example files within token budget
          const maxExampleTokens = boilerplate.manifest.context.max_example_tokens
          const examples: string[] = []
          let exampleTokens = 0
          for (const exFile of gen.examples) {
            const exPath = path.join(boilerplate.basePath, exFile)
            if (!existsSync(exPath)) continue
            const content = await Bun.file(exPath).text()
            const tokens = estimateTokens(content)
            if (exampleTokens + tokens > maxExampleTokens) continue
            examples.push(`### Example: ${exFile}\n${content}`)
            exampleTokens += tokens
          }

          const parts = [`## Generator: ${type}\n\n${instruction}`]
          if (examples.length > 0) {
            parts.push(`## Examples\n\n${examples.join("\n\n---\n\n")}`)
          }
          return parts.join("\n\n")
        },
      }),

      // Get review rules from boilerplate
      mage_boilerplate_review_rules: tool({
        description:
          "Get the boilerplate's code review rules and guidelines. " +
          "Call this before reviewing a file to obtain the team's review criteria.",
        args: {},
        async execute() {
          if (!boilerplate) {
            boilerplate = await detectBoilerplate(directory, await readMageSection(directory))
          }
          if (!boilerplate) return "No boilerplate loaded. Run `/boilerplate add [name] [url/path]` to configure a boilerplate path."
          if (!boilerplate.reviewRules) return "No review rules defined in the active boilerplate."
          return `## Review Rules (${boilerplate.manifest.name})\n\n${boilerplate.reviewRules}`
        },
      }),

      // Get test conventions from boilerplate
      mage_boilerplate_test_conventions: tool({
        description:
          "Get the boilerplate's testing conventions and patterns. " +
          "Call this before generating tests to obtain the team's test style and patterns.",
        args: {},
        async execute() {
          if (!boilerplate) {
            boilerplate = await detectBoilerplate(directory, await readMageSection(directory))
          }
          if (!boilerplate) return "No boilerplate loaded. Run `/boilerplate add [name] [url/path]` to configure a boilerplate path."
          if (!boilerplate.testConventions) return "No test conventions defined in the active boilerplate."
          return `## Test Conventions (${boilerplate.manifest.name})\n\n${boilerplate.testConventions}`
        },
      }),

      // List / switch / add profiles
      mage_boilerplate_manage: tool({
        description:
          "Manage Mage boilerplate profiles. " +
          "action='list' — show all profiles. " +
          "action='info' — show active boilerplate details. " +
          "action='use' — switch active profile (requires name). " +
          "action='add' — clone a boilerplate from a Git URL into ~/.mage/boilerplates/<name> and register it (requires name and url).",
        args: {
          action: tool.schema.enum(["list", "info", "use", "add"]).describe("Action: list | info | use | add"),
          name: tool.schema.string().optional().describe("Profile name (required for 'use' and 'add')"),
          url: tool.schema.string().optional().describe("Git URL to clone (required for 'add')"),
        },
        async execute({ action, name, url }) {
          const cfg = await readMageSection(directory)

          if (action === "list") {
            const profiles = cfg.profiles ?? []
            if (cfg.boilerplate && profiles.length === 0) {
              profiles.push({ name: "default", path: cfg.boilerplate })
            }
            if (profiles.length === 0) {
              return "No boilerplate profiles configured. Run `/boilerplate add [name] [url/path]` to add one."
            }
            const active = cfg.activeBoilerplate ?? (profiles.length === 1 ? profiles[0]!.name : null)
            return profiles
              .map((p) => `${p.name === active ? "● " : "  "}${p.name} → ${p.path}`)
              .join("\n")
          }

          if (action === "info") {
            if (!boilerplate) {
              boilerplate = await detectBoilerplate(directory, cfg)
            }
            if (!boilerplate) return "No active boilerplate."
            const m = boilerplate.manifest
            const generators = Object.keys(m.generators).join(", ")
            return [
              `**${m.name}** v${m.version}`,
              `Platform: ${m.platform} | Language: ${m.language}`,
              m.description ? `Description: ${m.description}` : null,
              `Conventions: ${boilerplate.conventions.size} file(s) loaded`,
              generators ? `Generators: ${generators}` : null,
              `Path: ${boilerplate.basePath}`,
            ]
              .filter(Boolean)
              .join("\n")
          }

          if (action === "use") {
            if (!name) return "Specify a profile name: mage_boilerplate_manage(action='use', name='...')"
            const profiles = cfg.profiles ?? []
            if (!profiles.some((p) => p.name === name)) {
              return `Profile "${name}" not found. Available: ${profiles.map((p) => p.name).join(", ") || "(none)"}`
            }

            // Write activeBoilerplate to global config
            const configPath = globalConfigPath()
            let existing: Record<string, any> = {}
            try {
              const text = await Bun.file(configPath).text()
              existing = JSON.parse(text.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, ""))
            } catch { }
            existing.mage ??= {}
            existing.mage.activeBoilerplate = name
            await Bun.write(configPath, JSON.stringify(existing, null, 2))

            // Reload boilerplate
            boilerplate = await detectBoilerplate(directory, { ...cfg, activeBoilerplate: name })
            return `Switched to profile "${name}"${boilerplate ? ` (${boilerplate.manifest.name})` : ""}`
          }

          if (action === "add") {
            if (!name) return "Specify a profile name: mage_boilerplate_manage(action='add', name='...', url='...')"
            if (!url) return "Specify a Git URL or local path: mage_boilerplate_manage(action='add', name='...', url='...')"

            const isLocalPath = url.startsWith("/") || url.startsWith("~") || url.startsWith(".")
            const resolvedLocalPath = isLocalPath ? url.replace(/^~/, os.homedir()) : null

            let cloneResult: { path: string; action: string }
            if (resolvedLocalPath && existsSync(resolvedLocalPath)) {
              // Local directory — register directly without cloning
              cloneResult = { path: resolvedLocalPath, action: "linked" }
            } else if (isLocalPath) {
              return `Local path not found: ${resolvedLocalPath ?? url}`
            } else {
              try {
                cloneResult = await gitCloneOrPull(url, name)
              } catch (err) {
                return `Failed to clone boilerplate: ${(err as Error).message}`
              }
            }

            if (!existsSync(path.join(cloneResult.path, "mage.yaml"))) {
              return `No mage.yaml found at ${cloneResult.path}. Make sure the directory contains a mage.yaml manifest.`
            }

            // Register in global config
            const configPath = globalConfigPath()
            let existing: Record<string, any> = {}
            try {
              const text = await Bun.file(configPath).text()
              existing = JSON.parse(text.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, ""))
            } catch { }
            existing.mage ??= {}
            existing.mage.profiles ??= []
            const profiles: Array<{ name: string; path: string }> = existing.mage.profiles
            const existingIdx = profiles.findIndex((p) => p.name === name)
            if (existingIdx >= 0) {
              profiles[existingIdx]!.path = cloneResult.path
            } else {
              profiles.push({ name, path: cloneResult.path })
            }
            existing.mage.activeBoilerplate = name
            await Bun.write(configPath, JSON.stringify(existing, null, 2))

            // Reload boilerplate
            boilerplate = await detectBoilerplate(directory, { ...existing.mage })
            const actionLabel = cloneResult.action === "linked" ? "registered (local)" : cloneResult.action
            return `Boilerplate "${name}" ${actionLabel} → ${cloneResult.path}\nNow active.`
          }

          return "Unknown action"
        },
      }),
    },
  }

  return hooks
}
