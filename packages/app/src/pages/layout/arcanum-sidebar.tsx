import { createEffect, createMemo, createSignal, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useNavigate, useParams } from "@solidjs/router"
import { DateTime } from "luxon"
import { base64Encode } from "@mybcabisnis/mage-shared/util/encode"
import { decode64 } from "@/utils/base64"
import { getFilename } from "@mybcabisnis/mage-shared/util/path"
import { type Session } from "@mybcabisnis/mage-sdk/v2/client"
import { useGlobalSync } from "@/context/global-sync"
import { useLayout } from "@/context/layout"
import { Icon } from "@mybcabisnis/mage-ui/icon"

import { A } from "@/components/arcanum/palette"

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
            <Icon name="plus-small" size="small" />
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
          {(session) => {
            const active = () => props.isActiveSession(session)
            const updated = session.time.updated ?? session.time.created
            return (
              <div
                onClick={() => props.onOpenSession(session)}
                style={{
                  display: "flex",
                  gap: "6px",
                  padding: "6px 10px 6px 30px",
                  "font-size": "12.5px",
                  "border-radius": "7px",
                  margin: "1px 2px",
                  background: active() ? A.accentSoft : "transparent",
                  color: active() ? A.fg : A.fgMuted,
                  "border-left": active() ? `2px solid ${A.accent}` : "2px solid transparent",
                  "box-shadow": active() ? `0 0 16px ${A.accentSoft}` : "none",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    flex: "1",
                    overflow: "hidden",
                    "text-overflow": "ellipsis",
                    "white-space": "nowrap",
                  }}
                >
                  {session.title}
                </span>
                <span style={{ "font-size": "10px", color: A.fgDim, "font-family": "monospace" }}>
                  {relTime(updated)}
                </span>
              </div>
            )
          }}
        </For>
      </Show>
    </div>
  )
}
