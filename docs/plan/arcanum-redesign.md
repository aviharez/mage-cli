# Arcanum Redesign — `packages/app` (execution plan)

> Audience: an implementing agent (e.g. Sonnet 4.6). Follow phases **in order**; each phase must
> build before starting the next. Code blocks are concrete targets — match surrounding style.
> Repo root: `/Users/bcamaster/Documents/SNZ_Playground/research/new-mage`. Stack: SolidJS +
> Vite + `@solidjs/router` + Tailwind v4 + Kobalte. Build/dev with `bun`.

---

## 1. Context & goal

The web app currently opens a **dashboard** (`packages/app/src/pages/home.tsx`) that lists recent
folders + an "Open Project" button; the user picks a project before chatting. The left sidebar
(`packages/app/src/pages/layout.tsx`, ~2500 lines) is a project-rail + workspace UI. Settings
exposes 38 themes.

We are replacing the **flow** and **look** with the "Arcanum" reference at
`design-references/arcanum.jsx` (arcane violet twilight: emblem logo + wordmark, Spectral serif
headings, subtle motion/atmosphere). Target behavior:

1. **Onboarding gate** — on launch, if `~/.mage/mage.json` has no `username`, show the Onboarding
   screen. "Start Mage" → popup to enter a username; on confirm, persist + enter chat.
2. **Direct to chat** — with a username present, open straight into chat with active directory =
   user Home (`~`).
3. **New sidebar** — top→bottom: New-chat button, search input, all sessions **grouped by
   directory** (hover a group → "+" starts a new chat in that folder), Settings pinned at bottom.
4. **Keep top-right** — existing top-right buttons (file search, file-tree/review/terminal toggles,
   status popover) + their panels stay in place and keep working.
5. **Single theme** — remove the picker; lock to one Arcanum theme. Full aesthetic (emblem, serif,
   atmosphere/motion, violet palette).
6. **Multi-folder preserved** — default opens at Home, but sessions can span directories.

