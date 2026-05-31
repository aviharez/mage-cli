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

## Phase A — Single Arcanum theme + fonts + keyframes ⬜ TODO

### What needs to happen

1. **`packages/ui/src/theme/themes/oc-2.json`** — Rewrite with Arcanum palette + overrides; set `"name": "Arcanum"`; duplicate `dark` block into `light` so it's always dark.
2. **`packages/ui/src/theme/themes/*.json`** — Delete the other 37 theme files; leave only `oc-2.json`. The `import.meta.glob` in `context.tsx` will then yield only `oc-2`.
3. **`packages/ui/src/theme/context.tsx`** — Trim the `names` map to `{ "oc-2": "Arcanum" }`.
4. **`packages/app/src/components/settings-general.tsx`** — Remove the theme `SettingsRow` and color-scheme `SettingsRow`; delete now-unused `themeOptions`/`colorSchemeOptions` memos.
5. **`packages/app/index.html`** — Add Spectral Google Fonts `<link>`; add `data-arc-motion="on"` to `<body>`.
6. **`packages/app/src/index.css`** — Append Arcanum `@keyframes` (`arc-rot`, `arc-rot-rev`, `arc-breathe`, `arc-trace`, `arc-twinkle`, `arc-aurora`, `arc-mote`), `.arc-*` animation classes, `body[data-arc-motion="off"]` gate, and `.serif` font utility.

### Checkpoint
After Phase A: `bun run --filter @mybcabisnis/mage-app build` passes; app opens with violet/arcane colour scheme; Settings shows no theme picker; `.arc-*` animation classes are live (emblem animates in next phases).

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
