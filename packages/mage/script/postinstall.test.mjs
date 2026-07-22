import assert from "node:assert/strict"
import { mergeDefaults } from "./postinstall.mjs"

const existing = {
  permission: { bash: "allow" },
  skills: { paths: ["~/custom-skills"] },
  share: "auto",
}

assert.deepEqual(mergeDefaults(existing), {
  $schema: "https://mage.ai/config.json",
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
