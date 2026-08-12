import path from "path"
import type { Plugin } from "@mybcabisnis/mage-plugin"
import { filepath } from "@mybcabisnis/mage-core/rtk/binary"

// Rewrites bash tool commands through `rtk` for token savings. Adapted from
// https://github.com/rtk-ai/rtk (hooks/opencode/rtk.ts) with the plugin import
// changed from @opencode-ai/plugin to @mybcabisnis/mage-plugin.
// All rewrite logic lives in the rtk binary (`rtk rewrite`) — this is a thin
// delegating plugin. The resolver prefers a system RTK, then the embedded/cache
// binary, and finally lazy-downloads as a fallback.
export const RtkPlugin: Plugin = async ({ $ }) => {
  const rtk = await filepath().catch(() => undefined)
  if (!rtk) return {}
  if (!$) return {}

  const rtkDir = path.dirname(rtk)

  function addRtkPath(env: NodeJS.ProcessEnv) {
    const own = Object.keys(env).filter((item) => item.toLowerCase() === "path")
    const inherited = Object.keys(process.env).filter((item) => item.toLowerCase() === "path")
    const key = inherited[0] ?? own[0] ?? "PATH"
    const values = (own.length ? own.map((item) => env[item]) : inherited.map((item) => process.env[item])).flatMap(
      (item) => item?.split(path.delimiter) ?? [],
    )
    const current = values
      .filter(
        (item, index) =>
          item &&
          values.findIndex((candidate) =>
            process.platform === "win32" ? candidate.toLowerCase() === item.toLowerCase() : candidate === item,
          ) === index,
      )
      .join(path.delimiter)
    for (const item of own) {
      if (item !== key) delete env[item]
    }
    const normalized = path.resolve(rtkDir)
    const exists = current.split(path.delimiter).some((item) => {
      if (!item) return false
      const candidate = path.resolve(item)
      return process.platform === "win32"
        ? candidate.toLowerCase() === normalized.toLowerCase()
        : candidate === normalized
    })
    env[key] = exists ? current : [rtkDir, current].filter(Boolean).join(path.delimiter)
  }

  addRtkPath(process.env)

  return {
    "shell.env": async (_input, output) => {
      addRtkPath(output.env)
    },
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
