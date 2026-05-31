import { createMemo, createSignal, Show, type ParentProps } from "solid-js"
import { Splash } from "@mybcabisnis/mage-ui/logo"
import { useGlobalSync } from "@/context/global-sync"
import { Onboarding } from "./onboarding"

export function OnboardingGate(props: ParentProps) {
  const sync = useGlobalSync()
  const [submitted, setSubmitted] = createSignal(false)
  const needsOnboarding = createMemo(
    () => sync.ready && !submitted() && !sync.data.config.username?.trim(),
  )
  return (
    <Show
      when={sync.ready}
      fallback={
        <div class="h-dvh w-screen flex items-center justify-center bg-background-base">
          <Splash class="w-16 h-20 opacity-50 animate-pulse" />
        </div>
      }
    >
      <Show when={!needsOnboarding()} fallback={<Onboarding onDone={() => setSubmitted(true)} />}>
        {props.children}
      </Show>
    </Show>
  )
}
