import { createEffect, Show, type ParentProps } from "solid-js"
import { useGlobalSync } from "@/context/global-sync"
import { ArcEmblem } from "./emblem"
import { useOnboarding } from "./onboarding-context"
import { Onboarding } from "./onboarding"

export function OnboardingGate(props: ParentProps) {
  const sync = useGlobalSync()
  const { needsOnboarding, markSubmitted } = useOnboarding()

  // Diagnostic: visible in renderer.log via spyRendererConsole.
  // TODO: remove once root cause confirmed.
  createEffect(() => {
    console.info("[mage] onboarding-gate", { ready: sync.ready, needsOnboarding: needsOnboarding() })
  })

  return (
    <Show
      when={sync.ready}
      fallback={
        <div class="h-dvh w-screen flex items-center justify-center bg-background-base">
          <ArcEmblem size={72} glow animate />
        </div>
      }
    >
      <Show when={!needsOnboarding()} fallback={<Onboarding onDone={markSubmitted} />}>
        {props.children}
      </Show>
    </Show>
  )
}
