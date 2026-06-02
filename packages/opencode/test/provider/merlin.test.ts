import { describe, test, expect, mock } from "bun:test"
import { createMerlin } from "../../src/provider/merlin"

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
