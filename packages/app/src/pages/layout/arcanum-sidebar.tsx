import { createEffect, createMemo, createSignal, For, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { useNavigate, useParams } from "@solidjs/router"
import { DateTime } from "luxon"
import { base64Encode } from "@mybcabisnis/mage-shared/util/encode"
import { decode64 } from "@/utils/base64"
import { getFilename } from "@mybcabisnis/mage-shared/util/path"
import { type Session } from "@mybcabisnis/mage-sdk/v2/client"
import { useGlobalSync } from "@/context/global-sync"
import { useGlobalSDK } from "@/context/global-sdk"
import { useLayout } from "@/context/layout"
import { useLanguage } from "@/context/language"
import { Icon } from "@mybcabisnis/mage-ui/icon"
import { IconButton } from "@mybcabisnis/mage-ui/icon-button"
import { DropdownMenu } from "@mybcabisnis/mage-ui/dropdown-menu"
import { Spinner } from "@mybcabisnis/mage-ui/spinner"
import { Dialog } from "@mybcabisnis/mage-ui/dialog"
import { Button } from "@mybcabisnis/mage-ui/button"
import { showToast } from "@mybcabisnis/mage-ui/toast"
import { useDialog } from "@mybcabisnis/mage-ui/context/dialog"

import { A } from "@/components/arcanum/palette"
import { IconPaperPlane } from "@/components/arcanum/composer-icons"

type GroupedDir = { dir: string; sessions: Session[] }

function sortByRecent(sessions: Session[]): Session[] {
  const now = Date.now()
  const oneMinuteAgo = now - 60_000
  return sessions.slice().sort((a, b) => {
    const at = a.time.updated ?? a.time.created
    const bt = b.time.updated ?? b.time.created
    const aR = at > oneMinuteAgo
    const bR = bt > oneMinuteAgo
    if (aR && bR) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    if (aR) return -1
    if (bR) return 1
    return bt - at
  })
}

function groupRecency(g: GroupedDir) {
  if (!g.sessions.length) return 0
  return Math.max(...g.sessions.map((s) => s.time.updated ?? s.time.created))
}

function relTime(ms: number) {
  return DateTime.fromMillis(ms).toRelative() ?? ""
}

export function ArcanumSidebar(props: { openSettings: () => void; mobile?: boolean }) {
  const sync = useGlobalSync()
  const layout = useLayout()
  const navigate = useNavigate()
  const params = useParams<{ dir?: string; id?: string }>()

  const opened = () => props.mobile || layout.sidebar.opened()
  const home = () => sync.data.path.home ?? ""
  const activeDir = () => decode64(params.dir ?? "") || home()

  const loadedDirs = new Set<string>()
  createEffect(() => {
    if (!sync.ready) return
    const h = home()
    if (!h) return
    const dirs = new Set<string>([h, ...sync.data.project.map((p) => p.worktree)])
    for (const dir of dirs) {
      if (!dir || loadedDirs.has(dir)) continue
      loadedDirs.add(dir)
      void sync.project.loadSessions(dir)
    }
  })

  const groups = createMemo<GroupedDir[]>(() => {
    const h = home()
    const dirs = new Set<string>([h, ...sync.data.project.map((p) => p.worktree)])
    const out: GroupedDir[] = []
    for (const dir of dirs) {
      const [store] = sync.peek(dir, { bootstrap: false })
      const sessions = (store?.session ?? []).filter((s) => !s.parentID)
      out.push({ dir, sessions: sortByRecent(sessions) })
    }
    return out.sort((a, b) =>
      a.dir === h ? -1 : b.dir === h ? 1 : groupRecency(b) - groupRecency(a),
    )
  })

  const [query, setQuery] = createSignal("")

  const filtered = createMemo<GroupedDir[]>(() => {
    const q = query().toLowerCase().trim()
    if (!q) return groups()
    return groups()
      .map((g) => ({
        dir: g.dir,
        sessions: g.sessions.filter(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            getFilename(s.directory).toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.sessions.length > 0)
  })

  const hasAnySessions = () => groups().some((g) => g.sessions.length > 0)

  const [collapsed, setCollapsed] = createStore<Record<string, boolean>>({})
  const toggle = (dir: string) => setCollapsed(dir, (v) => !v)

  const isActiveSession = (s: Session) =>
    decode64(params.dir ?? "") === s.directory && params.id === s.id

  return (
    <Show when={opened()}>
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        width: "100%",
        height: "100%",
        background: A.bgRaised,
        "border-right": `1px solid ${A.border}`,
        "z-index": "2",
        position: "relative",
      }}
    >

      {/* New chat + search */}
      <div style={{ padding: "12px", "flex-shrink": "0" }}>
        <button
          onClick={() => navigate(`/${base64Encode(activeDir())}/session`)}
          style={{
            width: "100%",
            display: "flex",
            "align-items": "center",
            "justify-content": "space-between",
            padding: "0 10px",
            height: "34px",
            "border-radius": "8px",
            border: "none",
            cursor: "pointer",
            background: `linear-gradient(135deg, ${A.accent}, #7c5fe0)`,
            color: A.accentInk,
            "font-size": "13px",
            "font-weight": "500",
          }}
        >
          <span style={{ display: "flex", "align-items": "center", gap: "6px" }}>
            <IconPaperPlane size={14} />
            New chat
          </span>
          <span style={{ "font-size": "10px", opacity: "0.65", "font-family": "monospace", "flex-shrink": "0" }}>
            ⌘N
          </span>
        </button>

        <div
          style={{
            display: "flex",
            "align-items": "center",
            gap: "8px",
            "margin-top": "10px",
            padding: "7px 10px",
            border: `1px solid ${A.border}`,
            "border-radius": "9px",
            background: A.bgInput,
          }}
        >
          <Icon name="magnifying-glass" size="small" style={{ color: A.fgDim }} />
          <input
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            placeholder="Search the archive"
            style={{
              flex: "1",
              "font-size": "12px",
              background: "transparent",
              border: "none",
              outline: "none",
              color: A.fg,
            }}
          />
        </div>
      </div>

      {/* Session list */}
      <div style={{ flex: "1", "overflow-y": "auto", padding: "2px 8px 12px" }}>
        <Show
          when={hasAnySessions()}
          fallback={
            <div
              style={{
                display: "flex",
                "flex-direction": "column",
                gap: "12px",
                padding: "40px 16px",
                "align-items": "center",
                "text-align": "center",
              }}
            >
              <Icon name="speech-bubble" size="normal" style={{ color: A.fgDim }} />
              <span style={{ "font-size": "12px", color: A.fgMuted }}>The archive is empty</span>
              <span style={{ "font-size": "11px", color: A.fgDim, "line-height": "1.5" }}>
                Start a conversation in any folder and it'll be inscribed here, grouped by circle.
              </span>
            </div>
          }
        >
          <For each={filtered()}>
            {(group) => (
              <FolderGroup
                group={group}
                home={home()}
                isActiveSession={isActiveSession}
                onOpenSession={(s) => navigate(`/${base64Encode(s.directory)}/session/${s.id}`)}
                onNewChat={() => navigate(`/${base64Encode(group.dir)}/session`)}
                collapsed={!!collapsed[group.dir]}
                onToggle={() => toggle(group.dir)}
              />
            )}
          </For>
        </Show>
      </div>

      {/* Settings */}
      <div
        style={{
          padding: "10px",
          "border-top": `1px solid ${A.border}`,
          "flex-shrink": "0",
        }}
      >
        <button
          onClick={props.openSettings}
          style={{
            width: "100%",
            display: "flex",
            "align-items": "center",
            gap: "8px",
            padding: "6px 10px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            "border-radius": "7px",
            color: A.fgMuted,
            "font-size": "12px",
          }}
        >
          <Icon name="settings-gear" size="small" style={{ color: A.fgDim }} />
          Settings
        </button>
      </div>
    </div>
    </Show>
  )
}

function FolderGroup(props: {
  group: GroupedDir
  home: string
  isActiveSession: (s: Session) => boolean
  onOpenSession: (s: Session) => void
  onNewChat: () => void
  collapsed: boolean
  onToggle: () => void
}) {
  const isHome = () => props.group.dir === props.home
  const label = () => (isHome() ? "Home" : getFilename(props.group.dir) || props.group.dir)

  return (
    <div style={{ "margin-top": "10px" }}>
      <div
        class="group/folder"
        onClick={props.onToggle}
        style={{
          display: "flex",
          "align-items": "center",
          padding: "5px 8px",
          gap: "7px",
          color: A.fgMuted,
          "font-size": "11.5px",
          cursor: "pointer",
        }}
      >
        <Icon
          name={props.collapsed ? "chevron-right" : "chevron-down"}
          size="small"
          style={{ color: A.fgDim }}
        />
        <Icon
          name="folder"
          size="small"
          style={{ color: isHome() ? A.accentBright : A.fgDim }}
        />
        <span style={{ "font-weight": "500", flex: "1" }}>{label()}</span>
        <span style={{ "font-size": "10px", color: A.fgDim, "font-family": "monospace" }}>
          {props.group.sessions.length}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); props.onNewChat() }}
          class="opacity-0 group-hover/folder:opacity-100 transition-opacity"
          style={{
            width: "18px",
            height: "18px",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            background: A.accentSoft,
            border: `1px solid ${A.accentRing}`,
            "border-radius": "4px",
            cursor: "pointer",
            color: A.accentBright,
          }}
          title={`New chat in ${label()}`}
        >
          <Icon name="plus-small" size="small" />
        </button>
      </div>

      <Show when={!props.collapsed}>
        <For each={props.group.sessions}>
          {(session) => (
            <SessionRow
              session={session}
              dir={props.group.dir}
              active={props.isActiveSession(session)}
              onOpen={() => props.onOpenSession(session)}
            />
          )}
        </For>
      </Show>
    </div>
  )
}

