---
name: mbb-lib
description: Use myBCA Bisnis's in-house Angular component library (@mybcabisnis-web/lib / @mybcabisnis/lib). Trigger BEFORE creating, scaffolding, or editing any Angular component, page, form, or UI element in a project that depends on these packages — so existing library components are reused instead of rebuilt from scratch.
metadata:
  author: MAGE Team
---

# myBCA Bisnis Component Library

Reads the installed myBCA Bisnis Angular library from node_modules and returns accurate selectors, inputs, outputs, and import paths. Prevents hallucinated or reinvented component APIs.

## Workflow

**Step 1 — Always call `mage_bca_lib_catalog` first.**
Never write template or component code before this tool returns. One tool call, no prose.

If `ok:false`:
- State the `reason` in one line (not Angular / lib not installed).
- Continue with the `angular-developer` skill and standard Angular primitives.
- Do not retry or guess lib component names.

**Step 2 — Reuse catalog items.**
When a catalog entry matches what the user needs:
- Use the exact `selector` in templates.
- Import from the exact `import` path — do not alter it.
- Bind only the `inputs`/`outputs` listed. Do not invent props.
- `standalone: true` → add the component to the host `imports: []` array.
- `standalone: false` → import its NgModule in the consuming module.

**Step 3 — Get detail on demand.**
Need full type signatures or the class declaration for one item?
- Call `mage_bca_lib_component` with the selector or class name.
- Do NOT read `node_modules` files yourself.

**Step 4 — Fill gaps with standard Angular.**
If part of the UI has no matching library component, build that part with plain Angular and use library components for everything that is covered.

**Companion skill:** Always load the `angular-developer` skill alongside this one. It governs scaffolding, signals, DI, routing, and all non-library Angular concerns.

## Hard rules

- Never invent a selector, input, or output absent from the catalog.
- Prefer a library component over a hand-rolled one whenever a matching `selector` exists.
- Run `ng build` after generating code; fix all type errors before responding.
