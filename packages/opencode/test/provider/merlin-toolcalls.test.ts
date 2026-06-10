import { describe, test, expect } from "bun:test"
import { parseToolCalls, stripToolCalls, capToolCalls } from "../../src/provider/merlin"

/**
 * Characterization tests for Merlin's prompt-based tool-call parsing.
 *
 * Merlin (GAIA gateway) has no native function-calling, so tool intent is
 * recovered from the model's free text by parseToolCalls. These tests pin that
 * behavior and probe the two field-reported symptoms:
 *
 *   #1 "the tool call fails"            → a FORMAT failure (call evaporates)
 *   #2 "file not found when it exists"  → an ARGUMENT failure (wrong path runs)
 *
 * Assertions describe the DESIRED behavior. A failing test is a surfaced bug.
 */

// Minimal function-tool stubs so name-normalization has a registry to match against.
const tool = (name: string) => ({ type: "function" as const, name, description: "", inputSchema: { type: "object" } })
const TOOLS = [tool("Read"), tool("Edit"), tool("Bash"), tool("Glob")] as any

describe("parseToolCalls — format recovery (symptom #1: 'tool call fails')", () => {
  test("closed JSON block parses", () => {
    const calls = parseToolCalls(`<tool_call>\n{"name": "Read", "arguments": {"filePath": "/a/b.ts"}}\n</tool_call>`, TOOLS)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ name: "Read", args: { filePath: "/a/b.ts" } })
  })

  test("closed XML sub-element block parses", () => {
    const calls = parseToolCalls(
      `<tool_call><name>Read</name><arguments>{"filePath": "/a/b.ts"}</arguments></tool_call>`,
      TOOLS,
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ name: "Read", args: { filePath: "/a/b.ts" } })
  })

  test("unclosed tag (model forgot </tool_call>) still recovers", () => {
    const calls = parseToolCalls(`Sure, let me read it.\n<tool_call>\n{"name": "Read", "arguments": {"filePath": "/a/b.ts"}}`, TOOLS)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ name: "Read", args: { filePath: "/a/b.ts" } })
  })

  test("JSON wrapped in markdown code fences inside the tag parses", () => {
    const calls = parseToolCalls(
      "<tool_call>\n```json\n{\"name\": \"Read\", \"arguments\": {\"filePath\": \"/a/b.ts\"}}\n```\n</tool_call>",
      TOOLS,
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ name: "Read", args: { filePath: "/a/b.ts" } })
  })

  test("case drift is normalized against the tool registry ('read' -> 'Read')", () => {
    const calls = parseToolCalls(`<tool_call>{"name": "read", "arguments": {"filePath": "/a/b.ts"}}</tool_call>`, TOOLS)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.name).toBe("Read")
  })

  test("trailing prose after the closing brace does not break the parse", () => {
    const calls = parseToolCalls(
      `<tool_call>\n{"name": "Read", "arguments": {"filePath": "/a/b.ts"}} I'll read this now.\n</tool_call>`,
      TOOLS,
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ name: "Read", args: { filePath: "/a/b.ts" } })
  })
})

describe("parseToolCalls — argument fidelity (symptom #2: 'file not found')", () => {
  test("absolute path containing spaces is preserved exactly", () => {
    const calls = parseToolCalls(
      `<tool_call>{"name": "Read", "arguments": {"filePath": "/Users/me/My Documents/a.ts"}}</tool_call>`,
      TOOLS,
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]!.args.filePath).toBe("/Users/me/My Documents/a.ts")
  })

  test("path containing a comma is preserved exactly", () => {
    const calls = parseToolCalls(
      `<tool_call>{"name": "Read", "arguments": {"filePath": "/Users/me/a,b/c.ts"}}</tool_call>`,
      TOOLS,
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]!.args.filePath).toBe("/Users/me/a,b/c.ts")
  })

  test("properly-escaped Windows path survives", () => {
    const calls = parseToolCalls(
      `<tool_call>{"name": "Read", "arguments": {"filePath": "C:\\\\Users\\\\me\\\\a.ts"}}</tool_call>`,
      TOOLS,
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]!.args.filePath).toBe("C:\\Users\\me\\a.ts")
  })

  test("UNESCAPED Windows path (invalid JSON) should not silently drop the call", () => {
    // Models frequently emit raw backslashes — invalid JSON. Current code drops
    // the whole call -> agent does nothing. Desired: recover the call somehow.
    const calls = parseToolCalls(`<tool_call>{"name": "Read", "arguments": {"filePath": "C:\\Users\\me\\a.ts"}}</tool_call>`, TOOLS)
    expect(calls.length).toBeGreaterThan(0)
  })

  test("bare func-call line with a spaced path is not truncated", () => {
    // No tags -> kv/JSON fallback path. The comma/paren-splitting kv regex is the
    // prime suspect for mangled paths reaching Read as 'not found'.
    const calls = parseToolCalls(`Read(filePath="/Users/me/My Documents/a.ts")`, TOOLS)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.args.filePath).toBe("/Users/me/My Documents/a.ts")
  })
})

describe("parseToolCalls — sequencing (symptom #2: Read fires before it has the path)", () => {
  test("DOCUMENTS current behavior: multiple calls in one turn are all returned", () => {
    // The model emits a Glob AND a Read in the same response. The Read path is a
    // guess because the Glob result hasn't returned yet -> 'file not found'.
    // This test pins the current (problematic) behavior so we can decide whether
    // to cap at one call per turn.
    const text = [
      `<tool_call>{"name": "Glob", "arguments": {"pattern": "**/config.ts"}}</tool_call>`,
      `<tool_call>{"name": "Read", "arguments": {"filePath": "src/config.ts"}}</tool_call>`,
    ].join("\n")
    const calls = parseToolCalls(text, TOOLS)
    expect(calls.map((c) => c.name)).toEqual(["Glob", "Read"])
  })

  test("capToolCalls enforces one-per-turn: keeps the first, drops the rest", () => {
    const text = [
      `<tool_call>{"name": "Glob", "arguments": {"pattern": "**/config.ts"}}</tool_call>`,
      `<tool_call>{"name": "Read", "arguments": {"filePath": "src/config.ts"}}</tool_call>`,
    ].join("\n")
    const capped = capToolCalls(parseToolCalls(text, TOOLS))
    expect(capped).toHaveLength(1)
    expect(capped[0]!.name).toBe("Glob")
  })

  test("capToolCalls leaves a single call untouched", () => {
    const calls = parseToolCalls(`<tool_call>{"name": "Read", "arguments": {"filePath": "/a/b.ts"}}</tool_call>`, TOOLS)
    expect(capToolCalls(calls)).toEqual(calls)
  })
})

describe("stripToolCalls — no tool-call syntax leaks to the user", () => {
  test("closed block is removed", () => {
    expect(stripToolCalls(`Hello\n<tool_call>{"name":"Read","arguments":{}}</tool_call>`)).toBe("Hello")
  })

  test("unclosed block is removed", () => {
    expect(stripToolCalls(`Hello\n<tool_call>{"name":"Read","arguments":{}}`)).toBe("Hello")
  })
})
