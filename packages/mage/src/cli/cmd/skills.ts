import fs from "fs/promises"
import path from "path"
import * as prompts from "@clack/prompts"
import { Effect } from "effect"
import { cmd } from "./cmd"
import { effectCmd } from "../effect-cmd"
import { UI } from "../ui"
import { Marketplace } from "@/marketplace"
import { InstanceRef } from "@/effect/instance-ref"
import { Global } from "@mybcabisnis/mage-core/global"
import { Skill } from "@/skill"

export const SkillsCommand = cmd({
  command: "skills",
  describe: "manage skills",
  builder: (yargs) => yargs.command(SkillsInstallCommand).command(SkillsRemoveCommand).demandCommand(),
  async handler() {},
})

export const SkillsInstallCommand = effectCmd({
  command: "install [name]",
  describe: "install a skill from the marketplace",
  builder: (yargs) =>
    yargs.positional("name", {
      describe: "name of the skill in the marketplace catalog",
      type: "string",
    }),
  handler: Effect.fn("Cli.skills.install")(function* (args) {
    const maybeCtx = yield* InstanceRef
    if (!maybeCtx) return yield* Effect.die("InstanceRef not provided")
    const ctx = maybeCtx
    yield* Effect.promise(async () => {
      UI.empty()
      prompts.intro("Install skill")

      const project = ctx.project

      const spinner = prompts.spinner()
      spinner.start("Fetching marketplace catalog...")
      let cat: Awaited<ReturnType<typeof Marketplace.catalog>>
      try {
        cat = await Marketplace.catalog()
      } catch (error) {
        spinner.stop("Failed to fetch catalog", 1)
        prompts.log.error(error instanceof Error ? error.message : String(error))
        prompts.outro("Done")
        return
      }
      spinner.stop(`Loaded ${cat.skills.length} skill(s) from Rune`)

      if (cat.skills.length === 0) {
        prompts.log.warn("No skills available in the marketplace catalog")
        prompts.outro("Done")
        return
      }

      let name = args.name
      if (!name) {
        const selected = await prompts.select({
          message: "Select a skill to install",
          options: cat.skills.map((s) => ({ label: s.name, value: s.name, hint: s.description })),
        })
        if (prompts.isCancel(selected)) throw new UI.CancelledError()
        name = selected
      }

      const entry = cat.skills.find((s) => s.name === name)
      if (!entry) {
        prompts.log.error(
          `Skill "${name}" not found in catalog. Available: ${cat.skills.map((s) => s.name).join(", ")}`,
        )
        prompts.outro("Done")
        return
      }

      const globalDir = path.join(Global.Path.config, "skills")
      const projectDir = path.join(ctx.worktree, ".mage", "skills")

      // Determine location (mirrors McpAddCommand's scope prompt in mcp.ts)
      let targetDir = globalDir
      if (project.vcs === "git") {
        const scopeResult = await prompts.select({
          message: "Location",
          options: [
            { label: "Current project", value: projectDir, hint: projectDir },
            { label: "Global", value: globalDir, hint: globalDir },
          ],
        })
        if (prompts.isCancel(scopeResult)) throw new UI.CancelledError()
        targetDir = scopeResult
      }

      const installSpinner = prompts.spinner()
      installSpinner.start(`Downloading "${name}"...`)
      let dir: string
      try {
        dir = await Marketplace.installSkill(entry, targetDir)
      } catch (error) {
        installSpinner.stop("Download failed", 1)
        prompts.log.error(error instanceof Error ? error.message : String(error))
        prompts.outro("Done")
        return
      }
      installSpinner.stop(`Downloaded "${name}"`)

      void Marketplace.recordInstall(name)

      prompts.log.success(`Skill "${name}" installed to ${dir}`)
      prompts.outro("Skill installed successfully")
    })
  }),
})

export const SkillsRemoveCommand = effectCmd({
  command: "remove [name]",
  aliases: ["rm", "uninstall"],
  describe: "remove an installed skill",
  builder: (yargs) =>
    yargs.positional("name", {
      describe: "name of the skill to remove",
      type: "string",
    }),
  handler: Effect.fn("Cli.skills.remove")(function* (args) {
    const skill = yield* Skill.Service
    const list = yield* skill.all()

    yield* Effect.promise(async () => {
      UI.empty()
      prompts.intro("Remove skill")

      if (list.length === 0) {
        prompts.log.warn("No skills found")
        prompts.outro("Done")
        return
      }

      let name = args.name
      if (!name) {
        const selected = await prompts.select({
          message: "Select a skill to remove",
          options: list.map((s) => ({ label: s.name, value: s.name, hint: s.location })),
        })
        if (prompts.isCancel(selected)) throw new UI.CancelledError()
        name = selected
      }

      const entry = list.find((s) => s.name === name)
      if (!entry) {
        prompts.log.error(`Skill "${name}" not found. Available: ${list.map((s) => s.name).join(", ")}`)
        prompts.outro("Done")
        return
      }

      const dir = path.dirname(entry.location)

      const confirmed = await prompts.confirm({
        message: `Remove skill "${name}" at ${dir}?`,
      })
      if (prompts.isCancel(confirmed) || !confirmed) {
        prompts.outro("Cancelled")
        return
      }

      try {
        await fs.rm(dir, { recursive: true, force: true })
      } catch (error) {
        prompts.log.error(error instanceof Error ? error.message : String(error))
        prompts.outro("Done")
        return
      }

      prompts.log.success(`Skill "${name}" removed`)
      prompts.outro("Skill removed successfully")
    })
  }),
})
