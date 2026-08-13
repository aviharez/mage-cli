import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider"
import { streamText } from "ai"
import path from "path"
import os from "os"
import { Global } from "@mybcabisnis/mage-core/global"
import { createMerlin } from "@/provider/merlin"

const CALL_OPTIONS: LanguageModelV3CallOptions = {
  prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
}

const TEST_CREDENTIAL = {
  udomain: "U073030",
  display_name: "Test User",
  access_token: "access-token",
  refresh_token: "refresh-token",
  expires_in: Date.now() + 3600_000,
}

const originalFetch = globalThis.fetch
const originalConfigPath = Global.Path.config

beforeEach(() => {
  // Point the cred.json reader at a non-existent path so tests never pick up
  // the developer's real ~/.mage/data/cred.json.
  Global.Path.config = path.join(os.tmpdir(), `mage-merlin-${Math.random().toString(36).slice(2)}`)
})

afterEach(() => {
  globalThis.fetch = originalFetch
  Global.Path.config = originalConfigPath
})

function mockFetchRejecting(error: unknown) {
  globalThis.fetch = (() => Promise.reject(error)) as unknown as typeof fetch
}

/** Install a fetch mock that hands the request (url, init) to `handler` and returns its Response. */
function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  globalThis.fetch = (async (url: string, init: RequestInit) => handler(url, init)) as unknown as typeof fetch
}

/** Build an SSE `Response` from a list of already-JSON-stringified `data:` chunk bodies. */
function sseResponse(chunks: string[]): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        const enc = new TextEncoder()
        for (const chunk of chunks) controller.enqueue(enc.encode(`data: ${chunk}\n\n`))
        controller.enqueue(enc.encode("data: [DONE]\n\n"))
        controller.close()
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  )
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })
}

