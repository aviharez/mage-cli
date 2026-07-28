/**
 * Cloud Merlin provider adapter for the Vercel AI SDK (LanguageModelV3).
 *
 * Talks to BCA's GAIA gateway `/chat/completions` endpoint (Techdoc "LLM
 * GATEWAY API v2.4" §1.1.3), which is OpenAI-compatible: standard
 * `messages`/`tools` request body, real SSE streaming, and native
 * `message.tool_calls` — no prompt-injected XML tool-call parsing needed.
 *
 * URL shape (positional path segments, §1.1.3):
 *   POST <origin>/<client_id>/<session_id>/<domain_id>/<user_name>/<divisi>/<new_session>/<task>/chat/completions
 *   We send fixed "none" placeholders for session_id/user_name/divisi and
 *   "false" for new_session; task is always "vllm-text-generation" (sending
 *   "none" here makes the gateway return its canned error).
 *
 * Request body (§1.2.2): { model, messages, temperature, max_completion_tokens,
 * service_id, tools?, tool_choice?, stream }.
 *
 * Response body:
 *   - Success (§1.3.2, streaming or not): standard OpenAI `choices[].message`
 *     (non-streaming) or `choices[].delta` (SSE) shape, with native
 *     `tool_calls`. `reasoning` (§1.3.2 — the model's thinking-mode
 *     chain-of-thought) is mapped to LanguageModelV3 `reasoning` content
 *     parts, ahead of the real answer, both non-streaming and as
 *     `reasoning-start`/`reasoning-delta`/`reasoning-end` stream parts closed
 *     out the moment real `content` starts arriving. Streaming responses
 *     decode as `text/event-stream`; `application/json` from a `stream: true`
 *     request means the gateway rejected the request before generating (see
 *     below).
 *   - Business-logic failure (§1.4): `{ error_schema: { error_code,
 *     error_message }, output_schema: { err_debug, result: { answer } } }`,
 *     always a plain JSON body (never SSE) even when `stream: true` was sent,
 *     because GAIA validates the request before it starts generating.
 *
 * Error scenario handling (§1.4 DPA-1xx table), see `mapErrorEnvelope`:
 *   - DPA-111 (success), DPA-120 (PII flagged, answer still returned),
 *     DPA-129 (recommendation-generation failed, answer still returned) are
 *     not treated as fatal — they carry a real answer in `result.answer`.
 *   - DPA-115 (internal bug/syntax error) and DPA-117 (OCP connection
 *     timeout) are transient — surfaced as retryable APICallErrors so the
 *     existing session-level retry policy (session/retry.ts) backs off and
 *     re-sends automatically.
 *   - DPA-126 (prompt exceeds limit) and DPA-124 (generic engine error) whose
 *     `err_debug` names a context-length limit are both converted to a 413
 *     APICallError so the session auto-compacts. Other DPA-124s (e.g. a
 *     generic engine 500) surface as "GAIA Error: 500 Internal Server Error"
 *     without compacting.
 *   - Every other DPA code is non-retryable (isRetryable: false, no >=500
 *     statusCode) and surfaces the localized "Answer to User" text from
 *     `output_schema.result.answer` (falling back to the English error
 *     message) so it is shown once instead of retried indefinitely
 *     (retry.ts has no max-attempt cap and retries on `isRetryable ||
 *     statusCode >= 500`).
 *   - A genuine per-request timeout (AbortSignal.timeout(this.timeoutMs)
 *     firing) and raw HTTP errors are handled the same way as before: only
 *     the timeout is retryable.
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
  LanguageModelV3Usage,
} from "@ai-sdk/provider"
import { mkdirSync } from "node:fs"
import { homedir } from "node:os"
import * as Log from "../util/log"
import * as Network from "../util/network"

const log = Log.create({ service: "merlin" })

// ── Constants ─────────────────────────────────────────────────────────────────

const MERLIN_ORIGIN = "https://gaia-gateway-multimodal-uat.apps.ocpuatgra.dti.co.id"
const CLIENT_ID = "MAGEDEV"
const DEFAULT_MODEL = "/app/models/text-2"
const DEBUG_PAYLOADS = process.env["MAGE_GAIA_DEBUG_MODE"] === "1" || process.env["MAGE_GAIA_DEBUG_MODE"]?.toLowerCase() === "true"

// ── GAIA wire types ──────────────────────────────────────────────────────────

interface OpenAIToolCall {
  id: string
  type: "function"
  function: { name: string; arguments: string }
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
}

interface ChatCompletionsRequest {
  model: string
  messages: OpenAIMessage[]
  temperature: number
  max_completion_tokens: number
  service_id?: string
  tools?: Array<{ type: "function"; function: { name: string; description?: string; parameters: unknown } }>
  tool_choice?: "auto"
  stream: boolean
  stream_options?: { include_usage: true }
  priority?: number,
  chat_template_kwargs?: { enable_thinking: boolean }
}

interface ChatCompletionsUsage {
  completion_tokens: number
  prompt_tokens: number
  total_tokens: number
}

/** Non-streaming success response (§1.3.2). */
interface ChatCompletionsResponse {
  choices?: Array<{
    finish_reason: string | null
    message: {
      content: string | null
      /** Model thinking process, per §1.3.2 — Qwen's reasoning-mode chain-of-thought. */
      reasoning?: string | null
      role: string
      tool_calls?: OpenAIToolCall[]
    }
  }>
  usage?: ChatCompletionsUsage
  // Present only on a business-logic failure (§1.4) — never alongside a real `choices` answer.
  error_schema?: { error_code: string; error_message?: { english?: string; indonesian?: string } }
  output_schema?: { err_debug?: string; result?: { answer?: string } }
}

