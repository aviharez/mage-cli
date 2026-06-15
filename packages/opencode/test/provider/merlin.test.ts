import { describe, test, expect, mock } from "bun:test"
import { createMerlin, missingRequiredArgs, stripHallucinatedTurns } from "../../src/provider/merlin"

describe("createMerlin", () => {
  test("registers provider and returns a LanguageModelV3", () => {
    const provider = createMerlin({ username: "u" })
    const model = provider.languageModel("default")
    expect(model.specificationVersion).toBe("v3")
    expect(model.provider).toBe("merlin")
    expect(model.modelId).toBe("default")
  })

  test("doGenerate sends correct Merlin request shape and parses answer", async () => {
    const captured: RequestInit[] = []
    const fakeFetch = mock(async (_url: string, init: RequestInit) => {
      captured.push(init)
      return new Response(
        JSON.stringify({
          output_schema: {
            result: { answer: "Saya adalah Mage.", token_input: 10, token_output: 5 },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    })

    const origFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as any

    try {
      const model = createMerlin({ baseURL: "https://merlin.test/llm", username: "testuser" }).languageModel("default")

      const result = await model.doGenerate({
        prompt: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: [{ type: "text", text: "Who are you?" }] },
        ],
        temperature: 0.7,
      } as any)

      expect(result.content).toHaveLength(1)
      expect(result.content[0]).toMatchObject({ type: "text", text: "Saya adalah Mage." })
      expect(result.finishReason).toMatchObject({ unified: "stop" })
      expect(result.usage.inputTokens.total).toBe(10)
      expect(result.usage.outputTokens.total).toBe(5)

      expect(captured).toHaveLength(1)
      const body = JSON.parse(captured[0]!.body as string)
      expect(body.client_id).toBe("MAGEDEV")
      expect(body.domain_id).toBe("testuser")
      expect(body.service_id).toBe("MBBDSDEV29978319")
      expect(body.new_session).toBe("True")
      expect(body.file).toEqual([])
      expect(body.config).not.toHaveProperty("model_name")
      expect(body.config).not.toHaveProperty("persona")
      expect(typeof body.prompt).toBe("string")
      expect(body.prompt).toContain("You are a helpful assistant.")
      expect(body.prompt).toContain("User: Who are you?")
    } finally {
      globalThis.fetch = origFetch
    }
  })

  test("doStream emits text-delta parts followed by finish", async () => {
    const fakeFetch = mock(async () =>
      new Response(
        JSON.stringify({
          output_schema: { result: { answer: "Halo dunia!", token_input: 5, token_output: 3 } },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    const origFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as any

    try {
      const model = createMerlin({ baseURL: "https://x.test", username: "u" }).languageModel("default")
      const { stream } = await model.doStream({
        prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      } as any)

      const parts: any[] = []
      const reader = stream.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        parts.push(value)
      }

      const types = parts.map((p) => p.type)
      expect(types).toContain("stream-start")
      expect(types).toContain("text-start")
      expect(types).toContain("text-delta")
      expect(types).toContain("text-end")
      expect(types).toContain("finish")

      const delta = parts.find((p) => p.type === "text-delta")
      expect(delta?.delta).toBe("Halo dunia!")
    } finally {
      globalThis.fetch = origFetch
    }
  })

  test("doGenerate self-corrects once when the first tool_call is unparseable", async () => {
    const answers = [
      // 1st reply: a <tool_call> tag the parser can't extract anything from.
      "Let me read it.\n<tool_call>\noops this is not valid json\n</tool_call>",
      // 2nd reply (repair round-trip): a clean, parseable tool call.
      '<tool_call>\n{"name": "Read", "arguments": {"filePath": "/a/b.ts"}}\n</tool_call>',
    ]
    let call = 0
    const fakeFetch = mock(async () =>
      new Response(
        JSON.stringify({ output_schema: { result: { answer: answers[call++], token_input: 4, token_output: 2 } } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    const origFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as any

    try {
      const model = createMerlin({ baseURL: "https://x.test", username: "u" }).languageModel("default")
      const result = await model.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "read the file" }] }],
      } as any)

      // Two round-trips: the original + one repair.
      expect(fakeFetch).toHaveBeenCalledTimes(2)
      // The recovered tool call is surfaced to the agent.
      const toolCall = result.content.find((p: any) => p.type === "tool-call") as any
      expect(toolCall).toBeDefined()
      expect(toolCall.toolName).toBe("Read")
      expect(JSON.parse(toolCall.input)).toEqual({ filePath: "/a/b.ts" })
      expect(result.finishReason).toMatchObject({ unified: "tool-calls" })
      // Usage is summed across both calls (4+4 in, 2+2 out).
      expect(result.usage.inputTokens.total).toBe(8)
      expect(result.usage.outputTokens.total).toBe(4)
    } finally {
      globalThis.fetch = origFetch
    }
  })

  test("doGenerate does not retry when the first reply is clean", async () => {
    const fakeFetch = mock(async () =>
      new Response(
        JSON.stringify({ output_schema: { result: { answer: "Just a plain answer.", token_input: 3, token_output: 1 } } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    const origFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as any

    try {
      const model = createMerlin({ baseURL: "https://x.test", username: "u" }).languageModel("default")
      await model.doGenerate({ prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }] } as any)
      expect(fakeFetch).toHaveBeenCalledTimes(1)
    } finally {
      globalThis.fetch = origFetch
    }
  })

  test("stripHallucinatedTurns removes fabricated transcript continuation after a tool call", () => {
    // Exact pattern from the session: closed tool_call followed by fabricated turns.
    const withSpam =
      '<tool_call>\n{"name":"read","arguments":{"filePath":"Foo.java"}}\n</tool_call>' +
      "\n\nTool Results:\n<tool_result>\n  <name>read</name>\n  <result>fake content</result>\n</tool_result>" +
      "\n\nAssistant: \n\nTool Results:\n<tool_result>\n  <name>read</name>\n  <result>more fake</result>\n</tool_result>"

    const cleaned = stripHallucinatedTurns(withSpam)
    // Real tool call is preserved.
    expect(cleaned).toContain('<tool_call>')
    expect(cleaned).toContain('"name":"read"')
    expect(cleaned).toContain('</tool_call>')
    // Fabricated turns are gone.
    expect(cleaned).not.toContain("Tool Results:")
    expect(cleaned).not.toContain("<tool_result>")
    expect(cleaned).not.toContain("fake content")
    expect(cleaned).not.toContain("Assistant:")
  })

  test("stripHallucinatedTurns removes fabricated Assistant: continuation without tool call", () => {
    // Plain final-text turn followed by hallucinated next turn.
    const answer = "Here is the summary.\n\nAssistant: Now let me check the file.\n\nUser: ok"
    const cleaned = stripHallucinatedTurns(answer)
    expect(cleaned).toBe("Here is the summary.")
    expect(cleaned).not.toContain("Assistant:")
  })

  test("stripHallucinatedTurns does not truncate mid-sentence 'assistant' in prose", () => {
    // "assistant" appearing inside a sentence (not line-anchored) must NOT be cut.
    const safe = "The assistant role is important.\n\nHere is the result."
    expect(stripHallucinatedTurns(safe)).toBe(safe)
  })

  test("stripHallucinatedTurns returns answer unchanged when no continuation markers present", () => {
    const clean = '<tool_call>\n{"name":"bash","arguments":{"command":"ls"}}\n</tool_call>'
    expect(stripHallucinatedTurns(clean)).toBe(clean)

    const plainText = "The answer is 42."
    expect(stripHallucinatedTurns(plainText)).toBe(plainText)
  })

  test("doGenerate strips hallucinated transcript spam from Merlin reply", async () => {
    // Simulate Merlin returning a real tool call followed by hallucinated continuation.
    const hallucinatedAnswer =
      '<tool_call>\n{"name":"bash","arguments":{"command":"pwd"}}\n</tool_call>' +
      "\n\nTool Results:\n<tool_result>\n  <name>bash</name>\n  <result>C:\\Users\\me</result>\n</tool_result>" +
      "\n\nAssistant: \n\nTool Results:\n<tool_result>\n  <name>read</name>\n  <result>hallucinated</result>\n</tool_result>"

    const fakeFetch = mock(async () =>
      new Response(
        JSON.stringify({ output_schema: { result: { answer: hallucinatedAnswer, token_input: 12, token_output: 30 } } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    const origFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as any

    try {
      const model = createMerlin({ baseURL: "https://x.test", username: "u" }).languageModel("default")
      const result = await model.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "what dir am I in?" }] }],
      } as any)

      // Only one round-trip — no repair needed.
      expect(fakeFetch).toHaveBeenCalledTimes(1)
      // The real tool call is still surfaced.
      const toolCall = result.content.find((p: any) => p.type === "tool-call") as any
      expect(toolCall).toBeDefined()
      expect(toolCall.toolName).toBe("bash")
      // No hallucinated text leaks into the text remainder.
      const textPart = result.content.find((p: any) => p.type === "text") as any
      if (textPart) {
        expect(textPart.text).not.toContain("Tool Results:")
        expect(textPart.text).not.toContain("Assistant:")
        expect(textPart.text).not.toContain("hallucinated")
      }
    } finally {
      globalThis.fetch = origFetch
    }
  })

  test("missingRequiredArgs identifies absent required fields", () => {
    const taskTool = {
      type: "function" as const,
      name: "task",
      description: "Launch a subagent",
      inputSchema: {
        type: "object" as const,
        required: ["description", "prompt", "subagent_type"],
        properties: {
          description: { type: "string" as const },
          prompt: { type: "string" as const },
          subagent_type: { type: "string" as const },
        },
      },
    }

    // All three required fields absent — mirrors the exact session failure.
    expect(missingRequiredArgs({ name: "task", callId: "x", args: {} }, [taskTool])).toEqual([
      "description",
      "prompt",
      "subagent_type",
    ])

    // All fields present → nothing missing.
    expect(
      missingRequiredArgs(
        { name: "task", callId: "x", args: { description: "d", prompt: "p", subagent_type: "s" } },
        [taskTool],
      ),
    ).toEqual([])

    // Tool not in the list → nothing missing (no false positives for unknown tools).
    expect(missingRequiredArgs({ name: "unknown", callId: "x", args: {} }, [taskTool])).toEqual([])

    // No tools list → nothing missing.
    expect(missingRequiredArgs({ name: "task", callId: "x", args: {} }, undefined)).toEqual([])

    // Schema without a required array → nothing missing.
    const noRequired = { ...taskTool, inputSchema: { type: "object" as const, properties: {} } }
    expect(missingRequiredArgs({ name: "task", callId: "x", args: {} }, [noRequired])).toEqual([])
  })

  test("doGenerate self-corrects once when the tool call is missing required args", async () => {
    const taskTool = {
      type: "function" as const,
      name: "task",
      description: "Launch a subagent",
      inputSchema: {
        type: "object" as const,
        required: ["description", "prompt", "subagent_type"],
        properties: {
          description: { type: "string" as const },
          prompt: { type: "string" as const },
          subagent_type: { type: "string" as const },
        },
      },
    }

    const answers = [
      // 1st reply: empty arguments — the exact failure from the session log.
      '<tool_call>\n{"name":"task","arguments":{}}\n</tool_call>',
      // 2nd reply (repair): all required fields filled in.
      '<tool_call>\n{"name":"task","arguments":{"description":"Review code","prompt":"Review src/","subagent_type":"claude"}}\n</tool_call>',
    ]
    let call = 0
    const fakeFetch = mock(async () =>
      new Response(
        JSON.stringify({ output_schema: { result: { answer: answers[call++], token_input: 8, token_output: 3 } } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    const origFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as any

    try {
      const model = createMerlin({ baseURL: "https://x.test", username: "u" }).languageModel("default")
      const result = await model.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "review the code" }] }],
        tools: [taskTool],
      } as any)

      // Two round-trips: the invalid call + one repair.
      expect(fakeFetch).toHaveBeenCalledTimes(2)

      // The repaired, complete tool call is surfaced.
      const toolCall = result.content.find((p: any) => p.type === "tool-call") as any
      expect(toolCall).toBeDefined()
      expect(toolCall.toolName).toBe("task")
      expect(JSON.parse(toolCall.input)).toMatchObject({
        description: "Review code",
        prompt: "Review src/",
        subagent_type: "claude",
      })
      expect(result.finishReason).toMatchObject({ unified: "tool-calls" })
      // Token usage is summed across both calls (8+8, 3+3).
      expect(result.usage.inputTokens.total).toBe(16)
      expect(result.usage.outputTokens.total).toBe(6)
    } finally {
      globalThis.fetch = origFetch
    }
  })

  test("doGenerate falls through gracefully when repair also has missing args", async () => {
    const taskTool = {
      type: "function" as const,
      name: "task",
      description: "Launch a subagent",
      inputSchema: {
        type: "object" as const,
        required: ["description", "prompt", "subagent_type"],
        properties: {
          description: { type: "string" as const },
          prompt: { type: "string" as const },
          subagent_type: { type: "string" as const },
        },
      },
    }

    // Both replies are incomplete — repair also fails.
    const answers = [
      '<tool_call>\n{"name":"task","arguments":{}}\n</tool_call>',
      '<tool_call>\n{"name":"task","arguments":{}}\n</tool_call>',
    ]
    let call = 0
    const fakeFetch = mock(async () =>
      new Response(
        JSON.stringify({ output_schema: { result: { answer: answers[call++], token_input: 5, token_output: 2 } } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    const origFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as any

    try {
      const model = createMerlin({ baseURL: "https://x.test", username: "u" }).languageModel("default")
      // Should NOT throw — falls through returning the original incomplete call.
      const result = await model.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "review the code" }] }],
        tools: [taskTool],
      } as any)

      expect(fakeFetch).toHaveBeenCalledTimes(2)
      // Original incomplete call is returned as-is (downstream Zod will surface the error,
      // but that is the same behaviour as today — no regression).
      const toolCall = result.content.find((p: any) => p.type === "tool-call") as any
      expect(toolCall).toBeDefined()
      expect(toolCall.toolName).toBe("task")
      expect(JSON.parse(toolCall.input)).toEqual({})
    } finally {
      globalThis.fetch = origFetch
    }
  })

  test("doGenerate throws on Merlin error_schema", async () => {
    const fakeFetch = mock(async () =>
      new Response(
        JSON.stringify({
          error_schema: {
            error_code: "AUTH_FAILED",
            error_message: { english: "Authentication failed" },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    const origFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as any

    try {
      const model = createMerlin({ baseURL: "https://x.test" }).languageModel("default")
      await expect(
        model.doGenerate({ prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }] } as any),
      ).rejects.toThrow("Authentication failed")
    } finally {
      globalThis.fetch = origFetch
    }
  })
})
