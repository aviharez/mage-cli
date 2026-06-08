# Arcanum — Post-Phase-G Fixes & UI Pass (execution plan)

> Audience: an implementing agent (e.g. Sonnet 4.6). Follow phases **in order**; each phase must
> `bun run --filter @mybcabisnis/mage-app build` (and, for Phase 6, also build `@mybcabisnis/mage-ui`)
> before starting the next. Repo root:
> `/Users/bcamaster/Documents/SNZ_Playground/research/new-mage`. Stack: SolidJS + Vite +
> `@solidjs/router` + Tailwind v4 + Kobalte; build/dev with `bun`. This continues
> `docs/plan/arcanum-redesign.md` (which was completed through Phase G).

---

## 1. Context & goal

The Arcanum redesign shipped through Phase G. Five follow-ups remain:

1. **Sidebar sessions don't persist on refresh** — after reload the grouped list shows the empty state
   or folders with "0" chats; sessions only appear after clicking a group's "+".
2. **Folder groups aren't collapsible** — the reference `V4FolderGroup` has a collapsing chevron.
3. **Composer + chat thread were never restyled** to the Arcanum look. `ArcComposerChrome` exists but
   is unused.
4. **Sidebar + header (command bar) must be hidden while the onboarding screen shows**, then land on the
   empty chat page after the username is bound.
5. **Folder switcher in the prompt input** — default folder is Home (`~`); the user can change the
   target folder from the composer, and new sessions are filed under the chosen folder in the sidebar.

Confirmed scope decisions: chat restyle = **Full** (including shared message parts in `packages/ui`);
collapse state = **session-only** (resets on refresh); composer chrome = **new-session composer only**.

### Reusable primitives (already in repo)
- `packages/app/src/components/arcanum/palette.ts` → `A` (colors + `A.serif`).
- `packages/app/src/components/arcanum/emblem.tsx` → `ArcEmblem`, `MageWordmark`, `ArcAvatar`,
  `RuneMark`.
- `packages/app/src/components/arcanum/atmos.tsx` → `ArcAtmos({ stars?, motes? })`.
- `packages/app/src/components/arcanum/composer-chrome.tsx` → `ArcComposerChrome(ParentProps &
  { big? })` — glowing violet border + 4 corner rune marks. **Currently unused.**
- `.serif` utility + `body[data-arc-motion]` motion gate already in `packages/app/src/index.css`.
- `DialogSelectDirectory` (`packages/app/src/components/dialog-select-directory.tsx`) — folder picker,
  props `{ multiple?: boolean; onSelect: (result: string | string[] | null) => void }`; supports `~`,
  path entry, dir autocomplete. Opened via `useDialog().show(() => <…/>, onClose?)`.

### Guardrails (do not break)
- Never remove `<Titlebar/>` or the `#mage-titlebar-left|center|right` portal ids while a **session
  view** is mounted — top-right buttons mount through them. Phase 3 only hides them during onboarding,
  before any session view exists.
- `packages/ui` is a **shared** package and **cannot import from `packages/app`** (dependency is
  app → ui only). Anything Arcanum needed inside `packages/ui` must be reimplemented locally there.
- New-chat navigation = `navigate(\`/${base64Encode(dir)}/session\`)` (no id). `base64Encode` from
  `@mybcabisnis/mage-shared/util/encode`; decode with `decode64` from `@/utils/base64`.

---

## Phase 1 — Fix sidebar session persistence

**File:** `packages/app/src/pages/layout/arcanum-sidebar.tsx`

**Root cause.** `onMount(() => sync.project.loadSessions(home()))` (lines 50-52) fires once; on a fresh
reload `sync.data.path.home` is still `""`, so nothing loads — and it only targets Home. The `groups`
memo (lines 54-66) reads each project dir via `sync.peek(dir, { bootstrap: false })`, which returns an
empty child store **without fetching** (`bootstrap:false` skips `onBootstrap` — see
`packages/app/src/context/global-sync/child-store.ts:251-260`). Layout's prefetch effect
(`packages/app/src/pages/layout.tsx:1607-1629`) only loads the *current* project's worktree, not the
other grouped folders.

