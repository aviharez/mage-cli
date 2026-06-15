import { parseDiffFromFile, type FileDiffMetadata } from "@pierre/diffs"
import { formatPatch, parsePatch, structuredPatch } from "diff"
import type { SnapshotFileDiff, VcsFileDiff } from "@mybcabisnis/mage-sdk/v2"

type LegacyDiff = {
  file: string
  patch?: string
  before?: string
  after?: string
  additions: number
  deletions: number
  status?: "added" | "deleted" | "modified"
}

type ReviewDiff = SnapshotFileDiff | VcsFileDiff | LegacyDiff

export type ViewDiff = {
  file: string
  patch: string
  additions: number
  deletions: number
  status?: "added" | "deleted" | "modified"
  fileDiff: FileDiffMetadata
}

const cache = new Map<string, FileDiffMetadata>()

function simpleHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return h >>> 0
}

function extract(diff: ReviewDiff): { before: string; after: string; sourcePatch: string | undefined } {
  // Fast path: before/after sent directly from backend (new VcsFileDiff format)
  if ("before" in diff && "after" in diff && typeof diff.before === "string" && typeof diff.after === "string") {
    return { before: diff.before, after: diff.after, sourcePatch: undefined }
  }

  // Legacy path: reconstruct from unified patch string (MAX_SAFE_INTEGER context)
  if ("patch" in diff && typeof diff.patch === "string") {
    const patchStr = diff.patch
    const [parsed] = parsePatch(patchStr)
    const beforeLines: string[] = []
    const afterLines: string[] = []
    for (const hunk of parsed.hunks) {
      for (const line of hunk.lines) {
        if (line.startsWith("-")) {
          beforeLines.push(line.slice(1))
        } else if (line.startsWith("+")) {
          afterLines.push(line.slice(1))
        } else {
          beforeLines.push(line.slice(1))
          afterLines.push(line.slice(1))
        }
      }
    }
    return { before: beforeLines.join("\n"), after: afterLines.join("\n"), sourcePatch: patchStr }
  }

  return { before: "", after: "", sourcePatch: undefined }
}

function file(name: string, before: string, after: string) {
  const key = `${name}:${simpleHash(before)}:${simpleHash(after)}`
  const hit = cache.get(key)
  if (hit) return hit
  const value = parseDiffFromFile({ name, contents: before }, { name, contents: after })
  cache.set(key, value)
  return value
}

export function normalize(diff: ReviewDiff): ViewDiff {
  const { before, after, sourcePatch } = extract(diff)
  const patch =
    sourcePatch ??
    formatPatch(structuredPatch(diff.file, diff.file, before, after, "", "", { context: 3 }))
  return {
    file: diff.file,
    patch,
    additions: diff.additions,
    deletions: diff.deletions,
    status: diff.status,
    fileDiff: file(diff.file, before, after),
  }
}

export function text(diff: ViewDiff, side: "deletions" | "additions") {
  if (side === "deletions") return diff.fileDiff.deletionLines.join("")
  return diff.fileDiff.additionLines.join("")
}
