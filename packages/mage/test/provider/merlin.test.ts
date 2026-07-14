import { afterEach, describe, expect, test } from "bun:test"
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider"
import { createMerlin } from "@/provider/merlin"

const CALL_OPTIONS: LanguageModelV3CallOptions = {
  prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
}

const originalFetch = globalThis.fetch

function mockFetchRejecting(error: unknown) {
  globalThis.fetch = (() => Promise.reject(error)) as unknown as typeof fetch
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

    const model = createMerlin({ baseURL: "https://unreachable.invalid/gaia" }).languageModel("default")

    await expect(model.doGenerate(CALL_OPTIONS)).rejects.toMatchObject({
      message: "GAIA request failed: Error: Unable to connect. Is the computer able to access the url?",
      isRetryable: false,
    })
  })

  test("normalizes Bun's raw 'typo in the url or port' message even without an error code", async () => {
    mockFetchRejecting(new Error("Was there a typo in the url or port?"))

    const model = createMerlin({ baseURL: "https://unreachable.invalid/gaia" }).languageModel("default")

    await expect(model.doGenerate(CALL_OPTIONS)).rejects.toMatchObject({
      message: "GAIA request failed: Error: Unable to connect. Is the computer able to access the url?",
      isRetryable: false,
    })
  })

  test("leaves unrelated fetch failures unmodified", async () => {
    mockFetchRejecting(new Error("boom: unexpected TLS failure"))

    const model = createMerlin({ baseURL: "https://unreachable.invalid/gaia" }).languageModel("default")

    await expect(model.doGenerate(CALL_OPTIONS)).rejects.toMatchObject({
      message: "GAIA request failed: Error: boom: unexpected TLS failure",
      isRetryable: false,
    })
  })
})
