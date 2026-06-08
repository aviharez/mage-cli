import { createEffect } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@mybcabisnis/mage-shared/util/encode"
import { ArcEmblem } from "@/components/arcanum/emblem"
import { useGlobalSync } from "@/context/global-sync"

export default function HomeRedirect() {
  const sync = useGlobalSync()
  const navigate = useNavigate()
  createEffect(() => {
    const home = sync.data.path.home
    // Diagnostic: visible in renderer.log via spyRendererConsole.
    // TODO: remove once root cause confirmed.
    console.info("[mage] home-redirect", { ready: sync.ready, home })
    if (!sync.ready || !home) return
    console.info("[mage] home-redirect navigating", { home })
    navigate(`/${base64Encode(home)}/session`, { replace: true })
  })
  return (
    <div class="h-dvh w-screen flex items-center justify-center bg-background-base">
      <ArcEmblem size={72} glow animate />
    </div>
  )
}