/** One SSE `data:` chunk (OpenAI streaming shape). */
interface ChatCompletionsStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string | null
      /** Streamed reasoning-mode chain-of-thought, mirroring `content` (vLLM reasoning-parser convention). */
      reasoning?: string | null
      tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>
    }
    finish_reason?: string | null
  }>
  usage?: ChatCompletionsUsage
}

// ── URL / request builders ────────────────────────────────────────────────────

/** Build the positional-path /chat/completions URL (Techdoc §1.1.3). */
function buildChatCompletionsUrl(origin: string, clientId: string, domainId: string): string {
  const segments = [clientId, "none", domainId || "none", "none", "none", "false", "vllm-text-generation", "chat", "completions"]
  return `${origin.replace(/\/+$/, "")}/${segments.join("/")}`
}

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

/** Convert the AI SDK's LanguageModelV3Prompt into an OpenAI `messages` array. */
function toOpenAIMessages(prompt: LanguageModelV3CallOptions["prompt"]): OpenAIMessage[] {
  const messages: OpenAIMessage[] = []

  for (const msg of prompt) {
    if (msg.role === "system") {
      messages.push({ role: "system", content: msg.content })
    } else if (msg.role === "user") {
      const text = msg.content
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n")
      messages.push({ role: "user", content: text })
    } else if (msg.role === "assistant") {
      const text = msg.content
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n")
      const toolCalls: OpenAIToolCall[] = msg.content
        .filter((p) => p.type === "tool-call")
        .map((tc) => ({
          id: tc.toolCallId,
          type: "function" as const,
          function: { name: tc.toolName, arguments: typeof tc.input === "string" ? tc.input : JSON.stringify(tc.input) },
        }))
      messages.push({ role: "assistant", content: text, ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}) })
    } else if (msg.role === "tool") {
      for (const part of msg.content) {
        if (part.type !== "tool-result") continue
        messages.push({ role: "tool", tool_call_id: part.toolCallId, content: outputToString(part.output) })
      }
    }
  }

  return messages
}

