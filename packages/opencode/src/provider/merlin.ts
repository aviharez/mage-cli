/**
 * Cloud Merlin provider adapter for the Vercel AI SDK (LanguageModelV3).
 *
 * The Merlin API is a proprietary BCA endpoint that is NOT OpenAI-compatible.
 * This adapter translates OpenCode's standard LanguageModelV3 calls into
 * Merlin's custom request/response envelope.
 *
 * Request shape (Merlin):
 *   POST <endpoint>
 *   { client_id, domain_id, config: { persona, temperature, max_token, model_name, recommendation },
 *     new_session: 'True', prompt: string, file: '' }
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

// ── Merlin API types ──────────────────────────────────────────────────────────

interface MerlinRequest {
  client_id: string
  domain_id: string
  config: {
    persona: string
    temperature: number
    max_token: string
    model_name: string
    recommendation: string
  }
  new_session: string
  prompt: string
  file: string
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
- You MAY call multiple tools in sequence. Call one at a time and wait for the result.
- After ALL tool results are returned, synthesise a final answer in plain text.
- If you do NOT need a tool, reply in plain text only — no <tool_call> tags.`
}

type ParsedCall = { name: string; callId: string; args: Record<string, unknown> }

/**
 * Parse tool calls from the model response.
 * Handles three formats Qwen3 may emit:
 *   1. Qwen3 native: <tool_call>{"name":"x","arguments":{...}}</tool_call>
 *   2. XML fallback: <tool_call><name>x</name><arguments>{...}</arguments></tool_call>
 *   3. Plain funcName({...}) or funcName(key=val) as a last resort.
 */
