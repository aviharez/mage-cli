import { run as runTui, type TuiInput } from "@mybcabisnis/mage-tui"
import { Global } from "@mybcabisnis/mage-core/global"
import { AppNodeBuilder } from "@mybcabisnis/mage-core/effect/app-node-builder"
import { Effect } from "effect"

export function run(input: TuiInput) {
  return runTui(input).pipe(Effect.provide(AppNodeBuilder.build(Global.node)))
}
