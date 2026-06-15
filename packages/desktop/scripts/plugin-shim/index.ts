// Runtime shim for `@mybcabisnis/mage-plugin`.
//
// The packaged desktop app ships the default file-plugins (resources/defaults/
// plugin/*.ts) WITHOUT a monorepo node_modules, so their
// `import { tool } from "@mybcabisnis/mage-plugin"` cannot resolve and they fail
// to load ("Cannot find package '@mybcabisnis/mage-plugin'"). This shim is built
// (with zod bundled in) and copied into
// `resources/defaults/node_modules/@mybcabisnis/mage-plugin` so Node resolves it
// from the plugin files. In the monorepo (dev/web) the real workspace package
// resolves instead and this shim is never used.
//
// The default plugins only use the runtime `tool` value; `Plugin`/`Hooks` are
// type-only imports that Node's type-stripping erases at load time.
import { z } from "zod"

export function tool(input: unknown) {
  return input
}
// Mirror packages/plugin/src/tool.ts: expose zod under `tool.schema`.
;(tool as unknown as { schema: typeof z }).schema = z
