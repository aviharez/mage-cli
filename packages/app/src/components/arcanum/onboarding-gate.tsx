import { Show, type ParentProps } from "solid-js"
import { Splash } from "@mybcabisnis/mage-ui/logo"
import { useGlobalSync } from "@/context/global-sync"
import { useOnboarding } from "./onboarding-context"
import { Onboarding } from "./onboarding"

export function OnboardingGate(props: ParentProps) {
  const sync = useGlobalSync()
  const { needsOnboarding, markSubmitted } = useOnboarding()
  return (
    <Show
      when={sync.ready}
      fallback={
        <div class="h-dvh w-screen flex items-center justify-center bg-background-base">
          <Splash class="w-16 h-20 opacity-50 animate-pulse" />
        </div>
      }
    >
      <Show when={!needsOnboarding()} fallback={<Onboarding onDone={markSubmitted} />}>
        {props.children}
      </Show>
    </Show>
  )
}
