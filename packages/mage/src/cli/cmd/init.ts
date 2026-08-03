import path from "path"
import { existsSync, readFileSync } from "fs"
import { chmod } from "fs/promises"
import * as prompts from "@clack/prompts"
import { cmd } from "./cmd"
import { Global } from "@mybcabisnis/mage-core/global"
import { UI } from "../ui"
import { EOL } from "os"
import { isMageCredential, loginRune, type MageCredential } from "@/login/oauth"

const CONFIG_FILE = "mage.json"

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function readConfig(configPath: string): Promise<Record<string, any>> {
  const file = Bun.file(configPath)

  if (!(await file.exists())) return {}

  const text = await file.text()
  if (!text.trim()) return {}

  try {
    const value = JSON.parse(text)
    return isPlainObject(value) ? value : {}
  } catch (err) {
    process.stderr.write(`Warning: could not parse config at ${configPath}: ${err}${EOL}`)
    return {}
  }
}

export function isFirstRun(): boolean {
  const configPath = path.join(Global.Path.config, CONFIG_FILE)

  if (!existsSync(configPath)) return true

  try {
    const raw = readFileSync(configPath, "utf-8")
    const config = JSON.parse(raw)

    if (isMageCredential(config?.credential)) return false
  } catch {
    // unreadable or invalid — treat as first run
  }

  return true
}

export async function persistCredential(configPath: string, credential: MageCredential): Promise<void> {
  const existing = await readConfig(configPath)
  const merged: Record<string, any> = { ...existing, credential }

  if (isPlainObject(existing.login)) {
    const login = { ...existing.login }
    delete login.oauth
    if (Object.keys(login).length > 0) merged.login = login
    else delete merged.login
  }

  if (isPlainObject(existing.provider)) {
    const provider = { ...existing.provider }
    if (isPlainObject(provider.merlin)) {
      const merlin = { ...provider.merlin }
      if (isPlainObject(merlin.options)) {
        const options = { ...merlin.options }
        delete options.username
        if (Object.keys(options).length > 0) merlin.options = options
        else delete merlin.options
      }
      if (Object.keys(merlin).length > 0) provider.merlin = merlin
      else delete provider.merlin
    }
    if (Object.keys(provider).length > 0) merged.provider = provider
    else delete merged.provider
  }

  if (existsSync(configPath)) await chmod(configPath, 0o600)
  await Bun.write(configPath, JSON.stringify(merged, null, 2) + EOL)
  await chmod(configPath, 0o600)
}

async function runRuneLoginWizard(): Promise<void> {
  process.stderr.write(UI.logo() + EOL + EOL)
  prompts.intro("Mage login")

  let credential: Awaited<ReturnType<typeof loginRune>>
  try {
    credential = await loginRune()
  } catch (error) {
    prompts.log.error(error instanceof Error ? error.message : String(error))
    prompts.outro("Login failed")
    process.exit(1)
  }

  const configPath = path.join(Global.Path.config, CONFIG_FILE)
  await persistCredential(configPath, credential)

  prompts.log.success(`Hi ${credential.display_name}, lets work together with Mage! :)`)
  prompts.outro(`Config saved → ${configPath}`)
}

export async function runInitWizard(): Promise<void> {
  await runRuneLoginWizard()
}

export const InitCommand = cmd({
  command: "init",
  describe: "set up mage for first use",
  handler: runInitWizard,
})
