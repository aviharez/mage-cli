import { $ } from "bun"

// All channels share the prod icon set. The dev/beta icon folders were removed,
// so the channel argument is accepted (for caller compatibility) but ignored here.
const channel = process.argv[2] ?? "prod"

const src = `./icons/prod`
const dest = "resources/icons"

await $`rm -rf ${dest}`
await $`cp -R ${src} ${dest}`
console.log(`Copied prod icons from ${src} to ${dest} (channel: ${channel})`)
