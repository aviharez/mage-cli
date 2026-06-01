# Arcanum Redesign — Implementation Progress

> Tracks completed phases and notes next steps. Reference: `arcanum-redesign.md`.

---

## Phase 0 — Port Arcanum primitives to Solid ✅ DONE

**Completed.** Build verified clean (`bun run --filter @mybcabisnis/mage-app build` → exit 0).

### Files created

| File | Contents |
|------|----------|
| `packages/app/src/components/arcanum/palette.ts` | `A` color object — all Arcanum design tokens. `sans`/`mono` removed (no external deps). |
| `packages/app/src/components/arcanum/emblem.tsx` | `ArcEmblem`, `MageWordmark`, `ArcAvatar`, `ArcStatus`, `RuneMark`, `ARC_RUNES` |
| `packages/app/src/components/arcanum/atmos.tsx` | `ArcAtmos` + seeded module-scope data (`ARC_RNG`, `ARC_STARS`, `ARC_CONSTEL`, `ARC_MOTES`) |
| `packages/app/src/components/arcanum/composer-chrome.tsx` | `ArcComposerChrome` — decorative border + four `RuneMark` corners, wraps `props.children` |

### Key React→Solid conversions applied
- `className` → `class` throughout
- `.map(...)` inside JSX → `<For each={...}>{(item, i) => ...}</For>`
- Numeric inline sizes → `"${n}px"` strings (SolidJS doesn't auto-suffix unlike React)
- SVG camelCase attrs → kebab: `strokeWidth`→`stroke-width`, `strokeDasharray`→`stroke-dasharray`, `strokeLinecap`→`stroke-linecap`, `strokeLinejoin`→`stroke-linejoin`
- CSS custom properties (`--len`, `--tw`, `--dur`, `--delay`, `--mo`) cast via `as JSX.CSSProperties`
- Dropped `Object.assign(window, …)` export
- No `Icon` component needed for Phase 0 primitives (none of these four components use it)

---

## Phase A — Single Arcanum theme + fonts + keyframes ✅ DONE

**Completed.** Build verified clean (`bun run --filter @mybcabisnis/mage-app build` → exit 0).

### Files changed

| File | Change |
|------|--------|
| `packages/ui/src/theme/themes/oc-2.json` | Rewritten with Arcanum violet palette; `light` = `dark` (always dark). |
| `packages/ui/src/theme/themes/*.json` | All 37 non-Arcanum theme files deleted; only `oc-2.json` remains. |
| `packages/ui/src/theme/context.tsx` | `names` map trimmed to `{ "oc-2": "Arcanum" }`. |
| `packages/app/src/components/settings-general.tsx` | Removed `themeOptions`/`colorSchemeOptions` memos; removed colorScheme and theme `SettingsRow`s; removed `ColorScheme` type import and `ThemeOption` type. |
| `packages/app/index.html` | Added Spectral `<link>`; added `data-arc-motion="on"` to `<body>`. |
| `packages/app/src/index.css` | Appended `@keyframes arc-*`, `.arc-*` animation classes, `body[data-arc-motion="off"]` gate, `.serif` utility. |

---

## Phase B — Onboarding gate + screen + username popup ✅ DONE

**Completed.** Build verified clean (`bun run --filter @mybcabisnis/mage-app build` → exit 0).

### Files created

| File | Contents |
|------|----------|
| `packages/app/src/components/arcanum/onboarding-gate.tsx` | `OnboardingGate` — wraps children; shows loading splash while sync not ready; shows `Onboarding` when no username; `submitted` latch prevents flicker during updateConfig reload cycle. |
| `packages/app/src/components/arcanum/onboarding.tsx` | `Onboarding` — full-viewport screen with `ArcAtmos stars`, summoning rings, `ArcEmblem size={132} glow animate`, serif "mage" wordmark, tagline, three rites cards, "Start Mage" button that opens `UsernameDialog`. |
| `packages/app/src/components/arcanum/username-dialog.tsx` | `UsernameDialog` — Kobalte dialog card with `ArcEmblem`, serif heading, "Your domain" input, "Bind the name" button + Enter-to-confirm; calls `sync.updateConfig`, `props.onDone()`, `dialog.close()`, navigates to home chat. |

### Files modified

| File | Change |
|------|--------|
| `packages/app/src/app.tsx` | Added `OnboardingGate` import; wrapped `RouterRoot` children in `<OnboardingGate>`. |

### Post-completion fixes
- `Icon` `size` prop takes `"small"|"normal"|"medium"|"large"`, not a number — passing `size={16}` caused icons to render unconstrained (filled entire card). Fixed to `size="small"` throughout. Added `align-self: center` to "Start Mage" button.
- `UsernameDialog` card rendered beneath the Kobalte overlay (`z-index: 50`) because the card had no explicit z-index (painted at level 0). Fixed by wrapping card in `position: fixed; inset: 0; z-index: 50` centering shell — same pattern as the app's existing `Dialog` component.
- Removed `@` prefix, "available" status, and suggestion pills from username input. Label changed to "Your domain".

---

## Phase C — `/` opens Home chat (retire dashboard) ✅ DONE

**Completed.** Build verified clean (`bun run --filter @mybcabisnis/mage-app build` → exit 0). Runtime verified via Playwright headless — `/` redirects to `/<b64(~)>/session`, old dashboard absent, onboarding gate transparent with username set.

### Files created

| File | Contents |
|------|----------|
| `packages/app/src/pages/home-redirect.tsx` | `HomeRedirect` — `createEffect` watches `sync.ready` + `sync.data.path.home`; navigates to `/${base64Encode(home)}/session` with `replace: true`; shows `Splash` spinner while waiting. |

### Files modified

| File | Change |
|------|--------|
| `packages/app/src/app.tsx` | Replaced `lazy(() => import("@/pages/home"))` with a static `import HomeRedirect`; changed route `path="/"` component to `HomeRedirect`. |

### Files deleted

| File | Reason |
|------|--------|
| `packages/app/src/pages/home.tsx` | Dashboard UI retired; no remaining imports. `DialogSelectDirectory`/`DialogSelectServer` are separate files, unaffected. |

---

## Phase D — New Arcanum sidebar ✅ DONE

**Completed.** Build verified clean (`bun run --filter @mybcabisnis/mage-app build` → exit 0). Runtime verified via Playwright headless — sidebar toggles correctly, all top-right portals preserved.

### Files created

| File | Contents |
|------|----------|
| `packages/app/src/pages/layout/arcanum-sidebar.tsx` | `ArcanumSidebar` + `FolderGroup` — session list grouped by directory; New-chat button (`space-between` layout with ⌘N shortcut); search input; per-group "+" on hover; active-row highlight; Settings button pinned at bottom. |

### Files modified

| File | Change |
|------|--------|
| `packages/app/src/pages/layout.tsx` | Imported `ArcanumSidebar`; replaced both `{sidebarContent()}` call sites (desktop + mobile `<nav>`); `--main-left` → `"0px"` when closed (full hide); `--dialog-left-margin` → `0` when closed. |

### Post-completion fixes
- Sidebar completely hidden on toggle: `--main-left` changed from `"4rem"` to `"0px"` when `!layout.sidebar.opened()`. Removed mini-rail fallback from `ArcanumSidebar`.
- Brand (MageWordmark) removed from titlebar — was added then reverted per direction change.
- New Chat button ⌘N shortcut overflow fixed: replaced `justify-content: center` + `margin-left: auto` with `justify-content: space-between` + `padding: 0 10px`; icon+text grouped in left `<span>`, shortcut in right `<span flex-shrink: 0>`.

### Key implementation notes
- `sync.peek(dir, { bootstrap: false })` used in `groups` memo to avoid pinning (plan guideline).
- `onMount(() => sync.project.loadSessions(home()))` ensures Home sessions load; project dirs rely on the controller's existing `loadSessions` effects.
- Icon names mapped to available set: `magnifying-glass` (search), `plus-small` (new chat & group "+"), `folder` (all dirs; home tinted `A.accentBright`), `settings-gear` (settings), `speech-bubble` (empty state).
- Old `SidebarContent` / `sidebarContent()` are now unused in JSX but the import and function remain (Phase-G cleanup).

---

## Phase E — Command bar restyle ✅ DONE

**Completed.** Build verified clean (`bun run --filter @mybcabisnis/mage-app build` → exit 0).

### Files modified

| File | Change |
|------|--------|
| `packages/app/src/components/titlebar.tsx` | Solid `A.bgInk` background (removes blur); inline `border-bottom-color: A.border`; accent folder icon + mono crumb breadcrumb in left area; `useGlobalSync` + `decode64` wired for home-aware crumb. |
| `packages/app/src/index.css` | `#mage-titlebar-center > button` overrides: `A.bgInput` bg, `A.border` border-color, `A.fgDim` text, `border-radius: 10px`; hover lifts to `A.bgRaised` + `A.borderStrong`. |

### Key notes
- `#mage-titlebar-center` portal untouched (session-header.tsx not modified); CSS targets the injected button only.
- Breadcrumb shows `~` when in home dir, otherwise the last path segment; rendered only when `params.dir` is set (hidden on root).
- Grid layout, all three portal ids, `data-tauri-drag-region`, mac/windows spacer logic all preserved.

### Post-completion tweaks
- Sidebar toggle moved to flush left (removed outer `pl-2` and `ml-2`/`ml-14` from toggle wrapper) then aligned with `pl-[22px]` — matches the New Chat button icon position (sidebar container 12px + button inner-left 10px = 22px).
- Sidebar default state changed `opened: false` → `opened: true` in layout context initial store so fresh sessions open with the sidebar visible.

---

## Phases F–G — Not yet started

| Phase | Summary |
|-------|---------|
| F | Settings → Arcanum style; username row; Arcane-motion toggle |
| G | Cleanup — delete dead sidebar helpers, unused imports |
