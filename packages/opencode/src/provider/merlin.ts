/**
 * Cloud Merlin provider adapter for the Vercel AI SDK (LanguageModelV3).
 *
 * The Merlin API is a proprietary BCA endpoint that is NOT OpenAI-compatible.
 * This adapter translates OpenCode's standard LanguageModelV3 calls into
 * Merlin's custom request/response envelope.
 *
 * Request shape (Merlin):
 *   POST <endpoint>
 *   { client_id, domain_id, service_id,
 *     config: { temperature, max_token, recommendation },
 *     new_session: 'True',
 *     prompt: OpenAI-format message array | string,
 *     file: '' }
 *
 * Response shape (Merlin):
 *   { output_schema?: { result?: { answer, token_input, token_output } }, error_schema? }
 *
 * No true streaming — we perform a full request then emit a single text-delta.
 *
 * Tool calling strategy:
 *   Merlin has no native function-calling API, so we use prompt-based tool calling:
 *   1. Inject tool schemas as XML into the system prompt.
 *   2. Instruct the model to emit <tool_call> XML blocks when it wants to use a tool.
 *   3. Parse the model's text response for those blocks.
 *   4. Return LanguageModelV3 tool-call content parts so the AI SDK agentic loop
 *      can execute the real tools and send results back.
 */

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

const MERLIN_ENDPOINT =
  "https://gaia-gateway-multimodal-uat.apps.ocpuatgra.dti.co.id/llm-gateway/multimodal"
const CLIENT_ID = "MAGEDEV"

// ── Merlin API types ──────────────────────────────────────────────────────────

interface MerlinRequest {
  client_id: string
  domain_id: string
  service_id: string
  config: {
    temperature: number
    max_token: string
    recommendation: string
  }
  new_session: string
  prompt: string
  /**
   * Attached file(s) as base64. Per the GAIA multimodal docs this may be a
   * single base64 string or an array of base64 strings. We always send an
   * array (empty when there are no attachments) for a consistent shape.
   */
  file: string | string[]
}

interface MerlinResponse {
  error_schema?: {
    error_code: string
    error_message?: { english?: string }
  }
  output_schema?: {
    result?: {
      answer: string
      token_input?: number
      token_output?: number
    }
    status?: string
    err_debug?: string
  }
  response?: string
  error?: string
}

// ── Tool calling helpers ──────────────────────────────────────────────────────

/**
 * Render tool schemas into the system prompt so the model knows which tools
 * are available and how to call them.
 *
 * Uses Qwen3's native JSON-in-tag format which the model produces reliably
 * without needing extra fine-tuning on a custom XML schema.
 */
function renderToolsBlock(options: LanguageModelV3CallOptions): string {
  if (!options.tools || options.tools.length === 0) return ""

  const toolDefs = options.tools
    .filter((t): t is LanguageModelV3FunctionTool => t.type === "function")
    .map((t) => JSON.stringify({ name: t.name, description: t.description ?? "", parameters: t.inputSchema }))
    .join("\n")

  if (!toolDefs) return ""

  return `# Tools

You have access to the following tools. Call them by outputting a JSON object inside <tool_call> tags.

${toolDefs}

When you need to use a tool output EXACTLY this format — no other text on the same line:
<tool_call>
{"name": "<tool_name>", "arguments": {<json_args>}}
</tool_call>

Rules:
- Tool names are CASE-SENSITIVE. Copy them exactly as listed above (e.g. "Edit" not "edit", "Read" not "read", "Bash" not "bash").
- ALWAYS close every <tool_call> with </tool_call> on its own line. Never leave a <tool_call> tag open.
- Output valid JSON inside the tag — no comments, no trailing commas, no markdown code fences.
- You MAY call multiple tools in sequence. Call one at a time and wait for the result.
- After ALL tool results are returned, synthesise a final answer in plain text.
- If you do NOT need a tool, reply in plain text only — no <tool_call> tags.`
}

