- To regenerate the JavaScript SDK, run `./packages/sdk/js/script/build.ts`.
- rtk (https://github.com/rtk-ai/rtk) is embedded like rg: downloaded per-platform in `packages/mage/script/build.ts` (pinned `RTK_VERSION`), seeded to `~/.mage/bin` by `postinstall.mjs`, with the lazy-download fallback in `packages/core/src/rtk/binary.ts` also using `~/.mage/bin` (version pinned separately — bump both). The internal plugin `packages/mage/src/plugin/rtk.ts` rewrites bash tool commands through `rtk rewrite`; disable with `--disable-default-plugins`.
- ALWAYS USE PARALLEL TOOLS WHEN APPLICABLE.
- The default branch in this repo is `dev`.
- Local `main` ref may not exist; use `dev` or `origin/dev` for diffs.
- Prefer automation: execute requested actions without confirmation unless blocked by missing info or safety/irreversibility.

## Style Guide

### General Principles

- Keep things in one function unless composable or reusable
- Avoid `try`/`catch` where possible
- Avoid using the `any` type
- Use Bun APIs when possible, like `Bun.file()`
- Rely on type inference when possible; avoid explicit type annotations or interfaces unless necessary for exports or clarity
- Prefer functional array methods (flatMap, filter, map) over for loops; use type guards on filter to maintain type inference downstream
- In `src/config`, follow the existing self-export pattern at the top of the file (for example `export * as ConfigAgent from "./agent"`) when adding a new config module.

Reduce total variable count by inlining when a value is only used once.

```ts
// Good
const journal = await Bun.file(path.join(dir, "journal.json")).json()

// Bad
const journalPath = path.join(dir, "journal.json")
const journal = await Bun.file(journalPath).json()
```

### Destructuring

Avoid unnecessary destructuring. Use dot notation to preserve context.

```ts
// Good
obj.a
obj.b

// Bad
const { a, b } = obj
```

### Variables

Prefer `const` over `let`. Use ternaries or early returns instead of reassignment.

```ts
// Good
const foo = condition ? 1 : 2

// Bad
let foo
if (condition) foo = 1
else foo = 2
```

### Control Flow

Avoid `else` statements. Prefer early returns.

```ts
// Good
function foo() {
  if (condition) return 1
  return 2
}

// Bad
function foo() {
  if (condition) return 1
  else return 2
}
```

### Schema Definitions (Drizzle)

Use snake_case for field names so column names don't need to be redefined as strings.

```ts
// Good
const table = sqliteTable("session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
  created_at: integer().notNull(),
})

// Bad
const table = sqliteTable("session", {
  id: text("id").primaryKey(),
  projectID: text("project_id").notNull(),
  createdAt: integer("created_at").notNull(),
})
```

## Testing

- Avoid mocks as much as possible
- Test actual implementation, do not duplicate logic into tests
- Tests cannot run from repo root (guard: `do-not-run-tests-from-root`); run from package dirs like `packages/mage`.

## Type Checking

- Always run `bun typecheck` from package directories (e.g., `packages/mage`), never `tsc` directly.

## Context Architecture

- The primary Mage agent coordinates context-heavy work through `explore`, `worker`, `verify`, and `scout`; `general` is the fallback.
- Built-in subagent prompts live in `packages/mage/src/agent/prompt/` and use the shared compact handoff contract in `handoff.txt`.
- Child sessions receive fresh history and return a concise result. Built-in subagents do not receive the `task` permission, so Phase 1 delegation remains one level below the primary agent.
