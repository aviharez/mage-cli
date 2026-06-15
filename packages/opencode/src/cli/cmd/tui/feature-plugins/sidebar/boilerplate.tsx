import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@mybcabisnis/mage-plugin/tui"
import { createMemo, Show } from "solid-js"
import { readFileSync, existsSync } from "fs"
import path from "path"
import os from "os"

const id = "internal:sidebar-boilerplate"

function readActiveBoilerplateName(directory: string): string | null {
  try {
    const home = os.homedir()
    const candidates = [
      path.join(home, ".mage", "config.json"),
      path.join(home, ".mage", "mage.json"),
      path.join(home, ".mage", "mage.jsonc"),
      path.join(directory, ".mage", "mage.json"),
      path.join(directory, ".mage", "mage.jsonc"),
    ]

    for (const configPath of candidates) {
      if (!existsSync(configPath)) continue
      const text = readFileSync(configPath, "utf8")
      const stripped = text.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "")
      const config = JSON.parse(stripped)
      const mage = config?.mage
      if (!mage) continue

      // Multi-profile: named active boilerplate
      if (mage.activeBoilerplate) return mage.activeBoilerplate
      // Profiles list without an explicit active: first profile name
      if (mage.profiles?.length) return mage.profiles[0].name
      // Single path: use directory basename
      if (mage.boilerplate) return path.basename(String(mage.boilerplate))
    }
    return null
  } catch {
    return null
  }
}

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const directory = () => props.api.state.path.directory || process.cwd()

  // Re-evaluate whenever messages change so the sidebar reflects /boilerplate
  // use or /boilerplate add results without needing a separate event bus.
  const messages = createMemo(() => props.api.state.session.messages(props.session_id))
  const name = createMemo(() => {
    messages().length // track dependency
    return readActiveBoilerplateName(directory())
  })

  return (
    <Show when={name()}>
      <box>
        <text fg={theme().text}>
          <b>Boilerplate</b>
        </text>
        <text fg={theme().success}>● {name()}</text>
      </box>
    </Show>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 90,
    slots: {
      sidebar_content(_ctx, props) {
        return <View api={api} session_id={props.session_id} />
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin
