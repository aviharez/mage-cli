import { createContext, createMemo, createSignal, useContext, type ParentProps } from "solid-js"
import { useGlobalSync } from "@/context/global-sync"

type OnboardingCtx = { needsOnboarding: () => boolean; markSubmitted: () => void }
const Ctx = createContext<OnboardingCtx>()

export function OnboardingProvider(props: ParentProps) {
  const sync = useGlobalSync()
  const [submitted, setSubmitted] = createSignal(false)
  const needsOnboarding = createMemo(
    () => sync.ready && !submitted() && !sync.data.config.username?.trim(),
  )
  return (
    <Ctx.Provider value={{ needsOnboarding, markSubmitted: () => setSubmitted(true) }}>
      {props.children}
    </Ctx.Provider>
  )
}

export function useOnboarding() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useOnboarding must be used within OnboardingProvider")
  return ctx
}