function parseToolCalls(text: string): ParsedCall[] {
  const results: ParsedCall[] = []
  let idx = 0

  // Format 1 & 2: anything inside <tool_call>…</tool_call>
  const tagRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g
  let match: RegExpExecArray | null
  while ((match = tagRegex.exec(text)) !== null) {
    const body = match[1].trim()
    // Format 1: JSON object { "name": "...", "arguments": {...} }
    if (body.startsWith("{")) {
      try {
        const parsed = JSON.parse(body) as { name?: string; arguments?: Record<string, unknown> }
        if (parsed.name) {
          results.push({ name: parsed.name, callId: `merlin-tc-${idx++}`, args: parsed.arguments ?? {} })
          continue
        }
      } catch {
        // fall through to XML format
      }
    }
    // Format 2: XML sub-elements
    const nameMatch = /<name>([\s\S]*?)<\/name>/.exec(body)
    const argsMatch = /<arguments>([\s\S]*?)<\/arguments>/.exec(body)
    if (nameMatch) {
      let args: Record<string, unknown> = {}
      if (argsMatch) {
        try { args = JSON.parse(argsMatch[1].trim()) } catch { /* ignore */ }
      }
      results.push({ name: nameMatch[1].trim(), callId: `merlin-tc-${idx++}`, args })
    }
  }

  // Format 3 (fallback): funcName({...}) or funcName(key=val, …) on its own line
  // Only run this if no tag-based calls were found, to avoid double-counting.
  if (results.length === 0) {
    // Match lines like:  glob({"pattern": "..."})
    //                    grep(pattern="TODO", include="*.ts")
    const lineRegex = /^([a-zA-Z_][a-zA-Z0-9_]*)\(([\s\S]*?)\)\s*$/gm
    while ((match = lineRegex.exec(text)) !== null) {
      const name = match[1]
      const rawArgs = match[2].trim()
      let args: Record<string, unknown> = {}
      // Try JSON object first
      try {
        args = JSON.parse(rawArgs.startsWith("{") ? rawArgs : `{${rawArgs}}`)
      } catch {
        // Try key=value pairs: key="val", key=val
        const kvRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*("[^"]*"|'[^']*'|[^,)]+)/g
        let kv: RegExpExecArray | null
        while ((kv = kvRegex.exec(rawArgs)) !== null) {
          const val = kv[2].trim().replace(/^["']|["']$/g, "")
          args[kv[1]] = val
        }
      }
      results.push({ name, callId: `merlin-tc-${idx++}`, args })
    }
  }

  return results
}

/** Strip all tool_call blocks (and plain func-call lines) from the model answer. */
function stripToolCalls(text: string): string {
  return text
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "")
    .replace(/^[a-zA-Z_][a-zA-Z0-9_]*\([\s\S]*?\)\s*$/gm, "")
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
        const callJson = JSON.stringify({ name: tc.toolName, arguments: JSON.parse(inputJson.trim() || "{}") })
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

// ── Persona resolution ────────────────────────────────────────────────────────

const PERSONAS: Record<string, string> = {
  ffl:
    "You are Mage in documentation mode. Your sole task is to generate a Functional Flow Document (FFL) by reading source files — never by guessing or inventing content. You produce Mermaid sequence diagrams and flowcharts with exact HTTP methods, endpoint paths, component names, and service method names as found in the code. You write all intermediate findings and the final document to disk using tool calls; you do not produce any chat text until the file exists on disk. If an endpoint or base URL cannot be verified from source, you write [undocumented].",

  "angular-update":
    "You are Mage in Angular migration mode. You are an expert Angular developer specialising in upgrading Angular applications from version 18 to version 20 following the official one-major-version-at-a-time path. You run ng update schematics, verify the build after every step, and commit after each successful step. After the control flow schematic runs, you manually read every remaining HTML file that still contains *ngIf, *ngFor, or [ngSwitch] and transform them to @if, @for, and @switch blocks using the Edit tool — you never leave structural directives untransformed. If a build fails you stop immediately and report the full error — you never continue past a broken build. You write all progress to a scratch file using tool calls and produce no user-visible text until the final migration report is written to disk.",

  "api-contract-web":
    "You are Mage in API documentation mode. Your task is to crawl Angular HTTP service files and produce a structured, versioned API contract document. You only document endpoints and types that you can verify by reading actual source files — you never invent paths, type shapes, or base URLs. If something cannot be resolved you write [undocumented]. You write all intermediate findings to a scratch file using tool calls and produce no chat text until the final contract file is written to disk.",

  boilerplate:
    "You are Mage in boilerplate management mode. You help developers manage team boilerplate profiles (list, add, switch) and generate new code that strictly follows the active boilerplate's conventions, naming patterns, and architectural layers. Before generating any code you always call mage_boilerplate_context to retrieve the generator instruction and examples for the requested type. You never deviate from the conventions defined in the active boilerplate manifest.",

  general:
    "You are Mage, a concise and direct CLI software engineering assistant for the myBCA Bisnis team. You assist with code generation, debugging, code review, refactoring, and architecture across Android (Kotlin/Jetpack Compose), iOS (SwiftUI), Angular (TypeScript), and Spring Boot (Kotlin/Java) projects. You follow myBCA Bisnis coding standards, never expose secrets or credentials, and keep every response brief and actionable.",
}

/**
 * Detect which skill is active by scanning the system prompt messages for
 * distinctive markers each SKILL.md injects when it is loaded.
 * Falls back to the general MBB persona when no skill is detected.
 */
function resolvePersona(options: LanguageModelV3CallOptions): string {
  const systemText = options.prompt
    .filter((m) => m.role === "system")
    .map((m) => (m as { role: "system"; content: string }).content)
    .join("\n")

  if (systemText.includes("ffl-scratch.md") || systemText.includes("Functional Flow Document (FFL) Generator"))
    return PERSONAS["ffl"]!

  if (systemText.includes("ng-update-scratch.md") || systemText.includes("Angular Update (v18"))
    return PERSONAS["angular-update"]!

  if (systemText.includes("api-contract-scratch.md") || systemText.includes("API Contract Generator — Angular Web"))
    return PERSONAS["api-contract-web"]!

  if (systemText.includes("mage_boilerplate") || systemText.includes("boilerplate profiles"))
    return PERSONAS["boilerplate"]!

  return PERSONAS["general"]!
}

// ── Model implementation ──────────────────────────────────────────────────────

/**
 * Map from config model IDs (used in mage.jsonc) to the exact model_name
 * strings the BCA gateway expects in every request body.
 * If a model ID is not listed here the raw ID is sent as-is.
 */
const MODEL_NAME_MAP: Record<string, string> = {
  // Explicit BCA gateway model names
  "qwen3": "/app/models/qwen3-30b-a3b-instruct-2507",
  "qwen3-30b": "/app/models/qwen3-30b-a3b-instruct-2507",
  "deepseek": "DeepSeek-R1",
  "deepseek-r1": "DeepSeek-R1",
  "gemini": "gemini-2.5-flash",
  "gemini-flash": "gemini-2.5-flash",
  "gemini-2.5-flash": "gemini-2.5-flash",
}

class MerlinLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = "v3" as const
  readonly provider: string
  readonly modelId: string
  readonly supportedUrls = {}

  constructor(
    private readonly endpoint: string,
    private readonly clientId: string,
    private readonly username: string,
    private readonly modelName: string,
    private readonly timeoutMs: number,
  ) {
    this.provider = "merlin"
    this.modelId = modelName
  }

  private buildPrompt(options: LanguageModelV3CallOptions): string {
    const toolsBlock = renderToolsBlock(options)
    const conversation = flattenPrompt(options)
    return toolsBlock ? `${toolsBlock}\n\n${conversation}` : conversation
  }

  private async callMerlin(
    options: LanguageModelV3CallOptions,
  ): Promise<{ answer: string; inputTokens: number; outputTokens: number }> {
    const resolvedModel = MODEL_NAME_MAP[this.modelName.toLowerCase()] ?? this.modelName
    const body: MerlinRequest = {
      client_id: this.clientId,
      domain_id: this.username,
      config: {
        persona: resolvePersona(options),
        temperature: 0.3,
        max_token: "",
        model_name: resolvedModel,
        recommendation: "False",
      },
      new_session: "True",
      prompt: this.buildPrompt(options),
      file: "",
    }

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

    if (data.error_schema?.error_code && data.error_schema.error_code !== "DPA-111" && data.error_schema.error_code !== "DPA-120") {
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
    const toolCalls = parseToolCalls(answer)

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
      content: [{ type: "text", text: answer }],
      finishReason: { unified: "stop", raw: "stop" },
      usage,
      warnings: [],
    }
  }

  async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
    const { answer, inputTokens, outputTokens } = await this.callMerlin(options)
    const toolCalls = parseToolCalls(answer)

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
      parts.push({ type: "text-delta", id: textId, delta: answer })
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
  /** Merlin API endpoint URL */
  baseURL: string
  /** BCA client_id for the Merlin gateway */
  clientId: string
  /** User's domain username (domain_id in Merlin requests) */
  username: string
  /** Default model name to send to Merlin */
  modelName: string
  /** Request timeout in milliseconds */
  timeoutMs: number
}

export interface MerlinProvider {
  languageModel(modelId: string): LanguageModelV3
}

/**
 * Create a Merlin provider instance.
 *
 * Usage in OpenCode config:
 *   provider.merlin.npm = "@mage/merlin-provider"
 *   provider.merlin.api = "https://your-merlin-endpoint/..."
 *   provider.merlin.options.username = "your-domain-username"
 *   provider.merlin.options.clientId = "your-client-id"
 */
export function createMerlin(options: MerlinProviderOptions): MerlinProvider {
  const {
    baseURL,
    clientId,
    username,
    modelName = "DeepSeek-R1",
    timeoutMs = 120_000,
  } = options

  return {
    languageModel(modelId: string): LanguageModelV3 {
      return new MerlinLanguageModel(baseURL, clientId, username, modelId || modelName, timeoutMs)
    },
  }
}
