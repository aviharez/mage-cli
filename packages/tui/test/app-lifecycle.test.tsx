import { expect, mock, test } from "bun:test"
import type { TuiPluginApi } from "@mybcabisnis/mage-plugin/tui"
import { createTestRenderer } from "@opentui/core/testing"
import { Effect } from "effect"
import { AppNodeBuilder } from "@mybcabisnis/mage-core/effect/app-node-builder"
import { Global } from "@mybcabisnis/mage-core/global"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { createEventSource, createFetch, directory, json } from "./fixture/tui-sdk"

test("SIGHUP clears title and disposes scoped resources once", async () => {
  const setup = await createTestRenderer({ width: 80, height: 24, useThread: false })
  const core = await import("@opentui/core")
  mock.module("@opentui/core", () => ({ ...core, createCliRenderer: async () => setup.renderer }))
  const titles: string[] = []
  const setTitle = setup.renderer.setTerminalTitle.bind(setup.renderer)
  setup.renderer.setTerminalTitle = (title) => {
    titles.push(title)
    setTitle(title)
  }
  const listeners = new Set(process.listeners("SIGHUP"))
  const events = createEventSource()
  const calls = createFetch()
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  let disposes = 0

  try {
    const { run } = await import("../src/app")
    const task = Effect.runPromise(
      run({
        url: "http://test",
        directory,
        config: createTuiResolvedConfig({ plugin_enabled: {} }),
        fetch: calls.fetch,
        events: events.source,
        args: {},
        pluginHost: {
          async start() {
            started()
          },
          async dispose() {
            disposes++
          },
        },
      }).pipe(Effect.provide(AppNodeBuilder.build(Global.node))),
    )
    await ready
    process.emit("SIGHUP")
    await task

    expect(setup.renderer.isDestroyed).toBe(true)
    expect(titles.at(-1)).toBe("")
    expect(disposes).toBe(1)
    expect(process.listeners("SIGHUP").every((listener) => listeners.has(listener))).toBe(true)
  } finally {
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
    mock.restore()
  }
})

test("renders home while plugins are loading", async () => {
  const setup = await createTestRenderer({ width: 80, height: 24, useThread: false })
  const core = await import("@opentui/core")
  mock.module("@opentui/core", () => ({ ...core, createCliRenderer: async () => setup.renderer }))
  const events = createEventSource()
  const calls = createFetch()
  let signalStart!: () => void
  const started = new Promise<void>((resolve) => {
    signalStart = resolve
  })
  let releasePlugins!: () => void
  const pluginsReady = new Promise<void>((resolve) => {
    releasePlugins = resolve
  })
  let task: Promise<unknown> | undefined

  try {
    const { run } = await import("../src/app")
    task = Effect.runPromise(
      run({
        url: "http://test",
        directory,
        config: createTuiResolvedConfig({ plugin_enabled: {} }),
        fetch: calls.fetch,
        events: events.source,
        args: {},
        pluginHost: {
          async start() {
            signalStart()
            await pluginsReady
          },
          async dispose() {},
        },
      }).pipe(Effect.provide(AppNodeBuilder.build(Global.node))),
    )

    await started
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain("What are we building today?")

    await new Promise((resolve) => setTimeout(resolve, 550))
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain("Loading plugins...")

    releasePlugins()
    await Promise.resolve()
    process.emit("SIGHUP")
    await task
  } finally {
    releasePlugins?.()
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
    await task?.catch(() => undefined)
    mock.restore()
  }
})

