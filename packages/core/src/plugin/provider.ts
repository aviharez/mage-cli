import type { PluginInternal } from "./internal"
import type { Scope } from "effect"

// Mage is locked to the Merlin/GAIA provider only — no V2 catalog provider
// plugins are registered. Merlin is injected directly in the opencode
// Provider.Service (packages/opencode/src/provider/provider.ts).
export const ProviderPlugins: PluginInternal.Plugin<PluginInternal.Requirements | Scope.Scope>[] = []
