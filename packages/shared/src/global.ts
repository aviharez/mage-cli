import path from "path"
import os from "os"
import { Context, Effect, Layer } from "effect"

export namespace Global {
  export class Service extends Context.Service<Service, Interface>()("@mage/Global") { }

  export interface Interface {
    readonly home: string
    readonly data: string
    readonly cache: string
    readonly config: string
    readonly state: string
    readonly bin: string
    readonly log: string
  }

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const home = process.env.MAGE_TEST_HOME ?? os.homedir()
      const root = path.join(home, ".mage")
      const data = process.env.MAGE_DATA_DIR ? path.resolve(process.env.MAGE_DATA_DIR) : path.join(root, "data")
      const cache = path.join(root, "cache")
      const cfg = process.env.MAGE_CONFIG_DIR ? path.resolve(process.env.MAGE_CONFIG_DIR) : root
      const state = path.join(root, "state")
      const bin = path.join(root, "bin")
      const log = path.join(data, "log")

      return Service.of({
        home,
        data,
        cache,
        config: cfg,
        state,
        bin,
        log,
      })
    }),
  )
}
