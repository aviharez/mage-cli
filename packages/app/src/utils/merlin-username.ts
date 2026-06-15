import type { Config } from "@mybcabisnis/mage-sdk/v2/client"

/**
 * The BCA udomain that the Merlin/GAIA gateway reads as `domain_id` lives at
 * `provider.merlin.options.username` — the same path the CLI `init` wizard
 * writes (see packages/opencode/src/cli/cmd/init.ts). It is NOT the top-level
 * `config.username`, which is only a display name used in conversations.
 *
 * Older desktop builds mistakenly stored the udomain in the top-level field, so
 * reads fall back to it to avoid re-prompting profiles created before this fix.
 */
export function readMerlinUsername(config: Config | undefined): string {
  const fromProvider = config?.provider?.merlin?.options?.username
  if (typeof fromProvider === "string" && fromProvider.trim()) return fromProvider.trim()
  const legacy = config?.username
  return typeof legacy === "string" ? legacy.trim() : ""
}

/**
 * Return a copy of `config` with the udomain written to
 * `provider.merlin.options.username` so the gateway receives it as `domain_id`.
 */
export function withMerlinUsername(config: Config, username: string): Config {
  return {
    ...config,
    provider: {
      ...config.provider,
      merlin: {
        ...config.provider?.merlin,
        options: {
          ...config.provider?.merlin?.options,
          username,
        },
      },
    },
  }
}
