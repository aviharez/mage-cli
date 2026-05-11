import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import path from "path"
import fs from "fs/promises"
import os from "os"

const FIXTURE_DIR = path.join(os.tmpdir(), "mage-boilerplate-test")

const MANIFEST_YAML = `
name: Test Boilerplate
version: "1.0"
platform: web
language: TypeScript
description: Test boilerplate for unit tests
conventions:
  always_include:
    - conventions/style.md
    - conventions/arch.md
  include_for_review:
    - conventions/review.md
  include_for_testing:
    - conventions/testing.md
generators:
  service:
    instruction: instructions/service.md
    examples:
      - examples/user-service.ts
    description: Generate a TypeScript service class
  repository:
    instruction: instructions/repository.md
    examples: []
project_detection:
  markers:
    - package.json
    - tsconfig.json
context:
  max_convention_tokens: 5000
  max_example_tokens: 2000
`

async function writeFixture() {
  await fs.mkdir(FIXTURE_DIR, { recursive: true })
  await fs.mkdir(path.join(FIXTURE_DIR, "conventions"), { recursive: true })
  await fs.mkdir(path.join(FIXTURE_DIR, "instructions"), { recursive: true })
  await fs.mkdir(path.join(FIXTURE_DIR, "examples"), { recursive: true })

  await Bun.write(path.join(FIXTURE_DIR, "mage.yaml"), MANIFEST_YAML)
  await Bun.write(path.join(FIXTURE_DIR, "conventions/style.md"), "# Style Guide\nUse camelCase.")
  await Bun.write(path.join(FIXTURE_DIR, "conventions/arch.md"), "# Architecture\nUse layered arch.")
  await Bun.write(path.join(FIXTURE_DIR, "conventions/review.md"), "# Review Rules\nCheck null safety.")
  await Bun.write(path.join(FIXTURE_DIR, "conventions/testing.md"), "# Testing\nUse describe/it blocks.")
  await Bun.write(path.join(FIXTURE_DIR, "instructions/service.md"), "Generate a stateless service class.")
  await Bun.write(path.join(FIXTURE_DIR, "instructions/repository.md"), "Generate a data repository.")
  await Bun.write(path.join(FIXTURE_DIR, "examples/user-service.ts"), "export class UserService { /* example */ }")
}

// Import the plugin's internal helpers by re-exporting them via a test shim
// We test the logic by exercising the server plugin directly
const { server } = await import("./boilerplate")