/** Drain a doStream() ReadableStream into an array of its parts. */
async function collectStream(stream: ReadableStream<import("@ai-sdk/provider").LanguageModelV3StreamPart>) {
  const reader = stream.getReader()
  const parts: import("@ai-sdk/provider").LanguageModelV3StreamPart[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
  }
  return parts
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

/**
 * Regression coverage for the off-VPN GAIA error message. Bun's fetch throws
 * "Was there a typo in the url or port?" on plain DNS resolution failure
 * (e.g. the internal GAIA host is unreachable without VPN), which reads like
 * a user config mistake rather than a connectivity problem. merlin.ts should
 * normalize any connection-class failure to a clear "Unable to connect"
 * message instead of passing the runtime-specific wording through verbatim.
 */
describe("Merlin provider — connection failure messaging", () => {
  test("normalizes a DNS-failure-coded error to 'Unable to connect'", async () => {
    const err = new Error("Was there a typo in the url or port?") as Error & { code?: string }
    err.code = "ENOTFOUND"
    mockFetchRejecting(err)

    const model = createMerlin({ baseURL: "https://unreachable.invalid/gaia", credential: TEST_CREDENTIAL }).languageModel("default")

    await expect(model.doGenerate(CALL_OPTIONS)).rejects.toMatchObject({
      message: "GAIA request failed: Error: Unable to connect. Is the computer able to access the url?",
      isRetryable: false,
    })
  })

  test("normalizes Bun's raw 'typo in the url or port' message even without an error code", async () => {
    mockFetchRejecting(new Error("Was there a typo in the url or port?"))

    const model = createMerlin({ baseURL: "https://unreachable.invalid/gaia", credential: TEST_CREDENTIAL }).languageModel("default")

    await expect(model.doGenerate(CALL_OPTIONS)).rejects.toMatchObject({
      message: "GAIA request failed: Error: Unable to connect. Is the computer able to access the url?",
      isRetryable: false,
    })
  })

  test("leaves unrelated fetch failures unmodified", async () => {
    mockFetchRejecting(new Error("boom: unexpected TLS failure"))

    const model = createMerlin({ baseURL: "https://unreachable.invalid/gaia", credential: TEST_CREDENTIAL }).languageModel("default")

    await expect(model.doGenerate(CALL_OPTIONS)).rejects.toMatchObject({
      message: "GAIA request failed: Error: boom: unexpected TLS failure",
      isRetryable: false,
    })
  })
})

describe("Merlin provider — /chat/completions request shape", () => {
  test("builds the positional URL and an OpenAI-shaped streaming body with tools", async () => {
    let capturedUrl = ""
    let capturedBody: Record<string, unknown> = {}
    mockFetch((url, init) => {
      capturedUrl = String(url)
      capturedBody = JSON.parse(init.body as string)
      return sseResponse(['{"choices":[{"delta":{"content":"hi"},"finish_reason":"stop"}]}'])
    })

    const model = createMerlin({
      baseURL: "https://gaia.example",
      credential: TEST_CREDENTIAL,
    }).languageModel("default")
    await model.doStream({
      prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      tools: [{ type: "function", name: "Read", description: "read a file", inputSchema: { type: "object", properties: {} } }],
    })

    expect(capturedUrl).toBe(
      "https://gaia.example/MAGEDEV/none/U073030/none/none/false/vllm-text-generation/chat/completions",
    )
    expect(capturedBody["stream"]).toBe(true)
    expect(capturedBody["stream_options"]).toEqual({ include_usage: true })
    expect(capturedBody["tools"]).toEqual([
      { type: "function", function: { name: "Read", description: "read a file", parameters: { type: "object", properties: {} } } },
    ])
    expect(capturedBody["tool_choice"]).toBe("auto")
  })
})

describe("Merlin provider — SSE streaming", () => {
  test("streams text deltas token by token", async () => {
    mockFetch(() =>
      sseResponse([
        '{"choices":[{"delta":{"content":"Hel"},"finish_reason":null}]}',
        '{"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}',
      ]),
    )

    const model = createMerlin({ baseURL: "https://gaia.example", credential: TEST_CREDENTIAL }).languageModel("default")
    const { stream } = await model.doStream(CALL_OPTIONS)
    const parts = await collectStream(stream)

    expect(parts.map((p) => p.type)).toEqual(["stream-start", "text-start", "text-delta", "text-delta", "text-end", "finish"])
    const deltas = parts.filter((p) => p.type === "text-delta").map((p) => (p as { delta: string }).delta)
    expect(deltas).toEqual(["Hel", "lo"])
  })

  test("assembles fragmented delta.tool_calls into one native tool-call part", async () => {
    mockFetch(() =>
      sseResponse([
        '{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"Read","arguments":"{\\"path\\":"}}]},"finish_reason":null}]}',
        '{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"a.ts\\"}"}}]},"finish_reason":"tool_calls"}]}',
      ]),
    )

    const model = createMerlin({ baseURL: "https://gaia.example", credential: TEST_CREDENTIAL }).languageModel("default")
    const { stream } = await model.doStream(CALL_OPTIONS)
    const parts = await collectStream(stream)

    const toolCall = parts.find((p) => p.type === "tool-call") as { toolCallId: string; toolName: string; input: string }
    expect(toolCall).toMatchObject({ toolCallId: "call_1", toolName: "Read", input: '{"path":"a.ts"}' })

    const finish = parts.find((p) => p.type === "finish") as { finishReason: { unified: string; raw: string | undefined } }
    expect(finish.finishReason).toEqual({ unified: "tool-calls", raw: "tool_calls" })
  })
})

describe("Merlin provider — DPA-1xx error scenario mapping (Techdoc §1.4)", () => {
  test("maps DPA-126 (prompt exceeds limit) to a 413 context_length_exceeded APICallError", async () => {
    mockFetch(() =>
      jsonResponse({
        error_schema: { error_code: "DPA-126", error_message: { english: "The prompt provided by user exceeds the limit" } },
        output_schema: { err_debug: "prompt too long", result: { answer: "Maaf pertanyaan yang Anda berikan terlalu panjang." } },
      }),
    )

    const model = createMerlin({ baseURL: "https://gaia.example", credential: TEST_CREDENTIAL }).languageModel("default")
    await expect(model.doGenerate(CALL_OPTIONS)).rejects.toMatchObject({
      message: expect.stringContaining("context_length_exceeded"),
      statusCode: 413,
      isRetryable: false,
    })
  })

  test("maps DPA-124 with a context-length err_debug to a 413 context_length_exceeded APICallError", async () => {
    mockFetch(() =>
      jsonResponse({
        error_schema: { error_code: "DPA-124", error_message: { english: "An error occurred while the engine was processing the query" } },
        output_schema: { err_debug: "maximum context length is 32000 tokens", result: { answer: "engine error" } },
      }),
    )

    const model = createMerlin({ baseURL: "https://gaia.example", credential: TEST_CREDENTIAL }).languageModel("default")
    await expect(model.doGenerate(CALL_OPTIONS)).rejects.toMatchObject({
      message: expect.stringContaining("context_length_exceeded"),
      statusCode: 413,
      isRetryable: false,
    })
  })

  test("maps a generic DPA-124 (no context-length err_debug) to a non-retryable engine error, not context overflow", async () => {
    mockFetch(() =>
      jsonResponse({
        error_schema: { error_code: "DPA-124", error_message: { english: "An error occurred while the engine was processing the query" } },
        output_schema: { err_debug: "ERROR 500 Internal Server Error", result: { answer: "engine error" } },
      }),
    )

    const model = createMerlin({ baseURL: "https://gaia.example", credential: TEST_CREDENTIAL }).languageModel("default")
    await expect(model.doGenerate(CALL_OPTIONS)).rejects.toMatchObject({
      message: "GAIA Error: 500 Internal Server Error\nERROR 500 Internal Server Error",
    })
  })

  test("maps DPA-115 (transient gateway failure) to a retryable APICallError", async () => {
    mockFetch(() =>
      jsonResponse({
        error_schema: { error_code: "DPA-115", error_message: { english: "Connection failed, please try again" } },
        output_schema: { result: { answer: "Mohon maaf, terjadi gangguan teknis." } },
      }),
    )

    const model = createMerlin({ baseURL: "https://gaia.example", credential: TEST_CREDENTIAL }).languageModel("default")
    await expect(model.doGenerate(CALL_OPTIONS)).rejects.toMatchObject({ isRetryable: true, statusCode: 503 })
  })

  test("maps DPA-117 (connection timeout) to a retryable APICallError", async () => {
    mockFetch(() =>
      jsonResponse({
        error_schema: { error_code: "DPA-117", error_message: { english: "Connection timeout" } },
        output_schema: { result: { answer: "Mohon maaf, terjadi gangguan teknis." } },
      }),
    )

    const model = createMerlin({ baseURL: "https://gaia.example", credential: TEST_CREDENTIAL }).languageModel("default")
    await expect(model.doGenerate(CALL_OPTIONS)).rejects.toMatchObject({ isRetryable: true, statusCode: 503 })
  })

  test("surfaces the localized 'Answer to User' text for a non-retryable DPA code (DPA-121)", async () => {
    mockFetch(() =>
      jsonResponse({
        error_schema: { error_code: "DPA-121", error_message: { english: "File format not available" } },
        output_schema: {
          result: {
            answer:
              "Maaf, saya tidak dapat memproses file dengan format tersebut. Mohon kirim file dengan format yang berbeda agar saya dapat memberikan jawaban. Terima kasih.",
          },
        },
      }),
    )

    const model = createMerlin({ baseURL: "https://gaia.example", credential: TEST_CREDENTIAL }).languageModel("default")
    await expect(model.doGenerate(CALL_OPTIONS)).rejects.toMatchObject({
      message: expect.stringContaining("Maaf, saya tidak dapat memproses file dengan format tersebut"),
      isRetryable: false,
    })
  })

  test("does not throw for DPA-111 (success code) when a real choices answer is present", async () => {
    mockFetch(() =>
      jsonResponse({
        error_schema: { error_code: "DPA-111", error_message: { english: "Transaction Successful" } },
        choices: [{ finish_reason: "stop", message: { role: "assistant", content: "hello" } }],
      }),
    )

    const model = createMerlin({ baseURL: "https://gaia.example", credential: TEST_CREDENTIAL }).languageModel("default")
    const result = await model.doGenerate(CALL_OPTIONS)
    expect(result.content).toEqual([{ type: "text", text: "hello" }])
  })
})

describe("Merlin provider — doGenerate native tool_calls (§1.3.2)", () => {
  test("parses choices[].message.tool_calls into LanguageModelV3 tool-call content", async () => {
    mockFetch(() =>
      jsonResponse({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: null,
              tool_calls: [{ id: "call_9", type: "function", function: { name: "Bash", arguments: '{"command":"ls"}' } }],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    )

    const model = createMerlin({ baseURL: "https://gaia.example", credential: TEST_CREDENTIAL }).languageModel("default")
    const result = await model.doGenerate(CALL_OPTIONS)

    expect(result.content).toEqual([{ type: "tool-call", toolCallId: "call_9", toolName: "Bash", input: '{"command":"ls"}' }])
    expect(result.finishReason).toEqual({ unified: "tool-calls", raw: "tool_calls" })
    expect(result.usage.inputTokens.total).toBe(10)
    expect(result.usage.outputTokens.total).toBe(5)
  })
})

describe("Merlin provider — reasoning (§1.3.2 thinking-mode chain-of-thought)", () => {
  test("doGenerate maps message.reasoning to a reasoning content part ahead of the answer", async () => {
    mockFetch(() =>
      jsonResponse({
        choices: [
          {
            finish_reason: "stop",
            message: { role: "assistant", content: "42", reasoning: "Let me compute 6 * 7 step by step." },
          },
        ],
      }),
    )

    const model = createMerlin({ baseURL: "https://gaia.example", credential: TEST_CREDENTIAL }).languageModel("default")
    const result = await model.doGenerate(CALL_OPTIONS)

    expect(result.content).toEqual([
      { type: "reasoning", text: "Let me compute 6 * 7 step by step." },
      { type: "text", text: "42" },
    ])
  })

  test("doStream emits reasoning-start/delta/end before the text parts, closed once real content starts", async () => {
    mockFetch(() =>
      sseResponse([
        '{"choices":[{"delta":{"reasoning":"Think"},"finish_reason":null}]}',
        '{"choices":[{"delta":{"reasoning":"ing..."},"finish_reason":null}]}',
        '{"choices":[{"delta":{"content":"42"},"finish_reason":"stop"}]}',
      ]),
    )

    const model = createMerlin({ baseURL: "https://gaia.example", credential: TEST_CREDENTIAL }).languageModel("default")
    const { stream } = await model.doStream(CALL_OPTIONS)
    const parts = await collectStream(stream)

    expect(parts.map((p) => p.type)).toEqual([
      "stream-start",
      "reasoning-start",
      "reasoning-delta",
      "reasoning-delta",
      "reasoning-end",
      "text-start",
      "text-delta",
      "text-end",
      "finish",
    ])
    const reasoningDeltas = parts.filter((p) => p.type === "reasoning-delta").map((p) => (p as { delta: string }).delta)
    expect(reasoningDeltas).toEqual(["Think", "ing..."])
  })
})

describe("Merlin provider — context-window usage accuracy", () => {
  test("zero-filled GAIA usage survives AI SDK normalization with fallback tokens", async () => {
    mockFetch(() =>
      sseResponse([
        '{"choices":[{"delta":{"content":"x"},"finish_reason":"stop"}]}',
        '{"choices":[],"usage":{"prompt_tokens":0,"completion_tokens":0,"total_tokens":0}}',
      ]),
    )

    const model = createMerlin({ baseURL: "https://gaia.example", credential: TEST_CREDENTIAL }).languageModel("default")
    const result = streamText({ model, prompt: "hi" })
    const events = []
    for await (const event of result.fullStream) events.push(event)
    const finish = events.find((event) => event.type === "finish-step")
    if (!finish || finish.type !== "finish-step") throw new Error("expected finish-step")

    expect(finish.usage.inputTokens).toBeGreaterThan(0)
    expect(finish.usage.outputTokens).toBe(1)
  })

  test("doStream folds tool-call argument length into the output token estimate too", async () => {
    mockFetch(() =>
      sseResponse([
        '{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"Read","arguments":"{\\"path\\":\\"a.ts\\"}"}}]},"finish_reason":"tool_calls"}]}',
      ]),
    )

    const model = createMerlin({ baseURL: "https://gaia.example", credential: TEST_CREDENTIAL }).languageModel("default")
    const { stream } = await model.doStream(CALL_OPTIONS)
    const parts = await collectStream(stream)

    const finish = parts.find((p) => p.type === "finish") as { usage: { outputTokens: { total: number } } }
    expect(finish.usage.outputTokens.total).toBeGreaterThan(0)
  })

  test("doStream trusts GAIA usage over local fallback estimates", async () => {
    mockFetch(() =>
      sseResponse([
        '{"choices":[{"delta":{"content":"x"},"finish_reason":"stop"}]}',
        '{"choices":[],"usage":{"prompt_tokens":1,"completion_tokens":3,"total_tokens":4}}',
      ]),
    )

    const model = createMerlin({ baseURL: "https://gaia.example", credential: TEST_CREDENTIAL }).languageModel("default")
    const { stream } = await model.doStream(CALL_OPTIONS)
    const parts = await collectStream(stream)
    const finish = parts.find((p) => p.type === "finish") as {
      usage: { inputTokens: { total: number }; outputTokens: { total: number }; raw: unknown }
    }

    expect(finish.usage.inputTokens.total).toBe(1)
    expect(finish.usage.outputTokens.total).toBe(3)
    expect(finish.usage.raw).toEqual({ prompt_tokens: 1, completion_tokens: 3, total_tokens: 4 })
  })
})
