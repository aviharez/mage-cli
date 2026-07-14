import { Effect } from "effect"
import { UI } from "../ui"
import { effectCmd } from "../effect-cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "@mybcabisnis/mage-core/flag/flag"
import open from "open"
import { networkInterfaces } from "os"
import path from "path"

const WEB_UI_PORT = 3001

/**
 * Resolve the web-react sidecar's server entry point. In this monorepo
 * checkout it sits alongside packages/mage; in a packaged install it
 * ships as a dependency of the mage package (see AGENTS.md distribution note).
 */
async function resolveWebUiServerEntry(): Promise<string | null> {
  const candidates = [
    path.resolve(import.meta.dirname, "../../../../web-react/server/index.js"),
    path.resolve(import.meta.dirname, "../../../node_modules/@mybcabisnis/mage-web-react/server/index.js"),
  ]
  for (const candidate of candidates) {
    if (await Bun.file(candidate).exists()) return candidate
  }
  return null
}

/** Poll the sidecar's /health endpoint until it responds or the timeout elapses. */
async function waitForWebUiReady(url: string, timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health`)
      if (res.ok) return true
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

function getNetworkIPs() {
  const nets = networkInterfaces()
  const results: string[] = []

  for (const name of Object.keys(nets)) {
    const net = nets[name]
    if (!net) continue

    for (const netInfo of net) {
      // Skip internal and non-IPv4 addresses
      if (netInfo.internal || netInfo.family !== "IPv4") continue

      // Skip Docker bridge networks (typically 172.x.x.x)
      if (netInfo.address.startsWith("172.")) continue

      results.push(netInfo.address)
    }
  }

  return results
}

export const WebCommand = effectCmd({
  command: "web",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "start mage server and open web interface",
  // Server loads instances per-request via x-mage-directory header — no
  // ambient project InstanceContext needed at startup.
  instance: false,
  handler: Effect.fn("Cli.web")(function* (args) {
    const { Server } = yield* Effect.promise(() => import("../../server/server"))
    if (!Flag.MAGE_SERVER_PASSWORD) {
      UI.println(UI.Style.TEXT_WARNING_BOLD + "!  MAGE_SERVER_PASSWORD is not set; server is unsecured.")
    }
    const opts = yield* resolveNetworkOptions(args)
    const server = yield* Effect.promise(() => Server.listen(opts))
    UI.empty()
    UI.println(UI.logo("  "))
    UI.empty()

    const webUiServerEntry = yield* Effect.promise(() => resolveWebUiServerEntry())
    if (!webUiServerEntry) {
      UI.println(
        UI.Style.TEXT_WARNING_BOLD + "!  Web UI package (@mybcabisnis/mage-web-react) not found; ",
        UI.Style.TEXT_NORMAL,
        "serving API only.",
      )
      const apiUrl = server.url.toString()
      UI.println(UI.Style.TEXT_INFO_BOLD + "  API:               ", UI.Style.TEXT_NORMAL, apiUrl)
      open(apiUrl).catch(() => {})
      yield* Effect.never
    }

    const webUiHostname = opts.hostname === "0.0.0.0" ? "127.0.0.1" : opts.hostname
    Bun.spawn(["bun", webUiServerEntry!, "--port", String(WEB_UI_PORT)], {
      env: {
        ...process.env,
        MAGE_SKIP_START: "true",
        MAGE_HOST: `http://${webUiHostname}:${server.port}`,
        MAGE_PORT: String(server.port),
      },
      stdout: "inherit",
      stderr: "inherit",
      stdin: "ignore",
    })

    const webUiUrl = `http://localhost:${WEB_UI_PORT}`
    const ready = yield* Effect.promise(() => waitForWebUiReady(webUiUrl))
    if (!ready) {
      UI.println(UI.Style.TEXT_WARNING_BOLD + "!  Web UI did not become ready in time; check its logs above.")
    }

    UI.println(UI.Style.TEXT_INFO_BOLD + "  Local access:      ", UI.Style.TEXT_NORMAL, webUiUrl)

    if (opts.hostname === "0.0.0.0") {
      const networkIPs = getNetworkIPs()
      for (const ip of networkIPs) {
        UI.println(UI.Style.TEXT_INFO_BOLD + "  Network access:    ", UI.Style.TEXT_NORMAL, `http://${ip}:${WEB_UI_PORT}`)
      }
    }

    open(webUiUrl).catch(() => {})

    yield* Effect.never
  }),
})
