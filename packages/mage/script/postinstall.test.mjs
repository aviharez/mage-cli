import assert from "node:assert/strict"
import { mergeDefaults, tryPackages } from "./postinstall.mjs"

const existing = {
  permission: { bash: "allow" },
  skills: { paths: ["~/custom-skills"] },
  share: "auto",
}

assert.deepEqual(mergeDefaults(existing), {
  $schema: "https://mage.apps.ocpdevgra.dti.co.id/config.json",
  permission: { bash: "allow", edit: "ask" },
  skills: { paths: ["~/custom-skills", "~/.mage/skills"] },
  share: "auto",
  lsp: true,
})
assert.deepEqual(existing, {
  permission: { bash: "allow" },
  skills: { paths: ["~/custom-skills"] },
  share: "auto",
})

const attempts = []
assert.equal(
  tryPackages(
    ["first", "second"],
    (name) => {
      attempts.push(`installed:${name}`)
      if (name === "first") throw new Error("missing RTK")
      return true
    },
    (name) => {
      attempts.push(`download:${name}`)
      throw new Error("invalid package")
    },
  ),
  true,
)
assert.deepEqual(attempts, ["installed:first", "download:first", "installed:second"])
