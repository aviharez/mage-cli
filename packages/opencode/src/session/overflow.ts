import type { Config } from "@/config"
import type { Provider } from "@/provider"
import { ProviderTransform } from "@/provider"
import type { MessageV2 } from "./message-v2"

const COMPACTION_BUFFER = 20_000

export function usable(input: { cfg: Config.Info; model: Provider.Model }) {
  const context = input.model.limit.context
  if (context === 0) return 0

  const reserved =
    input.cfg.compaction?.reserved ?? Math.min(COMPACTION_BUFFER, ProviderTransform.maxOutputTokens(input.model))
  return input.model.limit.input
    ? Math.max(0, input.model.limit.input - reserved)
    : Math.max(0, context - ProviderTransform.maxOutputTokens(input.model))
}

export function isOverflow(input: { cfg: Config.Info; tokens: MessageV2.Assistant["tokens"]; model: Provider.Model }) {
  if (input.cfg.compaction?.auto === false) return false
  if (input.model.limit.context === 0) return false

  // Some providers report a `total` that excludes cache or reasoning tokens
  // (or omit reasoning from the component fallback entirely), which can let
  // the displayed context gauge — which always sums every component — read
  // higher than what this check sees, silently missing the auto-compaction
  // trigger. Take the max of both so this never under-counts relative to the
  // gauge.
  const componentSum =
    input.tokens.input +
    input.tokens.output +
    input.tokens.reasoning +
    input.tokens.cache.read +
    input.tokens.cache.write
  const count = Math.max(input.tokens.total ?? 0, componentSum)
  return count >= usable(input)
}
