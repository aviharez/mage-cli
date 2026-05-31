import { createEffect } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { Splash } from "@mybcabisnis/mage-ui/logo"
import { base64Encode } from "@mybcabisnis/mage-shared/util/encode"
import { useGlobalSync } from "@/context/global-sync"

export default function HomeRedirect() {
  const sync = useGlobalSync()
  const navigate = useNavigate()
  createEffect(() => {
    const home = sync.data.path.home
    if (!sync.ready || !home) return
    navigate(`/${base64Encode(home)}/session`, { replace: true })
  })
  return (
    <div class="h-dvh w-screen flex items-center justify-center bg-background-base">
      <Splash class="w-16 h-20 opacity-50 animate-pulse" />
    </div>
  )
}
