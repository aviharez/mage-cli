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

## Phases B–G — Not yet started

| Phase | Summary |
|-------|---------|
| B | Onboarding gate + screen + username popup |
| C | `/` redirects to Home chat (retire dashboard) |
| D | New Arcanum sidebar (session groups by directory) |
| E | Command bar restyle; optional `ArcComposerChrome` wrap |
| F | Settings → Arcanum style; username row; Arcane-motion toggle |
| G | Cleanup — delete dead sidebar helpers, unused imports |
