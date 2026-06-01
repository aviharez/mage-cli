import { Component, Show } from "solid-js"
import { Dialog } from "@mybcabisnis/mage-ui/dialog"
import { Tabs } from "@mybcabisnis/mage-ui/tabs"
import { Icon } from "@mybcabisnis/mage-ui/icon"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { SettingsGeneral } from "./settings-general"
import { SettingsKeybinds } from "./settings-keybinds"
import { SettingsProviders } from "./settings-providers"
import { SettingsModels } from "./settings-models"
import { isDevMode } from "@/utils/dev-mode"
import { A } from "@/components/arcanum/palette"

export const DialogSettings: Component = () => {
  const language = useLanguage()
  const platform = usePlatform()

  return (
    <Dialog size="x-large" transition>
      <Tabs orientation="vertical" variant="settings" defaultValue="general" class="h-full settings-dialog"
        style={{ background: A.bg }}>
        <Tabs.List style={{ background: A.bgInk, "border-right": `1px solid ${A.border}` }}>
          <div class="flex flex-col justify-between h-full w-full">
            <div class="flex flex-col gap-3 w-full pt-3">
              <div class="flex flex-col gap-3">
                <div class="flex flex-col gap-1.5 px-3 pb-1">
                  <span style={{
                    "font-family": A.serif,
                    "font-size": "11px",
                    "letter-spacing": "0.12em",
                    "text-transform": "uppercase",
                    color: A.fgDim,
                    padding: "0 4px",
                  }}>Settings</span>
                </div>
                <div class="flex flex-col gap-1.5">
                  <div class="flex flex-col gap-0.5 w-full">
                    <Tabs.Trigger value="general">
                      <Icon name="sliders" />
                      {language.t("settings.tab.general")}
                    </Tabs.Trigger>
                    <Tabs.Trigger value="shortcuts">
                      <Icon name="keyboard" />
                      {language.t("settings.tab.shortcuts")}
                    </Tabs.Trigger>
                    <Show when={isDevMode()}>
                      <Tabs.Trigger value="models">
                        <Icon name="models" />
                        {language.t("settings.models.title")}
                      </Tabs.Trigger>
                    </Show>
                  </div>
                </div>
              </div>
            </div>
            <div class="flex flex-col gap-1 pl-3 py-3" style={{ color: A.fgDim, "font-size": "11px" }}>
              <span style={{ color: A.fgMuted }}>{language.t("app.name.desktop")}</span>
              <span>v{platform.version}</span>
            </div>
          </div>
        </Tabs.List>
        <Tabs.Content value="general" class="no-scrollbar" style={{ background: A.bg }}>
          <SettingsGeneral />
        </Tabs.Content>
        <Tabs.Content value="shortcuts" class="no-scrollbar" style={{ background: A.bg }}>
          <SettingsKeybinds />
        </Tabs.Content>
        {/* <Tabs.Content value="providers" class="no-scrollbar">
          <SettingsProviders />
        </Tabs.Content> */}
        <Show when={isDevMode()}>
          <Tabs.Content value="models" class="no-scrollbar" style={{ background: A.bg }}>
            <SettingsModels />
          </Tabs.Content>
        </Show>
      </Tabs>
    </Dialog>
  )
}
