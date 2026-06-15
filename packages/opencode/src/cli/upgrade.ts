import { Bus } from "@/bus"
import { AppRuntime } from "@/effect/app-runtime"
import { Installation } from "@/installation"
import { InstallationVersion } from "@/installation/version"

export async function upgrade() {
  const method = await AppRuntime.runPromise(Installation.Service.use((svc) => svc.method()))
  const latest = await AppRuntime.runPromise(Installation.Service.use((svc) => svc.latest(method))).catch(() => {})
  if (!latest || InstallationVersion === latest || method === "unknown") return

  await Bus.publish(Installation.Event.UpdateAvailable, { version: latest })
  await AppRuntime.runPromise(Installation.Service.use((svc) => svc.upgrade(method, latest)))
    .then(() => Bus.publish(Installation.Event.Updated, { version: latest }))
    .catch(() => {})
}
