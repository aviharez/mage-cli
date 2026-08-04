import type { PluginInput } from "@mybcabisnis/mage-plugin"
import { describe, expect, test } from "bun:test"
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
})
