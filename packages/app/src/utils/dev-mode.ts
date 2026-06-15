import { createRoot, createSignal } from "solid-js"
import { showToast } from "@mybcabisnis/mage-ui/toast"
import { DEV_MODE_EVENT } from "@mybcabisnis/mage-ui/utils/dev-mode"

const STORAGE_KEY = "mage:dev-mode"

const [devMode, setDevModeSignal] = createRoot(() =>
  createSignal(
    typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY) === "true",
  ),
)

export function isDevMode() {
  return devMode()
}

export function toggleDevMode() {
  const next = !devMode()
  setDevModeSignal(next)
  try {
    if (next) localStorage.setItem(STORAGE_KEY, "true")
    else localStorage.removeItem(STORAGE_KEY)
  } catch {}
  window.dispatchEvent(new CustomEvent(DEV_MODE_EVENT, { detail: { enabled: next } }))
  showToast({
    title: next ? "Developer mode enabled" : "Developer mode disabled",
    description: next ? "Model controls are now visible." : "Model controls are now hidden.",
    duration: 3000,
  })
  return next
}