**Change.** Replace the one-shot `onMount` with a reactive effect that loads every grouped directory
once `sync.ready`, mirroring the `loadedSessionDirs` pattern in `layout.tsx:1605-1629`.

Remove:
```tsx
onMount(() => {
  void sync.project.loadSessions(home())
})
```
Add (and add `createEffect` to the `solid-js` import; `onMount` may now be unused — drop it if so):
```tsx
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
```
`sync.project.loadSessions` dedupes in-flight loads (`global-sync.tsx:180-254`) and writes into the
same child store the `groups` memo reads via `peek`, so the memo updates reactively as sessions arrive.
Leave `groups`, `peek(dir,{bootstrap:false})`, `filtered`, and `hasAnySessions` unchanged.

**Checkpoint.** Hard-refresh at `/` and at a session URL — all folder groups populate with correct
counts without any clicks; no empty-state flash after `sync.ready`.

---

## Phase 2 — Collapsible folder groups (session-only)

**File:** `packages/app/src/pages/layout/arcanum-sidebar.tsx`

Lift collapse state into `ArcanumSidebar` keyed by directory (the `groups`/`filtered` memos recreate
group objects each run, so per-`FolderGroup` internal state would be lost). Add the import
`import { createStore } from "solid-js/store"` and, inside `ArcanumSidebar`:
```tsx
const [collapsed, setCollapsed] = createStore<Record<string, boolean>>({})
const toggle = (dir: string) => setCollapsed(dir, (v) => !v)
```
Pass two props through the `<For each={filtered()}>` into `FolderGroup`:
```tsx
collapsed={!!collapsed[group.dir]}
onToggle={() => toggle(group.dir)}
```
In `FolderGroup` (same file), extend its props type with `collapsed: boolean; onToggle: () => void`,
then:
1. Make the header row toggle: add `onClick={props.onToggle}` and `cursor: "pointer"` to the header
   `<div>` (the one with `class="group/folder"`).
2. Add a chevron as the first child of that header, before the folder `Icon`:
   ```tsx
   <Icon
     name={props.collapsed ? "chevron-right" : "chevron-down"}
     size="small"
     style={{ color: A.fgDim }}
   />
   ```
   (`chevron-right` / `chevron-down` are both present in `packages/ui/src/components/icon.tsx`.)
3. The existing per-group "+" button must NOT toggle the group — add to its handler:
   ```tsx
   onClick={(e) => { e.stopPropagation(); props.onNewChat() }}
   ```
4. Wrap the session rows so they hide when collapsed:
   ```tsx
   <Show when={!props.collapsed}>
     <For each={props.group.sessions}>{/* …existing row… */}</For>
   </Show>
   ```
   (`Show` is already imported in this file.)

**Checkpoint.** Click a group header → collapses (chevron flips, rows hide); click again → expands.
The "+" still starts a new chat without toggling.

---

## Phase 3 — Hide sidebar + header during onboarding

**Current structure.** `AppShellProviders` renders `<Layout>{children}</Layout>` (app.tsx:101); the
`OnboardingGate` (app.tsx:127) sits *inside* `Layout`, so the sidebar (`ArcanumSidebar`,
layout.tsx:1689 desktop / 1740 mobile) and `<Titlebar/>` keep rendering behind onboarding. The
`submitted` latch + `needsOnboarding` memo currently live privately in `OnboardingGate`.

**Approach.** Lift onboarding state into a small shared context so `Layout` can read it.

