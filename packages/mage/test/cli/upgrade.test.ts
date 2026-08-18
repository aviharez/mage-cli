import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { Flag } from "@mybcabisnis/mage-core/flag/flag"
import { AppRuntime } from "../../src/effect/app-runtime"
import { GlobalBus, type GlobalEvent } from "../../src/bus/global"
import { Installation } from "../../src/installation"
import { upgrade } from "../../src/cli/upgrade"

const originalDisable = Flag.MAGE_DISABLE_AUTOUPDATE
const originalAlwaysNotify = Flag.MAGE_ALWAYS_NOTIFY_UPDATE

afterEach(() => {
  Flag.MAGE_DISABLE_AUTOUPDATE = originalDisable
  Flag.MAGE_ALWAYS_NOTIFY_UPDATE = originalAlwaysNotify
})

describe("startup upgrade", () => {
  test("notifies without installing when autoupdate is notify", async () => {
    const config = spyOn(AppRuntime, "runPromise").mockImplementation(async () => ({ autoupdate: "notify" }) as never)
    const method = spyOn(Installation, "method").mockResolvedValue("npm")
    const latest = spyOn(Installation, "latest").mockResolvedValue("1.0.1")
    const releaseType = spyOn(Installation, "getReleaseType").mockReturnValue("patch")
    const install = spyOn(Installation, "upgrade").mockResolvedValue()
    const events: GlobalEvent[] = []
    const onEvent = (event: GlobalEvent) => events.push(event)
    GlobalBus.on("event", onEvent)

    try {
      await upgrade()
    } finally {
      GlobalBus.off("event", onEvent)
      config.mockRestore()
      method.mockRestore()
      latest.mockRestore()
      releaseType.mockRestore()
      install.mockRestore()
    }

    expect(events).toHaveLength(1)
    expect(events[0]?.payload.type).toBe(Installation.Event.UpdateAvailable.type)
    expect(install).not.toHaveBeenCalled()
  })

  test("does nothing when autoupdate is disabled", async () => {
    const config = spyOn(AppRuntime, "runPromise").mockImplementation(async () => ({ autoupdate: false }) as never)
    const method = spyOn(Installation, "method").mockResolvedValue("npm")
    const latest = spyOn(Installation, "latest").mockResolvedValue("1.0.1")
    const install = spyOn(Installation, "upgrade").mockResolvedValue()
    const events: GlobalEvent[] = []
    const onEvent = (event: GlobalEvent) => events.push(event)
    GlobalBus.on("event", onEvent)

    try {
      await upgrade()
    } finally {
      GlobalBus.off("event", onEvent)
      config.mockRestore()
      method.mockRestore()
      latest.mockRestore()
      install.mockRestore()
    }

    expect(events).toHaveLength(0)
    expect(method).not.toHaveBeenCalled()
    expect(latest).not.toHaveBeenCalled()
    expect(install).not.toHaveBeenCalled()
  })

  test("does nothing when the disable flag is set", async () => {
    Flag.MAGE_DISABLE_AUTOUPDATE = true
    const config = spyOn(AppRuntime, "runPromise").mockImplementation(async () => ({}) as never)
    const method = spyOn(Installation, "method").mockResolvedValue("npm")

    try {
      await upgrade()
    } finally {
      config.mockRestore()
      method.mockRestore()
    }

    expect(method).not.toHaveBeenCalled()
  })
})