/** Convert LanguageModelV3 function tools into OpenAI `tools` schema entries. */
function toOpenAITools(
  tools: LanguageModelV3CallOptions["tools"],
): NonNullable<ChatCompletionsRequest["tools"]> {
  if (!tools) return []
  return tools
    .filter((t): t is LanguageModelV3FunctionTool => t.type === "function")
    .map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.inputSchema } }))
}

/** Rough token estimate (chars/4) used as a fallback when GAIA doesn't report usage. */
function estimatePromptTokens(messages: OpenAIMessage[]): number {
  return Math.ceil(JSON.stringify(messages).length / 4)
}

/**
 * `outputTokenEstimate` (chars/4 of the streamed text, default 0) kicks in
 * when GAIA's own `completion_tokens` is absent or zero. Without it every
 * streaming turn can report outputTokens.total === 0,
 * which fails the TUI's "has this turn produced output" gate (sidebar/prompt/
 * subagent context indicators all skip messages with tokens.output === 0) and
 * the context-window display silently shows 0 tokens / 0% forever.
 */
function toUnifiedUsage(
  usage: ChatCompletionsUsage | undefined,
  promptTokenEstimate: number,
  outputTokenEstimate = 0,
): LanguageModelV3Usage {
  const inputTotal = usage?.prompt_tokens && usage.prompt_tokens > 0 ? usage.prompt_tokens : promptTokenEstimate
  const outputTotal = usage?.completion_tokens && usage.completion_tokens > 0 ? usage.completion_tokens : outputTokenEstimate
  return {
    inputTokens: { total: inputTotal, noCache: inputTotal, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: outputTotal, text: undefined, reasoning: undefined },
    raw: usage ? { ...usage } : undefined,
  }
}

function mapFinishReason(raw: string | null | undefined, hasToolCalls: boolean): LanguageModelV3GenerateResult["finishReason"] {
  if (hasToolCalls || raw === "tool_calls") return { unified: "tool-calls", raw: raw ?? "tool_calls" }
  if (raw === "length") return { unified: "length", raw }
  if (raw === "content_filter") return { unified: "content-filter", raw }
  return { unified: "stop", raw: raw ?? "stop" }
}

// ── Error scenario mapping (Techdoc §1.4) ────────────────────────────────────

/**
 * Map a GAIA `error_schema` envelope to the right failure behavior. Returns
 * `null` for codes that are not fatal (DPA-111 success, DPA-120 PII-flagged,
 * DPA-129 recommendation-failed — all still carry a real answer).
 */