type ParsedCall = { name: string; callId: string; args: Record<string, unknown> }

/** Extract the first balanced-brace JSON object substring, ignoring braces inside strings. */
function extractBalancedJson(s: string): string | null {
  const start = s.indexOf("{")
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (escape) { escape = false; continue }
    if (c === "\\") { escape = true; continue }
    if (c === '"') { inString = !inString; continue }
    if (inString) continue
    if (c === "{") depth++
    else if (c === "}") {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

/** Parse a single tool_call body into {name, args}, or null if unrecognized. */
function parseToolCallBody(body: string): { name: string; args: Record<string, unknown> } | null {
  // Strip surrounding markdown code fences if the model wrapped its JSON in them.
  const stripped = body.replace(/^```(?:json|xml)?\s*/i, "").replace(/\s*```\s*$/, "").trim()

  // Format 1: JSON object — strict parse first, then balanced-brace fallback for
  // cases where the model appended trailing text after the closing brace.
  if (stripped.startsWith("{")) {
    try {
      const parsed = JSON.parse(stripped) as { name?: string; arguments?: Record<string, unknown> }
      if (parsed.name) return { name: parsed.name, args: parsed.arguments ?? {} }
    } catch { /* try balanced extraction */ }
    const extracted = extractBalancedJson(stripped)
    if (extracted && extracted !== stripped) {
      try {
        const parsed = JSON.parse(extracted) as { name?: string; arguments?: Record<string, unknown> }
        if (parsed.name) return { name: parsed.name, args: parsed.arguments ?? {} }
      } catch { /* fall through */ }
    }
  }

  // Format 2: XML sub-elements
  const nameMatch = /<name>([\s\S]*?)<\/name>/.exec(stripped)
  if (nameMatch) {
    const argsMatch = /<arguments>([\s\S]*?)<\/arguments>/.exec(stripped)
    let args: Record<string, unknown> = {}
    if (argsMatch) {
      try { args = JSON.parse(argsMatch[1].trim()) } catch { /* ignore */ }
    }
    return { name: nameMatch[1].trim(), args }
  }
  return null
}

/**
 * Parse tool calls from the model response.
 * Handles formats Qwen3.5 may emit:
 *   1. Closed JSON:   <tool_call>{"name":"x","arguments":{...}}</tool_call>
 *   2. Closed XML:    <tool_call><name>x</name><arguments>{...}</arguments></tool_call>
 *   3. Unclosed:      <tool_call>{"name":"x","arguments":{...}}    (model forgot the close tag)
 *   4. Bare line:     funcName({...})  or  funcName(key=val)
 *
 * Tool names are normalized against `availableTools` to recover from case drift —
 * e.g. when the model emits "edit" but the registered tool is "Edit".
 */
function parseToolCalls(
  text: string,
  availableTools?: LanguageModelV3CallOptions["tools"],
): ParsedCall[] {
  const results: ParsedCall[] = []
  let idx = 0

  const nameMap = new Map<string, string>()
  if (availableTools) {
    for (const t of availableTools) {
      if (t.type === "function") nameMap.set(t.name.toLowerCase(), t.name)
    }
  }
  const normalizeName = (n: string) => nameMap.get(n.toLowerCase()) ?? n

  // Closed AND unclosed <tool_call> blocks. The `(?:</tool_call>|$)` alternation
  // falls back to end-of-string when the model omits the closing tag.
  const tagRegex = /<tool_call>([\s\S]*?)(?:<\/tool_call>|$)/g
  let match: RegExpExecArray | null
  while ((match = tagRegex.exec(text)) !== null) {
    const body = match[1].trim()
    if (!body) continue
    const parsed = parseToolCallBody(body)
    if (parsed) {
      results.push({
        name: normalizeName(parsed.name),
        callId: `merlin-tc-${idx++}`,
        args: parsed.args,
      })
    }
  }

  // Fallback: bare funcName(...) lines. Only run when no tag-based calls were found,
  // and only accept names that match a registered tool — keeps prose like "use Edit()"
  // from being misread as a phantom call.
  if (results.length === 0) {
    const lineRegex = /^([a-zA-Z_][a-zA-Z0-9_]*)\(([\s\S]*?)\)\s*$/gm
    while ((match = lineRegex.exec(text)) !== null) {
      const name = match[1]
      if (nameMap.size > 0 && !nameMap.has(name.toLowerCase())) continue
      const rawArgs = match[2].trim()
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(rawArgs.startsWith("{") ? rawArgs : `{${rawArgs}}`)
      } catch {
        const kvRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*("[^"]*"|'[^']*'|[^,)]+)/g
        let kv: RegExpExecArray | null
        while ((kv = kvRegex.exec(rawArgs)) !== null) {
          const val = kv[2].trim().replace(/^["']|["']$/g, "")
          args[kv[1]] = val
        }
      }
      results.push({ name: normalizeName(name), callId: `merlin-tc-${idx++}`, args })
    }
  }

  return results
}

/** Strip closed, unclosed, and bare func-call traces so they don't leak to the user. */
function stripToolCalls(text: string): string {
  return text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "")  // closed blocks
    .replace(/<tool_call>[\s\S]*$/g, "")               // unclosed block to end-of-string
    .replace(/^[a-zA-Z_][a-zA-Z0-9_]*\([\s\S]*?\)\s*$/gm, "")  // bare func-call lines
    .trim()
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

// ── Prompt flattening ─────────────────────────────────────────────────────────

/** Flatten the standard prompt messages array into a single prompt string. */
function flattenPrompt(options: LanguageModelV3CallOptions): string {
  const parts: string[] = []

  for (const msg of options.prompt) {
    if (msg.role === "system") {
      parts.push(msg.content)
      parts.push("---")
    } else if (msg.role === "user") {
      const text = msg.content
        .filter((p) => p.type === "text")
        .map((p) => (p as { type: "text"; text: string }).text)
        .join("\n")
      parts.push(`User: ${text}`)
    } else if (msg.role === "assistant") {
      const textParts = msg.content.filter((p) => p.type === "text")
      const toolCalls = msg.content.filter((p) => p.type === "tool-call")

      if (textParts.length > 0) {
        const text = textParts.map((p) => (p as { type: "text"; text: string }).text).join("\n")
        parts.push(`Assistant: ${text}`)
      }

      for (const tc of toolCalls) {
        if (tc.type !== "tool-call") continue
        const inputJson = typeof tc.input === "string" ? tc.input : JSON.stringify(tc.input)
        let argsObj: unknown = {}
        try { argsObj = JSON.parse(inputJson.trim() || "{}") } catch { argsObj = inputJson }
        const callJson = JSON.stringify({ name: tc.toolName, arguments: argsObj })
        parts.push(`Assistant: <tool_call>\n${callJson}\n</tool_call>`)
      }
    } else if (msg.role === "tool") {
      const resultBlocks = msg.content
        .filter((p) => p.type === "tool-result")
        .map((p) => {
          if (p.type !== "tool-result") return ""
          return `<tool_result>\n  <name>${p.toolName}</name>\n  <result>${outputToString(p.output)}</result>\n</tool_result>`
        })
        .join("\n")
      if (resultBlocks) parts.push(`Tool Results:\n${resultBlocks}`)
    }
  }

  return parts.join("\n\n")
}

// ── File attachment extraction ─────────────────────────────────────────────────

/**
 * A LanguageModelV3 file content part. The AI SDK delivers user-uploaded
 * attachments here: a `data:<mime>;base64,…` URL from the web composer is
 * decoded by `convertToModelMessages` into a bare base64 string in `data`,
 * while binary attachments may arrive as a Uint8Array or, for un-downloaded
 * remote assets, a URL.
 */
type FilePart = {
  type: "file"
  mediaType: string
  filename?: string
  data: string | Uint8Array | ArrayBuffer | URL
}

/** Convert a single file part's data into a bare base64 string, or null if it can't be inlined. */
function filePartToBase64(data: FilePart["data"]): string | null {
  if (typeof data === "string") {
    // Already base64, or a data: URL we need to strip the prefix from.
    if (data.startsWith("data:")) {
      const comma = data.indexOf(",")
      return comma === -1 ? null : data.slice(comma + 1)
    }
    return data
  }
  if (data instanceof Uint8Array) return Buffer.from(data).toString("base64")
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data)).toString("base64")
  // A bare URL (e.g. an un-downloaded remote asset) can't be inlined as base64.
  return null
}

/**
 * Collect every uploaded attachment across the conversation as base64 strings,
 * to populate Merlin's `file` field. Walks user messages for file content parts
 * — the same parts the prompt composer produces from the file-picker / paste /
 * drag-drop flows in packages/app.
 */
function extractFiles(options: LanguageModelV3CallOptions): string[] {
  const files: string[] = []
  for (const msg of options.prompt) {
    if (msg.role !== "user") continue
    for (const part of msg.content) {
      if (part.type !== "file") continue
      const base64 = filePartToBase64((part as FilePart).data)
      if (base64) files.push(base64)
    }
  }
  return files
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
  ) {}

  private buildPrompt(options: LanguageModelV3CallOptions): string {
    const toolsBlock = renderToolsBlock(options)
    const conversation = flattenPrompt(options)
    return toolsBlock ? `${toolsBlock}\n\n${conversation}` : conversation
  }

  private async callMerlin(
    options: LanguageModelV3CallOptions,
  ): Promise<{ answer: string; inputTokens: number; outputTokens: number }> {
    const files = extractFiles(options)

    const body: MerlinRequest = {
      client_id: this.clientId,
      domain_id: this.username,
      service_id: resolveServiceId(options),
      config: {
        temperature: 0.2,
        max_token: "",
        recommendation: "False",
      },
      new_session: "True",
      prompt: this.buildPrompt(options),
      file: files,
    }

    const { prompt: _prompt, file: _file, ...loggableBody } = body
    log.info("request", {
      ...loggableBody,
      prompt_length: body.prompt.length,
      file_count: files.length,
      file_bytes: files.reduce((sum, f) => sum + f.length, 0),
    })
    log.info("request_prompt", { prompt: body.prompt })

    const signals: AbortSignal[] = [AbortSignal.timeout(this.timeoutMs)]
    if (options.abortSignal) signals.push(options.abortSignal)

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.any(signals),
      // Disable TLS verification for internal self-signed endpoints (Bun-specific)
      tls: { rejectUnauthorized: false },
    } as RequestInit)

    if (!response.ok) {
      throw new Error(`GAIA HTTP ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as MerlinResponse

    if (
      data.error_schema?.error_code &&
      data.error_schema.error_code !== "DPA-111" &&
      data.error_schema.error_code !== "DPA-120"
    ) {
      const msg = data.error_schema.error_message?.english ?? data.error_schema.error_code
      throw new Error(`GAIA error: ${msg}`)
    }

    const answer = data.output_schema?.result?.answer ?? data.response
    if (!answer) throw new Error("GAIA returned no answer in output_schema.result.answer")

    return {
      answer,
      inputTokens: data.output_schema?.result?.token_input ?? 0,
      outputTokens: data.output_schema?.result?.token_output ?? 0,
    }
  }

  async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
    const { answer, inputTokens, outputTokens } = await this.callMerlin(options)
    const toolCalls = parseToolCalls(answer, options.tools)
    if (toolCalls.length === 0 && /<tool_call>/i.test(answer)) {
      log.warn("tool_call_parse_miss", { answer })
    }

    const usage = {
      inputTokens: { total: inputTokens, noCache: inputTokens, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: outputTokens, text: undefined, reasoning: undefined },
    }

    if (toolCalls.length > 0) {
      const content: LanguageModelV3GenerateResult["content"] = toolCalls.map((tc) => ({
        type: "tool-call" as const,
        toolCallId: tc.callId,
        toolName: tc.name,
        // LanguageModelV3ToolCall.input must be a stringified JSON string
        input: JSON.stringify(tc.args),
      }))
      const textRemainder = stripToolCalls(answer)
      if (textRemainder) content.unshift({ type: "text", text: textRemainder })

      return {
        content,
        finishReason: { unified: "tool-calls", raw: "tool_calls" },
        usage,
        warnings: [],
      }
    }

    return {
      content: [{ type: "text", text: stripToolCalls(answer) }],
      finishReason: { unified: "stop", raw: "stop" },
      usage,
      warnings: [],
    }
  }

  async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
    const { answer, inputTokens, outputTokens } = await this.callMerlin(options)
    const toolCalls = parseToolCalls(answer, options.tools)
    if (toolCalls.length === 0 && /<tool_call>/i.test(answer)) {
      log.warn("tool_call_parse_miss", { answer })
    }

    const usage = {
      inputTokens: { total: inputTokens, noCache: inputTokens, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: outputTokens, text: undefined, reasoning: undefined },
    }

    const parts: LanguageModelV3StreamPart[] = [{ type: "stream-start", warnings: [] }]

    if (toolCalls.length > 0) {
      const textRemainder = stripToolCalls(answer)
      if (textRemainder) {
        const textId = "merlin-text"
        parts.push({ type: "text-start", id: textId })
        parts.push({ type: "text-delta", id: textId, delta: textRemainder })
        parts.push({ type: "text-end", id: textId })
      }

      for (const tc of toolCalls) {
        const argsJson = JSON.stringify(tc.args)
        // Streaming UI parts (progressive display in the TUI)
        parts.push({ type: "tool-input-start", id: tc.callId, toolName: tc.name })
        parts.push({ type: "tool-input-delta", id: tc.callId, delta: argsJson })
        parts.push({ type: "tool-input-end", id: tc.callId })
        // The "tool-call" part is what actually triggers execute() in the AI SDK's
        // runToolsTransformation pipeline. Without it the AI SDK never calls execute()
        // and no "tool-result" is produced — causing every tool to abort during cleanup.
        parts.push({ type: "tool-call", toolCallId: tc.callId, toolName: tc.name, input: argsJson })
      }

      parts.push({ type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage })
    } else {
      const textId = "merlin-0"
      parts.push({ type: "text-start", id: textId })
      parts.push({ type: "text-delta", id: textId, delta: stripToolCalls(answer) })
      parts.push({ type: "text-end", id: textId })
      parts.push({ type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage })
    }

    const stream = new ReadableStream<LanguageModelV3StreamPart>({
      start(controller) {
        for (const part of parts) controller.enqueue(part)
        controller.close()
      },
    })

    return { stream }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export interface MerlinProviderOptions {
  /** Override Merlin API endpoint URL (defaults to the hardcoded GAIA endpoint) */
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
 * All options are optional — endpoint, client_id, and model are hardcoded
 * for the BCA GAIA gateway and require no external configuration.
 *
 * Optionally set `username` to populate the domain_id field for gateway
 * user tracking. Can be configured via provider.merlin.options.username
 * in mage.jsonc if needed.
 */
export function createMerlin(options: MerlinProviderOptions = {}): MerlinProvider {
  const {
    baseURL = MERLIN_ENDPOINT,
    username = "",
    timeoutMs = 600_000,
  } = options

  return {
    languageModel(_modelId: string): LanguageModelV3 {
      return new MerlinLanguageModel(baseURL, CLIENT_ID, username, timeoutMs)
    },
  }
}
