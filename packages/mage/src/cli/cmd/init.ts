import os from "os"
import path from "path"
import { existsSync, readFileSync } from "fs"
import * as prompts from "@clack/prompts"
import { cmd } from "./cmd"
import { Global } from "@mybcabisnis/mage-core/global"
import { UI } from "../ui"
import { EOL } from "os"
import { loginLdap } from "@/login/ldap"

const CONFIG_FILE = "mage.json"

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function deepMerge(base: Record<string, any>, patch: Record<string, any>): Record<string, any> {
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

async function updateConfig(configPath: string, updates: Record<string, any>): Promise<void> {
  const existing = await readConfig(configPath)
  const merged = deepMerge(existing, updates)
  await Bun.write(configPath, JSON.stringify(merged, null, 2) + EOL)
}

function isLdapLoginEnabled(): boolean {
  return process.env.MAGE_LOGIN_LDAP === "1"
}

export function isFirstRun(): boolean {
  const configPath = path.join(Global.Path.config, CONFIG_FILE)

  if (!existsSync(configPath)) return true

  try {
    const raw = readFileSync(configPath, "utf-8")
    const config = JSON.parse(raw)

    if (isLdapLoginEnabled()) {
      const oauth = config?.login?.oauth
      const access = oauth?.access
      if (typeof access !== "string" || access.length === 0) return true
      const expires = oauth?.expires
      // No expiry recorded (e.g. non-expiring token) or still valid.
      if (typeof expires !== "number" || expires > Date.now() / 1000) return false
      return true
    }

    const username = config?.provider?.merlin?.options?.username
    if (username && /^u0/i.test(username)) return false
  } catch {
    // unreadable or invalid — treat as first run
  }

  return true
}

async function runLdapLoginWizard(): Promise<void> {
  process.stderr.write(UI.logo() + EOL + EOL)
  prompts.intro("Mage login")

  let result: Awaited<ReturnType<typeof loginLdap>>
  try {
    result = await loginLdap()
  } catch (error) {
    prompts.log.error(error instanceof Error ? error.message : String(error))
    prompts.outro("Login failed")
    process.exit(1)
  }

  const updates: Record<string, any> = {
    login: {
      oauth: {
        access: result.access,
        ...(result.refresh ? { refresh: result.refresh } : {}),
        ...(result.expires ? { expires: result.expires } : {}),
        ...(result.username ? { username: result.username } : {}),
      },
    },
  }
  // Derive the Merlin domain_id straight from the authenticated identity —
  // no separate username prompt when logging in via LDAP.
  if (result.username) {
    updates.provider = {
      merlin: {
        options: {
          username: result.username,
        },
      },
    }
  }

  const configPath = path.join(Global.Path.config, CONFIG_FILE)
  await updateConfig(configPath, updates)

  prompts.outro(`Config saved → ${configPath}`)
}

async function runUsernameWizard(): Promise<void> {
  process.stderr.write(UI.logo() + EOL + EOL)

  prompts.intro("Mage setup")

  const username = await prompts.text({
    message: "BCA udomain username",
    placeholder: os.userInfo().username,
    defaultValue: os.userInfo().username,
  })
  if (prompts.isCancel(username)) {
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
  }

  const configPath = path.join(Global.Path.config, CONFIG_FILE)
  await updateConfig(configPath, updates)

  prompts.outro(`Config saved → ${configPath}`)
}

export async function runInitWizard(): Promise<void> {
  if (isLdapLoginEnabled()) {
    await runLdapLoginWizard()
    return
  }
  await runUsernameWizard()
}

export const InitCommand = cmd({
  command: "init",
  describe: "set up mage for first use",
  handler: runInitWizard,
})