function SessionRow(props: { session: Session; dir: string; active: boolean; onOpen: () => void }) {
  const sync = useGlobalSync()
  const globalSDK = useGlobalSDK()
  const navigate = useNavigate()
  const language = useLanguage()
  const dialog = useDialog()

  const [editing, setEditing] = createSignal(false)
  const [draft, setDraft] = createSignal("")
  const [pendingRename, setPendingRename] = createSignal(false)
  let inputRef: HTMLInputElement | undefined

  const updated = () => props.session.time.updated ?? props.session.time.created
  const working = createMemo(() => {
    const [store] = sync.peek(props.dir, { bootstrap: false })
    return (store?.session_status?.[props.session.id]?.type ?? "idle") !== "idle"
  })

  const reportError = (err: unknown) =>
    showToast({
      variant: "error",
      title: language.t("common.requestFailed"),
      description: err instanceof Error ? err.message : String(err),
    })

  const startRename = () => {
    setDraft(props.session.title)
    setEditing(true)
    requestAnimationFrame(() => {
      inputRef?.focus()
      inputRef?.select()
    })
  }

  const commitRename = async () => {
    const next = draft().trim()
    setEditing(false)
    if (!next || next === props.session.title) return
    try {
      const client = globalSDK.createClient({ directory: props.dir, throwOnError: true })
      await client.session.update({ sessionID: props.session.id, title: next })
      const [, setStore] = sync.child(props.dir, { bootstrap: false })
      setStore(
        "session",
        produce((sessions: Session[]) => {
          const index = sessions.findIndex((s) => s.id === props.session.id)
          if (index !== -1) sessions[index].title = next
        }),
      )
    } catch (err) {
      reportError(err)
    }
  }

  const archive = async () => {
    try {
      const client = globalSDK.createClient({ directory: props.dir, throwOnError: true })
      await client.session.update({ sessionID: props.session.id, time: { archived: Date.now() } })
      const [, setStore] = sync.child(props.dir, { bootstrap: false })
      setStore(
        "session",
        produce((sessions: Session[]) => {
          const index = sessions.findIndex((s) => s.id === props.session.id)
          if (index !== -1) sessions.splice(index, 1)
        }),
      )
      if (props.active) navigate(`/${base64Encode(props.dir)}/session`)
    } catch (err) {
      reportError(err)
    }
  }

  const remove = async () => {
    try {
      const client = globalSDK.createClient({ directory: props.dir, throwOnError: true })
      await client.session.delete({ sessionID: props.session.id })
      const [, setStore] = sync.child(props.dir, { bootstrap: false })
      setStore(
        "session",
        produce((sessions: Session[]) => {
          const removed = new Set<string>([props.session.id])
          let added = true
          while (added) {
            added = false
            for (const s of sessions) {
              if (s.parentID && removed.has(s.parentID) && !removed.has(s.id)) {
                removed.add(s.id)
                added = true
              }
            }
          }
          for (let i = sessions.length - 1; i >= 0; i--) {
            if (removed.has(sessions[i].id)) sessions.splice(i, 1)
          }
        }),
      )
      if (props.active) navigate(`/${base64Encode(props.dir)}/session`)
    } catch (err) {
      reportError(err)
    }
  }

  return (
    <div
      class="group/session relative"
      onClick={() => {
        if (editing()) return
        props.onOpen()
      }}
      style={{
        display: "flex",
        "align-items": "center",
        gap: "6px",
        padding: "6px 10px 6px 30px",
        "font-size": "12.5px",
        "border-radius": "7px",
        margin: "1px 2px",
        background: props.active ? A.accentSoft : "transparent",
        color: props.active ? A.fg : A.fgMuted,
        "border-left": props.active ? `2px solid ${A.accent}` : "2px solid transparent",
        "box-shadow": props.active ? `0 0 16px ${A.accentSoft}` : "none",
        cursor: "pointer",
      }}
    >
      <Show when={working()}>
        <Spinner class="size-3.5 shrink-0" style={{ color: A.accentBright }} />
      </Show>

      <Show
        when={editing()}
        fallback={
          <span
            style={{
              flex: "1",
              "min-width": "0",
              overflow: "hidden",
              "text-overflow": "ellipsis",
              "white-space": "nowrap",
            }}
          >
            {props.session.title}
          </span>
        }
      >
        <input
          ref={inputRef}
          value={draft()}
          onClick={(e) => e.stopPropagation()}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onBlur={() => void commitRename()}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === "Enter") {
              e.preventDefault()
              void commitRename()
            } else if (e.key === "Escape") {
              e.preventDefault()
              setEditing(false)
            }
          }}
          style={{
            flex: "1",
            "min-width": "0",
            "font-size": "12.5px",
            color: A.fg,
            background: A.bgInput,
            border: `1px solid ${A.accentRing}`,
            "border-radius": "5px",
            padding: "1px 6px",
            outline: "none",
          }}
        />
      </Show>

      <Show when={!editing()}>
        <div class="relative flex items-center shrink-0" style={{ "margin-left": "auto" }}>
          <span
            class="transition-opacity"
            classList={{ "group-hover/session:opacity-0": props.active }}
            style={{ "font-size": "10px", color: A.fgDim, "font-family": "monospace" }}
          >
            {relTime(updated())}
          </span>
          <Show when={props.active}>
            <div
              class="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover/session:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenu gutter={4} placement="bottom-end">
                <DropdownMenu.Trigger
                  as={IconButton}
                  icon="dot-grid"
                  variant="ghost"
                  class="size-6 rounded-md data-[expanded]:bg-surface-base-active"
                  aria-label={language.t("common.moreOptions")}
                />
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    style={{ "min-width": "104px" }}
                    onCloseAutoFocus={(event) => {
                      if (!pendingRename()) return
                      event.preventDefault()
                      setPendingRename(false)
                      startRename()
                    }}
                  >
                    <DropdownMenu.Item onSelect={() => setPendingRename(true)}>
                      <DropdownMenu.ItemLabel>{language.t("common.rename")}</DropdownMenu.ItemLabel>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item onSelect={() => void archive()}>
                      <DropdownMenu.ItemLabel>{language.t("common.archive")}</DropdownMenu.ItemLabel>
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item
                      onSelect={() =>
                        dialog.show(() => (
                          <DialogDeleteSession
                            name={props.session.title || language.t("command.session.new")}
                            onConfirm={async () => {
                              await remove()
                              dialog.close()
                            }}
                            onCancel={() => dialog.close()}
                          />
                        ))
                      }
                    >
                      <DropdownMenu.ItemLabel>{language.t("common.delete")}</DropdownMenu.ItemLabel>
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}

function DialogDeleteSession(props: { name: string; onConfirm: () => void | Promise<void>; onCancel: () => void }) {
  const language = useLanguage()
  return (
    <Dialog title={language.t("session.delete.title")} fit>
      <div class="flex flex-col gap-4 pl-6 pr-2.5 pb-3">
        <div class="flex flex-col gap-1">
          <span class="text-14-regular text-text-strong">
            {language.t("session.delete.confirm", { name: props.name })}
          </span>
        </div>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" size="large" onClick={props.onCancel}>
            {language.t("common.cancel")}
          </Button>
          <Button variant="primary" size="large" onClick={() => void props.onConfirm()}>
            {language.t("session.delete.button")}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
