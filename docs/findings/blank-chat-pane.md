# Blank Chat Pane — Root Cause & Fix

**Date:** 2026-06-03  
**Branch:** DEV/INIT  
**Symptom:** Packaged Windows desktop build shows a fully black main pane. Onboarding
renders normally; the arcanum sidebar lists session groups and highlights the active
session. Clicking any session (or the new-chat button) keeps the pane blank. The issue
does **not** reproduce in `electron-vite dev`.

---

## Evidence from logs

`logs_n/renderer.log` (4 lines, all at startup):

```
[2026-06-03 11:38:55] [error] No directory provided   (×4)
```

No crash, no 404 on assets, server came up cleanly (`main.log`), sidecar exited cleanly
after session (`utility.log`). The blank is a UI render guard, not a process failure.

---

## Architecture context

The app has two independent render trees inside `Layout` (`pages/layout.tsx`):

| Tree | What it renders | Source of data |
|------|-----------------|----------------|
| Sidebar (`ArcanumSidebar`) | Session groups by directory | `globalSync.data.project` — populated from server events |
| Main pane | `DirectoryLayout → lazy Session` | Gated by `autoselecting` resource |

Because the sidebar reads `globalSync.data` directly and the main pane is behind a
`createResource` gate, the sidebar can show populated data while the main pane is
completely blank — which is exactly the symptom.

---

## Root cause 1 — `autoselecting` resource never resolves (primary blank)

`pages/layout.tsx:415-431`:

```ts
const [autoselecting] = createResource(async () => {
  await ready.promise          // layout.page persisted store
  await layout.ready.promise   // layout context persisted store
  if (!untrack(() => state.autoselect)) return
  // ... navigate to last project
})
```

The main-pane gate was:

```tsx
<Show when={!autoselecting.loading} fallback={<div class="size-full" />}>
  {props.children}
</Show>
```

In the **packaged sidecar** environment the two `persisted()` stores use the Electron
IPC async storage (`window.api.storeGet / storeSet`). The `ready.promise` they produce
wraps the initial hydration round-trip. If that IPC call is slow or never acks (which
can happen when the sidecar boots under load or the renderer loads before the preload
bridge is fully wired), `autoselecting.loading` stays `true` forever.

The fallback is a plain `<div class="size-full" />` — a fully black box. The sidebar
renders from a different subtree and is unaffected.

---

## Root cause 2 — Wrong UI rendered once the pane does mount (secondary)

`packages/app/src/context/settings.tsx:58`:

```ts
export const newLayoutDesignsDefault = import.meta.env.VITE_MAGE_CHANNEL !== "prod"
```

`packages/desktop/package.json`:

```json
"dev": "MAGE_CHANNEL=dev electron-vite dev",
"build": "electron-vite build"
```

Dev injects `MAGE_CHANNEL=dev` → `VITE_MAGE_CHANNEL="dev"` → `newLayoutDesignsDefault = true` →
**arcanum/V2 UI** (what the team develops against).

`bun run build` leaves `MAGE_CHANNEL` unset → channel IIFE returns `"prod"` →
`VITE_MAGE_CHANNEL="prod"` → `newLayoutDesignsDefault = false` → **old V1 chat UI** (not
the arcanum UI, broken in this fork). So even if root cause 1 were fixed, the packaged
build would ship the wrong layout.

---

## Root cause 3 — `No directory provided` console noise

`pages/layout/arcanum-sidebar.tsx` `groups()` memo:

```ts
const dirs = new Set<string>([h, ...sync.data.project.map((p) => p.worktree)])
for (const dir of dirs) {
  const [store] = sync.peek(dir, { bootstrap: false }) // <-- called with "" when home() is ""
```

`home()` is `sync.data.path.home ?? ""`, which is `""` until the server's `path.get()`
response arrives. The empty string reaches `sync.peek("")` → `ensureChild("")` →
`pathKey("")` returns `""` → the guard only `console.error`'d but still created a
corrupt child store under the `""` key. Not the cause of the blank, but pollutes logs
and can cause subtle state corruption.

