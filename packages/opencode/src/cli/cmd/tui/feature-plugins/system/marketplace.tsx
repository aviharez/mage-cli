import { Keybind } from "@/util"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@mybcabisnis/mage-plugin/tui"
import { useTerminalDimensions } from "@opentui/solid"
import { createEffect, createResource, createSignal, onMount, Show } from "solid-js"
import { DialogSelect, type DialogSelectOption } from "@tui/ui/dialog-select"
import { useDialog } from "@tui/ui/dialog"
import { DialogPrompt } from "@tui/ui/dialog-prompt"

// ------------------------------------------------------------------
// Type aliases mirroring the generated SDK types
// ------------------------------------------------------------------
type SkillCatalogEntry = {
  name: string
  description: string
  files: string[]
}

type McpInput = {
  key: string
  message: string
  placeholder?: string
  into: "environment" | "header" | "arg"
  secret?: boolean
}

type McpCatalogEntry = {
  name: string
  description: string
  config: Record<string, unknown>
  inputs?: McpInput[]
}

type CatalogData = {
  skills: SkillCatalogEntry[]
  mcp: McpCatalogEntry[]
}

type Scope = "global" | "project"

const id = "internal:marketplace"
const spaceKey = Keybind.parse("space").at(0)
const tabKey = Keybind.parse("tab").at(0)

// ------------------------------------------------------------------
// Sequential input collector (same pattern as PromptsMethod in dialog-provider.tsx)
// ------------------------------------------------------------------
async function collectInputs(
  inputs: McpInput[],
  dialog: ReturnType<typeof useDialog>,
): Promise<Record<string, string> | null> {
  const collected: Record<string, string> = {}
  for (const input of inputs) {
    const value = await new Promise<string | null>((resolve) => {
      dialog.replace(
        () => (
          <DialogPrompt
            title={input.message}
            placeholder={input.placeholder}
            onConfirm={(v) => resolve(v)}
            onCancel={() => resolve(null)}
          />
        ),
        () => resolve(null),
      )
    })
    if (value === null) return null
    collected[input.key] = value
  }
  return collected
}

// ------------------------------------------------------------------
// Shared install-by-name logic (used by Browse and DirectInstall)
// ------------------------------------------------------------------
async function installByName(
  api: TuiPluginApi,
  catalogData: CatalogData,
  name: string,
  scope: Scope,
  dialog: ReturnType<typeof useDialog>,
): Promise<void> {
  // Try skill first
  const skillEntry = catalogData.skills.find((s) => s.name === name)
  if (skillEntry) {
    const res = await api.client.marketplace.skill.install({ name, scope })
    if (!res.data) throw new Error("Install failed")
    api.ui.toast({
      variant: "success",
      message: `Skill "${name}" installed (${scope}). Start a new session to use it.`,
    })
    return
  }

  // Try MCP
  const mcpEntry = catalogData.mcp.find((m) => m.name === name)
  if (mcpEntry) {
    const inputs = mcpEntry.inputs ?? []
    let collected: Record<string, string> = {}
    if (inputs.length > 0) {
      const result = await collectInputs(inputs, dialog)
      if (result === null) return // cancelled
      collected = result
    }
    const res = await api.client.marketplace.mcp.install({ name, scope, inputs: collected })
    if (!res.data) throw new Error("Install failed")
    api.ui.toast({
      variant: "success",
      message: `MCP server "${name}" installed and connected (${scope}).`,
    })
    return
  }

  throw new Error(`"${name}" not found in catalog. Use /catalog to browse available entries.`)
}

// ------------------------------------------------------------------
// DirectInstall — used when /catalog is invoked with arguments
// Renders inside a dialog: fetches catalog, optionally collects MCP inputs, installs.
// ------------------------------------------------------------------
function DirectInstall(props: { api: TuiPluginApi; name: string; scope: Scope }) {
  const dialog = useDialog()
  const [status, setStatus] = createSignal<"loading" | "done">("loading")
  const [error, setError] = createSignal<string | null>(null)

  onMount(async () => {
    try {
      const res = await props.api.client.marketplace.catalog()
      if (!res.data) throw new Error("Failed to fetch catalog")
      await installByName(props.api, res.data as CatalogData, props.name, props.scope, dialog)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      props.api.ui.toast({ variant: "error", message: msg })
    } finally {
      setStatus("done")
      dialog.clear()
    }
  })

  return (
    <DialogPrompt
      title="Catalog"
      placeholder=""
      busy={status() === "loading"}
      busyText={`Installing "${props.name}"...`}
      description={() =>
        error() ? (
          <span style={{ fg: props.api.theme.current.error }}>{error()}</span>
        ) : null
      }
      onCancel={() => dialog.clear()}
      onConfirm={() => dialog.clear()}
    />
  )
}