### 3.1 New context — `packages/app/src/components/arcanum/onboarding-context.tsx`
```tsx
import { createContext, createMemo, createSignal, useContext, type ParentProps } from "solid-js"
import { useGlobalSync } from "@/context/global-sync"

type OnboardingCtx = { needsOnboarding: () => boolean; markSubmitted: () => void }
const Ctx = createContext<OnboardingCtx>()

export function OnboardingProvider(props: ParentProps) {
  const sync = useGlobalSync()
  const [submitted, setSubmitted] = createSignal(false)
  const needsOnboarding = createMemo(
    () => sync.ready && !submitted() && !sync.data.config.username?.trim(),
  )
  return (
    <Ctx.Provider value={{ needsOnboarding, markSubmitted: () => setSubmitted(true) }}>
      {props.children}
    </Ctx.Provider>
  )
}

export function useOnboarding() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useOnboarding must be used within OnboardingProvider")
  return ctx
}
```

### 3.2 Mount the provider above `Layout` — `packages/app/src/app.tsx`
`GlobalSyncProvider` is an ancestor of the Router (~line 309), so place `OnboardingProvider` just
inside it (wrapping the Router / `RouterRoot` tree) so both `Layout` and `OnboardingGate` are
descendants and `useGlobalSync()` is available. Import `OnboardingProvider` from
`@/components/arcanum/onboarding-context`.

### 3.3 `OnboardingGate` consumes the context — `packages/app/src/components/arcanum/onboarding-gate.tsx`
Replace its private `submitted`/`needsOnboarding` with `const { needsOnboarding } = useOnboarding()`,
and pass the dialog's done-callback through (see 3.4). Keep the `<Show when={sync.ready} fallback={…}>`
splash and the `<Show when={!needsOnboarding()} fallback={<Onboarding …/>}>` structure.

### 3.4 `markSubmitted` on bind — `packages/app/src/components/arcanum/username-dialog.tsx`
In `confirm()`, after `await sync.updateConfig(...)`, call `markSubmitted()` (from `useOnboarding()`)
in place of / alongside the existing `props.onDone()` so the shared latch flips. Keep the
`navigate(\`/${base64Encode(sync.data.path.home)}/session\`)`.

### 3.5 Gate the chrome — `packages/app/src/pages/layout.tsx`
Add `const onboarding = useOnboarding()` in `Layout`, and wrap **both** the sidebar `<nav>` shells
(desktop ~1689 and mobile ~1740) **and** the `<Titlebar/>` render (~2364) in
`<Show when={!onboarding.needsOnboarding()}>…</Show>`. The shared latch prevents a flash during
`updateConfig`'s reload. Gating `<Titlebar/>` here is safe because the `#mage-titlebar-*` portals are
only consumed once a session view mounts — i.e. after onboarding.

**Checkpoint.** Blank `username` in `~/.mage/mage.json`, relaunch → onboarding shows full-bleed with
**no sidebar, no command bar**. Enter a username → chrome appears, lands on empty Home chat. Relaunch →
onboarding skipped, chrome present, top-right panels work.

---

## Phase 4 — Composer chrome + folder switcher (new-session only)

### 4.1 Wrap the new-session composer with `ArcComposerChrome`
The inline new-session composer is rendered at `packages/app/src/pages/session.tsx:1943`
(`<NewSessionDesignView>{composerRegion("inline")}</NewSessionDesignView>`) with the `NewSessionView`
fallback at 1942. Wrap the inline/new-session composer with `ArcComposerChrome` (use `big`). **Do NOT**
wrap the in-thread dock composer (`composerRegion("dock")`, session.tsx:1949) — it carries the layered
permission/todo/followup docks (`packages/app/src/pages/session/composer/session-composer-region.tsx`)
and must stay structurally intact.

### 4.2 Folder switcher ribbon (requirement 5)
Render an arcane context ribbon at the top of the new-session composer matching `V4Composer`'s
"@ Context · Home › `~`" row (arcanum.jsx 393-398). It shows the **current target folder**: Home (i.e.
`sync.data.path.home`) rendered as `~`, otherwise `getFilename(dir)` (from
`@mybcabisnis/mage-shared/util/path`). The current dir is the route's `:dir`; in `session.tsx` it is
available as `sdk.directory` / `decode64(params.dir)`.

