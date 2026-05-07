import { createRoot, createSignal } from "solid-js"

const STORAGE_KEY = "mage:dev-mode"

export const DEV_MODE_EVENT = "mage:dev-mode"

const devMode = createRoot(() => {
  const [signal, setSignal] = createSignal(
    typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY) === "true",
  )

  if (typeof window !== "undefined") {
    window.addEventListener(DEV_MODE_EVENT, (e: Event) => {
      setSignal((e as CustomEvent<{ enabled: boolean }>).detail.enabled)
    })
  }

  return signal
})

export function isDevMode() {
  return devMode()
}
