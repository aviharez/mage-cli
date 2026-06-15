import type { DesktopTheme } from "./types"
import oc2ThemeJson from "./themes/oc-2.json"

export const oc2Theme = oc2ThemeJson as DesktopTheme

export const DEFAULT_THEMES: Record<string, DesktopTheme> = {
  "oc-2": oc2Theme,
}