test("renders home while sync is loading", async () => {
  const setup = await createTestRenderer({ width: 80, height: 24, useThread: false })
  const core = await import("@opentui/core")
  mock.module("@opentui/core", () => ({ ...core, createCliRenderer: async () => setup.renderer }))
  const events = createEventSource()
  let releaseSync!: () => void
  const syncReleased = new Promise<void>((resolve) => {
    releaseSync = resolve
  })
  const calls = createFetch(async (url) => {
    if (url.pathname === "/config/providers") {
      await syncReleased
      return json({ providers: [], default: {} })
    }
  })
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  let task: Promise<unknown> | undefined

  try {
    const { run } = await import("../src/app")
    task = Effect.runPromise(
      run({
        url: "http://test",
        directory,
        config: createTuiResolvedConfig({ plugin_enabled: {} }),
        fetch: calls.fetch,
        events: events.source,
        args: {},
        pluginHost: {
          async start() {
            started()
          },
          async dispose() {},
        },
      }).pipe(Effect.provide(AppNodeBuilder.build(Global.node))),
    )

    await ready
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain("What are we building today?")

    releaseSync()
    await Promise.resolve()
    process.emit("SIGHUP")
    await task
  } finally {
    releaseSync?.()
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
    await task?.catch(() => undefined)
    mock.restore()
  }
})

test("prompt stays disabled until sync and plugins are ready", async () => {
  const setup = await createTestRenderer({ width: 80, height: 24, useThread: false })
  const core = await import("@opentui/core")
  mock.module("@opentui/core", () => ({ ...core, createCliRenderer: async () => setup.renderer }))
  const events = createEventSource()
  let releaseSync!: () => void
  const syncReleased = new Promise<void>((resolve) => {
    releaseSync = resolve
  })
  const posts: string[] = []
  const calls = createFetch(async (url) => {
    if (url.pathname === "/config/providers") {
      await syncReleased
      return json({
        providers: [{ id: "test", name: "Test", models: { m1: { id: "m1", name: "M1" } } }],
        default: {},
      })
    }
    if (url.pathname === "/agent") return json([{ name: "build", mode: "primary" }])
    if (url.pathname.startsWith("/session/")) return json(url.pathname.endsWith("/message") ? [] : {})
  })
  const fetch = (async (input: RequestInfo | URL) => {
    if (input instanceof Request && input.method !== "GET") posts.push(new URL(input.url).pathname)
    return calls.fetch(input)
  }) as typeof globalThis.fetch
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  let task: Promise<unknown> | undefined

  try {
    const { run } = await import("../src/app")
    task = Effect.runPromise(
      run({
        url: "http://test",
        directory,
        config: createTuiResolvedConfig({ plugin_enabled: {} }),
        fetch,
        events: events.source,
        args: { prompt: "hello" },
        pluginHost: {
          async start() {
            started()
          },
          async dispose() {},
        },
      }).pipe(Effect.provide(AppNodeBuilder.build(Global.node))),
    )

    await ready
    await setup.renderOnce()
    expect(setup.captureCharFrame()).toContain("What are we building today?")
    // Give the (buggy) auto-submit path every chance to fire while disabled.
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(posts.filter((path) => path === "/session")).toHaveLength(0)

    releaseSync()
    const submitted = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("prompt never became enabled")), 5000)
      const check = () => {
        if (posts.includes("/session")) {
          clearTimeout(timeout)
          resolve()
          return
        }
        setTimeout(check, 50)
      }
      check()
    })
    await submitted
    await setup.renderOnce()

    process.emit("SIGHUP")
    await task
  } finally {
    releaseSync?.()
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
    await task?.catch(() => undefined)
    mock.restore()
  }
})