// ------------------------------------------------------------------
// Browse dialog
// ------------------------------------------------------------------
function Browse(props: { api: TuiPluginApi; catalog: CatalogData }) {
  const size = useTerminalDimensions()
  const dialog = useDialog()

  const [scope, setScope] = createSignal<Scope>("global")
  const [busyName, setBusyName] = createSignal<string | null>(null)
  const [cur, setCur] = createSignal<string | undefined>()
  const [installedSkills, setInstalledSkills] = createSignal(new Set<string>())
  const [connectedMcp, setConnectedMcp] = createSignal(new Set<string>())

  createEffect(() => {
    const width = size().width
    if (width >= 128) props.api.ui.dialog.setSize("xlarge")
    else if (width >= 96) props.api.ui.dialog.setSize("large")
    else props.api.ui.dialog.setSize("medium")
  })

  // Load current installed state on mount
  void (async () => {
    const [skillsRes, mcpRes] = await Promise.allSettled([
      props.api.client.app.skills(),
      props.api.client.mcp.status(),
    ])
    if (skillsRes.status === "fulfilled" && skillsRes.value.data) {
      setInstalledSkills(new Set(skillsRes.value.data.map((s: { name: string }) => s.name)))
    }
    if (mcpRes.status === "fulfilled" && mcpRes.value.data) {
      setConnectedMcp(new Set(Object.keys(mcpRes.value.data)))
    }
  })()

  // Build options list
  const options = (): DialogSelectOption<string>[] => {
    const busy = busyName()
    const installed = installedSkills()
    const connected = connectedMcp()

    const skillRows: DialogSelectOption<string>[] = props.catalog.skills.map((s) => {
      const isInstalled = installed.has(s.name)
      return {
        title: s.name,
        value: `skill:${s.name}`,
        category: "Skills",
        description: s.description,
        footer: isInstalled ? (
          <span style={{ fg: props.api.theme.current.success }}>installed</span>
        ) : busy === s.name ? (
          <span style={{ fg: props.api.theme.current.textMuted }}>installing...</span>
        ) : (
          <span style={{ fg: props.api.theme.current.textMuted }}>
            {Keybind.toString(spaceKey)} install
          </span>
        ),
        disabled: isInstalled || busy === s.name,
      }
    })

    const mcpRows: DialogSelectOption<string>[] = props.catalog.mcp.map((m) => {
      const isConnected = connected.has(m.name)
      return {
        title: m.name,
        value: `mcp:${m.name}`,
        category: "MCP Servers",
        description: m.description,
        footer: isConnected ? (
          <span style={{ fg: props.api.theme.current.success }}>connected</span>
        ) : busy === m.name ? (
          <span style={{ fg: props.api.theme.current.textMuted }}>installing...</span>
        ) : (
          <span style={{ fg: props.api.theme.current.textMuted }}>
            {Keybind.toString(spaceKey)} install
          </span>
        ),
        disabled: isConnected || busy === m.name,
      }
    })

    return [...skillRows, ...mcpRows]
  }

  async function doInstall(value: string) {
    if (busyName()) return

    if (value.startsWith("skill:")) {
      const name = value.slice(6)
      setBusyName(name)
      try {
        const res = await props.api.client.marketplace.skill.install({
          name,
          scope: scope(),
        })
        if (!res.data) throw new Error("Install failed")
        setInstalledSkills((s) => new Set([...s, name]))
        props.api.ui.toast({
          variant: "success",
          message: `Skill "${name}" installed (${scope()}). Start a new session to use it.`,
        })
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        props.api.ui.toast({ variant: "error", message: `Failed to install skill "${name}": ${msg}` })
      } finally {
        setBusyName(null)
        show(props.api)
      }
      return
    }

    if (value.startsWith("mcp:")) {
      const name = value.slice(4)
      const entry = props.catalog.mcp.find((m) => m.name === name)
      if (!entry) return

      const inputs = entry.inputs ?? []
      let collected: Record<string, string> = {}

      if (inputs.length > 0) {
        const result = await collectInputs(inputs, dialog)
        if (result === null) {
          show(props.api)
          return
        }
        collected = result
      }

      setBusyName(name)
      try {
        const res = await props.api.client.marketplace.mcp.install({
          name,
          scope: scope(),
          inputs: collected,
        })
        if (!res.data) throw new Error("Install failed")
        setConnectedMcp((s) => new Set([...s, name]))
        props.api.ui.toast({
          variant: "success",
          message: `MCP server "${name}" installed and connected (${scope()}).`,
        })
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        props.api.ui.toast({ variant: "error", message: `Failed to install MCP "${name}": ${msg}` })
      } finally {
        setBusyName(null)
        show(props.api)
      }
    }
  }

  return (
    <DialogSelect
      title="Catalog"
      placeholder="Filter..."
      options={options()}
      current={cur()}
      onMove={(item) => setCur(item.value)}
      keybind={[
        {
          title: "install",
          keybind: spaceKey,
          disabled: busyName() !== null,
          onTrigger: (item) => {
            setCur(item.value)
            void doInstall(item.value)
          },
        },
        {
          title: scope() === "global" ? "global" : "project",
          keybind: tabKey,
          side: "left",
          onTrigger: () => {
            setScope((s) => (s === "global" ? "project" : "global"))
          },
        },
      ]}
      onSelect={(item) => {
        setCur(item.value)
        void doInstall(item.value)
      }}
    />
  )
}