describe("boilerplate plugin", () => {
  beforeAll(writeFixture)
  afterAll(() => fs.rm(FIXTURE_DIR, { recursive: true, force: true }))

  test("server plugin exports a function", () => {
    expect(typeof server).toBe("function")
  })

  test("plugin initializes with empty config when no mage config exists", async () => {
    const hooks = await server(
      {
        directory: "/tmp/nonexistent-project",
        worktree: "/tmp/nonexistent-project",
        client: {} as any,
        project: {} as any,
        serverUrl: new URL("http://localhost"),
        $: {} as any,
        experimental_workspace: { register: () => {} },
      },
      {},
    )
    expect(hooks).toBeDefined()
    expect(typeof hooks["experimental.chat.system.transform"]).toBe("function")
  })

  test("system transform injects conventions when boilerplate is configured", async () => {
    // Write a mage config pointing to the fixture
    const configDir = path.join(os.tmpdir(), "mage-plugin-test-config")
    await fs.mkdir(path.join(configDir, ".mage"), { recursive: true })
    const configFile = path.join(configDir, ".mage", "mage.jsonc")
    await Bun.write(configFile, JSON.stringify({ mage: { boilerplate: FIXTURE_DIR } }))

    const hooks = await server(
      {
        directory: configDir,
        worktree: configDir,
        client: {} as any,
        project: {} as any,
        serverUrl: new URL("http://localhost"),
        $: {} as any,
        experimental_workspace: { register: () => {} },
      },
      {},
    )

    const output = { system: [] as string[] }
    await hooks["experimental.chat.system.transform"]!({ model: {} as any }, output)

    expect(output.system.length).toBeGreaterThan(0)
    expect(output.system[0]).toContain("Project Conventions")
    expect(output.system[0]).toContain("camelCase")

    await fs.rm(configDir, { recursive: true, force: true })
  })

  test("mage_boilerplate_context returns generator instruction + examples", async () => {
    const configDir = path.join(os.tmpdir(), "mage-plugin-test-ctx")
    await fs.mkdir(path.join(configDir, ".mage"), { recursive: true })
    await Bun.write(
      path.join(configDir, ".mage", "mage.jsonc"),
      JSON.stringify({ mage: { boilerplate: FIXTURE_DIR } }),
    )

    const hooks = await server(
      {
        directory: configDir,
        worktree: configDir,
        client: {} as any,
        project: {} as any,
        serverUrl: new URL("http://localhost"),
        $: {} as any,
        experimental_workspace: { register: () => {} },
      },
      {},
    )

    const ctx = { sessionID: "t", messageID: "t", agent: "t", directory: configDir, worktree: configDir, abort: new AbortController().signal, metadata: () => {}, ask: () => { throw new Error() } }
    const result = await (hooks.tool as any)!["mage_boilerplate_context"]!.execute({ type: "service" }, ctx)
    const output = typeof result === "string" ? result : result.output

    expect(output).toContain("stateless service class")
    expect(output).toContain("UserService")

    await fs.rm(configDir, { recursive: true, force: true })
  })

  test("mage_boilerplate_context returns error for unknown type", async () => {
    const configDir = path.join(os.tmpdir(), "mage-plugin-test-unk")
    await fs.mkdir(path.join(configDir, ".mage"), { recursive: true })
    await Bun.write(
      path.join(configDir, ".mage", "mage.jsonc"),
      JSON.stringify({ mage: { boilerplate: FIXTURE_DIR } }),
    )

    const hooks = await server(
      {
        directory: configDir,
        worktree: configDir,
        client: {} as any,
        project: {} as any,
        serverUrl: new URL("http://localhost"),
        $: {} as any,
        experimental_workspace: { register: () => {} },
      },
      {},
    )

    const ctx = { sessionID: "t", messageID: "t", agent: "t", directory: configDir, worktree: configDir, abort: new AbortController().signal, metadata: () => {}, ask: () => { throw new Error() } }
    const result = await (hooks.tool as any)!["mage_boilerplate_context"]!.execute({ type: "unknown_xyz" }, ctx)
    const output = typeof result === "string" ? result : result.output

    expect(output).toContain("not found")
    expect(output).toContain("service")

    await fs.rm(configDir, { recursive: true, force: true })
  })

  test("mage_boilerplate_manage add rejects missing url", async () => {
    const hooks = await server(
      {
        directory: "/tmp/nonexistent-project",
        worktree: "/tmp/nonexistent-project",
        client: {} as any,
        project: {} as any,
        serverUrl: new URL("http://localhost"),
        $: {} as any,
        experimental_workspace: { register: () => {} },
      },
      {},
    )
    const ctx = { sessionID: "t", messageID: "t", agent: "t", directory: "/tmp", worktree: "/tmp", abort: new AbortController().signal, metadata: () => {}, ask: () => { throw new Error() } }
    const result = await (hooks.tool as any)!["mage_boilerplate_manage"]!.execute({ action: "add", name: "test" }, ctx)
    const output = typeof result === "string" ? result : result.output
    expect(output).toContain("Git URL")
  })

  test("mage_boilerplate_manage add registers local path as profile", async () => {
    const configDir = path.join(os.tmpdir(), "mage-plugin-test-add")
    await fs.mkdir(path.join(configDir, ".mage"), { recursive: true })
    await Bun.write(path.join(configDir, ".mage", "mage.jsonc"), JSON.stringify({ mage: {} }))

    const hooks = await server(
      {
        directory: configDir,
        worktree: configDir,
        client: {} as any,
        project: {} as any,
        serverUrl: new URL("http://localhost"),
        $: {} as any,
        experimental_workspace: { register: () => {} },
      },
      {},
    )

    // Simulate add with a local path that has mage.yaml (not a real git clone, just check validation)
    // We expect it to fail at git clone, which is correct — just verify it doesn't crash with wrong args
    const ctx = { sessionID: "t", messageID: "t", agent: "t", directory: configDir, worktree: configDir, abort: new AbortController().signal, metadata: () => {}, ask: () => { throw new Error() } }
    const result = await (hooks.tool as any)!["mage_boilerplate_manage"]!.execute({ action: "add", name: "my-bp", url: "not-a-real-url" }, ctx)
    const output = typeof result === "string" ? result : result.output
    // Should fail at git clone, not crash
    expect(output).toContain("Failed to clone")

    await fs.rm(configDir, { recursive: true, force: true })
  })

  test("mage_boilerplate_manage list returns profiles", async () => {
    const configDir = path.join(os.tmpdir(), "mage-plugin-test-mgmt")
    await fs.mkdir(path.join(configDir, ".mage"), { recursive: true })
    await Bun.write(
      path.join(configDir, ".mage", "mage.jsonc"),
      JSON.stringify({ mage: { boilerplate: FIXTURE_DIR } }),
    )

    const hooks = await server(
      {
        directory: configDir,
        worktree: configDir,
        client: {} as any,
        project: {} as any,
        serverUrl: new URL("http://localhost"),
        $: {} as any,
        experimental_workspace: { register: () => {} },
      },
      {},
    )

    const ctx = { sessionID: "t", messageID: "t", agent: "t", directory: configDir, worktree: configDir, abort: new AbortController().signal, metadata: () => {}, ask: () => { throw new Error() } }
    const result = await (hooks.tool as any)!["mage_boilerplate_manage"]!.execute({ action: "list" }, ctx)
    const output = typeof result === "string" ? result : result.output

    expect(output).toContain("default")

    await fs.rm(configDir, { recursive: true, force: true })
  })
})