---

## Fixes applied

### 1. `autoselecting` — add a 5 s timeout (`pages/layout.tsx`)

```ts
const withTimeout = (p: Promise<unknown> | undefined, ms = 5000) =>
  p ? Promise.race([p, new Promise<void>((r) => setTimeout(r, ms))]) : Promise.resolve()

const [autoselecting] = createResource(async () => {
  await withTimeout(ready.promise)
  await withTimeout(layout.ready.promise)
  ...
})
```

The resource now always resolves within 5 seconds even if the IPC storage never acks.

### 2. Gate — bypass wait when a dir is already in the URL (`pages/layout.tsx`)

```tsx
<Show
  when={!autoselecting.loading || !!params.dir}
  fallback={
    <div class="size-full flex items-center justify-center">
      <ArcEmblem size={72} glow animate />
    </div>
  }
>
  {props.children}
</Show>
```

When the user clicks a session in the sidebar the router navigates to
`/:dir/session/:id` — `params.dir` becomes truthy and the main pane renders immediately,
regardless of the autoselect state. The blank fallback is replaced by the animated
`ArcEmblem` spinner so the waiting state is visible.

### 3. `newLayoutDesignsDefault = true` (`context/settings.tsx`)

```ts
// The arcanum/V2 UI is the only supported layout in this fork.
export const newLayoutDesignsDefault = true
```

Packaged builds now default to the same arcanum/V2 UI as dev. The per-user settings
override (`withFallback(..., newLayoutDesignsDefault)`) still works.

### 4. Empty-dir guard in sidebar (`pages/layout/arcanum-sidebar.tsx`)

```ts
for (const dir of dirs) {
  if (!dir) continue  // home() can be "" before the server responds
  const [store] = sync.peek(dir, { bootstrap: false })
  ...
}
```

Eliminates the 4× `No directory provided` console errors at startup.

### 5. `ensureChild` — throw on empty key (`context/global-sync/child-store.ts`)

```ts
if (!key) {
  console.error("No directory provided")
  throw new Error(input.translate("error.childStore.storeCreateFailed"))
}
```

Prevents a corrupt child store from being built under the `""` key, which was
previously silently created and could cause subtle session-list bugs.

### 6. `messagesReady` fallback (`pages/session.tsx`)

```tsx
<Show
  when={messagesReady()}
  fallback={
    <div class="size-full flex items-center justify-center">
      <ArcEmblem size={56} glow animate />
    </div>
  }
>
  <MessageTimeline ... />
</Show>
```

Prevents a silent black message area while the API call to load session messages is
in-flight or slow.

### 7. Stale comments updated (`packages/desktop/electron.vite.config.ts`)

Removed the old rationale that `VITE_MAGE_CHANNEL` drives the layout choice (it no
longer does after fix 3).

---

## Files changed

| File | Change |
|------|--------|
| `packages/app/src/pages/layout.tsx` | `withTimeout` helper, gate condition + spinner fallback, `ArcEmblem` import |
| `packages/app/src/context/settings.tsx` | `newLayoutDesignsDefault = true` |
| `packages/app/src/pages/layout/arcanum-sidebar.tsx` | `if (!dir) continue` guard in `groups()` |
| `packages/app/src/pages/session.tsx` | `messagesReady` spinner fallback, `ArcEmblem` import |
| `packages/app/src/context/global-sync/child-store.ts` | `ensureChild` throws on empty key |
| `packages/desktop/electron.vite.config.ts` | Comment cleanup |

---

## Verification steps

1. `cd packages/desktop && bun run build && bun run package:mac` (or `package:win` for
   Windows). Launch the packaged app.
2. **New-chat view** — main pane shows the arcanum "Conjure anything" emblem + composer.
3. **Existing session** — clicking a session in the sidebar shows the message timeline.
4. **Logs** — `renderer.log` no longer contains `No directory provided`.
5. **Dev regression** — `electron-vite dev` still renders correctly.
6. **Typecheck** — `cd packages/app && bun run typecheck` exits 0.