### Critical enabling fact — username needs NO backend change
`Config.username` already exists (`packages/opencode/src/config/config.ts:140`, *"Custom username
to display in conversations"*), is stored in `~/.mage/mage.json`, is in the generated SDK `Config`
type, is exposed as `sync.data.config.username`, and is writable via
`sync.updateConfig({ ...sync.data.config, username })` (`packages/app/src/context/global-sync.tsx:408`).
`getGlobal()` returns the **raw** file (unset ⇒ empty), so an empty username is the onboarding
signal. **Do not add server endpoints or regenerate the SDK.**

### Architecture facts (verified, with locations)
- **Routing** `packages/app/src/app.tsx:310-319`: `/` → `HomeRoute`; `/:dir` → `DirectoryLayout`
  with children `/` → `SessionIndexRoute` (`<Navigate href="session"/>`) and `/session/:id?` →
  `SessionRoute`. Directory segment is base64 (`base64Encode` from
  `@mybcabisnis/mage-shared/util/encode`; decode via `decode64` from `@/utils/base64`).
- **New chat = navigate to** `/${base64Encode(dir)}/session` (no id). `session.tsx` renders the
  new-session composer when `params.id` is absent. Precedent: `titlebar.tsx:253-256`.
- **`<Layout>`** (`packages/app/src/pages/layout.tsx`) wraps all routed children inside
  `AppShellProviders` (`app.tsx:91-108`) and renders the sidebar + `<Titlebar/>` + `<main>`.
- **Top-right buttons** render through **portals** into `#mage-titlebar-center` /
  `#mage-titlebar-right` (`titlebar.tsx:308,319`), populated by `components/session/session-header.tsx`.
  `<Titlebar/>` is rendered by `layout.tsx` (~line 2364). **These ids must keep existing & visible.**
- **Theme**: generated from a small seed/`palette` by `packages/ui/src/theme/resolve.ts`; default
  hardcoded `oc-2` (`packages/ui/src/theme/context.tsx:166`), themes auto-discovered via
  `import.meta.glob("./themes/*.json")` (`context.tsx:25`).
- **Global sync** (`global-sync.tsx`): `sync.data.path.home`, `sync.data.project` (`Project[]`,
  each `worktree` + `time`), `sync.data.config` (with `username`), `sync.ready`, `sync.updateConfig`,
  `sync.project.loadSessions(dir)`, `sync.peek(dir,{bootstrap})` / `sync.child(dir)` →
  child store with `.session: Session[]` (each has `id`, `directory`, `title`, `time`, `parentID`).
- **Fonts**: `<link>` in `packages/app/index.html`. **App-global keyframes**: `packages/app/src/index.css`.
- **Dialogs**: `useDialog().show(() => <Cmp/>, onClose?)` from `@mybcabisnis/mage-ui/context/dialog`
  (Kobalte modal; Esc closes; one active dialog). `useDialog().close()` to dismiss.
- **Primitives** in `packages/ui/src/components`: `Button`, `TextField`, `Switch`, `Dialog`, `Icon`,
  `IconButton`, `Popover`, `Tooltip`, `Splash`/`Logo`. Import via `@mybcabisnis/mage-ui/<name>`.

> Note: `settings.general.newLayoutDesigns()` / `showNavigation()` flags exist in `titlebar.tsx` —
> leave them alone; do not couple new work to them.

---

## Phase 0 — Port Arcanum primitives to Solid

`design-references/arcanum.jsx` is **React**. Convert idioms: `className`→`class`; JSX `.map(...)`
→ `<For each={...}>{(x)=>...}</For>`; numeric inline styles → strings with units; keep CSS custom
props (`"--len"`) as string keys; SVG camelCase attrs → kebab (`strokeWidth`→`stroke-width`,
`strokeDasharray`→`stroke-dasharray`, `strokeLinecap`→`stroke-linecap`); drop `Object.assign(window,…)`.
Replace the mockup's `Icon` with `@mybcabisnis/mage-ui/icon`'s `Icon` (map names: `home`, `search`,
`plus`, `folder`, `chevron-down`/`chevron-right`, `sparkles`/`gear`, etc. — pick the closest existing
icon names; check `packages/ui/src/components/icon.tsx` for the available set).

Create folder `packages/app/src/components/arcanum/`.

### 0.1 `palette.ts`
Export the `A` object verbatim from `arcanum.jsx` (lines 8-39), minus `sans/mono/serif` refs:
```ts
export const A = {
  bg: "#080611", bgRaised: "#0f0c1d", bgCard: "#151131", bgInput: "#0b0918", bgInk: "#060410",
  border: "rgba(165,148,255,0.10)", borderStrong: "rgba(165,148,255,0.22)",
  fg: "#e7e2fb", fgMuted: "#9b90c8", fgDim: "#5b5388", fgInk: "#f6f2ff",
  accent: "#a98bff", accentBright: "#c8b4ff", accentInk: "#160f2e",
  accentSoft: "rgba(169,139,255,0.13)", accentRing: "rgba(169,139,255,0.32)",
  aether: "#67e8f9", ok: "#6ee7b7", warn: "#f6c177", err: "#f87a9a", add: "#6ee7b7", del: "#f87a9a",
  serif: '"Spectral", Georgia, "Times New Roman", serif',
} as const
```
This is the source for inline gradients/glows the CSS-var theme can't express.

### 0.2 `emblem.tsx`
Port `ArcEmblem`, `MageWordmark`, `ArcAvatar`, `ArcStatus`, `RuneMark` (arcanum.jsx 110-203) to
Solid. Use `import { A } from "./palette"`. Example shape for `ArcEmblem`:
```tsx
import { For } from "solid-js"
import { A } from "./palette"

export function ArcEmblem(props: { size?: number; glow?: boolean; animate?: boolean }) {
  const size = () => props.size ?? 40
  const ticks = Array.from({ length: 12 }, (_, i) => { /* same math as mockup 112-118 */ })
  const spokes = Array.from({ length: 8 }, (_, i) => { /* same math as mockup 120-126 */ })
  return (
    <svg width={size()} height={size()} viewBox="0 0 100 100"
      style={{ display: "block", overflow: "visible", "flex-shrink": 0,
        filter: props.glow ? `drop-shadow(0 0 13px ${A.accentRing})` : "none" }}>
      {/* ... port circles/lines; use <For> for ticks/spokes; class={props.animate ? "arc-rot" : ""} */}
    </svg>
  )
}
```
Keep `arc-rot`/`arc-rev`/`arc-orbit`/`arc-breathe`/`arc-trace` class toggles gated on `props.animate`.

### 0.3 `atmos.tsx`
Port `ArcAtmos` + the module-scope seeded data (`ARC_RNG`, `ARC_STARS`, `ARC_CONSTEL`, `ARC_MOTES`,
arcanum.jsx 205-265). Props `{ stars?: boolean; motes?: boolean }` (default `motes: true`). Render
the gradient washes + aurora div + optional `<svg>` constellation/stars + mote `<span>`s via `<For>`.
The `.arc-*` classes + `body[data-arc-motion="off"]` gate come from Phase A's `index.css`.

### 0.4 `composer-chrome.tsx`
Port only the **decorative shell** of `V4Composer` (arcanum.jsx 378-411): the glowing border box +
the four corner rune marks (`ARC_RUNES`, `RuneMark`). Export `ArcComposerChrome(props: ParentProps &
{ big?: boolean })` that wraps `props.children`. The real composer logic stays in
`pages/session/composer/`; this is a visual wrapper applied in Phase E (optional polish).

**Checkpoint:** `bun run --filter @mybcabisnis/mage-app build` — primitives compile in isolation.

---

## Phase A — Single Arcanum theme + fonts + keyframes

### A.1 Recolor the default theme — `packages/ui/src/theme/themes/oc-2.json`
Keep `id: "oc-2"`; set `name: "Arcanum"`. Use the compact `palette` form (type `ThemePaletteColors`
in `packages/ui/src/theme/types.ts`) so `resolve.ts` regenerates all semantic tokens. Make **`light`
identical to `dark`** (design is dark-only). Replace file contents with:
```json
{
  "$schema": "https://opencode.ai/desktop-theme.json",
  "name": "Arcanum",
  "id": "oc-2",
  "dark": {
    "palette": {
      "neutral": "#080611", "ink": "#e7e2fb", "primary": "#a98bff", "accent": "#a98bff",
      "interactive": "#a98bff", "success": "#6ee7b7", "warning": "#f6c177", "error": "#f87a9a",
      "info": "#67e8f9", "diffAdd": "#6ee7b7", "diffDelete": "#f87a9a"
    },
    "overrides": {
      "background-base": "#080611",
      "surface-raised-base": "#0f0c1d", "surface-raised-base-hover": "#151131",
      "surface-base": "#151131", "surface-base-hover": "#ffffff0d",
      "input-base": "#0b0918",
      "border-weak-base": "#16132b", "border-weaker-base": "#110e22", "border-base": "#221d3f",
      "text-strong": "#f6f2ff", "text-base": "#9b90c8", "text-weak": "#5b5388", "text-weaker": "#46406b",
      "icon-base": "#9b90c8", "icon-weak-base": "#5b5388", "icon-brand-base": "#c8b4ff",
      "surface-brand-base": "#a98bff", "surface-brand-hover": "#c8b4ff",
      "syntax-keyword": "#c8b4ff", "syntax-string": "#6ee7b7", "syntax-primitive": "#67e8f9",
      "syntax-property": "#a98bff", "syntax-type": "#f6c177", "syntax-constant": "#67e8f9",
      "syntax-comment": "#5b5388"
    }
  },
  "light": { "...": "EXACT COPY of the dark object above (palette + overrides)" }
}
```
> Replace the `light` placeholder with a literal duplicate of the `dark` value. After editing, open
> the app and adjust any token that reads wrong (the `resolve.ts` generator fills the rest from
> `neutral`/`ink`). Override keys must be valid token names — cross-check against the keys already
> present in the original `oc-2.json` and `packages/ui/src/styles/tailwind/colors.css`.

### A.2 Lock to a single theme — `packages/ui/src/theme/context.tsx`
- **Delete the other 37 theme JSONs** in `packages/ui/src/theme/themes/` (keep only `oc-2.json`).
  Then `import.meta.glob("./themes/*.json")` (`context.tsx:25`) yields only `oc-2`, so `themeIDs()`
  returns `["oc-2"]` and any cycle/select becomes a no-op.
- Trim the `names` map (`context.tsx:43-81`) to `{ "oc-2": "Arcanum" }`.
- No other change needed — `oc-2` is already the default and has special-cased storage handling.

### A.3 Remove the picker UI — `packages/app/src/components/settings-general.tsx`
Remove the theme `SettingsRow` and the color-scheme `SettingsRow` (the rows that call
`theme.setTheme` / `theme.previewTheme` / `theme.setColorScheme`; grep this file for `theme.` and
`colorScheme`). Delete now-unused `themeOptions`/`colorSchemeOptions` memos. Leave all other rows.

> Theme-cycle **commands** in `layout.tsx` (`theme.cycle`, `theme.set.*`, `theme.scheme.*`) can stay
> as harmless no-ops; remove them in the Phase-G cleanup to keep this phase's diff small.

### A.4 Fonts + keyframes
- **`packages/app/index.html`**: beside the existing Inter `<link>` (~line 20) add Spectral:
  ```html
  <link href="https://fonts.googleapis.com/css2?family=Spectral:wght@400;500;600&display=swap" rel="stylesheet">
  ```
  On `<body>` add the default attribute `data-arc-motion="on"`.
- **`packages/app/src/index.css`**: append the Arcanum keyframes + helper classes + motion gate +
  a serif utility. Port from `ArcanumCSS` (arcanum.jsx 41-105) — keep only the `@keyframes` and the
  `.arc-*` animation classes and the `body[data-arc-motion="off"] …{animation:none !important}` block.
  Do **not** copy the `.v4` reset utilities (Tailwind covers those). Add:
  ```css
  .serif { font-family: "Spectral", Georgia, "Times New Roman", serif; font-weight: 400; }
  .font-arc-mono { /* if needed, falls back to existing mono var */ }
  ```

**Checkpoint:** build + dev. App is now violet/arcane; old flow still works; Settings shows no theme
picker.

---

## Phase B — Onboarding gate + screen + username popup

### B.1 Gate — `packages/app/src/components/arcanum/onboarding-gate.tsx`
```tsx
import { createMemo, createSignal, Show, type ParentProps } from "solid-js"
import { Splash } from "@mybcabisnis/mage-ui/logo"
import { useGlobalSync } from "@/context/global-sync"
import { Onboarding } from "./onboarding"

export function OnboardingGate(props: ParentProps) {
  const sync = useGlobalSync()
  const [submitted, setSubmitted] = createSignal(false)
  const needsOnboarding = createMemo(
    () => sync.ready && !submitted() && !sync.data.config.username?.trim(),
  )
  return (
    <Show when={sync.ready} fallback={
      <div class="h-dvh w-screen flex items-center justify-center bg-background-base">
        <Splash class="w-16 h-20 opacity-50 animate-pulse" />
      </div>
    }>
      <Show when={!needsOnboarding()} fallback={<Onboarding onDone={() => setSubmitted(true)} />}>
        {props.children}
      </Show>
    </Show>
  )
}
```
The `submitted` latch prevents a flicker back to onboarding during `updateConfig`'s reload cycle
(`updateConfig` sets `reload:"pending"` then re-bootstraps).

**Mount it** in `packages/app/src/app.tsx` `RouterRoot` (lines 123-132), wrapping the routed children:
```tsx
function RouterRoot(props: ParentProps<{ appChildren?: JSX.Element }>) {
  return (
    <AppShellProviders>
      <OnboardingGate>
        {props.appChildren}
        {props.children}
      </OnboardingGate>
    </AppShellProviders>
  )
}
```
`GlobalSyncProvider` is an ancestor (`app.tsx:309`), so `useGlobalSync()` is available here.

### B.2 Onboarding screen — `packages/app/src/components/arcanum/onboarding.tsx`
Solid port of `V4Onboarding` (arcanum.jsx 414-462). Full-viewport (`h-dvh w-screen`), `<ArcAtmos
stars/>`, summoning rings, `<ArcEmblem size={132} glow animate/>`, serif "mage" wordmark + tagline,
the three "rites" cards via `<For>`, and a primary **"Start Mage"** button. The button opens the
username dialog:
```tsx
const dialog = useDialog()
// onClick:
dialog.show(() => <UsernameDialog onDone={props.onDone} />)
```
Drop the hardcoded "Signed in as bcamaster" footer (use neutral copy or omit). `props: { onDone: () => void }`.

### B.3 Username popup — `packages/app/src/components/arcanum/username-dialog.tsx`
Solid port of `V4Username` (arcanum.jsx 465-527) rendered **inside** the dialog system (Kobalte
already supplies the scrim/Esc). Card with `<ArcEmblem size={52} glow/>`, serif heading, a controlled
input (reuse `@mybcabisnis/mage-ui/text-field` `TextField` for a11y, styled arcane), suggestion
pills via `<For>`, and a **"Bind the name"** button + Enter-to-confirm. Default value =
`sync.data.config.username ?? ""`.
```tsx
const sync = useGlobalSync(); const dialog = useDialog(); const navigate = useNavigate()
const [value, setValue] = createSignal(sync.data.config.username ?? "")
async function confirm() {
  const name = value().trim(); if (!name) return
  await sync.updateConfig({ ...sync.data.config, username: name })
  props.onDone()
  dialog.close()
  navigate(`/${base64Encode(sync.data.path.home)}/session`)
}
```
`props: { onDone: () => void }`. Import `base64Encode` from `@mybcabisnis/mage-shared/util/encode`,
`useNavigate` from `@solidjs/router`, `useDialog` from `@mybcabisnis/mage-ui/context/dialog`.

**Checkpoint:** With a `~/.mage/mage.json` lacking `username` (or temporarily blank it), launch →
Onboarding → enter name → lands in Home chat. Relaunch → skips onboarding.

---

## Phase C — `/` opens Home chat (retire dashboard)

### C.1 `packages/app/src/pages/home-redirect.tsx`
```tsx
import { createEffect } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { Splash } from "@mybcabisnis/mage-ui/logo"
import { base64Encode } from "@mybcabisnis/mage-shared/util/encode"
import { useGlobalSync } from "@/context/global-sync"

export default function HomeRedirect() {
  const sync = useGlobalSync(); const navigate = useNavigate()
  createEffect(() => {
    const home = sync.data.path.home
    if (!sync.ready || !home) return
    navigate(`/${base64Encode(home)}/session`, { replace: true })
  })
  return <div class="h-dvh w-screen flex items-center justify-center bg-background-base">
    <Splash class="w-16 h-20 opacity-50 animate-pulse" />
  </div>
}
```

### C.2 `packages/app/src/app.tsx`
- Replace the `HomeRoute` lazy import (line 51) with `import HomeRedirect from "@/pages/home-redirect"`.
- Change the route (line 314) to `<Route path="/" component={HomeRedirect} />`.

### C.3 Delete `packages/app/src/pages/home.tsx`
Confirm nothing else imports it (grep `pages/home`). `DialogSelectDirectory` / `DialogSelectServer`
are referenced elsewhere — **keep those files**. `/:dir/session/:id` is unchanged.

**Checkpoint:** launching at `/` lands directly in the Home (`~`) new-session chat.

---

## Phase D — New sidebar (replace old chrome, keep controller)

### D.1 Preserve vs replace in `packages/app/src/pages/layout.tsx`
**KEEP (load-bearing controllers — do not remove):** `<Titlebar/>` render (~2364, hosts the
top-right portals), Toast region (`<Toast.Region/>`, ~2508) + notification/update polling
(`useSDKNotificationToasts`, `useUpdatePolling`, `setNavigate(navigate)`), the session **prefetch**
engine + the `createEffect` calling `globalSync.project.loadSessions` (~1819-1841), navigation/command
machinery and the `command.register("layout", …)` block (minus theme cmds), the `--main-left` /
`--dialog-left-margin` CSS-var effects, and `<main>{props.children}</main>` (~2456-2465).

**REPLACE (old sidebar UI only):** the desktop `<nav data-component="sidebar-nav-desktop">`
(~2368-2391) and mobile `<nav>` (~2430-2442) **bodies** (`sidebarContent()`), plus the peek/hover/rail
helpers (`SidebarPanel`, `aim`, `hoverProject`, `peek`, `arm/disarm/reset`, the rail `ResizeHandle`,
peek overlay panels). Leave the outer `<nav>` elements + their width so `--main-left` math holds
(or hardcode width 256px).

### D.2 Swap strategy (incremental, always buildable)
1. Build `ArcanumSidebar` (D.3) as a self-contained component.
2. In `layout.tsx`'s JSX, render `<ArcanumSidebar/>` in place of `sidebarContent()` inside the
   existing desktop/mobile `<nav>` shells; keep `<Titlebar/>`, `<Toast.Region/>`, `<DebugBar/>`,
   `<main>` exactly.
3. After verifying, delete the dead helpers + unused imports (`sidebar-workspace.tsx`,
   `sidebar-project.tsx`, `sidebar-shell.tsx`, solid-dnd) in the Phase-G cleanup commit.

### D.3 `packages/app/src/pages/layout/arcanum-sidebar.tsx`
Solid port of `V4Sidebar` + `V4FolderGroup` (arcanum.jsx 302-366). Data wiring:
```tsx
const sync = useGlobalSync(); const navigate = useNavigate(); const params = useParams()
const dialog = useDialog()
const home = () => sync.data.path.home
const activeDir = () => decode64(params.dir ?? "") || home()

// Ensure Home sessions load (controller already loads project dirs):
onMount(() => { void sync.project.loadSessions(home()) })

// Gather all sessions across known projects + Home, grouped by directory.
const groups = createMemo(() => {
  const dirs = new Set<string>([home(), ...sync.data.project.map((p) => p.worktree)])
  const out: { dir: string; sessions: Session[] }[] = []
  for (const dir of dirs) {
    const [store] = sync.peek(dir, { bootstrap: false })   // child store; do NOT use child() in a list
    const sessions = (store?.session ?? []).filter((s) => !s.parentID)
    out.push({ dir, sessions: sortByRecent(sessions) })    // reuse sortedRootSessions from pages/layout/helpers.ts if suitable
  }
  // Home first, then most-recent activity desc
  return out.sort((a, b) => (a.dir === home() ? -1 : b.dir === home() ? 1 : recency(b) - recency(a)))
})

// Search filter
const [query, setQuery] = createSignal("")
const filtered = createMemo(() => /* filter group.sessions by title incl. + dir basename; drop empty groups */)
```
Structure (top→bottom):
1. **Header**: `<MageWordmark emblem={24} text={18}/>` + (optional) `layout.sidebar.toggle` affordance.
2. **New chat** button (violet gradient) → `navigate(\`/${base64Encode(activeDir())}/session\`)`.
   Register a `session.new`-style command/keybind in the layout controller if not already present.
3. **Search input** bound to `query`/`setQuery`.
4. **Grouped list** `<For each={filtered()}>`:
   - **Group header**: folder/home icon + basename (`getFilename(dir)` from
     `@mybcabisnis/mage-shared/util/path`; render Home as "Home"/`~`) + session count. Wrap in a
     Tailwind `group/...` container and reveal a **"+"** button on `group-hover` →
     `navigate(\`/${base64Encode(group.dir)}/session\`)`.
   - **Session rows** `<For>`: title (ellipsized) + relative time (`luxon` `DateTime.fromMillis(...).toRelative()`).
     Click → `navigate(\`/${base64Encode(s.directory)}/session/${s.id}\`)`. **Active highlight** when
     `decode64(params.dir) === s.directory && params.id === s.id` (accentSoft bg + left accent border).
   - Empty-archive state per mockup when no sessions exist anywhere.
5. **Settings** pinned at bottom → open the existing settings dialog. The controller exposes
   `openSettings()` (lazy-imports `@/components/dialog-settings`, ~`layout.tsx:1216`); pass it as a
   prop, or lazy-import `DialogSettings` here and `dialog.show(() => <DialogSettings/>)`.

Mobile: keep the existing mobile `<nav>` shell (translate-x + `layout.mobileSidebar`) and render
`<ArcanumSidebar mobile/>` inside.

**Checkpoint:** sessions appear grouped by directory; per-group "+" starts a chat in that folder;
active row highlights; Settings opens; **all top-right buttons/panels still work** (verify file-tree,
review, terminal toggles + status popover).

---

## Phase E — Command bar restyle (keep top-right intact)

Do **not** touch `components/session/session-header.tsx` portal logic. Restyle only
`packages/app/src/components/titlebar.tsx`'s `<header>` (line 168) to the `V4CommandBar` look
(arcanum.jsx 277-300): violet-tinted `A.bgInk` background, hairline `border-border-weak-base` bottom,
accent home icon, and a centered "Summon a command, file or chat ⌘K" pill — **restyle the existing
center file-search button** (already injected into `#mage-titlebar-center` by `session-header`), do
not add a second one. **Preserve**: the grid `grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]`, the three
`#mage-titlebar-left|center|right` ids, `data-tauri-drag-region`, and the mac/windows spacer logic.
Optionally render a `~`/breadcrumb in `#mage-titlebar-left`.

Optional polish: wrap the session composer (`pages/session/composer/`) with `ArcComposerChrome` from
Phase 0.4.

---

## Phase F — Settings → Arcanum + remove theme

Keep `packages/app/src/components/dialog-settings.tsx` as the host (opened from the new sidebar + the
`⌘,` command). Restyle its surface and `settings-general.tsx` content to the arcane look (serif
section headers, `A.bgInk` nav, violet active row) modeled on `V4Settings` (arcanum.jsx 770-825).
Map nav **only** to settings that already exist; do not invent panels. Theme + color-scheme rows are
already removed (Phase A.3). **Add**:
- A **username** row bound to `sync.updateConfig({ ...sync.data.config, username })` (lets users edit
  later, as onboarding copy promises).
- An **"Arcane motion"** toggle → a new persisted setting in `packages/app/src/context/settings.tsx`
  that sets `document.body.dataset.arcMotion = on ? "on" : "off"` (drives the `index.css` gate +
  `ArcAtmos`/emblem `animate`).

---

## Phase G — Cleanup (separate commit)

- Delete dead sidebar helpers in `layout.tsx` (`SidebarPanel`, peek/hover/rail) + now-unused imports.
- Delete `pages/layout/sidebar-workspace.tsx`, `sidebar-project.tsx`, `sidebar-shell.tsx` if unused
  (grep first).
- Remove theme-cycle commands in `layout.tsx` (`theme.cycle`, `theme.set.*`, `theme.scheme.*`).
- Confirm the 37 non-Arcanum theme JSONs are gone.

---

## Files

**Create:** `packages/app/src/components/arcanum/{palette.ts,emblem.tsx,atmos.tsx,composer-chrome.tsx,
onboarding-gate.tsx,onboarding.tsx,username-dialog.tsx}`, `packages/app/src/pages/home-redirect.tsx`,
`packages/app/src/pages/layout/arcanum-sidebar.tsx`.

**Modify:** `packages/ui/src/theme/themes/oc-2.json`, `packages/ui/src/theme/context.tsx`,
`packages/app/index.html`, `packages/app/src/index.css`, `packages/app/src/app.tsx`,
`packages/app/src/pages/layout.tsx`, `packages/app/src/components/titlebar.tsx`,
`packages/app/src/components/settings-general.tsx`, `packages/app/src/components/dialog-settings.tsx`,
`packages/app/src/context/settings.tsx` (Arcane-motion setting).

**Delete:** `packages/app/src/pages/home.tsx`; the 37 non-Arcanum `packages/ui/src/theme/themes/*.json`;
(if unused, in Phase G) `pages/layout/sidebar-{workspace,project,shell}.tsx`.

---

## Risks

1. `layout.tsx` is huge & load-bearing — swap only the `<nav>` body; defer deletions to Phase G.
2. Portal-mount breakage silently kills top-right buttons — never remove `<Titlebar/>` or the
   `#mage-titlebar-*` ids; verify buttons after every sidebar change.
3. React→Solid port bugs — Phase 0 builds primitives in isolation; verify visually before wiring.
4. Onboarding flicker during `updateConfig` reload — handled by the `submitted` latch (B.1).
5. Theme glob still pulling 37 themes — physically delete the JSONs (A.2).
6. Session enumeration over-pinning — use `peek(dir,{bootstrap:false})`, not `child()`; rely on the
   controller's existing `loadSessions` effects; only explicitly `loadSessions(home)`.

## Verification

After **each** phase: `bun run --filter @mybcabisnis/mage-app build` (stay buildable).
Live: `bun run --filter @mybcabisnis/mage-app dev` (or the `/run` skill). Walk the full flow:
launch with no `username` → Onboarding → "Start Mage" → enter username → lands in Home (`~`) chat →
sidebar shows sessions grouped by directory → hover a group → "+" starts a chat there → top-right
file-tree/review/terminal/status panels still open → Settings opens with no theme picker and a
working "Arcane motion" toggle → relaunch skips onboarding (username persisted in `~/.mage/mage.json`).
