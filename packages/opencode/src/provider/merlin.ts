/**
 * Cloud Merlin provider adapter for the Vercel AI SDK (LanguageModelV3).
 *
 * The Merlin API wraps the GAIA gateway's OpenAI-compatible /chat/completions
 * endpoint, which supports Server-Sent-Events streaming and native
 * tools/tool_calls — no prompt-based workarounds needed.
 *
 * Request URL shape (positional path segments):
 *   POST <base>/<client_id>/<session_id>/<domain_id>/<user_name>/<divisi>/<new_session>/<task>/chat/completions
 *   where task = "vllm-text-generation" (routes to the vllm backend; "none" causes the gateway error fallback)
 *
 * Request body:
 *   { model, service_id, messages, stream, stream_options, temperature, tools?, tool_choice? }
 *
 * Response: standard OpenAI SSE — data: {choices:[{delta:{content?,tool_calls?},finish_reason?}]}
 * terminated by data: [DONE]. Usage arrives in the penultimate chunk when
 * stream_options.include_usage is set.
 *
 * Service ID resolution: the existing skill-detection heuristic (`resolveServiceId`)
 * scans system prompt text for SKILL.md markers and picks the right GAIA service.
 */

import { APICallError } from "@ai-sdk/provider"
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3FunctionTool,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamResult,
  LanguageModelV3StreamPart,
  LanguageModelV3ToolResultOutput,
} from "@ai-sdk/provider"
import { Log } from "../util"

const log = Log.create({ service: "merlin" })

// ── Constants ─────────────────────────────────────────────────────────────────

const MERLIN_BASE =
  "https://gaia-gateway-multimodal-uat.apps.ocpuatgra.dti.co.id"

const CLIENT_ID = "MAGEDEV"

/**
 * GAIA `task` path segment that routes the request to the vllm text-generation
 * backend. Must match the working Postman curl (`vllm-text-generation`); using
 * `none` here causes the gateway to short-circuit and return its canned error.
 */
const TASK = "vllm-text-generation"

/** On-premise Qwen3.6 27B dense served via vllm. */
const MODEL_NAME = "/app/models/text-2"

/**
 * /chat/completions accepts ONLY temperature — there is no top_p, top_k, min_p,
 * or penalty knob available. Temperature alone must keep output focused.
 * 0.2 is tuned for agentic coding: near-deterministic edits and reliable
 * tool-call JSON, while staying above 0 where Qwen3.6 degrades into repetition.
 */
const CODING_TEMPERATURE = 0.2

// ── TLS bypass for the internal self-signed GAIA gateway ───────────────────────

const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined"

/**
 * The GAIA UAT gateway serves a self-signed certificate, so TLS verification has
 * to be disabled. The two runtimes that host the server need different mechanisms:
 *
 *   - Bun (CLI / `bun run dev` web backend) honors a per-request `tls` option on
 *     fetch — see `bunFetchTlsOption`.
 *   - Node (the Electron desktop sidecar in packages/desktop) runs the prebuilt
 *     dist/node bundle and uses undici's fetch, which SILENTLY IGNORES the `tls`
 *     option. Without an undici dispatcher the desktop fails with "fetch failed"
 *     on the self-signed cert. We lazily build an Agent that skips verification.
 */
const bunFetchTlsOption = isBun ? { tls: { rejectUnauthorized: false } } : {}

let nodeDispatcher: unknown
let nodeDispatcherInit = false

async function getNodeInsecureDispatcher(): Promise<unknown> {
  if (isBun) return undefined
  if (nodeDispatcherInit) return nodeDispatcher
  nodeDispatcherInit = true
  try {
    const { Agent } = await import("undici")
    nodeDispatcher = new Agent({ connect: { rejectUnauthorized: false } })
  } catch (error) {
    log.warn("undici_dispatcher_unavailable", { error: String(error) })
  }
  return nodeDispatcher
}

// ── URL builder ───────────────────────────────────────────────────────────────

/**
 * Build the /chat/completions URL from the base endpoint and the caller's
 * domain ID (username). All path segments are fixed constants except domain_id.
 *
 * Segment order (per Techdoc v2.4 §1.1.3):
 *   /{client_id}/{session_id}/{domain_id}/{user_name}/{divisi}/{new_session}/{task}/chat/completions
 */
