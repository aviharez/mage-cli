import type { PluginInput } from "@mybcabisnis/mage-plugin"
import { describe, expect, test } from "bun:test"
import path from "path"
import launch from "cross-spawn"
import { filepath } from "@mybcabisnis/mage-core/rtk/binary"
import { Shell } from "@mybcabisnis/mage-core/shell"
import { RtkPlugin } from "../../src/plugin/rtk"

describe("RtkPlugin", () => {
  test("rewrites bash commands before execution", async () => {
    const hooks = await RtkPlugin({ $: Bun.$ } as unknown as PluginInput)
    const hook = hooks["tool.execute.before"]
    expect(hook).toBeFunction()
    if (!hook) return

    const output = { args: { command: "git status" } }
    await hook({ tool: "bash", sessionID: "test", callID: "test" }, output)

    expect(output.args.command).toBe("rtk git status")
  })

  test("adds the resolved RTK directory without replacing the shell PATH", async () => {
    const hooks = await RtkPlugin({ $: Bun.$ } as unknown as PluginInput)
    const hook = hooks["shell.env"]
    expect(hook).toBeFunction()
    if (!hook) return

    const key = process.platform === "win32" ? "Path" : "PATH"
    const env: Record<string, string> = {
      [key]: path.delimiter === ";" ? "C:\\tools" : "/tools",
      [key === "PATH" ? "Path" : "PATH"]: path.delimiter === ";" ? "C:\\other" : "/other",
    }
    await hook({ cwd: "/tmp", sessionID: "test", callID: "test" }, { env })

    const rtkDir = path.dirname(await filepath())
    const keys = Object.keys(env).filter((item) => item.toLowerCase() === "path")
    expect(keys).toHaveLength(1)
    expect(env[keys[0]].split(path.delimiter)[0]).toBe(rtkDir)
    expect(env[keys[0]]).toContain(path.delimiter === ";" ? "C:\\tools" : "/tools")
    expect(env[keys[0]]).toContain(path.delimiter === ";" ? "C:\\other" : "/other")

    const existing = { [key === "PATH" ? "Path" : "PATH"]: rtkDir }
    await hook({ cwd: "/tmp", sessionID: "test", callID: "test" }, { env: existing })
    expect(Object.values(existing)).toEqual([rtkDir])
  })

  test("executes the rewritten command through Mage's shell", async () => {
    const hooks = await RtkPlugin({ $: Bun.$ } as unknown as PluginInput)
    const before = hooks["tool.execute.before"]
    const shellEnv = hooks["shell.env"]
    expect(before).toBeFunction()
    expect(shellEnv).toBeFunction()
    if (!before || !shellEnv) return

    const output = { args: { command: "git log --oneline -1" } }
    await before({ tool: "bash", sessionID: "test", callID: "test" }, output)
    const env: Record<string, string> = {}
    await shellEnv({ cwd: process.cwd(), sessionID: "test", callID: "test" }, { env })

    const shell = Shell.acceptable()
    const options = { cwd: process.cwd(), env: { ...process.env, ...env }, encoding: "utf8" as const }
    const result = Shell.ps(shell)
      ? launch.sync(shell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", output.args.command], options)
      : launch.sync(output.args.command, [], { ...options, shell })

    expect(result.error).toBeFalsy()
    expect(result.status).toBe(0)
  })
})