Clicking the ribbon opens the existing `DialogSelectDirectory` (single-select) — the same picker
`layout.tsx:1264` uses:
```tsx
const dialog = useDialog()
function pickFolder() {
  void import("@/components/dialog-select-directory").then((x) => {
    dialog.show(() => (
      <x.DialogSelectDirectory
        onSelect={(result) => {
          const dir = Array.isArray(result) ? result[0] : result
          if (dir) navigate(`/${base64Encode(dir)}/session`)
          dialog.close()
        }}
      />
    ))
  })
}
```
Because the new session is created in that directory and the sidebar groups by `session.directory`
(Phase 1 already loads that folder's sessions), the new chat is automatically filed under the chosen
folder — no backend change; the directory rides in the route exactly like the existing new-chat flow.

Place this ribbon component in `packages/app/src/components/arcanum/` (e.g. `composer-folder-ribbon.tsx`)
and render it inside `ArcComposerChrome` above the composer, or alongside the composer in `session.tsx`.

**Checkpoint.** New-session screen shows the glowing chrome + ribbon (`~`). Click ribbon → picker opens
→ choose a folder → composer targets it → send a message → the session appears under that folder's group
in the sidebar (not Home).

---

## Phase 5 — New-session hero + thread atmosphere

### 5.1 Hero (V4Home look) — `packages/app/src/components/session/session-new-view.tsx` and/or
`packages/app/src/components/session/session-new-design-view.tsx`
Restyle the new-session welcome to `V4Home` (arcanum.jsx 530-577): `ArcEmblem size={72} glow animate`,
serif greeting (e.g. "Conjure anything") + a "You're in `~` — your Home circle" subtitle, over an
`<ArcAtmos stars/>` layer. Use the `.serif` utility and `A` palette. `shouldUseV2NewSessionPage` /
`newLayoutDesigns()` flags select which view renders — restyle the active path; do not couple new work
to those flags.

### 5.2 Atmosphere behind the thread — `packages/app/src/pages/session.tsx`
Add `<ArcAtmos motes={false}/>` as a `z-0`, absolutely-positioned layer behind the `MessageTimeline`
container (around session.tsx:1895-1939), with thread content kept above it (`position: relative` /
`z-10`). Motion stays gated by `body[data-arc-motion]` (Phase F setting).

**Checkpoint.** New-session hero is arcane; faint atmosphere sits behind the thread and stops when
"Arcane motion" is off.

---

## Phase 6 — Message parts: Full Arcanum restyle (shared `packages/ui`)

Blast radius is contained: `SessionTurn` / message-part components are consumed only by
`packages/app/src/pages/session/message-timeline.tsx` plus Storybook stories
(`session-turn.stories.tsx`, `message-part.stories.tsx`). Colors are **token-driven** — the Arcanum
theme already recolored the semantic CSS vars in Phase A (`oc-2.json`), and styling lives in
`packages/ui/src/components/message-part.css` keyed by `data-component` / `data-slot`. So most of this
phase is spacing/radius/border/glow + serif accents; the tokens carry the color.

### 6.1 Restyle via CSS — `packages/ui/src/components/message-part.css`
Match `V4Message` (arcanum.jsx 618-705) on the existing selectors (current values noted for reference):
- `[data-component="user-message"]` → bubble `[data-slot="user-message-text"]` currently
  `background: var(--surface-base); border: 1px solid var(--border-weak-base); padding: 8px 12px;
  border-radius: 6px;` — give it the arcane bubble (rounded ~12px, subtle accent glow via
  `box-shadow`, keep token colors).
- Assistant `[data-component="text-part"]` and `[data-component="reasoning-part"]` → tune line-height /
  spacing; optionally apply `.serif` to section labels.
- Tool / diff / terminal block chrome: `[data-component="bash-output"]`,
  `[data-component="edit-trigger"]`, `[data-component="write-trigger"]`, and the diff slots in
  `session-turn.tsx` (`[data-slot="session-turn-diff-view"]`) → match the arcane card chrome (rounded,
  `var(--border-weak-base)`, raised header on `var(--surface-raised-base)`). Keep diff add/delete on
  the existing `--surface-diff-*` / `--text-diff-*` tokens.

### 6.2 Assistant ring avatar — new `packages/ui/src/components/arc-avatar-emblem.tsx`
`ArcAvatar` lives in `packages/app` and can't be imported here. Reimplement a minimal `ArcAvatarEmblem`
inside `packages/ui` (port of `packages/app/src/components/arcanum/emblem.tsx` `ArcAvatar`, lines
~109-131; inline the 2-3 palette colors directly — no `packages/app` import). Render it as the assistant
role marker in `session-turn.tsx` / `message-part.tsx`, behind the existing role-label rendering so
non-Arcanum consumers are unaffected. The shared `packages/ui/src/components/avatar.tsx` stays for the
user's initials marker.

### 6.3 Build both packages
`bun run --filter @mybcabisnis/mage-ui build && bun run --filter @mybcabisnis/mage-app build`.

**Checkpoint.** The thread shows the restyled user bubble, assistant ring avatar, and tool/diff/terminal
blocks; Storybook (`session-turn.stories.tsx`, `message-part.stories.tsx`) still renders.

---

## Files

**Create:** `packages/app/src/components/arcanum/onboarding-context.tsx`,
`packages/app/src/components/arcanum/composer-folder-ribbon.tsx`,
`packages/ui/src/components/arc-avatar-emblem.tsx`.

**Modify:** `packages/app/src/pages/layout/arcanum-sidebar.tsx` (Phases 1-2),
`packages/app/src/app.tsx` (Phase 3),
`packages/app/src/components/arcanum/onboarding-gate.tsx` + `username-dialog.tsx` (Phase 3),
`packages/app/src/pages/layout.tsx` (Phase 3),
`packages/app/src/pages/session.tsx` (Phases 4-5),
`packages/app/src/components/session/session-new-view.tsx` +
`session-new-design-view.tsx` (Phase 5),
`packages/ui/src/components/message-part.css` + `message-part.tsx` + `session-turn.tsx` (Phase 6).

**Reuse (no edit):** `packages/app/src/components/dialog-select-directory.tsx`,
`packages/app/src/components/arcanum/{palette,emblem,atmos,composer-chrome}.{ts,tsx}`.

---

## Risks

1. `layout.tsx` is large & load-bearing — for Phase 3 only wrap the existing sidebar `<nav>` shells and
   `<Titlebar/>` in `<Show>`; don't restructure.
2. Hiding `<Titlebar/>` could kill the `#mage-titlebar-*` portals — safe only because it's gated to the
   onboarding state (no session view mounted yet). Verify top-right buttons after onboarding.
3. Phase 6 touches a shared package — verify Storybook + the app; keep colors on tokens.
4. Onboarding flicker during `updateConfig` reload — handled by the shared `submitted` latch (Phase 3).
5. Collapse state resetting unexpectedly — keep it in `ArcanumSidebar` keyed by dir (not inside
   `FolderGroup`).

---

## Verification (end-to-end)

After each phase: `bun run --filter @mybcabisnis/mage-app build` (Phase 6 also builds
`@mybcabisnis/mage-ui`). Live: `bun run --filter @mybcabisnis/mage-app dev` (or `/run`).

1. **Persistence:** hard-refresh at `/` and a session URL → all folder groups populate with correct
   counts, no clicks, no empty-state flash.
2. **Collapse:** click group header → collapses/expands; "+" still starts a chat without toggling.
3. **Onboarding chrome:** blank `username`, relaunch → onboarding full-bleed, no sidebar/header → enter
   name → chrome restored, empty Home chat → relaunch skips onboarding.
4. **Folder switcher:** new-session ribbon shows `~` → click → picker → choose folder → send → new
   session appears under that folder's sidebar group.
5. **Restyle:** new-session arcane hero + glowing composer chrome; thread shows restyled user bubble,
   assistant ring avatar, tool/diff/terminal blocks; atmosphere behind thread; stops when "Arcane
   motion" is off; Storybook renders.
6. **Regression:** post-onboarding, top-right file-tree/review/terminal/status panels + Settings open.