function buildUrl(base: string, domainId: string): string {
  const b = base.replace(/\/$/, "")
  // session_id, user_name, divisi → "none"; new_session → "false"; task → TASK ("vllm-text-generation")
  return `${b}/${CLIENT_ID}/none/${encodeURIComponent(domainId)}/none/none/true/${TASK}/chat/completions`
}

// ── Service ID resolution ─────────────────────────────────────────────────────

const SERVICE_IDS: Record<string, string> = {
  ffl: "FFDGDEV662933418",
  "angular-update": "ANGULARDEV622010",
  "api-contract-web": "CGDEV77822391003",
  boilerplate: "BMDEV28894492190",
  general: "MBBDSDEV29978319",
}

/**
 * Detect which skill is active by scanning the system prompt messages for
 * distinctive markers each SKILL.md injects when it is loaded.
 * Falls back to the general MBB service ID when no skill is detected.
 */
function resolveServiceId(options: LanguageModelV3CallOptions): string {
  const systemText = options.prompt
    .filter((m) => m.role === "system")
    .map((m) => (m as { role: "system"; content: string }).content)
    .join("\n")

  if (systemText.includes("ffl-scratch.md") || systemText.includes("Functional Flow Document (FFL) Generator"))
    return SERVICE_IDS["ffl"]!
  if (systemText.includes("ng-update-scratch.md") || systemText.includes("Angular Update (v18"))
    return SERVICE_IDS["angular-update"]!
  if (systemText.includes("api-contract-scratch.md") || systemText.includes("API Contract Generator — Angular Web"))
    return SERVICE_IDS["api-contract-web"]!
  if (systemText.includes("mage_boilerplate") || systemText.includes("boilerplate profiles"))
    return SERVICE_IDS["boilerplate"]!
  return SERVICE_IDS["general"]!
}

// ── Tool result helper ────────────────────────────────────────────────────────

/** Extract a readable string from a LanguageModelV3ToolResultOutput. */
function outputToString(output: LanguageModelV3ToolResultOutput): string {
  if (output.type === "text") return output.value
  if (output.type === "json") return JSON.stringify(output.value)
  if (output.type === "error-text") return output.value
  if (output.type === "error-json") return JSON.stringify(output.value)
  if (output.type === "execution-denied") return output.reason ?? "execution denied"
  if (output.type === "content") {
    return output.value
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n")
  }
  return ""
}

// ── OpenAI message / tool conversion ─────────────────────────────────────────

type OpenAIMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant"
      content?: string | null
      tool_calls?: Array<{
        id: string
        type: "function"
        function: { name: string; arguments: string }
      }>
    }
  | { role: "tool"; tool_call_id: string; content: string }

/**
 * Convert the LanguageModelV3 prompt array into the OpenAI messages format
 * that the /chat/completions endpoint expects.
 */
function toOpenAIMessages(options: LanguageModelV3CallOptions): OpenAIMessage[] {
  const out: OpenAIMessage[] = []

  for (const msg of options.prompt) {
    if (msg.role === "system") {
      out.push({ role: "system", content: msg.content })
    } else if (msg.role === "user") {
      // Join text parts; skip file parts (attachment capability is false for Merlin).
      const text = msg.content
        .filter((p) => p.type === "text")
        .map((p) => (p as { type: "text"; text: string }).text)
        .join("\n")
      out.push({ role: "user", content: text })
    } else if (msg.role === "assistant") {
      const textContent =
        msg.content
          .filter((p) => p.type === "text")
          .map((p) => (p as { type: "text"; text: string }).text)
          .join("\n") || null

      const toolCalls = msg.content
        .filter((p) => p.type === "tool-call")
        .map((p) => {
          if (p.type !== "tool-call") return null!
          const input = typeof p.input === "string" ? p.input : JSON.stringify(p.input)
          return {
            id: p.toolCallId,
            type: "function" as const,
            function: { name: p.toolName, arguments: input },
          }
        })

      const assistantMsg: OpenAIMessage = { role: "assistant" }
      if (textContent) (assistantMsg as { role: "assistant"; content: string }).content = textContent
      if (toolCalls.length > 0)
        (assistantMsg as { role: "assistant"; tool_calls: typeof toolCalls }).tool_calls = toolCalls
      out.push(assistantMsg)
    } else if (msg.role === "tool") {
      // One tool message per tool-result part.
      for (const p of msg.content) {
        if (p.type !== "tool-result") continue
        out.push({
          role: "tool",
          tool_call_id: p.toolCallId,
          content: outputToString(p.output),
        })
      }
    }
  }

  return out
}