function mapErrorEnvelope(data: ChatCompletionsResponse, url: string, promptTokenEstimate: number): Error | null {
  const code = data.error_schema?.error_code
  if (!code) return null
  if (code === "DPA-111" || code === "DPA-120" || code === "DPA-129") return null

  const englishMsg = data.error_schema?.error_message?.english
  const localizedAnswer = data.output_schema?.result?.answer
  const errDebug = data.output_schema?.err_debug ?? ""
  const userMessage = localizedAnswer || englishMsg || code

  // DPA-115 / DPA-117: transient gateway/OCP hiccups — always retried, same
  // treatment as a request timeout, instead of a one-shot error for a hiccup
  // that a re-send would clear.
  if (code === "DPA-115" || code === "DPA-117") {
    log.warn("transient_gateway_error", { error_code: code })
    return new APICallError({
      message: `GAIA transient error ${code}: ${englishMsg ?? "gateway error"}`,
      url,
      requestBodyValues: {},
      statusCode: 503,
      responseBody: userMessage,
      isRetryable: true,
    })
  }

  // DPA-126: prompt (+persona/history) exceeds the gateway's length limit —
  // always a context overflow.
  if (code === "DPA-126") {
    return new APICallError({
      message: `context_length_exceeded: GAIA DPA-126 (estimated ~${promptTokenEstimate} tokens): ${englishMsg ?? "prompt exceeds limit"}`,
      url,
      requestBodyValues: {},
      statusCode: 413,
      responseBody: errDebug || userMessage,
      isRetryable: false,
    })
  }

  // DPA-124 is GAIA's catch-all engine failure. Only convert to a
  // context-overflow APICallError when err_debug names a context-length
  // limit; other DPA-124s (e.g. a generic engine 500) must not trigger
  // auto-compaction.
  if (code === "DPA-124") {
    log.error("DPA-124 err_debug", { error_code: code, err_debug: errDebug || "(none)" })
    if (errDebug.toLowerCase().includes("context length")) {
      return new APICallError({
        message: `context_length_exceeded: GAIA DPA-124 (estimated ~${promptTokenEstimate} tokens): ${englishMsg ?? "engine error"}`,
        url,
        requestBodyValues: {},
        statusCode: 413,
        responseBody: errDebug,
        isRetryable: false,
      })
    }
    return new Error(errDebug ? `GAIA Error: 500 Internal Server Error\n${errDebug}` : "GAIA Error: 500 Internal Server Error")
  }

  // Every remaining DPA code (112,113,114,116,118,119,121,122,123,125,127,128,130):
  // non-retryable, surfaced once with the localized "Answer to User" text.
  log.warn("gaia_error", { error_code: code })
  return new APICallError({
    message: `GAIA ${code}: ${userMessage}`,
    url,
    requestBodyValues: {},
    responseBody: errDebug || userMessage,
    isRetryable: false,
  })
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

// ── Model implementation ──────────────────────────────────────────────────────

class MerlinLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = "v3" as const
  readonly provider = "merlin"
  readonly modelId = "default"
  readonly supportedUrls = {}

  constructor(
    private readonly endpoint: string,
    private readonly clientId: string,
    private readonly username: string,
    private readonly timeoutMs: number,
    /** Whether to send service_id at all (MAGE_USE_SERVICE_ID can disable it). */
    private readonly sendServiceId: boolean,
    /** Optional model override sent as `model` (from MAGE_MODEL_NAME). */
    private readonly modelName: string | undefined,
  ) {}

  private get url(): string {
    return buildChatCompletionsUrl(this.endpoint, this.clientId, this.username)
  }

  /**
   * POST the OpenAI-shaped chat completion request. Handles the genuine
   * per-request timeout, connection-class failures, and raw HTTP errors the
   * same way regardless of streaming — only the response body's shape
   * (SSE vs JSON, success vs error_schema) differs afterward.
   */
  private async postChat(
    options: LanguageModelV3CallOptions,
    stream: boolean,
  ): Promise<{ response: Response; promptTokenEstimate: number; payloadDir: string }> {
    const url = this.url
    const messages = toOpenAIMessages(options.prompt)
    const tools = toOpenAITools(options.tools)
    const promptTokenEstimate = estimatePromptTokens(messages)

    const body: ChatCompletionsRequest = {
      model: this.modelName ?? DEFAULT_MODEL,
      messages,
      // Qwen3.6-27B (dense) official thinking-mode coding preset: temperature
      // 0.6 for low-variance determinism without degrading into repetition
      // (unlike temperature 0 greedy decoding). Ref: huggingface.co/Qwen/Qwen3.6-27B.
      temperature: 0.3,
      max_completion_tokens: 128000,
      priority: 1,
      ...(this.sendServiceId ? { service_id: resolveServiceId(options) } : {}),
      ...(tools.length > 0 ? { tools, tool_choice: "auto" as const } : {}),
      stream: false,
      // stream_options: { include_usage: true },
    }

    const { messages: _messages, ...loggableBody } = body
    log.info("request", { ...loggableBody, message_count: messages.length, prompt_token_estimate: promptTokenEstimate })
    log.debug("request_messages", { messages })

    const exchangeDir = `${homedir()}/.mage/data/payloads/${new Date().toISOString().replace(/[:]/g, "-")}`
    if (DEBUG_PAYLOADS) {
      mkdirSync(exchangeDir, { recursive: true })
      Bun.write(`${exchangeDir}/request.json`, JSON.stringify(body, null, 2))
    }

    // Bound to its own name (rather than inlined) so the catch block can tell
    // a genuine per-request timeout apart from any other fetch failure —
    // see the retry-scoping note below.
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs)
    const signals: AbortSignal[] = [timeoutSignal]
    if (options.abortSignal) signals.push(options.abortSignal)

    // Disable TLS verification for the internal self-signed GAIA endpoint. Bun
    // reads the `tls` option; Node (desktop sidecar) needs an undici dispatcher.
    let response: Response
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.any(signals),
        ...(await Network.insecureFetchInit()),
      } as RequestInit)
    } catch (error) {
      // A user-initiated cancel must propagate untouched and never be retried.
      if (options.abortSignal?.aborted) throw error
      // Only a genuine per-request timeout (AbortSignal.timeout(this.timeoutMs)
      // firing) is treated as transient and retried — surfaced as a retryable
      // APICallError so the session-level retry policy (session/retry.ts) backs
      // off and re-sends automatically.
      if (timeoutSignal.aborted) {
        log.warn("request_timeout", { timeoutMs: this.timeoutMs })
        throw new APICallError({
          message: `GAIA request timed out after ${this.timeoutMs}ms`,
          url,
          requestBodyValues: {},
          statusCode: 504,
          isRetryable: true,
        })
      }
      // Any other fetch failure (connection refused, DNS, TLS, socket reset) is
      // NOT a timeout — do not retry. isRetryable is false and statusCode is
      // omitted (undefined) so it can't be picked up by retry.ts's `status >=
      // 500` fallback, which retries regardless of isRetryable.
      //
      // Connection-class failures (e.g. GAIA unreachable off-VPN) get a clear,
      // runtime-agnostic message instead of Bun's confusing "Was there a typo
      // in the url or port?" (which fires on plain DNS failure, not just typos).
      const surfaced = Network.isConnectionFailure(error)
        ? new Error("Unable to connect. Is the computer able to access the url?")
        : error
      log.warn("request_failed", { error: String(surfaced) })
      throw new APICallError({
        message: `GAIA request failed: ${String(surfaced)}`,
        url,
        requestBodyValues: {},
        isRetryable: false,
      })
    }

    if (!response.ok) {
      const responseText = await response.text().catch(() => "")
      // Only genuine timeouts are retried (see the fetch catch-block above), so
      // raw HTTP 5xx error responses (connection drops, OCP hiccups at the
      // transport level) are never retried here. statusCode is omitted for
      // >=500 so it can't fall through retry.ts's `status >= 500` fallback;
      // a real 4xx status (e.g. 413) is preserved so downstream classification
      // still works. Note this is distinct from DPA-1xx codes, which arrive as
      // a 200 response with an error_schema — see mapErrorEnvelope.
      throw new APICallError({
        message: `GAIA HTTP ${response.status} ${response.statusText}: ${responseText}`,
        url,
        requestBodyValues: {},
        statusCode: response.status < 500 ? response.status : undefined,
        responseBody: responseText,
        isRetryable: false,
      })
    }

    return { response, promptTokenEstimate, payloadDir: exchangeDir }
  }

  async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
    const { response, promptTokenEstimate, payloadDir } = await this.postChat(options, false)
    const data = (await response.json()) as ChatCompletionsResponse
    if (DEBUG_PAYLOADS) Bun.write(`${payloadDir}/response.json`, JSON.stringify(data, null, 2))

    if (data.error_schema) {
      const mapped = mapErrorEnvelope(data, this.url, promptTokenEstimate)
      if (mapped) throw mapped
    }

    const choice = data.choices?.[0]
    if (!choice?.message) throw new Error("GAIA returned no choices in chat completion response")

    const toolCalls = choice.message.tool_calls ?? []
    const content: LanguageModelV3GenerateResult["content"] = []
    if (choice.message.reasoning) content.push({ type: "reasoning", text: choice.message.reasoning })
    if (choice.message.content) content.push({ type: "text", text: choice.message.content })
    for (const tc of toolCalls) {
      content.push({ type: "tool-call", toolCallId: tc.id, toolName: tc.function.name, input: tc.function.arguments })
    }

    return {
      content,
      finishReason: mapFinishReason(choice.finish_reason, toolCalls.length > 0),
      usage: toUnifiedUsage(data.usage, promptTokenEstimate),
      warnings: [],
    }
  }

  async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
    const { response, promptTokenEstimate, payloadDir } = await this.postChat(options, true)
    const url = this.url
    const contentType = response.headers.get("content-type") ?? ""

    // The gateway validates the request before it starts generating: a
    // business-logic failure (§1.4 DPA-1xx) comes back as one JSON body even
    // though stream:true was requested, instead of an SSE text/event-stream
    // body. Handle that as a one-shot (non-streaming) result.
    if (contentType.includes("application/json")) {
      const data = (await response.json()) as ChatCompletionsResponse
      if (DEBUG_PAYLOADS) Bun.write(`${payloadDir}/response.json`, JSON.stringify(data, null, 2))
      log.info("response", {
        has_error_schema: data.error_schema != null,
        error_code: data.error_schema?.error_code,
        has_output_schema: data.output_schema != null,
        output_answer: data.output_schema?.result?.answer?.slice(0, 200),
        has_choices: data.choices != null,
        choice_count: data.choices?.length ?? 0,
        choice_content: data.choices?.[0]?.message?.content?.slice(0, 200),
        choice_role: data.choices?.[0]?.message?.role,
        choice_tool_calls: data.choices?.[0]?.message?.tool_calls?.length ?? 0,
        usage: data.usage,
      })
      if (data.error_schema) {
        const mapped = mapErrorEnvelope(data, url, promptTokenEstimate)
        if (mapped) throw mapped
      }

      const choice = data.choices?.[0]
      if (!choice?.message) throw new Error("GAIA returned no choices in chat completion response")

      // GAIA returns canned error messages as choices[0].message.content
      // when it can't process the request. Signal: prompt_tokens === 0 means
      // GAIA didn't even count the input tokens — the content is an error.
      if (data.usage?.prompt_tokens === 0 && choice.message.content) {
        throw new Error(choice.message.content)
      }

      const toolCalls = choice.message.tool_calls ?? []

      const parts: LanguageModelV3StreamPart[] = [{ type: "stream-start", warnings: [] }]
      if (choice.message.reasoning) {
        parts.push({ type: "reasoning-start", id: "merlin-reasoning-0" })
        parts.push({ type: "reasoning-delta", id: "merlin-reasoning-0", delta: choice.message.reasoning })
        parts.push({ type: "reasoning-end", id: "merlin-reasoning-0" })
      }
      if (choice.message.content) {
        parts.push({ type: "text-start", id: "merlin-0" })
        parts.push({ type: "text-delta", id: "merlin-0", delta: choice.message.content })
        parts.push({ type: "text-end", id: "merlin-0" })
      }
      for (const tc of toolCalls) {
        parts.push({ type: "tool-input-start", id: tc.id, toolName: tc.function.name })
        parts.push({ type: "tool-input-delta", id: tc.id, delta: tc.function.arguments })
        parts.push({ type: "tool-input-end", id: tc.id })
        parts.push({ type: "tool-call", toolCallId: tc.id, toolName: tc.function.name, input: tc.function.arguments })
      }
      // Same chars/4 fallback as the real SSE path (see toUnifiedUsage) — this
      // branch only fires when GAIA answers a `stream: true` request with a
      // plain JSON body instead of SSE, so `data.usage` may be just as absent.
      const outputChars =
        (choice.message.content?.length ?? 0) +
        (choice.message.reasoning?.length ?? 0) +
        toolCalls.reduce((sum, tc) => sum + tc.function.arguments.length, 0)
      parts.push({
        type: "finish",
        finishReason: mapFinishReason(choice.finish_reason, toolCalls.length > 0),
        usage: toUnifiedUsage(data.usage, promptTokenEstimate, Math.ceil(outputChars / 4)),
      })

      return {
        stream: new ReadableStream({
          start(controller) {
            for (const part of parts) controller.enqueue(part)
            controller.close()
          },
        }),
      }
    }

    if (!response.body) throw new Error("GAIA streaming response had no body")

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const rawSseLines: string[] = []

    const stream = new ReadableStream<LanguageModelV3StreamPart>({
      async start(controller) {
        controller.enqueue({ type: "stream-start", warnings: [] })

        let textId: string | null = null
        let reasoningId: string | null = null
        let reasoningClosed = false
        let rawFinish: string | null = null
        let usage: ChatCompletionsUsage | undefined
        // chars/4 fallback for outputTokens when GAIA sends no usage object (see toUnifiedUsage).
        let outputChars = 0
        const toolCalls = new Map<number, { id: string; name: string; args: string }>()
        let buffer = ""

        // Parse one SSE line. GAIA (like OpenAI) sends `data: {...}` lines
        // separated by blank lines, terminated by `data: [DONE]`.
        const handleLine = (line: string) => {
          const trimmed = line.trim()
          rawSseLines.push(trimmed)
          if (!trimmed.startsWith("data:")) return
          const payload = trimmed.slice("data:".length).trim()
          if (!payload || payload === "[DONE]") return

          let chunk: ChatCompletionsStreamChunk
          try {
            chunk = JSON.parse(payload)
          } catch {
            log.warn("sse_parse_error", { payload: payload.slice(0, 200) })
            return
          }

          const choice = chunk.choices?.[0]
          if (choice?.delta?.reasoning) {
            if (!reasoningId) {
              reasoningId = "merlin-reasoning-0"
              controller.enqueue({ type: "reasoning-start", id: reasoningId })
            }
            controller.enqueue({ type: "reasoning-delta", id: reasoningId, delta: choice.delta.reasoning })
            outputChars += choice.delta.reasoning.length
          }

          if (choice?.delta?.content) {
            // Reasoning always precedes the real answer — close it out the moment
            // real content starts arriving, so reasoning-end isn't deferred to the
            // very end of the stream (which would delay the UI collapsing the
            // "thinking" block until the whole answer had already streamed in).
            if (reasoningId && !reasoningClosed) {
              controller.enqueue({ type: "reasoning-end", id: reasoningId })
              reasoningClosed = true
            }
            if (!textId) {
              textId = "merlin-0"
              controller.enqueue({ type: "text-start", id: textId })
            }
            controller.enqueue({ type: "text-delta", id: textId, delta: choice.delta.content })
            outputChars += choice.delta.content.length
          }

          for (const tcDelta of choice?.delta?.tool_calls ?? []) {
            const idx = tcDelta.index ?? 0
            const existing = toolCalls.get(idx)
            if (!existing) {
              toolCalls.set(idx, {
                id: tcDelta.id ?? `merlin-tc-${idx}`,
                name: tcDelta.function?.name ?? "",
                args: tcDelta.function?.arguments ?? "",
              })
            } else {
              if (tcDelta.function?.name) existing.name = tcDelta.function.name
              if (tcDelta.function?.arguments) existing.args += tcDelta.function.arguments
            }
          }

          if (choice?.finish_reason) rawFinish = choice.finish_reason
          if (chunk.usage) usage = chunk.usage
        }

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split("\n")
            buffer = lines.pop() ?? "" // keep the trailing partial line for the next chunk
            for (const line of lines) handleLine(line)
          }
          if (buffer) handleLine(buffer)
        } catch (error) {
          controller.error(error)
          return
        }

        if (reasoningId && !reasoningClosed) controller.enqueue({ type: "reasoning-end", id: reasoningId })
        if (textId) controller.enqueue({ type: "text-end", id: textId })

        for (const tc of toolCalls.values()) {
          controller.enqueue({ type: "tool-input-start", id: tc.id, toolName: tc.name })
          controller.enqueue({ type: "tool-input-delta", id: tc.id, delta: tc.args })
          controller.enqueue({ type: "tool-input-end", id: tc.id })
          controller.enqueue({ type: "tool-call", toolCallId: tc.id, toolName: tc.name, input: tc.args })
          outputChars += tc.args.length
        }

        controller.enqueue({
          type: "finish",
          finishReason: mapFinishReason(rawFinish, toolCalls.size > 0),
          usage: toUnifiedUsage(usage, promptTokenEstimate, Math.ceil(outputChars / 4)),
        })
        if (DEBUG_PAYLOADS) Bun.write(`${payloadDir}/response.sse.txt`, rawSseLines.join("\n"))
        controller.close()
      },
      cancel(reason) {
        reader.cancel(reason).catch(() => {})
      },
    })

    return { stream }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export interface MerlinProviderOptions {
  /** Override GAIA gateway origin (defaults to the hardcoded UAT origin) */
  baseURL?: string
  /** User's domain username sent as the domain_id URL segment in every request */
  username?: string
  /** Request timeout in milliseconds (defaults to 600 000 ms) */
  timeoutMs?: number
}

