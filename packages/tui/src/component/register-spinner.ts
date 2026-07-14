import { getComponentCatalogue } from "@opentui/solid/components"
import { registerSpinner } from "opentui-spinner/solid"

export function registerMageSpinner() {
  if (!getComponentCatalogue().spinner) registerSpinner()
}
