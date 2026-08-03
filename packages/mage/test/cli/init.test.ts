import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, stat } from "fs/promises"
import os from "os"
import path from "path"
import { Global } from "@mybcabisnis/mage-core/global"
import { isFirstRun, persistCredential } from "@/cli/cmd/init"

const credential = {
  udomain: "u012345",
  display_name: "Monitoring MBB MBB",
  access_token: "access",
  refresh_token: "refresh",
}

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("Mage credential persistence", () => {
  test("treats missing or incomplete credentials as first run", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mage-first-run-test-"))
    tempDirs.push(dir)
    const previousConfig = Global.Path.config
    Global.Path.config = dir

    try {
      expect(isFirstRun()).toBe(true)
      await Bun.write(path.join(dir, "mage.json"), JSON.stringify({ credential: { udomain: "u012345" } }))
      expect(isFirstRun()).toBe(true)
      await Bun.write(path.join(dir, "mage.json"), JSON.stringify({ credential }))
      expect(isFirstRun()).toBe(false)
    } finally {
      Global.Path.config = previousConfig
    }
  })

  test("writes the new credential shape, removes replaced fields, and preserves unrelated settings", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mage-init-test-"))
    tempDirs.push(dir)
    const configPath = path.join(dir, "mage.json")
    await Bun.write(
      configPath,
      JSON.stringify({
        model: "merlin/default",
        login: { oauth: { access: "legacy" }, keep: true },
        provider: { merlin: { options: { username: "u999999", baseURL: "https://gaia.example" } } },
      }),
    )

    await persistCredential(configPath, credential)

    expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual({
      model: "merlin/default",
      login: { keep: true },
      provider: { merlin: { options: { baseURL: "https://gaia.example" } } },
      credential,
    })
    expect((await stat(configPath)).mode & 0o777).toBe(0o600)
  })
})