export interface MerlinProvider {
  languageModel(modelId: string): LanguageModelV3
}

/** True when `key` is set to a recognized falsy string ("false" or "0"). */
function isEnvFalsy(key: string): boolean {
  const value = process.env[key]?.toLowerCase()
  return value === "false" || value === "0"
}

/**
 * Create a Merlin provider instance.
 * All options are optional — origin, client_id, and model are hardcoded
 * for the BCA GAIA gateway and require no external configuration.
 *
 * Optionally set `username` to populate the domain_id URL segment for gateway
 * user tracking. Can be configured via provider.merlin.options.username
 * in mage.jsonc if needed.
 *
 * Four env vars intercept/augment the request at runtime, for deployments
 * pointed at a different GAIA gateway or tenant:
 *   - MAGE_GAIA_ENDPOINT: overrides the gateway origin.
 *   - MAGE_CLIENT_ID: overrides the client_id URL segment.
 *   - MAGE_USE_SERVICE_ID: when set to a falsy value ("false"/"0"), omits
 *     service_id from the request entirely (some gateways reject an
 *     unrecognized service_id outright).
 *   - MAGE_MODEL_NAME: when set, overrides the `model` field (defaults to
 *     the vllm-backed text model).
 */
export function createMerlin(options: MerlinProviderOptions = {}): MerlinProvider {
  const {
    baseURL = MERLIN_ORIGIN,
    username = "",
    timeoutMs = 600_000,
  } = options
  // MAGE_GAIA_ENDPOINT/MAGE_CLIENT_ID intercept even an explicitly-passed
  // baseURL/CLIENT_ID — env always wins over the provider.merlin.options config.
  const endpoint = process.env["MAGE_GAIA_ENDPOINT"] || baseURL
  const clientId = process.env["MAGE_CLIENT_ID"] || CLIENT_ID
  const sendServiceId = !isEnvFalsy("MAGE_USE_SERVICE_ID")
  const modelName = process.env["MAGE_MODEL_NAME"] || undefined

  return {
    languageModel(_modelId: string): LanguageModelV3 {
      return new MerlinLanguageModel(endpoint, clientId, username, timeoutMs, sendServiceId, modelName)
    },
  }
}
