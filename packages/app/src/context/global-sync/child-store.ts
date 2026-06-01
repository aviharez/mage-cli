import { createRoot, getOwner, onCleanup, runWithOwner, type Owner } from "solid-js"
import { createStore, type SetStoreFunction, type Store } from "solid-js/store"
import { Persist, persisted } from "@/utils/persist"
import type { VcsInfo } from "@mybcabisnis/mage-sdk/v2/client"
import {
  DIR_IDLE_TTL_MS,
  MAX_DIR_STORES,
  type ChildOptions,
  type DirState,
  type IconCache,
  type MetaCache,
  type ProjectMeta,
  type State,
  type VcsCache,
} from "./types"
import { canDisposeDirectory, pickDirectoriesToEvict } from "./eviction"
import { pathKey } from "@/utils/path-key"

export function createChildStoreManager(input: {
  owner: Owner
  isBooting: (directory: string) => boolean
  isLoadingSessions: (directory: string) => boolean
  onBootstrap: (directory: string) => void
  onMcp?: (directory: string, setStore: SetStoreFunction<State>) => void
  onDispose: (directory: string) => void
  translate: (key: string, vars?: Record<string, string | number>) => string
  queryOptions?: unknown
  global?: unknown
}) {
  const children: Record<string, [Store<State>, SetStoreFunction<State>]> = {}
  const vcsCache = new Map<string, VcsCache>()
  const metaCache = new Map<string, MetaCache>()
  const iconCache = new Map<string, IconCache>()
  const lifecycle = new Map<string, DirState>()
  const pins = new Map<string, number>()
  const ownerPins = new WeakMap<object, Set<string>>()
  const disposers = new Map<string, () => void>()
  const mcpDirectories = new Set<string>()

  const mark = (directory: string) => {
    if (!directory) return
    lifecycle.set(directory, { lastAccessAt: Date.now() })
    runEviction(directory)
  }

  const pin = (directory: string) => {
    if (!directory) return
    pins.set(directory, (pins.get(directory) ?? 0) + 1)
    mark(directory)
  }

  const unpin = (directory: string) => {
    if (!directory) return
    const next = (pins.get(directory) ?? 0) - 1
    if (next > 0) {
      pins.set(directory, next)
      return
    }
    pins.delete(directory)
    runEviction()
  }

  const pinned = (directory: string) => (pins.get(directory) ?? 0) > 0

  const pinForOwner = (directory: string) => {
    const current = getOwner()
    if (!current) return
    if (current === input.owner) return
    const key = current as object
    const set = ownerPins.get(key)
    if (set?.has(directory)) return
    if (set) set.add(directory)
    if (!set) ownerPins.set(key, new Set([directory]))
    pin(directory)
    onCleanup(() => {
      const set = ownerPins.get(key)
      if (set) {
        set.delete(directory)
        if (set.size === 0) ownerPins.delete(key)
      }
      unpin(directory)
    })
  }

  function disposeDirectory(directory: string) {
    const key = pathKey(directory)
    if (
      !canDisposeDirectory({
        directory: key,
        hasStore: !!children[key],
        pinned: pinned(key),
        booting: input.isBooting(key),
        loadingSessions: input.isLoadingSessions(key),
      })
    ) {
      return false
    }

    vcsCache.delete(key)
    metaCache.delete(key)
    iconCache.delete(key)
    lifecycle.delete(key)
    mcpDirectories.delete(key)
    const dispose = disposers.get(key)
    if (dispose) {
      dispose()
      disposers.delete(key)
    }
    delete children[key]
    input.onDispose(key)
    return true
  }

  function runEviction(skip?: string) {
    const stores = Object.keys(children)
    if (stores.length === 0) return
    const list = pickDirectoriesToEvict({
      stores,
      state: lifecycle,
      pins: new Set(stores.filter(pinned)),
      max: MAX_DIR_STORES,
      ttl: DIR_IDLE_TTL_MS,
      now: Date.now(),
    }).filter((directory) => directory !== skip)
    if (list.length === 0) return
    for (const directory of list) {
      if (!disposeDirectory(directory)) continue
    }
  }

  function ensureChild(directory: string) {
    const key = pathKey(directory)
    if (!key) console.error("No directory provided")
    if (!children[key]) {
      const vcs = runWithOwner(input.owner, () =>
        persisted(
          Persist.workspace(key, "vcs", ["vcs.v1"]),
          createStore({ value: undefined as VcsInfo | undefined }),
        ),
      )
      if (!vcs) throw new Error(input.translate("error.childStore.persistedCacheCreateFailed"))
      const vcsStore = vcs[0]
      vcsCache.set(key, { store: vcsStore, setStore: vcs[1], ready: vcs[3] })

      const meta = runWithOwner(input.owner, () =>
        persisted(
          Persist.workspace(key, "project", ["project.v1"]),
          createStore({ value: undefined as ProjectMeta | undefined }),
        ),
      )
      if (!meta) throw new Error(input.translate("error.childStore.persistedProjectMetadataCreateFailed"))
      metaCache.set(key, { store: meta[0], setStore: meta[1], ready: meta[3] })

      const icon = runWithOwner(input.owner, () =>
        persisted(
          Persist.workspace(key, "icon", ["icon.v1"]),
          createStore({ value: undefined as string | undefined }),
        ),
      )
      if (!icon) throw new Error(input.translate("error.childStore.persistedProjectIconCreateFailed"))
      iconCache.set(key, { store: icon[0], setStore: icon[1], ready: icon[3] })

      const init = () =>
        createRoot((dispose) => {
          const initialMeta = meta[0].value
          const initialIcon = icon[0].value

          const child = createStore<State>({
            project: "",
            projectMeta: initialMeta,
            icon: initialIcon,
            provider_ready: false,
            provider: { all: [], connected: [], default: {} },
            config: {},
            path: { state: "", config: "", worktree: "", directory: "", home: "" },
            status: "loading" as const,
            agent: [],
            command: [],
            session: [],
            sessionTotal: 0,
            session_status: {},
            session_diff: {},
            todo: {},
            permission: {},
            question: {},
            mcp_ready: false,
            mcp: {},
            lsp_ready: false,
            lsp: [],
            vcs: vcsStore.value,
            // Initial per-folder session page size. The sidebar has no
            // "show more"/infinite scroll and store.limit never grows, so this
            // is the only lever for how many sessions are visible. Keep it >=
            // the CLI's effective cap (100) so all three clients stay in sync.
            limit: 100,
            message: {},
            part: {},
          })
          children[key] = child
          disposers.set(key, dispose)

          const onPersistedInit = (init: Promise<string> | string | null, run: () => void) => {
            if (!(init instanceof Promise)) return
            void init.then(() => {
              if (children[key] !== child) return
              run()
            })
          }

          onPersistedInit(vcs[2], () => {
            const cached = vcsStore.value
            if (!cached?.branch) return
            child[1]("vcs", (value) => value ?? cached)
          })

          onPersistedInit(meta[2], () => {
            if (child[0].projectMeta !== initialMeta) return
            child[1]("projectMeta", meta[0].value)
          })

          onPersistedInit(icon[2], () => {
            if (child[0].icon !== initialIcon) return
            child[1]("icon", icon[0].value)
          })
        })

      runWithOwner(input.owner, init)
    }
    mark(key)
    const childStore = children[key]
    if (!childStore) throw new Error(input.translate("error.childStore.storeCreateFailed"))
    return childStore
  }

  function enableMcp(directory: string, key: string, childStore: [Store<State>, SetStoreFunction<State>]) {
    if (mcpDirectories.has(key)) return
    mcpDirectories.add(key)
    if (childStore[0].status !== "loading") {
      input.onMcp?.(directory, childStore[1])
    }
  }

  function child(directory: string, options: ChildOptions = {}) {
    const key = pathKey(directory)
    const childStore = ensureChild(directory)
    pinForOwner(key)
    const shouldBootstrap = options.bootstrap ?? true
    if (shouldBootstrap && childStore[0].status === "loading") {
      input.onBootstrap(directory)
    }
    if (options.mcp) enableMcp(directory, key, childStore)
    return childStore
  }

  function peek(directory: string, options: ChildOptions = {}) {
    const key = pathKey(directory)
    const childStore = ensureChild(directory)
    const shouldBootstrap = options.bootstrap ?? true
    if (shouldBootstrap && childStore[0].status === "loading") {
      input.onBootstrap(directory)
    }
    if (options.mcp) enableMcp(directory, key, childStore)
    return childStore
  }

  function disableMcp(directory: string) {
    const key = pathKey(directory)
    mcpDirectories.delete(key)
  }

  function mcpEnabled(directory: string) {
    return mcpDirectories.has(pathKey(directory))
  }

  function projectMeta(directory: string, patch: ProjectMeta) {
    const [store, setStore] = ensureChild(directory)
    const key = pathKey(directory)
    const cached = metaCache.get(key)
    if (!cached) return
    const previous = store.projectMeta ?? {}
    const icon = patch.icon ? { ...previous.icon, ...patch.icon } : previous.icon
    const commands = patch.commands ? { ...previous.commands, ...patch.commands } : previous.commands
    const next = {
      ...previous,
      ...patch,
      icon,
      commands,
    }
    cached.setStore("value", next)
    setStore("projectMeta", next)
  }

  function projectIcon(directory: string, value: string | undefined) {
    const [store, setStore] = ensureChild(directory)
    const key = pathKey(directory)
    const cached = iconCache.get(key)
    if (!cached) return
    if (store.icon === value) return
    cached.setStore("value", value)
    setStore("icon", value)
  }

  return {
    children,
    ensureChild,
    child,
    peek,
    projectMeta,
    projectIcon,
    mark,
    pin,
    unpin,
    pinned,
    disposeDirectory,
    runEviction,
    vcsCache,
    metaCache,
    iconCache,
    disableMcp,
    mcp: mcpEnabled,
  }
}
