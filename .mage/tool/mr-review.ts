/// <reference path="../env.d.ts" />
/**
 * mr-review tool — invokes the mr-reviewer Go binary to review a GitLab MR.
 *
 * The binary is spawned as a child process. Its stderr emits progress lines in
 * the format `[progress] <message>` which are surfaced as live metadata updates
 * to the OpenCode UI. Stdout is captured as JSON and parsed into findings.
 *
 * Configuration (via environment variables or .mage/env.d.ts):
 *   MAGE_MR_BINARY   path to the mr-reviewer binary (default: "mr-reviewer")
 *   GITLAB_TOKEN     GitLab personal access token
 */

import { tool } from "@mybcabisnis/mage-plugin"
import { z } from "zod"

// ── Output schema (mirrors mage-cli/src/binary/types.ts) ─────────────────────

const ReviewFindingSchema = z.object({
  severity: z.enum(["critical", "warning", "suggestion", "style"]),
  file: z.string(),
  line: z.number().optional(),
  title: z.string(),
  description: z.string(),
  recommendation: z.string(),
})

const MrReviewOutputSchema = z.object({
  status: z.enum(["success", "error"]),
  mr: z
    .object({
      iid: z.number(),
      title: z.string(),
      author: z.string(),
      source_branch: z.string(),
      target_branch: z.string(),
      web_url: z.string(),
      files_changed: z.number(),
    })
    .optional(),
  findings: z.array(ReviewFindingSchema).optional(),
  summary: z.string().optional(),
  comments_posted: z.boolean().optional(),
  error: z.string().optional(),
})

type MrReviewOutput = z.infer<typeof MrReviewOutputSchema>
type ReviewFinding = z.infer<typeof ReviewFindingSchema>

// ── Progress line parser (mirrors mage-cli/src/binary/progress.ts) ───────────

type ProgressEvent = { type: "progress" | "error" | "info"; message: string }

function parseProgressLine(line: string): ProgressEvent | null {
  const trimmed = line.trim()
  const progressMatch = trimmed.match(/^\[progress\]\s*(.+)/)
  if (progressMatch) return { type: "progress", message: progressMatch[1]! }
  const errorMatch = trimmed.match(/^\[error\]\s*(.+)/)
  if (errorMatch) return { type: "error", message: errorMatch[1]! }
  const infoMatch = trimmed.match(/^\[info\]\s*(.+)/)
  if (infoMatch) return { type: "info", message: infoMatch[1]! }
  return null
}

// ── Output formatter ──────────────────────────────────────────────────────────

const SEVERITY_ICON: Record<string, string> = {
  critical: "🔴",
  warning: "🟡",
  suggestion: "🔵",
  style: "⚪",
}

function formatFindings(output: MrReviewOutput): string {
  const lines: string[] = []

  if (output.mr) {
    lines.push(`## MR Review: ${output.mr.title}`)
    lines.push(
      `**Author:** ${output.mr.author} · **Branch:** ${output.mr.source_branch} → ${output.mr.target_branch} · **Files changed:** ${output.mr.files_changed}`,
    )
    lines.push("")
  }

  if (output.summary) {
    lines.push("### Summary")
    lines.push(output.summary)
    lines.push("")
  }

  const findings = output.findings ?? []
  if (findings.length === 0) {
    lines.push("✅ No issues found.")
    return lines.join("\n")
  }

  const grouped = new Map<string, ReviewFinding[]>()
  for (const f of findings) {
    const existing = grouped.get(f.severity) ?? []
    existing.push(f)
    grouped.set(f.severity, existing)
  }

  for (const severity of ["critical", "warning", "suggestion", "style"]) {
    const group = grouped.get(severity)
    if (!group?.length) continue
    lines.push(`### ${SEVERITY_ICON[severity] ?? ""} ${severity.charAt(0).toUpperCase() + severity.slice(1)} (${group.length})`)
    for (const f of group) {
      const loc = f.line != null ? `:${f.line}` : ""
      lines.push(`\n**${f.file}${loc}** — ${f.title}`)
      lines.push(f.description)
      lines.push(`> **Fix:** ${f.recommendation}`)
    }
    lines.push("")
  }

  if (output.comments_posted) {
    lines.push("💬 Comments posted to GitLab MR.")
  }

  return lines.join("\n")
}

// ── Tool definition ───────────────────────────────────────────────────────────

export default tool({
  description: `Review a GitLab Merge Request using the mr-reviewer binary.

Provide the full MR URL (e.g. https://gitlab.example.com/group/repo/-/merge_requests/42).
The tool spawns the mr-reviewer binary, streams progress, and returns structured findings
with severity levels (critical / warning / suggestion / style).`,

  args: {
    url: tool.schema
      .string()
      .describe("Full GitLab Merge Request URL"),
    post_comments: tool.schema
      .boolean()
      .optional()
      .describe("Post review findings as inline comments on the MR (default: false)"),
  },

  async execute(args, ctx) {
    const binaryPath = process.env["MAGE_MR_BINARY"] ?? "mr-reviewer"

    const spawnArgs: string[] = [
      "--url", args.url,
      "--format", "json",
      ...(args.post_comments ? ["--post-comments"] : []),
    ]

    ctx.metadata({ title: `Starting mr-reviewer for ${args.url}` })

    const proc = Bun.spawn([binaryPath, ...spawnArgs], {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        ...(process.env["GITLAB_TOKEN"] ? { GITLAB_TOKEN: process.env["GITLAB_TOKEN"] } : {}),
      },
    })

    // Timeout: 3 minutes
    const timeoutHandle = setTimeout(() => {
      proc.kill()
    }, 180_000)

    // Stream stderr for progress updates
    async function streamStderr(): Promise<string> {
      const reader = (proc.stderr as ReadableStream<Uint8Array>).getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let full = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        full += chunk
        buffer += chunk

        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          const event = parseProgressLine(line.trim())
          if (event?.type === "progress") {
            ctx.metadata({ title: event.message })
          }
        }
      }
      return full
    }

    const [exitCode, stdout, _stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      streamStderr(),
    ])

    clearTimeout(timeoutHandle)

    if (exitCode !== 0) {
      return {
        output: `mr-reviewer exited with code ${exitCode}.\n\nStderr:\n${_stderr}`,
        metadata: { exitCode, success: false },
      }
    }

    // Parse JSON output
    if (!stdout.trim()) {
      return { output: "mr-reviewer produced no output.", metadata: { exitCode, success: false } }
    }

    let parsed: MrReviewOutput
    try {
      const raw = JSON.parse(stdout)
      const result = MrReviewOutputSchema.safeParse(raw)
      if (!result.success) {
        return {
          output: `mr-reviewer output did not match expected schema.\n\nRaw output:\n${stdout}`,
          metadata: { exitCode, success: false },
        }
      }
      parsed = result.data
    } catch {
      return {
        output: `Failed to parse mr-reviewer JSON output.\n\nRaw output:\n${stdout}`,
        metadata: { exitCode, success: false },
      }
    }

    if (parsed.status === "error") {
      return {
        output: `mr-reviewer returned an error: ${parsed.error ?? "unknown"}`,
        metadata: { exitCode, success: false, error: parsed.error },
      }
    }

    ctx.metadata({ title: `Found ${parsed.findings?.length ?? 0} findings` })

    return {
      output: formatFindings(parsed),
      metadata: {
        exitCode,
        success: true,
        findingCount: parsed.findings?.length ?? 0,
        mrTitle: parsed.mr?.title,
        commentsPosted: parsed.comments_posted ?? false,
      },
    }
  },
})
