---
name: verify
description: Verifies that a code change actually works by running the app and observing behavior. Use when asked to verify a PR, confirm a fix works, test a change manually, check that a feature works end-to-end, or validate local changes before pushing. Tests the golden path and edge cases and watches for regressions.
---

# Verify

## Overview

Don't trust static analysis alone. Run the code, observe the behavior, and confirm the change does what it claims to do. This skill drives the app to verify a specific change — not just that it compiles or type-checks, but that it actually behaves correctly at runtime.

## When to Use

- "Does this fix work?"
- "Verify this feature before I push"
- "Confirm the PR is working"
- "Test this change manually"
- "Make sure nothing is broken after this refactor"

**When NOT to use:** For a full code-quality review (use `code-review-and-quality`). For debugging a broken build (use `debugging-and-error-recovery`).

---

## Step 1: Classify the Change

Before running anything, determine what type of change this is. Read the diff or ask the user what changed.

| Change type | Layers affected | How to run |
|---|---|---|
| Core logic / backend | `packages/opencode` | `bun run dev` (CLI mode) |
| Web UI | `packages/web-react` (+ `packages/ui-react`) | `bun run dev:serve` then `bun run dev:web-react` |
| Plugin | `packages/plugin` | `bun run build:plugin` |
| CLI / server | `packages/opencode/src/cli` | `bun run dev` |
| Full-stack | all layers | start each relevant server |

If the change touches multiple layers, start all of them.

---

## Step 2: Run Static Checks First

Fast checks before committing to a live run:

```bash
# Type checking
bun run typecheck

# Lint
bun run lint

# Unit tests for the affected package
bun test packages/<package>/src
```

If any of these fail, **stop and fix before continuing**. A live run won't tell you more than a type error already did.

---

## Step 3: Start the App

Use the right command for the change:

```bash
# Core / CLI changes
bun run dev

# Web UI changes — needs both the API server and the web sidecar
bun run dev:serve            # API server on :4096
bun run dev:web-react        # web sidecar, proxies to :4096
# Then open the URL the web-react dev server reports

# Backend server (API/session mode)
bun run dev:serve
```

Wait for the server to be ready before proceeding. Look for "ready" or a port binding in the output.

If the project has a `run` skill configured, prefer that — it may have project-specific startup instructions.

---

## Step 4: Test the Golden Path

Exercise the specific behavior the change was supposed to affect. Be deliberate:

1. **Identify the happy path** — what does this change do when everything works correctly?
2. **Reproduce that path** — take the exact steps a user would take
3. **Observe the outcome** — does it match the expected behavior?

For UI changes: use the browser (Chrome DevTools MCP if available) to confirm the component renders correctly, check console for errors.

For CLI/backend changes: run the relevant command or trigger the relevant API call and check the output.

Document what you tested:
```
Golden path tested:
- [step 1]
- [step 2]
- [expected result] ✓
```

---

## Step 5: Test Edge Cases

Based on the change, identify realistic edge cases:

| Change type | Edge cases to check |
|---|---|
| Input handling | Empty input, very long input, special characters |
| UI component | No data state, loading state, error state |
| API call | Network failure, timeout, unexpected response shape |
| File operations | File not found, permission denied, empty file |
| Auth flows | Expired token, invalid credentials, unauthorized access |
| Model/provider | Provider unavailable, empty response, streaming error |

Test at least two edge cases for every change. If an edge case is hard to trigger manually, check if there's a test covering it — if not, note it as a gap.

---

## Step 6: Check for Regressions

After verifying the change itself, spot-check adjacent behavior:

- Does anything that was working before still work?
- Did the change touch shared utilities, types, or services that other features rely on?
- Are there any console errors or warnings that weren't there before?

Run the full unit test suite for the affected package:

```bash
bun test packages/<package>/src
```

For end-to-end tests (if available):

```bash
bun run --cwd packages/web-react test
```

---

## Step 7: Report the Verification

After testing, produce a short, factual summary:

```
## Verification: [change description]

**Build:** ✓ / ✗
**Type check:** ✓ / ✗
**Tests:** ✓ / ✗ (N passed, N failed)

**Golden path:** [what you tested] → [result]

**Edge cases:**
- [edge case 1] → [result]
- [edge case 2] → [result]

**Regressions:** None found / [describe any found]

**Verdict:** Ready to push / Needs fixes before pushing
```

If you found regressions or failures, stop and describe them clearly. Don't report success if anything failed.

---

## Failure Modes to Watch For

- **Silent failures** — the app starts but does the wrong thing silently (no error, wrong output)
- **Works on golden path, breaks on edge case** — only the happy path was tested
- **Console errors ignored** — errors logged to console but not surfaced
- **Wrong environment** — testing against a dev mock that doesn't reflect production behavior
- **Stale build** — running an old build, not the latest code

---

## Notes

- If the app won't start, use `debugging-and-error-recovery` to fix the build first, then come back.
- For visual/UI changes, always take a before/after screenshot if Chrome DevTools MCP is available.
- Type checking (`bun run typecheck`) is fast and catches most regressions — always run it before a live test.