test("--continue waits for sync before navigating to session", async () => {
  const setup = await createTestRenderer({ width: 80, height: 24, useThread: false })
  const core = await import("@opentui/core")
  mock.module("@opentui/core", () => ({ ...core, createCliRenderer: async () => setup.renderer }))
  const events = createEventSource()
  let releaseSync!: () => void
  const syncReleased = new Promise<void>((resolve) => {
    releaseSync = resolve
  })
  const sessionGet: string[] = []
  const calls = createFetch(async (url) => {
    if (url.pathname === "/config/providers") {
      await syncReleased
      return json({ providers: [], default: {} })
    }
    if (url.pathname === "/session") {
      return json([
        {
          id: "dummy",
          title: "Demo session",
          slug: "dummy",
          projectID: "project",
          directory,
          version: "0.0.0-test",
          time: { created: 0, updated: 0 },
        },
      ])
    }
    if (url.pathname === "/session/dummy") {
      sessionGet.push(url.pathname)
      return json({
        id: "dummy",
        title: "Demo session",
        slug: "dummy",
        projectID: "project",
        directory,
        version: "0.0.0-test",
        time: { created: 0, updated: 0 },
      })
    }
    if (url.pathname.startsWith("/session/")) return json(url.pathname.endsWith("/message") ? [] : {})
  })
  const originalWrite = process.stdout.write.bind(process.stdout)
  let stdout = ""
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += String(chunk)
    return true
  }) as typeof process.stdout.write
  let api: TuiPluginApi | undefined
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  let task: Promise<unknown> | undefined

  try {
    const { run } = await import("../src/app")
    task = Effect.runPromise(
      run({
        url: "http://test",
        directory,
        config: createTuiResolvedConfig({ plugin_enabled: {} }),
        fetch: calls.fetch,
        events: events.source,
        args: { continue: true },
        pluginHost: {
          async start(input) {
            api = input.api
            started()
          },
          async dispose() {},
        },
      }).pipe(Effect.provide(AppNodeBuilder.build(Global.node))),
    )

    await ready
    await setup.renderOnce()
    // Session routes must not paint while sync is still loading.
    expect(setup.captureCharFrame()).not.toContain("What are we building today?")
    await new Promise((resolve) => setTimeout(resolve, 550))
    await setup.renderOnce()
    // App is mounted (startup spinner visible) but session content is gated.
    expect(setup.captureCharFrame()).toContain("Loading plugins...")

    releaseSync()
    const navigated = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("session route never hydrated")), 5000)
      const check = () => {
        if (sessionGet.includes("/session/dummy")) {
          clearTimeout(timeout)
          resolve()
          return
        }
        setTimeout(check, 50)
      }
      check()
    })
    await navigated
    await setup.renderOnce()

    api?.keymap.dispatchCommand("app.exit")
    await task

    expect(stdout).toContain("Demo session")
    expect(stdout).toContain("mage -s dummy")
  } finally {
    process.stdout.write = originalWrite
    releaseSync?.()
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
    await task?.catch(() => undefined)
    mock.restore()
  }
})

test("app.exit prints the session epilogue after scoped cleanup", async () => {
  const setup = await createTestRenderer({ width: 80, height: 24, useThread: false })
  const core = await import("@opentui/core")
  mock.module("@opentui/core", () => ({ ...core, createCliRenderer: async () => setup.renderer }))
  const events = createEventSource()
  const calls = createFetch((url) => {
    if (url.pathname === "/session")
      return json([
        {
          id: "dummy",
          title: "Demo session",
          slug: "dummy",
          projectID: "project",
          directory,
          version: "0.0.0-test",
          time: { created: 0, updated: 0 },
        },
      ])
  })
  const originalWrite = process.stdout.write.bind(process.stdout)
  let stdout = ""
  let api: TuiPluginApi | undefined
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })

  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += String(chunk)
    return true
  }) as typeof process.stdout.write

  try {
    const { run } = await import("../src/app")
    const task = Effect.runPromise(
      run({
        url: "http://test",
        directory,
        config: createTuiResolvedConfig({ plugin_enabled: {} }),
        fetch: calls.fetch,
        events: events.source,
        args: { continue: true },
        pluginHost: {
          async start(input) {
            api = input.api
            started()
          },
          async dispose() {},
        },
      }).pipe(Effect.provide(AppNodeBuilder.build(Global.node))),
    )

    await ready
    await setup.renderOnce()
    await setup.renderOnce()
    api?.keymap.dispatchCommand("app.exit")
    await task

    expect(stdout).toContain("Demo session")
    expect(stdout).toContain("mage -s dummy")
  } finally {
    process.stdout.write = originalWrite
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
    mock.restore()
  }
})
