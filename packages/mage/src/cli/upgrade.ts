import { Installation } from "@/installation"
import { InstallationVersion } from "@mybcabisnis/mage-core/installation/version"
import { GlobalBus } from "@/bus/global"

// Force-upgrades to any newer version on startup, no config gate. Silently no-ops when
// the install method is unknown/unsupported (Installation.latest dies for those).
export async function upgrade() {
  const method = await Installation.method()
  const latest = await Installation.latest(method).catch(() => {})
  if (!latest || InstallationVersion === latest || method === "unknown") return

  GlobalBus.emit("event", {
    directory: "global",
    payload: {
      type: Installation.Event.UpdateAvailable.type,
      properties: { version: latest },
    },
  })

  await Installation.upgrade(method, latest)
    .then(() =>
      GlobalBus.emit("event", {
        directory: "global",
        payload: {
          type: Installation.Event.Updated.type,
          properties: { version: latest },
        },
      }),
    )
    .catch(() => {})
}
