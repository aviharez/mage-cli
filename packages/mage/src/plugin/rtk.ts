import type { Plugin } from "@mybcabisnis/mage-plugin"
import { filepath } from "@mybcabisnis/mage-core/rtk/binary"

// Rewrites bash tool commands through `rtk` for token savings. Adapted from
// https://github.com/rtk-ai/rtk (hooks/opencode/rtk.ts) with the plugin import
// changed from @opencode-ai/plugin to @mybcabisnis/mage-plugin.
// All rewrite logic lives in the rtk binary (`rtk rewrite`) — this is a thin
// delegating plugin. The binary is embedded at build time and seeded into
// ~/.cache/mage/bin by postinstall; filepath() lazy-downloads as a fallback.
export const RtkPlugin: Plugin = async ({ $ }) => {
  const rtk = await filepath().catch(() => undefined)
  if (!rtk) return {}
  if (!$) return {}

  return {
    "tool.execute.before": async (input, output) => {
      const tool = input.tool.toLowerCase()
      if (tool !== "bash" && tool !== "shell") return
      const command = output.args?.command
      if (typeof command !== "string" || !command) return

      try {
        // RTK returns a nonzero status for some successful rewrites; stdout is authoritative.
        const result = await $`${rtk} rewrite ${command}`.quiet().nothrow()
        const rewritten = result.stdout.toString().trim()
        if (rewritten && rewritten !== command) output.args.command = rewritten
      } catch {}
    },
  }
}