// ------------------------------------------------------------------
// Loading / error wrapper
// ------------------------------------------------------------------
function CatalogView(props: { api: TuiPluginApi }) {
  const dialog = useDialog()
  const [catalog] = createResource<CatalogData>(() =>
    props.api.client.marketplace.catalog().then((res) => {
      if (!res.data) throw new Error("Failed to fetch catalog")
      return res.data as CatalogData
    }),
  )

  return (
    <Show
      when={!catalog.loading && !catalog.error}
      fallback={
        <props.api.ui.DialogPrompt
          title="Catalog"
          placeholder=""
          busy={catalog.loading}
          busyText={catalog.loading ? "Loading catalog..." : ""}
          description={() =>
            catalog.error ? (
              <span style={{ fg: props.api.theme.current.error }}>
                {catalog.error instanceof Error
                  ? catalog.error.message
                  : "Failed to load catalog. Is marketplace.registry configured?"}
              </span>
            ) : null
          }
          onCancel={() => dialog.clear()}
          onConfirm={() => dialog.clear()}
        />
      }
    >
      <Browse api={props.api} catalog={catalog()!} />
    </Show>
  )
}

function show(api: TuiPluginApi) {
  api.ui.dialog.replace(() => <CatalogView api={api} />)
}

// ------------------------------------------------------------------
// Parse /catalog args: "[add] <name> [global|project]"
// Returns null if no name could be extracted.
// ------------------------------------------------------------------
function parseInstallArgs(args: string): { name: string; scope: Scope } | null {
  const tokens = args.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null

  // Drop optional leading "add" verb
  let remaining = tokens
  if (remaining[0]?.toLowerCase() === "add") remaining = remaining.slice(1)
  if (remaining.length === 0) return null

  const name = remaining[0]!

  // Optional trailing scope token
  const last = remaining[remaining.length - 1]?.toLowerCase()
  const scope: Scope = last === "project" ? "project" : "global"

  return { name, scope }
}

// ------------------------------------------------------------------
// Plugin entrypoint
// ------------------------------------------------------------------
const tui: TuiPlugin = async (api) => {
  api.command.register(() => [
    {
      title: "Catalog",
      value: "marketplace.open",
      category: "System",
      slash: { name: "catalog", arguments: true },
      onSelect(args?: string) {
        if (!args) {
          show(api)
          return
        }
        const parsed = parseInstallArgs(args)
        if (!parsed) {
          show(api)
          return
        }
        // Direct install: open a transient dialog that handles the flow
        api.ui.dialog.replace(() => (
          <DirectInstall api={api} name={parsed.name} scope={parsed.scope} />
        ))
      },
    },
  ])
}

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin
