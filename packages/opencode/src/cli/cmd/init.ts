import os from "os"
import path from "path"
import { existsSync, readFileSync } from "fs"
import * as prompts from "@clack/prompts"
import { cmd } from "./cmd"
import { Global } from "../../global"
import { UI } from "../ui"
import { EOL } from "os"

const CONFIG_FILE = "mage.json"

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function deepMerge(
  base: Record<string, any>,
  patch: Record<string, any>
): Record<string, any> {
  const result = { ...base }

  for (const key of Object.keys(patch)) {
    const baseVal = base[key]
    const patchVal = patch[key]

    if (isPlainObject(baseVal) && isPlainObject(patchVal)) {
      result[key] = deepMerge(baseVal, patchVal)
    } else {
      result[key] = patchVal
    }
  }

  return result
}

async function readConfig(configPath: string): Promise<Record<string, any>> {
  const file = Bun.file(configPath)

  if (!(await file.exists())) return {}

  const text = await file.text()
  if (!text.trim()) return {}

  try {
    return JSON.parse(text)
  } catch (err) {
    process.stderr.write(`Warning: could not parse config at ${configPath}: ${err}${EOL}`)
    return {}
  }
}

async function updateConfig(
  configPath: string,
  updates: Record<string, any>
): Promise<void> {
  const existing = await readConfig(configPath)
  const merged = deepMerge(existing, updates)
  await Bun.write(configPath, JSON.stringify(merged, null, 2) + EOL)
}

export function isFirstRun(): boolean {
  const configPath = path.join(Global.Path.config, CONFIG_FILE)

  if (!existsSync(configPath)) return true

  try {
    const raw = readFileSync(configPath, "utf-8")
    const config = JSON.parse(raw)
    const username = config?.provider?.merlin?.options?.username

    if (username && /^u0/i.test(username)) return false
  } catch {
    // unreadable or invalid — treat as first run
  }

  return true
}

export async function runInitWizard(): Promise<void> {
  process.stderr.write(UI.logo() + EOL + EOL)

  prompts.intro("Mage setup")

  const username = await prompts.text({
    message: "BCA udomain username",
    placeholder: os.userInfo().username,
    defaultValue: os.userInfo().username
  })
  if (prompts.isCancel(username)) {
    prompts.cancel("Setup cancelled")
    process.exit(0)
  }

  const boilerplate = await prompts.text({
    message: "Team boilerplate path (optional)",
    placeholder: "local/path or https://git-url — leave empty to skip",
  })
  if (prompts.isCancel(boilerplate)) {
    prompts.cancel("Setup cancelled")
    process.exit(0)
  }

  const updates: Record<string, any> = {
    provider: {
      merlin: {
        options: {
          username: (username as string).trim(),
        },
      },
    },
    model: "merlin/qwen3",
  }

  const bp = (boilerplate as string | undefined)?.trim()
  if (bp) {
    updates.mage = { boilerplate: bp }
  }

  const configPath = path.join(Global.Path.config, CONFIG_FILE)
  await updateConfig(configPath, updates)

  prompts.outro(`Config saved → ${configPath}`)
}

export const InitCommand = cmd({
  command: "init",
  describe: "set up mage for first use",
  handler: runInitWizard,
})