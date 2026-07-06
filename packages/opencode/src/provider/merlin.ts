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
 * (The company's GAIA gateway proved unreliable under SSE streaming — connections
 * were dropped mid-answer with no finish signal — so this adapter deliberately
 * stays on the single request/response shape instead of /chat/completions SSE.)
 *
 * Tool calling strategy:
 *   Merlin has no native function-calling API, so we use prompt-based tool calling:
 *   1. Inject tool schemas as XML into the system prompt.
 *   2. Instruct the model to emit <tool_call> XML blocks when it wants to use a tool.
 *   3. Parse the model's text response for those blocks.
 *   4. Return LanguageModelV3 tool-call content parts so the AI SDK agentic loop
 *      can execute the real tools and send results back.
 *
 * Resilience layered on top of the base request/response flow:
 *   - Timeouts and 5xx responses are surfaced as retryable APICallErrors so the
 *     existing session-level retry policy (session/retry.ts) backs off and
 *     re-sends automatically.
 *   - DPA-124 ("engine error while processing the query") is GAIA's catch-all
 *     failure code. Only DPA-124s whose err_debug names a context-length limit
 *     are treated as context overflow and converted to a 413 APICallError so
 *     the session auto-compacts; other DPA-124s (e.g. a generic engine 500)
 *     surface as "GAIA Error: 500 Internal Server Error" without compacting.
 *   - A genuine reply that only announces an action ("Let me read the key
 *     files...") without ever emitting the tool call is detected and
 *     transparently continued, bounded by MAX_CONTINUATIONS, so the agent loop
 *     doesn't stall mid-task.
 *   - An internal engine parse diagnostic ("Tool results was maybe incorrectly
 *     parsed for json...") occasionally comes back as a 200 "answer" instead of
 *     a real reply — usually when a large, multiline tool-result block fails to
 *     JSON-parse gateway-side. This is detected and surfaced as a retryable
 *     APICallError so it is treated as transient and retried, instead of being
 *     shown to the user or misclassified as context overflow.
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

const MERLIN_ENDPOINT =
  "https://gaia-gateway-multimodal-uat.apps.ocpuatgra.dti.co.id/llm-gateway/multimodal"
const CLIENT_ID = "MAGEDEV"

/**
 * Maximum number of transparent re-requests issued when the model announces an
 * action ("Let me check the config...") but never actually emits the tool call
 * for it (see `isPrematureActionStop`). Bounds retries so a model stuck in that
 * pattern can't loop forever.
 */
export const MAX_CONTINUATIONS = 2

// ── TLS bypass for the internal self-signed GAIA gateway ───────────────────────

const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined"

/**
 * The GAIA UAT gateway serves a self-signed certificate, so TLS verification has
 * to be disabled for the Merlin request. The two runtimes that host the server
 * need different mechanisms:
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

// ── Merlin API types ──────────────────────────────────────────────────────────

interface MerlinRequest {
  client_id: string
  domain_id: string
  service_id: string
  config: {
    temperature: number
    top_p: number
    top_k: number
    min_p: number
    presence_penalty: number
    repetition_penalty: number
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

/**
 * Escape backslashes that are not part of a valid JSON escape sequence
 * (`\" \\ \/ \b \f \n \r \t \uXXXX`). Turns a raw Windows path emitted by the
 * model — `C:\Users\me` — into valid JSON `C:\\Users\\me` so the tool call
 * survives instead of being dropped. Returns null if given null.
 */
function escapeStrayBackslashes(s: string | null): string | null {
  return s === null ? null : s.replace(/\\(?!["\\/bfnrtu])/g, "\\\\")
}

/** Parse a single tool_call body into {name, args}, or null if unrecognized. */
function parseToolCallBody(body: string): { name: string; args: Record<string, unknown> } | null {
  // Strip surrounding markdown code fences if the model wrapped its JSON in them.
  const stripped = body.replace(/^```(?:json|xml)?\s*/i, "").replace(/\s*```\s*$/, "").trim()

  // Format 1: JSON object. Try a sequence of increasingly forgiving candidates:
  //   1. the string as-is,
  //   2. the balanced-brace substring (model appended trailing text after `}`),
  //   3. with stray backslashes escaped (raw Windows paths like C:\Users\me make
  //      the JSON invalid — `\U` is not a legal escape — and would otherwise drop
  //      the whole tool call, so the agent silently does nothing).
  if (stripped.startsWith("{")) {
    const balanced = extractBalancedJson(stripped)
    const candidates = [stripped, balanced, escapeStrayBackslashes(stripped), escapeStrayBackslashes(balanced)]
    for (const candidate of candidates) {
      if (!candidate) continue
      try {
        const parsed = JSON.parse(candidate) as { name?: string; arguments?: Record<string, unknown> }
        if (parsed.name) return { name: parsed.name, args: parsed.arguments ?? {} }
      } catch { /* try next candidate */ }
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
export function parseToolCalls(
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

/**
 * Return the required field names absent from (or `undefined` in) `call.args`,
 * as declared by the matching tool's inputSchema. Returns an empty array when
 * the tool is not found, the schema has no `required` array, or all required
 * fields are present — i.e. a non-empty return means the call is incomplete.
 */
export function missingRequiredArgs(
  call: ParsedCall,
  tools?: LanguageModelV3CallOptions["tools"],
): string[] {
  if (!tools) return []
  const tool = tools.find(
    (t): t is LanguageModelV3FunctionTool => t.type === "function" && t.name === call.name,
  )
  if (!tool) return []
  const required = (tool.inputSchema as { required?: string[] }).required
  if (!Array.isArray(required)) return []
  return required.filter((k) => call.args[k] === undefined)
}

/**
 * Force strict one-tool-per-turn sequencing.
 *
 * Merlin's text-only model can emit several <tool_call> blocks in a single
 * response, but it has no way to know a later call is safe before the earlier
 * call's result returns — e.g. a Read whose path depends on a Glob emitted in
 * the SAME turn fires with a guessed path and reports "file not found". We keep
 * only the first call; the model re-emits the rest, with real context, on the
 * next round-trip. The discard is logged so we can measure how often it happens.
 */
export function capToolCalls(calls: ParsedCall[]): ParsedCall[] {
  if (calls.length > 1) {
    log.warn("tool_call_discard", {
      kept: calls[0]!.name,
      discarded: calls.slice(1).map((c) => c.name),
      count: calls.length - 1,
    })
    return [calls[0]!]
  }
  return calls
}

/**
 * Strip hallucinated transcript continuation that Qwen/GAIA generates after a
 * real tool call.
 *
 * When the model emits a closed `<tool_call>` it sometimes keeps generating and
 * fabricates the rest of the conversation — fake `Tool Results:`, `<tool_result>`
 * blocks with invented results, and new `Assistant:` turn markers. These use the
 * exact delimiters `flattenPrompt` injects, so the model is just continuing the
 * pattern it was shown.
 *
 * Strategy: the model's genuine output for one turn is at most one `<tool_call>`.
 * Anchor the search for continuation delimiters to **after** the real tool call so
 * we never accidentally cut inside a tool-call argument string. Everything from the
 * first line-anchored delimiter onwards is hallucinated and is discarded.
 */
export function stripHallucinatedTurns(answer: string): string {
  // Find where the real tool call ends (prefer the close tag; fall back to the
  // open tag for unclosed calls; use 0 if there's no tool call at all).
  const closeIdx = answer.indexOf("</tool_call>")
  const openIdx = answer.indexOf("<tool_call>")
  const searchFrom =
    closeIdx >= 0 ? closeIdx + "</tool_call>".length :
    openIdx  >= 0 ? openIdx :
    0

  // Match the first line-anchored continuation delimiter after searchFrom.
  // \b on "Assistant" catches both bare "Assistant" and "Assistant:".
  const tail = answer.slice(searchFrom)
  const continuationRe = /\n[ \t]*(?:Assistant\b|Tool Results:|User:|<tool_result>)/
  const match = continuationRe.exec(tail)
  if (!match) return answer
  return answer.slice(0, searchFrom + match.index).trimEnd()
}

/** Strip closed, unclosed, and bare func-call traces so they don't leak to the user. */
export function stripToolCalls(text: string): string {
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

/**
 * Escape <tool_call> tags in untrusted external content (user messages, tool
 * results) so the model cannot be tricked into executing injected tool calls
 * if it echoes back user-supplied or file-read content verbatim.
 */
function sanitizeExternal(text: string): string {
  return text.replace(/<(\/?tool_call)>/gi, "&lt;$1&gt;")
}

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
      parts.push(`User: ${sanitizeExternal(text)}`)
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
          return `<tool_result>\n  <name>${p.toolName}</name>\n  <result>${sanitizeExternal(outputToString(p.output))}</result>\n</tool_result>`
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

// ── Premature-stop detection ──────────────────────────────────────────────────

// First-person intent to act; "let me know" is excluded since it's a common
// turn-ending closer, not an announcement of pending work.
const INTENT_RE = /\b(let me(?! know)|let'?s|i'?ll|i will|i'?m going to|going to|now i|next,? i|proceed to|proceed)\b/i
// A tool-ish action verb that implies work should follow the announcement.
const ACTION_RE =
  /\b(read|check|run|look|search|create|write|update|edit|fix|explore|examine|investigate|gather|inspect|review|open|list|find|grep|analyze|start|build|test)\b/i

/**
 * The gateway sometimes returns a reply that only announces an action ("Let me
 * read the key files...") with no `<tool_call>` at all — the announced work
 * never happens and the agentic loop exits mid-task. Detect that pattern so
 * the caller can transparently re-request instead of ending the turn. Gated on
 * the trailing line only, and requires both an intent phrase and an action
 * verb, to avoid re-prompting legitimate text-only final answers.
 */
export function isPrematureActionStop(fullText: string): boolean {
  const lines = fullText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const lastLine = lines[lines.length - 1] ?? ""
  return lastLine.length > 0 && INTENT_RE.test(lastLine) && ACTION_RE.test(lastLine)
}

// ── Gateway parse-error detection ─────────────────────────────────────────────

// The engine occasionally returns an internal parse diagnostic as the ANSWER
// (HTTP 200, non-empty) instead of a real reply — typically when it fails to
// JSON-parse a large, multiline tool-result block out of the flattened prompt:
//   "Tool results was maybe incorrectly parsed for json
//    Block name: "read"
//    Error character: <newline>"
// Without this, the diagnostic slips past every other guard (no error_schema, no
// <tool_call>, doesn't match isPrematureActionStop) and is shown to the user as
// the assistant's reply. Match only the machine-diagnostic shapes (an opening
// "tool results … incorrectly parsed" line, or the structured "Block name: …
// Error character:" pair) so a genuine answer that merely mentions JSON/parsing
// is never mistaken for one.
const GATEWAY_PARSE_ERROR_RES = [
  /\btool results?\b[\s\S]{0,40}\bincorrectly parsed\b/i,
  /\bblock name:\s*["']?[\w.-]+["']?[\s\S]{0,80}\berror character:/i,
]

/**
 * Detect a gateway-side parse-diagnostic masquerading as a normal answer (see
 * `session-error.md` for a captured repro). Treated as a transient failure —
 * the caller throws a retryable APICallError so the session retry policy
 * (session/retry.ts) backs off and re-sends instead of showing raw engine
 * internals to the user.
 */
export function isGatewayParseError(answer: string): boolean {
  return GATEWAY_PARSE_ERROR_RES.some((re) => re.test(answer))
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
    // Compute a local token estimate from the flattened prompt length.
    // Used as a floor for the overflow check when GAIA under-reports, and as the
    // signal for context overflow when GAIA errors on a large prompt.

    const body: MerlinRequest = {
      client_id: this.clientId,
      domain_id: this.username,
      service_id: resolveServiceId(options),
      // Qwen3.6-27B (dense) official thinking-mode coding preset. Qwen recommends
      // temperature 0.6, top_p 0.95, top_k 20, min_p 0, presence_penalty 0,
      // repetition_penalty 1.0 for code generation — low temperature for
      // determinism, no presence_penalty (unlike the 35B-A3B MoE variant). Do NOT
      // use greedy decoding (temperature 0) — Qwen3.6 degrades into endless
      // repetition. Ref: huggingface.co/Qwen/Qwen3.6-27B sampling guidance.
      //
      // GATEWAY TYPE CONSTRAINT: the GAIA gateway only accepts a float for
      // `temperature`; every other sampling field must be an integer. JS already
      // serializes 0, 1.0 → "0", "1" (integers), but top_p 0.95 would serialize
      // as a float and be rejected — so top_p is sent as 1 (nucleus sampling
      // effectively off). top_k 20 still does the heavy token-set constraining,
      // so quality impact is minimal. Keep temperature written with a decimal.
      config: {
        temperature: 0.6,
        top_p: 1,
        top_k: 20,
        min_p: 0,
        presence_penalty: 0,
        repetition_penalty: 1,
        max_token: "",
        recommendation: "False",
      },
      new_session: "True",
      prompt: this.buildPrompt(options),
      file: files,
    }

    const promptTokenEstimate = Math.round(body.prompt.length / 4)

    const { prompt: _prompt, file: _file, ...loggableBody } = body
    log.info("request", {
      ...loggableBody,
      prompt_length: body.prompt.length,
      prompt_token_estimate: promptTokenEstimate,
      file_count: files.length,
      file_bytes: files.reduce((sum, f) => sum + f.length, 0),
    })
    log.debug("request_prompt", { prompt: body.prompt })

    const signals: AbortSignal[] = [AbortSignal.timeout(this.timeoutMs)]
    if (options.abortSignal) signals.push(options.abortSignal)

    // Disable TLS verification for the internal self-signed GAIA endpoint. Bun
    // reads the `tls` option; Node (desktop sidecar) needs an undici dispatcher.
    const dispatcher = await getNodeInsecureDispatcher()

    let response: Response
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.any(signals),
        ...bunFetchTlsOption,
        ...(dispatcher ? { dispatcher } : {}),
      } as RequestInit)
    } catch (error) {
      // A user-initiated cancel must propagate untouched and never be retried.
      if (options.abortSignal?.aborted) throw error
      // Anything else here — including the per-request timeout
      // (AbortSignal.timeout(this.timeoutMs)) firing — is a transient failure.
      // Surface it as a retryable APICallError so the session-level retry
      // policy (session/retry.ts) backs off and re-sends automatically.
      log.warn("request_failed", { error: String(error) })
      throw new APICallError({
        message: `GAIA request failed or timed out: ${String(error)}`,
        url: this.endpoint,
        requestBodyValues: {},
        statusCode: 504,
        isRetryable: true,
      })
    }

    if (!response.ok) {
      const responseText = await response.text().catch(() => "")
      // 5xx are transient server failures (connection drops, OCP hiccups —
      // DPA-115/117-class) and should be retried; 4xx are not.
      throw new APICallError({
        message: `GAIA HTTP ${response.status} ${response.statusText}: ${responseText}`,
        url: this.endpoint,
        requestBodyValues: {},
        statusCode: response.status,
        responseBody: responseText,
        isRetryable: response.status >= 500,
      })
    }

    const data = (await response.json()) as MerlinResponse

    if (data.error_schema?.error_code === "DPA-124") {
      const errDebug = data.output_schema?.err_debug ?? ""
      log.error("DPA-124 err_debug", {
        error_code: data.error_schema.error_code,
        err_debug: errDebug || "(none)",
      })
      // DPA-124 ("engine error while processing the query") is GAIA's catch-all
      // failure code. It fires both for real context overflow (err_debug names
      // the model's context length limit) and for unrelated engine failures
      // (err_debug is a generic 500 Internal Server Error page). Only the former
      // should convert to a context-overflow APICallError so the existing
      // parseAPICallError → ContextOverflowError chain fires and the session
      // auto-compacts; the latter is not a context problem and must not trigger
      // compaction.
      if (errDebug.toLowerCase().includes("context length")) {
        throw new APICallError({
          message: `context_length_exceeded: GAIA DPA-124 (estimated ~${promptTokenEstimate} tokens): ${data.error_schema.error_message?.english ?? "engine error"}`,
          url: this.endpoint,
          requestBodyValues: {},
          statusCode: 413,
          responseBody: errDebug,
          isRetryable: false,
        })
      }
      throw new Error("GAIA Error: 500 Internal Server Error")
    }

    if (
      data.error_schema?.error_code &&
      data.error_schema.error_code !== "DPA-111" &&
      data.error_schema.error_code !== "DPA-120"
    ) {
      const msg = data.error_schema.error_message?.english ?? data.error_schema.error_code
      // When the prompt is already large and GAIA errors, it is almost certainly a
      // context overflow. Throw as APICallError with statusCode 413 so the existing
      // parseAPICallError → ContextOverflowError chain fires and auto-compaction
      // triggers instead of surfacing a generic "stop" error to the user.
      if (promptTokenEstimate >= 200_000) {
        throw new APICallError({
          message: `context_length_exceeded: GAIA error (estimated ~${promptTokenEstimate} tokens): ${msg}`,
          url: this.endpoint,
          requestBodyValues: {},
          statusCode: 413,
          responseBody: msg,
          isRetryable: false,
        })
      }
      throw new Error(`GAIA error: ${msg}`)
    }

    const rawAnswer = data.output_schema?.result?.answer ?? data.response
    if (!rawAnswer) {
      // No answer with a large prompt is also treated as context overflow.
      if (promptTokenEstimate >= 200_000) {
        throw new APICallError({
          message: `context_length_exceeded: GAIA returned no answer (estimated ~${promptTokenEstimate} tokens)`,
          url: this.endpoint,
          requestBodyValues: {},
          statusCode: 413,
          responseBody: "",
          isRetryable: false,
        })
      }
      throw new Error("GAIA returned no answer in output_schema.result.answer")
    }

    if (isGatewayParseError(rawAnswer)) {
      // A degenerate engine diagnostic came back as a 200 "answer" instead of a
      // real reply (see isGatewayParseError). This is a transient gateway-side
      // failure, not a context-overflow or a genuine model error — surface it as
      // a retryable APICallError so session/retry.ts backs off and re-sends
      // rather than showing engine internals to the user.
      log.warn("gateway_parse_diagnostic", { answer: rawAnswer.slice(0, 500) })
      throw new APICallError({
        message: `GAIA returned an internal parse diagnostic instead of a reply (transient): ${rawAnswer.slice(0, 200)}`,
        url: this.endpoint,
        requestBodyValues: {},
        statusCode: 504,
        responseBody: rawAnswer,
        isRetryable: true,
      })
    }

    return {
      // Strip hallucinated transcript continuation before any caller sees the answer.
      // Qwen keeps generating after its own <tool_call>, fabricating fake Tool Results:
      // / <tool_result> / Assistant: turns using the same delimiters flattenPrompt injects.
      answer: stripHallucinatedTurns(rawAnswer),
      // Use the local prompt-length estimate as a floor: if GAIA reports fewer tokens
      // than the flattened prompt implies (e.g. per-turn counting instead of cumulative),
      // the overflow check would never fire. The max() ensures it fires correctly.
      inputTokens: Math.max(data.output_schema?.result?.token_input ?? 0, promptTokenEstimate),
      outputTokens: data.output_schema?.result?.token_output ?? 0,
    }
  }

  /**
   * Append a corrective turn instructing the model to re-emit a single, valid
   * tool call. Used by the self-correction retry when the first reply contained
   * a <tool_call> tag we couldn't parse, or when it parsed but had missing
   * required fields.
   *
   * When `details` is supplied the message names the specific tool and the
   * missing fields, which helps prompt-only models fill in the right arguments
   * rather than sending another empty `arguments: {}`.
   */
  private withRepairTurn(
    options: LanguageModelV3CallOptions,
    malformedAnswer: string,
    details?: { toolName: string; missingFields: string[] },
  ): LanguageModelV3CallOptions {
    const correction = details
      ? `Your previous \`${details.toolName}\` tool call was missing required arguments: ${details.missingFields.join(", ")}. ` +
        "Re-emit the tool call now with ALL required fields filled in, using EXACTLY this format — valid JSON, a closing tag, and nothing else:\n" +
        '<tool_call>\n{"name": "<tool_name>", "arguments": {<json_args>}}\n</tool_call>'
      : "Your previous reply contained a <tool_call> block that could not be parsed. " +
        "Re-emit the tool call now using EXACTLY this format — valid JSON, a closing tag, and nothing else:\n" +
        '<tool_call>\n{"name": "<tool_name>", "arguments": {<json_args>}}\n</tool_call>'
    return {
      ...options,
      prompt: [
        ...options.prompt,
        { role: "assistant", content: [{ type: "text", text: malformedAnswer }] },
        { role: "user", content: [{ type: "text", text: correction }] },
      ],
    }
  }

  /**
   * Call Merlin, parse tool calls, and self-correct once when needed:
   *
   * Branch 1 — tag found but nothing parsed (malformed JSON, stray prose, broken
   * tag): send one repair round-trip rather than dropping the turn — a dropped
   * call is a stalled agent.
   *
   * Branch 2 — call parsed cleanly but required arguments are missing (e.g. the
   * model emitted `{"name":"task","arguments":{}}`): send one repair round-trip
   * that names the specific tool and the absent fields, so the model knows exactly
   * what to fill in rather than repeating the empty call.
   *
   * In both branches token usage is summed across both calls. If the repair also
   * fails we fall through and return the original (no worse than current behavior).
   */
  private async resolveAnswer(
    options: LanguageModelV3CallOptions,
  ): Promise<{ answer: string; toolCalls: ParsedCall[]; inputTokens: number; outputTokens: number }> {
    const first = await this.callMerlin(options)
    const toolCalls = capToolCalls(parseToolCalls(first.answer, options.tools))

    // Branch 1: tag present but nothing parsed — classic malformed JSON / broken tag.
    if (toolCalls.length === 0 && /<tool_call>/i.test(first.answer)) {
      log.warn("tool_call_parse_miss", { answer: first.answer })
      const repaired = await this.callMerlin(this.withRepairTurn(options, first.answer))
      const repairedCalls = capToolCalls(parseToolCalls(repaired.answer, options.tools))
      const inputTokens = first.inputTokens + repaired.inputTokens
      const outputTokens = first.outputTokens + repaired.outputTokens
      if (repairedCalls.length > 0) {
        log.info("tool_call_repair_ok", { count: repairedCalls.length })
        return { answer: repaired.answer, toolCalls: repairedCalls, inputTokens, outputTokens }
      }
      log.warn("tool_call_repair_failed", { answer: repaired.answer })
      return { answer: first.answer, toolCalls, inputTokens, outputTokens }
    }

    // Branch 2: call parsed OK but required arguments are absent.
    if (toolCalls.length > 0) {
      const tc = toolCalls[0]!
      const missing = missingRequiredArgs(tc, options.tools)
      if (missing.length > 0) {
        log.warn("tool_call_invalid_args", { name: tc.name, missing })
        const repaired = await this.callMerlin(
          this.withRepairTurn(options, first.answer, { toolName: tc.name, missingFields: missing }),
        )
        const repairedCalls = capToolCalls(parseToolCalls(repaired.answer, options.tools))
        const inputTokens = first.inputTokens + repaired.inputTokens
        const outputTokens = first.outputTokens + repaired.outputTokens
        if (repairedCalls.length > 0 && missingRequiredArgs(repairedCalls[0]!, options.tools).length === 0) {
          log.info("tool_call_repair_ok", { count: repairedCalls.length })
          return { answer: repaired.answer, toolCalls: repairedCalls, inputTokens, outputTokens }
        }
        log.warn("tool_call_repair_failed", { answer: repaired.answer })
        return { answer: first.answer, toolCalls, inputTokens, outputTokens }
      }
    }

    return { answer: first.answer, toolCalls, inputTokens: first.inputTokens, outputTokens: first.outputTokens }
  }

  /**
   * Wrap `resolveAnswer` with transparent continuation for the premature
   * action-stop case: the model announced work ("Let me look at X...") but
   * never emitted the `<tool_call>` for it. When that pattern is detected and
   * tools are available, re-request with the accumulated answer folded back in
   * as an assistant turn plus a nudge, bounded by MAX_CONTINUATIONS. Token usage
   * and answer text are summed/concatenated across rounds so the caller sees one
   * uninterrupted reply.
   */
  private async resolveWithContinuation(
    options: LanguageModelV3CallOptions,
  ): Promise<{ answer: string; toolCalls: ParsedCall[]; inputTokens: number; outputTokens: number }> {
    const toolsAvailable = !!options.tools && options.tools.length > 0

    let combinedAnswer = ""
    let inputTokens = 0
    let outputTokens = 0
    let toolCalls: ParsedCall[] = []
    let currentOptions = options

    for (let round = 0; round <= MAX_CONTINUATIONS; round++) {
      const result = await this.resolveAnswer(currentOptions)
      inputTokens += result.inputTokens
      outputTokens += result.outputTokens
      combinedAnswer = combinedAnswer ? `${combinedAnswer}\n\n${result.answer}` : result.answer
      toolCalls = result.toolCalls

      // Only the latest round's delta can end in an "announced but not done" line, so
      // check that instead of re-stripping the whole (monotonically growing) combined
      // answer every round — avoids O(rounds * total length) work across continuations.
      const strippedDelta = stripToolCalls(result.answer)
      const premature = toolsAvailable && toolCalls.length === 0 && isPrematureActionStop(strippedDelta)
      if (!premature) break

      if (round >= MAX_CONTINUATIONS) {
        log.warn("continuation_exhausted", { round, answer: stripToolCalls(combinedAnswer) })
        break
      }

      log.warn("premature_action_stop", { round: round + 1, answer: result.answer })
      currentOptions = {
        ...options,
        prompt: [
          ...options.prompt,
          { role: "assistant", content: [{ type: "text", text: combinedAnswer }] },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "You described your next step but did not carry it out. Continue by actually issuing the tool call and performing the work you described. Do not repeat any text you already produced.",
              },
            ],
          },
        ],
      }
    }

    return { answer: combinedAnswer, toolCalls, inputTokens, outputTokens }
  }

  async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
    const { answer, toolCalls, inputTokens, outputTokens } = await this.resolveWithContinuation(options)

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
    const { answer, toolCalls, inputTokens, outputTokens } = await this.resolveWithContinuation(options)

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