type OpenAITool = {
  type: "function"
  function: {
    name: string
    description?: string
    parameters: unknown
  }
}

/**
 * Convert the LanguageModelV3 tools array into the OpenAI function format
 * for the /chat/completions request body.
 * Returns undefined when no tools are present (so the field is omitted entirely).
 */
function toOpenAITools(options: LanguageModelV3CallOptions): OpenAITool[] | undefined {
  if (!options.tools || options.tools.length === 0) return undefined
  const tools = options.tools
    .filter((t): t is LanguageModelV3FunctionTool => t.type === "function")
    .map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }))
  return tools.length > 0 ? tools : undefined
}

// ── GAIA gateway error-string filter ─────────────────────────────────────────

/**
 * The gateway appends a canned Indonesian error string to the end of the SSE
 * content when its own post-processing fails (DPA-11x), even when the model
 * ran successfully and returned real content. Strip them before yielding to
 * the UI so the error never reaches the user.
 */
const GAIA_CANNED_ERRORS = [
  // DPA-112/113/114/115/116/117/118 — all map to this single user-facing string.
  "Mohon maaf, terjadi gangguan teknis. Silakan coba lagi setelah beberapa saat, kemudian refresh halaman ini.",
]

function stripGaiaErrors(text: string): string {
  let out = text
  for (const err of GAIA_CANNED_ERRORS) {
    out = out.replaceAll(err, "")
  }
  return out
}

// ── Finish-reason mapping ─────────────────────────────────────────────────────

type UnifiedFinish = "stop" | "length" | "content-filter" | "tool-calls" | "other" | "error"

function mapFinishReason(raw: string, hasToolCalls: boolean): { unified: UnifiedFinish; raw: string } {
  if (hasToolCalls) return { unified: "tool-calls", raw }
  if (raw === "stop") return { unified: "stop", raw }
  if (raw === "tool_calls") return { unified: "tool-calls", raw }
  if (raw === "length" || raw === "max_tokens") return { unified: "length", raw }
  if (raw === "content_filter") return { unified: "content-filter", raw }
  return { unified: "other", raw }
}

// ── Model implementation ──────────────────────────────────────────────────────

class MerlinLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = "v3" as const
  readonly provider = "merlin"
  readonly modelId = "default"
  readonly supportedUrls = {}

  constructor(
    private readonly baseUrl: string,
    private readonly username: string,
    private readonly timeoutMs: number,
  ) {}

  /**
   * Core SSE streaming generator. Connects to the /chat/completions endpoint,
   * parses the event stream, and yields LanguageModelV3StreamPart values:
   *
   *   stream-start
   *   [text-start → text-delta* → text-end]   (when the model returns text)
   *   [tool-input-start → tool-input-delta → tool-input-end → tool-call]*  (per tool)
   *   finish
   *
   * Text deltas stream live as they arrive. Tool calls are accumulated and
   * emitted in index order after the stream finishes.
   */
  private async *streamChat(
    options: LanguageModelV3CallOptions,
  ): AsyncGenerator<LanguageModelV3StreamPart> {
    yield { type: "stream-start", warnings: [] }

    const messages = toOpenAIMessages(options)
    const tools = toOpenAITools(options)
    const serviceId = resolveServiceId(options)
    const domainId = this.username || "none"
    const url = buildUrl(this.baseUrl, domainId)

    // Token estimation for the sidebar context gauge.
    // The gateway never returns usage during streaming because stream_options.include_usage
    // is not in the §1.2.2 whitelist and triggers DPA-113 "Invalid Parameters".
    // Use serialised message bytes ÷ 4 as a ~±15% proxy (~4 chars/token for mixed
    // English/code content). Falls back to real gateway counts whenever they are non-zero.
    const estimatedInputTokens = Math.ceil(JSON.stringify(messages).length / 4)

    // GAIA §1.2.2 accepted params: model, messages, temperature,
    // max_token/max_completion_tokens, tools, n, stop, voice_name,
    // web_search, priority, request_id, service_id.
    // Sending undocumented params (stream_options, tool_choice) triggers DPA-113
    // "Invalid Parameters" — the gateway returns its canned error body.
    const body: Record<string, unknown> = {
      model: MODEL_NAME,
      service_id: serviceId,
      messages,
      stream: true,
      temperature: CODING_TEMPERATURE,
    }
    if (tools) {
      // tool_choice is NOT in the §1.2.2 whitelist; the model picks automatically.
      body.tools = tools
    }

    log.info("request", {
      url,
      service_id: serviceId,
      message_count: messages.length,
      tool_count: tools?.length ?? 0,
    })

    const signals: AbortSignal[] = [AbortSignal.timeout(this.timeoutMs)]
    if (options.abortSignal) signals.push(options.abortSignal)

    const dispatcher = await getNodeInsecureDispatcher()
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.any(signals),
      ...bunFetchTlsOption,
      ...(dispatcher ? { dispatcher } : {}),
    } as RequestInit)

    if (!response.ok) {
      const responseText = await response.text().catch(() => "")
      // Heuristic: a large prompt is the most likely cause when GAIA 5xx-es.
      // Use serialized messages length as a proxy token count.
      const msgEstimate = Math.round(JSON.stringify(messages).length / 4)
      if (msgEstimate >= 200_000) {
        throw new APICallError({
          message: `context_length_exceeded: GAIA HTTP ${response.status} (estimated ~${msgEstimate} tokens): ${responseText}`,
          url,
          requestBodyValues: {},
          statusCode: 413,
          responseBody: responseText,
          isRetryable: false,
        })
      }
      throw new Error(`GAIA HTTP ${response.status} ${response.statusText}: ${responseText}`)
    }

    // Log the raw response meta so we can see what content-type the gateway sent.
    const contentType = response.headers.get("content-type") ?? ""
    log.info("response", { status: response.status, contentType })

    // ── Non-SSE fallback ─────────────────────────────────────────────────────
    // GAIA may return a plain application/json body (the non-streaming OpenAI shape)
    // even when stream:true was requested — e.g. the vllm backend ignores the flag,
    // or the gateway wraps the result itself.  Without this branch the SSE parser
    // would drain the body without finding any `data:` lines and yield nothing.
    if (!contentType.includes("text/event-stream")) {
      const raw = await response.text()
      log.warn("non_sse_response", { contentType, preview: raw.slice(0, 500) })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let json: any
      try {
        json = JSON.parse(raw)
      } catch {
        throw new Error(`GAIA non-SSE response was not JSON (${contentType}): ${raw.slice(0, 500)}`)
      }
      // Surface a GAIA error envelope when no choices are present.
      if (!json.choices && (json.error || json.error_schema)) {
        const msg =
          (json.error_schema as { error_message?: { english?: string } } | undefined)
            ?.error_message?.english ??
          (json.error as string | undefined) ??
          "unknown GAIA error"
        throw new Error(`GAIA error: ${msg}`)
      }
      if (!json.choices?.[0]?.message) {
        log.warn("non_sse_no_message", { raw: raw.slice(0, 500) })
      }
      yield* this.emitMessage(
        json.choices?.[0]?.message as Parameters<typeof this.emitMessage>[0],
        json.choices?.[0]?.finish_reason as string | undefined,
        json.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined,
        estimatedInputTokens,
      )
      return
    }

    // ── SSE parser ────────────────────────────────────────────────────────────

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ""

    // Text stream state (single text stream per response)
    const TEXT_ID = "merlin-text"
    let textOpen = false

    // Reasoning stream state (thinking block — populated via reasoning_content field)
    const REASONING_ID = "merlin-reasoning"
    let reasoningOpen = false
    let reasoningSeen = false

    // Tool call accumulator, keyed by the OpenAI stream index.
    type ToolAcc = { id: string; name: string; argsBuffer: string }
    const toolAccum = new Map<number, ToolAcc>()

    // Final usage & finish tracking
    let inputTokens = 0
    let outputTokens = 0
    let finishReason = "stop"
    // Character accumulator for output-token estimation (see estimatedInputTokens comment above).
    let outputChars = 0

    outer: while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buf += decoder.decode(value, { stream: true })

      // Split on double-newline SSE event boundaries.
      const events = buf.split(/\r?\n\r?\n/)
      buf = events.pop() ?? ""

      for (const event of events) {
        for (const line of event.split(/\r?\n/)) {
          if (!line.startsWith("data:")) continue
          const data = line.slice(5).trim()
          if (data === "[DONE]") break outer

          // Chunk type mirrors the OpenAI streaming format.
          // `message` is the non-streaming field; some gateway variants send it even
          // in SSE chunks instead of `delta`, so we accept both.
          type ChunkDeltaOrMessage = {
            content?: string | null
            // Live SSE field name confirmed from gateway wire capture: "reasoning"
            reasoning?: string | null
            // Fallback field name from non-SSE JSON and some gateway variants
            reasoning_content?: string | null
            tool_calls?: Array<{
              index?: number
              id?: string
              function?: { name?: string; arguments?: string }
            }>
          }
          let chunk: {
            choices?: Array<{
              delta?: ChunkDeltaOrMessage
              message?: ChunkDeltaOrMessage
              finish_reason?: string | null
            }>
            usage?: { prompt_tokens?: number; completion_tokens?: number } | null
          }
          try {
            chunk = JSON.parse(data)
          } catch {
            continue
          }

          // Usage arrives in the penultimate chunk when include_usage is set.
          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens ?? inputTokens
            outputTokens = chunk.usage.completion_tokens ?? outputTokens
          }

          const choice = chunk.choices?.[0]
          if (!choice) continue

          if (choice.finish_reason) finishReason = choice.finish_reason

          // Accept either `delta` (standard SSE streaming) or `message` (some gateway
          // variants send the full message object even in SSE mode instead of deltas).
          const delta = choice.delta ?? choice.message
          if (!delta) continue

          // ── Reasoning deltas: stream live (before text) ─────────────────────
          // The gateway sends reasoning in "reasoning" (confirmed from SSE wire capture);
          // fall back to "reasoning_content" for non-SSE JSON variants.
          const reasoningDelta = delta.reasoning ?? delta.reasoning_content
          if (typeof reasoningDelta === "string" && reasoningDelta) {
            if (!reasoningOpen) {
              yield { type: "reasoning-start", id: REASONING_ID }
              reasoningOpen = true
            }
            reasoningSeen = true
            yield { type: "reasoning-delta", id: REASONING_ID, delta: reasoningDelta }
            outputChars += reasoningDelta.length
          }

          // ── Text deltas: stream live ────────────────────────────────────────
          if (typeof delta.content === "string" && delta.content) {
            const cleaned = stripGaiaErrors(delta.content)
            if (cleaned) {
              // Close reasoning block before the first text token arrives.
              if (reasoningOpen) {
                yield { type: "reasoning-end", id: REASONING_ID }
                reasoningOpen = false
              }
              if (!textOpen) {
                yield { type: "text-start", id: TEXT_ID }
                textOpen = true
              }
              yield { type: "text-delta", id: TEXT_ID, delta: cleaned }
              outputChars += cleaned.length
            }
          }

          // ── Tool call deltas: accumulate by index ───────────────────────────
          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              if (!toolAccum.has(idx)) {
                // Initialise with empty name/args; all fields are filled via += below.
                toolAccum.set(idx, { id: `merlin-tc-${idx}`, name: "", argsBuffer: "" })
              }
              const acc = toolAccum.get(idx)!
              // The gateway sends id and name only in the first delta for each index;
              // subsequent deltas only carry argument fragments. Always append so the
              // accumulator works correctly even if multiple chunks carry name fragments.
              if (tc.id) acc.id = tc.id
              if (tc.function?.name) acc.name += tc.function.name
              if (tc.function?.arguments) {
                acc.argsBuffer += tc.function.arguments
                outputChars += tc.function.arguments.length
              }
            }
          }
        }
      }
    }

    // ── Diagnostic guard ─────────────────────────────────────────────────────
    // If the gateway returned an SSE body but we never saw any text or tool calls,
    // emit a warning so a future response-shape mismatch is visible in the log.
    if (!textOpen && !reasoningSeen && toolAccum.size === 0) {
      log.warn("empty_stream", { finishReason, message_count: messages.length })
    }

    // ── Emit accumulated events ───────────────────────────────────────────────

    // Close any open reasoning block (e.g. model returned reasoning but no text).
    if (reasoningOpen) yield { type: "reasoning-end", id: REASONING_ID }

    // Close the text stream before emitting tool parts.
    if (textOpen) yield { type: "text-end", id: TEXT_ID }

    // Emit tool call events in index order.
    const sortedTools = [...toolAccum.entries()].sort(([a], [b]) => a - b)
    for (const [, tc] of sortedTools) {
      yield { type: "tool-input-start", id: tc.id, toolName: tc.name }
      yield { type: "tool-input-delta", id: tc.id, delta: tc.argsBuffer }
      yield { type: "tool-input-end", id: tc.id }
      // The "tool-call" part is required to trigger execute() in the AI SDK
      // runToolsTransformation pipeline — without it the agent loop stalls.
      yield { type: "tool-call", toolCallId: tc.id, toolName: tc.name, input: tc.argsBuffer }
    }

    // Use real gateway token counts when available; fall back to char-based estimates
    // for the common streaming case where the gateway never sends a usage chunk.
    const finalInputTokens = inputTokens || estimatedInputTokens
    const finalOutputTokens = outputTokens || Math.ceil(outputChars / 4)

    yield {
      type: "finish",
      finishReason: mapFinishReason(finishReason, toolAccum.size > 0),
      usage: {
        inputTokens: { total: finalInputTokens, noCache: finalInputTokens, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: finalOutputTokens, text: undefined, reasoning: undefined },
      },
    }
  }

  /**
   * Emit LanguageModelV3StreamPart values for a complete OpenAI-style message object.
   * Used when the gateway returns a plain JSON (non-SSE) response, and can be reused
   * wherever a full message needs to be turned into the streaming part sequence.
   *
   * Yields: [text-start → text-delta → text-end] then [tool-call parts…] then finish.
   */
  private *emitMessage(
    message:
      | {
          content?: string | null
          // "reasoning" is the confirmed SSE field; "reasoning_content" is the non-SSE fallback.
          reasoning?: string | null
          reasoning_content?: string | null
          tool_calls?: Array<{
            id?: string
            type?: string
            function?: { name?: string; arguments?: string }
          }>
        }
      | undefined,
    finishRaw: string | null | undefined,
    usage: { prompt_tokens?: number; completion_tokens?: number } | null | undefined,
    /** Estimated input tokens from the serialised request body (÷4 heuristic). */
    fallbackInputTokens = 0,
  ): Generator<LanguageModelV3StreamPart> {
    const TEXT_ID = "merlin-text"
    const REASONING_ID = "merlin-reasoning"
    const toolList: Array<{ id: string; name: string; argsBuffer: string }> = []

    // Accumulate output chars for the token estimate fallback.
    let outputCharsEst = 0

    const reasoningText = message?.reasoning ?? message?.reasoning_content
    if (typeof reasoningText === "string" && reasoningText) {
      yield { type: "reasoning-start", id: REASONING_ID }
      yield { type: "reasoning-delta", id: REASONING_ID, delta: reasoningText }
      yield { type: "reasoning-end", id: REASONING_ID }
      outputCharsEst += reasoningText.length
    }

    if (typeof message?.content === "string" && message.content) {
      const cleaned = stripGaiaErrors(message.content)
      if (cleaned) {
        yield { type: "text-start", id: TEXT_ID }
        yield { type: "text-delta", id: TEXT_ID, delta: cleaned }
        yield { type: "text-end", id: TEXT_ID }
        outputCharsEst += cleaned.length
      }
    }

    if (Array.isArray(message?.tool_calls)) {
      for (const [i, tc] of message.tool_calls.entries()) {
        const args = tc.function?.arguments ?? ""
        toolList.push({
          id: tc.id ?? `merlin-tc-${i}`,
          name: tc.function?.name ?? "",
          argsBuffer: args,
        })
        outputCharsEst += args.length
      }
    }

    for (const tc of toolList) {
      yield { type: "tool-input-start", id: tc.id, toolName: tc.name }
      yield { type: "tool-input-delta", id: tc.id, delta: tc.argsBuffer }
      yield { type: "tool-input-end", id: tc.id }
      yield { type: "tool-call", toolCallId: tc.id, toolName: tc.name, input: tc.argsBuffer }
    }

    // Use real gateway token counts when present; fall back to char-based estimates.
    const finalInputTokens = usage?.prompt_tokens || fallbackInputTokens
    const finalOutputTokens = usage?.completion_tokens || Math.ceil(outputCharsEst / 4)
    yield {
      type: "finish",
      finishReason: mapFinishReason(finishRaw ?? "stop", toolList.length > 0),
      usage: {
        inputTokens: { total: finalInputTokens, noCache: finalInputTokens, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: finalOutputTokens, text: undefined, reasoning: undefined },
      },
    }
  }

  /**
   * Non-streaming generate: drain the SSE stream and aggregate into a single result.
   * Used by doGenerate and by callers that need the complete answer in one go.
   */
  async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
    let reasoningAcc = ""
    let textAcc = ""
    const toolCalls: Array<{ toolCallId: string; toolName: string; input: string }> = []
    let usage: LanguageModelV3GenerateResult["usage"] = {
      inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 0, text: undefined, reasoning: undefined },
    }
    let finishReason: LanguageModelV3GenerateResult["finishReason"] = { unified: "stop", raw: "stop" }

    for await (const part of this.streamChat(options)) {
      if (part.type === "reasoning-delta") reasoningAcc += part.delta
      if (part.type === "text-delta") textAcc += part.delta
      if (part.type === "tool-call") {
        toolCalls.push({
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
        })
      }
      if (part.type === "finish") {
        usage = part.usage
        finishReason = part.finishReason
      }
    }

    const content: LanguageModelV3GenerateResult["content"] = []
    if (reasoningAcc) content.push({ type: "reasoning", text: reasoningAcc })
    if (textAcc) content.push({ type: "text", text: textAcc })
    for (const tc of toolCalls) {
      content.push({ type: "tool-call", ...tc })
    }

    return { content, finishReason, usage, warnings: [] }
  }

  /**
   * Streaming generate: expose the SSE generator as a ReadableStream.
   * Tokens reach the UI as they are produced by the model.
   */
  async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
    const gen = this.streamChat(options)
    const stream = new ReadableStream<LanguageModelV3StreamPart>({
      async pull(controller) {
        const { done, value } = await gen.next()
        if (done) {
          controller.close()
          return
        }
        controller.enqueue(value)
      },
      cancel() {
        void gen.return(undefined)
      },
    })
    return { stream }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export interface MerlinProviderOptions {
  /** Override Merlin API base URL (defaults to the GAIA UAT endpoint) */
  baseURL?: string
  /** User's domain username sent as domain_id in every request */
  username?: string
  /** Request timeout in milliseconds (defaults to 600 000 ms) */
  timeoutMs?: number
}

export interface MerlinProvider {
  languageModel(modelId: string): LanguageModelV3
}

/**
 * Create a Merlin provider instance.
 * All options are optional — the base URL, model, and client_id are hardcoded
 * for the BCA GAIA gateway. Set `username` to populate the domain_id path
 * segment for gateway user tracking (via provider.merlin.options.username in
 * mage.jsonc).
 */
export function createMerlin(options: MerlinProviderOptions = {}): MerlinProvider {
  const {
    baseURL = MERLIN_BASE,
    username = "",
    timeoutMs = 600_000,
  } = options

  return {
    languageModel(_modelId: string): LanguageModelV3 {
      return new MerlinLanguageModel(baseURL, username, timeoutMs)
    },
  }
}
