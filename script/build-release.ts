#!/usr/bin/env bun

import { $ } from "bun"
import path from "path"
import { Script } from "@mybcabisnis/mage-script"

const root = path.resolve(import.meta.dirname, "..")
process.chdir(root)
process.env.MAGE_VERSION = Script.version
process.env.MAGE_CHANNEL = Script.channel

await $`bun install`
for (const directory of ["packages/sdk/js", "packages/plugin", "packages/web-react", "packages/mage"]) {
  await $`bun run build`.cwd(path.join(root, directory))
}

await Bun.write(
  path.join(root, ".mage-release-metadata"),
  JSON.stringify({ version: Script.version, channel: Script.channel }),
)
console.log(`Built Mage release ${Script.version} (${Script.channel})`)
