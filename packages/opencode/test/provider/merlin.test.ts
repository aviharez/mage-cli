import { describe, test, expect, mock } from "bun:test"
import { createMerlin } from "../../src/provider/merlin"

// ── SSE test helper ───────────────────────────────────────────────────────────

/**
 * Build a streaming Response that yields the given SSE chunks then [DONE].
 * Optionally appends a usage-only chunk before [DONE] (mirrors the
 * stream_options.include_usage behaviour).
 */
function makeSseResponse(
  chunks: object[],
  status = 200,
  opts?: { usage?: { prompt_tokens: number; completion_tokens: number } },
): Response {
  const enc = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(c)}\n\n`))
      }
      if (opts?.usage) {
        controller.enqueue(
          enc.encode(`data: ${JSON.stringify({ choices: [], usage: opts.usage })}\n\n`),
        )
      }
      controller.enqueue(enc.encode("data: [DONE]\n\n"))
      controller.close()
    },
  })
  return new Response(stream, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  })
}

/** Drain a ReadableStream into an array. */
async function collect<T>(stream: ReadableStream<T>): Promise<T[]> {
  const parts: T[] = []
  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
  }
  return parts
}

// ── Factory ───────────────────────────────────────────────────────────────────

describe("createMerlin", () => {
  test("registers provider and returns a LanguageModelV3", () => {
    const provider = createMerlin({ username: "u" })
    const model = provider.languageModel("default")
    expect(model.specificationVersion).toBe("v3")
    expect(model.provider).toBe("merlin")
    expect(model.modelId).toBe("default")
  })
})

// ── doGenerate — text ─────────────────────────────────────────────────────────

describe("doGenerate — text response", () => {
  test("sends correct OpenAI-compatible request shape and returns aggregated text", async () => {
    let capturedUrl = ""
    let capturedBody: Record<string, unknown> = {}

    const fakeFetch = mock(async (url: string, init: RequestInit) => {
      capturedUrl = url as string
      capturedBody = JSON.parse(init.body as string)
      return makeSseResponse(
        [
          { choices: [{ delta: { role: "assistant", content: "Saya adalah Mage." }, index: 0, finish_reason: null }] },
          { choices: [{ delta: {}, index: 0, finish_reason: "stop" }] },
        ],
        200,
        { usage: { prompt_tokens: 10, completion_tokens: 5 } },
      )
    })

    const origFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as any
    try {
      const model = createMerlin({ baseURL: "https://merlin.test", username: "testuser" }).languageModel("default")
      const result = await model.doGenerate({
        prompt: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: [{ type: "text", text: "Who are you?" }] },
        ],
      } as any)

      // ── URL shape ──
      expect(capturedUrl).toContain("MAGEDEV")
      expect(capturedUrl).toContain("testuser")
      expect(capturedUrl).toContain("/chat/completions")
      // domain_id is the 3rd positional segment after MAGEDEV/none
      expect(capturedUrl).toMatch(/\/MAGEDEV\/none\/testuser\//)
      // task segment must be vllm-text-generation (not "none") for gateway routing
      expect(capturedUrl).toContain("/false/vllm-text-generation/chat/completions")

      // ── Request body ──
      expect(capturedBody.model).toBe("/app/models/text-2")
      expect(capturedBody.service_id).toBe("MBBDSDEV29978319") // general skill
      expect(capturedBody.stream).toBe(true)
      expect(Array.isArray(capturedBody.messages)).toBe(true)
      const msgs = capturedBody.messages as any[]
      expect(msgs[0]).toMatchObject({ role: "system", content: "You are a helpful assistant." })
      expect(msgs[1]).toMatchObject({ role: "user", content: "Who are you?" })
      expect(capturedBody.tools).toBeUndefined()           // no tools in this call
      expect(capturedBody.tool_choice).toBeUndefined()     // NOT sent (not in GAIA §1.2.2 whitelist)
      expect(capturedBody.stream_options).toBeUndefined()  // NOT sent (DPA-113 if present)

      // ── Result ──
      expect(result.content).toHaveLength(1)
      expect(result.content[0]).toMatchObject({ type: "text", text: "Saya adalah Mage." })
      expect(result.finishReason).toMatchObject({ unified: "stop" })
      expect(result.usage.inputTokens.total).toBe(10)
      expect(result.usage.outputTokens.total).toBe(5)
    } finally {
      globalThis.fetch = origFetch
    }
  })

  test("concatenates multiple text-delta chunks into one string", async () => {
    const fakeFetch = mock(async () =>
      makeSseResponse([
        { choices: [{ delta: { content: "Halo " }, index: 0, finish_reason: null }] },
        { choices: [{ delta: { content: "dunia" }, index: 0, finish_reason: null }] },
        { choices: [{ delta: { content: "!" }, index: 0, finish_reason: null }] },
        { choices: [{ delta: {}, index: 0, finish_reason: "stop" }] },
      ]),
    )
    const origFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as any
    try {
      const model = createMerlin({ baseURL: "https://x.test", username: "u" }).languageModel("default")
      const result = await model.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      } as any)
      expect(result.content[0]).toMatchObject({ type: "text", text: "Halo dunia!" })
    } finally {
      globalThis.fetch = origFetch
    }
  })
})

// ── doStream ──────────────────────────────────────────────────────────────────

describe("doStream", () => {
  test("emits stream-start, text-start, text-delta parts (live), text-end, and finish", async () => {
    const fakeFetch = mock(async () =>
      makeSseResponse(
        [
          { choices: [{ delta: { content: "Halo " }, index: 0, finish_reason: null }] },
          { choices: [{ delta: { content: "dunia!" }, index: 0, finish_reason: null }] },
          { choices: [{ delta: {}, index: 0, finish_reason: "stop" }] },
        ],
        200,
        { usage: { prompt_tokens: 5, completion_tokens: 3 } },
      ),
    )
    const origFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as any
    try {
      const model = createMerlin({ baseURL: "https://x.test", username: "u" }).languageModel("default")
      const { stream } = await model.doStream({
        prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      } as any)

      const parts = await collect(stream)
      const types = parts.map((p: any) => p.type)

      expect(types).toContain("stream-start")
      expect(types).toContain("text-start")
      expect(types).toContain("text-delta")
      expect(types).toContain("text-end")
      expect(types).toContain("finish")

      // Both incremental deltas must be present and in order.
      const deltas = parts.filter((p: any) => p.type === "text-delta").map((p: any) => p.delta)
      expect(deltas).toEqual(["Halo ", "dunia!"])

      const finish = parts.find((p: any) => p.type === "finish") as any
      expect(finish.finishReason).toMatchObject({ unified: "stop" })
      expect(finish.usage.inputTokens.total).toBe(5)
      expect(finish.usage.outputTokens.total).toBe(3)
    } finally {
      globalThis.fetch = origFetch
    }
  })

  test("text-start arrives before text-delta, text-end arrives after", async () => {
    const fakeFetch = mock(async () =>
      makeSseResponse([
        { choices: [{ delta: { content: "A" }, index: 0, finish_reason: null }] },
        { choices: [{ delta: { content: "B" }, index: 0, finish_reason: null }] },
        { choices: [{ delta: {}, index: 0, finish_reason: "stop" }] },
      ]),
    )
    const origFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as any
    try {
      const model = createMerlin({ baseURL: "https://x.test", username: "u" }).languageModel("default")
      const { stream } = await model.doStream({
        prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      } as any)

      const parts = await collect(stream)
      const types = parts.map((p: any) => p.type)
      const startIdx = types.indexOf("text-start")
      const endIdx = types.indexOf("text-end")
      const deltaIdxs = types.reduce<number[]>((acc, t, i) => (t === "text-delta" ? [...acc, i] : acc), [])

      expect(startIdx).toBeLessThan(deltaIdxs[0]!)
      expect(endIdx).toBeGreaterThan(deltaIdxs[deltaIdxs.length - 1]!)
    } finally {
      globalThis.fetch = origFetch
    }
  })
})

// ── Native tool_calls ─────────────────────────────────────────────────────────

describe("doGenerate — native tool_calls", () => {
  test("sends tools in OpenAI format when tools are provided", async () => {
    let capturedBody: any = null
    const fakeFetch = mock(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string)
      return makeSseResponse([
        { choices: [{ delta: { content: "ok" }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: "stop" }] },
      ])
    })
    const origFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as any
    try {
      const model = createMerlin({ baseURL: "https://x.test", username: "u" }).languageModel("default")
      await model.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
        tools: [
          {
            type: "function",
            name: "Bash",
            description: "Run a shell command",
            inputSchema: {
              type: "object",
              properties: { command: { type: "string" } },
              required: ["command"],
            },
          },
        ],
      } as any)

      expect(Array.isArray(capturedBody.tools)).toBe(true)
      expect(capturedBody.tools).toHaveLength(1)
      expect(capturedBody.tools[0]).toMatchObject({
        type: "function",
        function: {
          name: "Bash",
          description: "Run a shell command",
        },
      })
      expect(capturedBody.tool_choice).toBeUndefined() // NOT sent (not in GAIA §1.2.2 whitelist)
    } finally {
      globalThis.fetch = origFetch
    }
  })

  test("assembles fragmented tool_calls argument deltas into a complete tool-call part", async () => {
    const fakeFetch = mock(async () =>
      makeSseResponse(
        [
          // First chunk: tool call header with id and function name
          {
            choices: [{
              delta: {
                role: "assistant",
                content: null,
                tool_calls: [{ index: 0, id: "call_abc", type: "function", function: { name: "Read", arguments: "" } }],
              },
              index: 0,
              finish_reason: null,
            }],
          },
          // Argument fragment 1
          { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"filePath":' } }] }, finish_reason: null }] },
          // Argument fragment 2
          { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"/a/b.ts"}' } }] }, finish_reason: null }] },
          // Finish
          { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
        ],
        200,
        { usage: { prompt_tokens: 8, completion_tokens: 4 } },
      ),
    )
    const origFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as any
    try {
      const model = createMerlin({ baseURL: "https://x.test", username: "u" }).languageModel("default")
      const result = await model.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "read the file" }] }],
        tools: [
          {
            type: "function",
            name: "Read",
            description: "Read a file",
            inputSchema: {
              type: "object",
              properties: { filePath: { type: "string" } },
              required: ["filePath"],
            },
          },
        ],
      } as any)

      expect(result.content).toHaveLength(1)
      const toolCall = result.content[0] as any
      expect(toolCall.type).toBe("tool-call")
      expect(toolCall.toolCallId).toBe("call_abc")
      expect(toolCall.toolName).toBe("Read")
      expect(JSON.parse(toolCall.input)).toEqual({ filePath: "/a/b.ts" })
      expect(result.finishReason).toMatchObject({ unified: "tool-calls" })
      expect(result.usage.inputTokens.total).toBe(8)
      expect(result.usage.outputTokens.total).toBe(4)
    } finally {
      globalThis.fetch = origFetch
    }
  })

  test("emits tool-input-start/delta/end + tool-call parts in doStream for tool responses", async () => {
    const fakeFetch = mock(async () =>
      makeSseResponse([
        {
          choices: [{
            delta: {
              tool_calls: [{ index: 0, id: "call_xyz", type: "function", function: { name: "Bash", arguments: "" } }],
            },
            finish_reason: null,
          }],
        },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"command":"ls"}' } }] }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
      ]),
    )
    const origFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as any
    try {
      const model = createMerlin({ baseURL: "https://x.test", username: "u" }).languageModel("default")
      const { stream } = await model.doStream({
        prompt: [{ role: "user", content: [{ type: "text", text: "list files" }] }],
      } as any)

      const parts = await collect(stream)
      const types = parts.map((p: any) => p.type)

      expect(types).toContain("tool-input-start")
      expect(types).toContain("tool-input-delta")
      expect(types).toContain("tool-input-end")
      expect(types).toContain("tool-call")

      const toolCallPart = parts.find((p: any) => p.type === "tool-call") as any
      expect(toolCallPart.toolCallId).toBe("call_xyz")
      expect(toolCallPart.toolName).toBe("Bash")
      expect(JSON.parse(toolCallPart.input)).toEqual({ command: "ls" })

      const finish = parts.find((p: any) => p.type === "finish") as any
      expect(finish.finishReason).toMatchObject({ unified: "tool-calls" })
    } finally {
      globalThis.fetch = origFetch
    }
  })

  test("multiple tool calls in one response are all surfaced", async () => {
    const fakeFetch = mock(async () =>
      makeSseResponse([
        {
          choices: [{
            delta: {
              tool_calls: [
                { index: 0, id: "call_1", type: "function", function: { name: "Read", arguments: '{"filePath":"/a"}' } },
              ],
            },
            finish_reason: null,
          }],
        },
        {
          choices: [{
            delta: {
              tool_calls: [
                { index: 1, id: "call_2", type: "function", function: { name: "Bash", arguments: '{"command":"ls"}' } },
              ],
            },
            finish_reason: null,
          }],
        },
        { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
      ]),
    )
    const origFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as any
    try {
      const model = createMerlin({ baseURL: "https://x.test", username: "u" }).languageModel("default")
      const result = await model.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "do stuff" }] }],
      } as any)

      const calls = result.content.filter((p: any) => p.type === "tool-call") as any[]
      expect(calls).toHaveLength(2)
      expect(calls[0].toolName).toBe("Read")
      expect(calls[1].toolName).toBe("Bash")
      expect(result.finishReason).toMatchObject({ unified: "tool-calls" })
    } finally {
      globalThis.fetch = origFetch
    }
  })
})

// ── Message conversion ────────────────────────────────────────────────────────

describe("message conversion", () => {
  test("passes assistant tool_calls history to the gateway in OpenAI format", async () => {
    let capturedBody: any = null
    const fakeFetch = mock(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string)
      return makeSseResponse([
        { choices: [{ delta: { content: "done" }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: "stop" }] },
      ])
    })
    const origFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as any
    try {
      const model = createMerlin({ baseURL: "https://x.test", username: "u" }).languageModel("default")
      await model.doGenerate({
        prompt: [
          { role: "user", content: [{ type: "text", text: "read the file" }] },
          {
            role: "assistant",
            content: [
              { type: "tool-call", toolCallId: "call_1", toolName: "Read", input: { filePath: "/a.ts" } },
            ],
          },
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: "call_1",
                toolName: "Read",
                output: { type: "text", value: "file content" },
              },
            ],
          },
        ],
      } as any)

      const msgs = capturedBody.messages as any[]
      const assistantMsg = msgs.find((m: any) => m.role === "assistant")
      expect(assistantMsg).toBeDefined()
      expect(assistantMsg.tool_calls).toHaveLength(1)
      expect(assistantMsg.tool_calls[0]).toMatchObject({
        id: "call_1",
        type: "function",
        function: { name: "Read", arguments: '{"filePath":"/a.ts"}' },
      })

      const toolMsg = msgs.find((m: any) => m.role === "tool")
      expect(toolMsg).toBeDefined()
      expect(toolMsg.tool_call_id).toBe("call_1")
      expect(toolMsg.content).toBe("file content")
    } finally {
      globalThis.fetch = origFetch
    }
  })
})

// ── Error handling ────────────────────────────────────────────────────────────

describe("error handling", () => {
  test("throws on non-OK HTTP status", async () => {
    const fakeFetch = mock(async () =>
      new Response("Unauthorized", { status: 401, headers: { "Content-Type": "text/plain" } }),
    )
    const origFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as any
    try {
      const model = createMerlin({ baseURL: "https://x.test" }).languageModel("default")
      await expect(
        model.doGenerate({
          prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
        } as any),
      ).rejects.toThrow("GAIA HTTP 401")
    } finally {
      globalThis.fetch = origFetch
    }
  })

  test("emits domain_id=none in URL when username is empty", async () => {
    let capturedUrl = ""
    const fakeFetch = mock(async (url: string) => {
      capturedUrl = url as string
      return makeSseResponse([
        { choices: [{ delta: { content: "ok" }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: "stop" }] },
      ])
    })
    const origFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as any
    try {
      const model = createMerlin({ baseURL: "https://x.test" }).languageModel("default")
      await model.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      } as any)
      expect(capturedUrl).toContain("/MAGEDEV/none/none/")
    } finally {
      globalThis.fetch = origFetch
    }
  })
})

// ── Non-SSE JSON fallback ─────────────────────────────────────────────────────

describe("non-SSE JSON fallback", () => {
  test("handles application/json response (non-streaming shape) with choices[0].message.content", async () => {
    const fakeFetch = mock(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: { role: "assistant", content: "Saya Mage versi JSON!" },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 12, completion_tokens: 7 },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )
    const origFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as any
    try {
      const model = createMerlin({ baseURL: "https://x.test", username: "u" }).languageModel("default")
      const result = await model.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "siapa kamu?" }] }],
      } as any)
      expect(result.content).toHaveLength(1)
      expect(result.content[0]).toMatchObject({ type: "text", text: "Saya Mage versi JSON!" })
      expect(result.finishReason).toMatchObject({ unified: "stop" })
      expect(result.usage.inputTokens.total).toBe(12)
      expect(result.usage.outputTokens.total).toBe(7)
    } finally {
      globalThis.fetch = origFetch
    }
  })

  test("handles SSE chunks that use choice.message instead of choice.delta", async () => {
    // Some gateway variants send the full message object even in SSE mode.
    const fakeFetch = mock(async () =>
      makeSseResponse([
        { choices: [{ message: { content: "Halo dari message field!" }, finish_reason: "stop" }] },
      ]),
    )
    const origFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as any
    try {
      const model = createMerlin({ baseURL: "https://x.test", username: "u" }).languageModel("default")
      const result = await model.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "halo" }] }],
      } as any)
      expect(result.content).toHaveLength(1)
      expect(result.content[0]).toMatchObject({ type: "text", text: "Halo dari message field!" })
      expect(result.finishReason).toMatchObject({ unified: "stop" })
    } finally {
      globalThis.fetch = origFetch
    }
  })
})

// ── Reasoning / thinking block ────────────────────────────────────────────────

describe("reasoning block", () => {
  test("SSE: reasoning chunks emit reasoning-start/delta/end before text parts", async () => {
    // The gateway streams thinking in a field named "reasoning" (confirmed from wire capture).
    const fakeFetch = mock(async () =>
      makeSseResponse([
        { choices: [{ delta: { reasoning: "First, I need to think " }, finish_reason: null }] },
        { choices: [{ delta: { reasoning: "about this problem." }, finish_reason: null }] },
        { choices: [{ delta: { content: "The answer is 42." }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: "stop" }] },
      ]),
    )
    const origFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as any
    try {
      const model = createMerlin({ baseURL: "https://x.test", username: "u" }).languageModel("default")
      const { stream } = await model.doStream({
        prompt: [{ role: "user", content: [{ type: "text", text: "what is 6*7?" }] }],
      } as any)

      const parts = await collect(stream)
      const types = parts.map((p: any) => p.type)

      // Reasoning parts must be present
      expect(types).toContain("reasoning-start")
      expect(types).toContain("reasoning-delta")
      expect(types).toContain("reasoning-end")

      // All reasoning deltas must be concatenated in order
      const reasoningDeltas = parts
        .filter((p: any) => p.type === "reasoning-delta")
        .map((p: any) => p.delta)
      expect(reasoningDeltas).toEqual(["First, I need to think ", "about this problem."])

      // reasoning-start must precede reasoning-delta, reasoning-end must follow
      const rsIdx = types.indexOf("reasoning-start")
      const reIdx = types.indexOf("reasoning-end")
      const rdIdxs = types.reduce<number[]>((acc, t, i) => (t === "reasoning-delta" ? [...acc, i] : acc), [])
      expect(rsIdx).toBeLessThan(rdIdxs[0]!)
      expect(reIdx).toBeGreaterThan(rdIdxs[rdIdxs.length - 1]!)

      // reasoning-end must come before text-start
      const textStartIdx = types.indexOf("text-start")
      expect(reIdx).toBeLessThan(textStartIdx)
    } finally {
      globalThis.fetch = origFetch
    }
  })

  test("SSE: doGenerate aggregates reasoning field into reasoning content part before text", async () => {
    const fakeFetch = mock(async () =>
      makeSseResponse([
        { choices: [{ delta: { reasoning: "Let me think..." }, finish_reason: null }] },
        { choices: [{ delta: { content: "Answer: 7." }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: "stop" }] },
      ]),
    )
    const origFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as any
    try {
      const model = createMerlin({ baseURL: "https://x.test", username: "u" }).languageModel("default")
      const result = await model.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "what is 3+4?" }] }],
      } as any)

      // Reasoning part must come before text part
      expect(result.content).toHaveLength(2)
      expect(result.content[0]).toMatchObject({ type: "reasoning", text: "Let me think..." })
      expect(result.content[1]).toMatchObject({ type: "text", text: "Answer: 7." })
    } finally {
      globalThis.fetch = origFetch
    }
  })

  test("non-SSE JSON: reasoning_content in message emits reasoning parts before text parts", async () => {
    const fakeFetch = mock(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                reasoning_content: "I think deeply about this.",
                content: "Here is the answer.",
              },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 10 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    const origFetch = globalThis.fetch
    globalThis.fetch = fakeFetch as any
    try {
      const model = createMerlin({ baseURL: "https://x.test", username: "u" }).languageModel("default")
      const result = await model.doGenerate({
        prompt: [{ role: "user", content: [{ type: "text", text: "explain something" }] }],
      } as any)

      // Reasoning before text in the content array
      expect(result.content).toHaveLength(2)
      expect(result.content[0]).toMatchObject({ type: "reasoning", text: "I think deeply about this." })
      expect(result.content[1]).toMatchObject({ type: "text", text: "Here is the answer." })
      expect(result.finishReason).toMatchObject({ unified: "stop" })
    } finally {
      globalThis.fetch = origFetch
    }
  })
})
