import { expect, test } from "bun:test"
import { statusPlugins } from "../../src/component/dialog-status"

test("includes built-in RTK in status and avoids duplicate configured entries", () => {
  expect(statusPlugins([])).toEqual([{ name: "rtk", builtin: true }])
  expect(statusPlugins(["example-plugin@1.0.0", "rtk@0.44.2"])).toEqual([
    { name: "example-plugin", version: "1.0.0" },
    { name: "rtk", builtin: true },
  ])
})
