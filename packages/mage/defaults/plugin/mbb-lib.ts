/**
 * Mage mbb-lib plugin
 *
 * Provides deterministic tools for reading BCA's in-house Angular component
 * library (@mybcabisnis-web/lib and/or @mybcabisnis/lib) from the current
 * project's node_modules at runtime.
 *
 * Tools:
 *   mage_bca_lib_catalog   — scans all .d.ts files and returns a compact
 *                             catalog: selector, kind, standalone, import path,
 *                             inputs and outputs (with TypeScript types).
 *   mage_bca_lib_component — returns full detail for one item looked up by
 *                             selector or class name (for on-demand deep dive).
 *
 * Scanning is live on every call — no caching, always accurate to the installed
 * version. Both tools require @angular/core to be present in package.json.
 */

import type { Plugin } from "@mybcabisnis/mage-plugin"
import { tool } from "@mybcabisnis/mage-plugin"
import path from "path"

// ── Constants ────────────────────────────────────────────────────────────────

const LIB_PACKAGES = ["@mybcabisnis-web/lib", "@mybcabisnis/lib"] as const

// ── Types ────────────────────────────────────────────────────────────────────

interface LibItem {
  name: string
  kind: "component" | "directive" | "pipe"
  selector: string
  standalone: boolean
  import: string
  inputs: Record<string, string>
  outputs: Record<string, string>
}

interface LibItemInternal extends LibItem {
  /** Absolute path to the .d.ts file where this declaration was found. */
  sourceFile: string
}

interface PkgJson {
  version?: string
  name?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  types?: string
  typings?: string
  exports?: unknown
}

// ── IO helpers ───────────────────────────────────────────────────────────────

async function readJson<T = PkgJson>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await Bun.file(file).text()) as T
  } catch {
    return null
  }
}

// ── Parsing helpers ──────────────────────────────────────────────────────────

/**
 * Split a TypeScript generic argument list at top-level commas.
 * Handles nested generics, bracket pairs, and string literals.
 *
 * e.g. `A, B<C, D>, "x,y"` → ["A", "B<C, D>", `"x,y"`]
 */
function splitTopArgs(text: string): string[] {
  const args: string[] = []
  let depth = 0
  let current = ""
  let inString: string | null = null

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      current += ch
      if (ch === inString && (i === 0 || text[i - 1] !== "\\")) inString = null
    } else if (ch === '"' || ch === "'") {
      inString = ch
      current += ch
    } else if ("<({[".includes(ch)) {
      depth++
      current += ch
    } else if (">)}]".includes(ch)) {
      depth--
      current += ch
    } else if (ch === "," && depth === 0) {
      args.push(current.trim())
      current = ""
    } else {
      current += ch
    }
  }
  if (current.trim()) args.push(current.trim())
  return args
}

/**
 * Extract top-level keys from an Angular input or output record type literal.
 *
 * Handles both styles:
 *   Old: `{ "inputName": "alias"; }`
 *   New: `{ "inputName": { "alias": "..."; "required": false; }; }`
 *
 * Only keys at brace-depth 1 (directly inside the outer `{}`) are captured,
 * so nested metadata keys ("alias", "required", etc.) are automatically skipped.
 */
function extractObjKeys(objStr: string): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  let depth = 0
  let i = 0

  while (i < objStr.length) {
    const ch = objStr[i]
    if ("{<([".includes(ch)) {
      depth++
      i++
      continue
    }
    if ("}])>".includes(ch)) {
      depth--
      i++
      continue
    }
    if ((ch === '"' || ch === "'") && depth === 1) {
      const q = ch
      let j = i + 1
      let key = ""
      while (j < objStr.length && objStr[j] !== q) {
        key += objStr[j]
        j++
      }
      j++ // skip closing quote
      // skip whitespace
      while (j < objStr.length && (objStr[j] === " " || objStr[j] === "\t" || objStr[j] === "\n")) j++
      if (objStr[j] === ":" && key.length > 0 && !seen.has(key)) {
        keys.push(key)
        seen.add(key)
      }
      i = j
      continue
    }
    i++
  }
  return keys
}

/**
 * Extract instance property types from a named class declaration in .d.ts text.
 * Returns a map of { propName: typeString }, skipping methods and static members.
 */
function extractClassProps(dtsText: string, className: string): Record<string, string> {
  const simpleName = (className.split("<")[0] ?? className).trim().replace(/\W+$/, "")
  if (!simpleName) return {}

  // Match: [export] declare class Name[<...>][extends ...][implements ...] {
  const re = new RegExp(`(?:export\\s+)?declare\\s+class\\s+${simpleName}[\\s\\S]*?\\{`)
  const match = re.exec(dtsText)
  if (!match) return {}

  // Extract the class body by counting braces
  let depth = 1
  let i = match.index + match[0].length
  const start = i
  while (i < dtsText.length && depth > 0) {
    if (dtsText[i] === "{") depth++
    else if (dtsText[i] === "}") depth--
    i++
  }
  const body = dtsText.slice(start, i - 1)

  const props: Record<string, string> = {}
  // Match: [readonly] propName[?]: type;  — skip methods by requiring no `(` after name
  const propRe = /^\s+(?:readonly\s+)?([a-zA-Z_$][\w$]*)(?:\?)?\s*:\s*(?!\()(.+?)\s*;/gm
  let m
  while ((m = propRe.exec(body)) !== null) {
    const [, name, type] = m
    if (name && !props[name]) props[name] = type.trim()
  }
  return props
}

// ── Core parser ──────────────────────────────────────────────────────────────

/**
 * Parse Angular Ivy component/directive/pipe declarations from a .d.ts file.
 *
 * Angular Ivy compiles every public class with a static type-only declaration:
 *   ɵɵComponentDeclaration<T, "selector", exportAs, {inputs}, {outputs}, queries, ngContent, isStandalone, ...>
 *   ɵɵDirectiveDeclaration<T, "selector", exportAs, {inputs}, {outputs}, queries, ngContent, isStandalone, ...>
 *   ɵɵPipeDeclaration<T, "name", isStandalone?>
 *
 * These signatures are stable across Angular versions and are present in every
 * compiled Angular library.
 */
function parseDeclarations(dtsText: string, importPath: string, sourceFile: string): LibItemInternal[] {
  const items: LibItemInternal[] = []
  const seen = new Set<string>()

  const re = /ɵɵ(Component|Directive|Pipe)Declaration\s*</g
  let m

  while ((m = re.exec(dtsText)) !== null) {
    const kind = m[1].toLowerCase() as "component" | "directive" | "pipe"
    const argsStart = m.index + m[0].length

    // Walk forward counting angle brackets to find the full generic arg list
    let depth = 1
    let i = argsStart
    while (i < dtsText.length && depth > 0) {
      if (dtsText[i] === "<") depth++
      else if (dtsText[i] === ">") depth--
      i++
    }
    const argsStr = dtsText.slice(argsStart, i - 1)
    const args = splitTopArgs(argsStr)

    if (kind === "pipe") {
      // PipeDeclaration<T, "pipeName", IsStandalone?>
      const className = (args[0] ?? "").trim()
      const pipeName = (args[1] ?? "").replace(/^['"]|['"]$/g, "").trim()
      const standalone = (args[2] ?? "").trim() === "true"

      if (pipeName && !seen.has(`pipe:${pipeName}`)) {
        seen.add(`pipe:${pipeName}`)
        items.push({ name: className, kind: "pipe", selector: pipeName, standalone, import: importPath, inputs: {}, outputs: {}, sourceFile })
      }
    } else {
      // ComponentDeclaration / DirectiveDeclaration:
      // args[0]=T  args[1]="selector"  args[2]=exportAs  args[3]={inputs}
      // args[4]={outputs}  args[5]=queries  args[6]=ngContent  args[7]=isStandalone  args[8+]=...
      const className = (args[0] ?? "").trim()
      const rawSelector = (args[1] ?? "").replace(/^['"]|['"]$/g, "").trim()

      if (!rawSelector || rawSelector === "never") continue

      const dedupeKey = `${kind}:${rawSelector}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      const inputsStr = args[3] ?? ""
      const outputsStr = args[4] ?? ""
      // isStandalone is at arg index 7; undefined or absent → false
      const standalone = (args[7] ?? "").trim() === "true"

      // Best-effort: look up TypeScript types from the class body
      const classProps = extractClassProps(dtsText, className)
      const inputKeys = extractObjKeys(inputsStr)
      const outputKeys = extractObjKeys(outputsStr)

      const inputs = Object.fromEntries(inputKeys.map((k) => [k, classProps[k] ?? ""]))
      const outputs = Object.fromEntries(outputKeys.map((k) => [k, classProps[k] ?? ""]))

      items.push({ name: className, kind: kind as "component" | "directive", selector: rawSelector, standalone, import: importPath, inputs, outputs, sourceFile })
    }
  }

  return items
}

// ── Lib scanner ──────────────────────────────────────────────────────────────

/**
 * Glob all .d.ts files in a lib package, run the Ivy parser, and return items
 * with their source file path attached for later deep-dive lookups.
 *
 * Subpath entries that have their own package.json are assigned a subpath
 * import (e.g. "@mybcabisnis-web/lib/button"); otherwise the root package name
 * is used.
 */
async function scanLib(libDir: string, pkgName: string): Promise<LibItemInternal[]> {
  const items: LibItemInternal[] = []
  const seenKey = new Set<string>()
  const glob = new Bun.Glob("**/*.d.ts")

  for await (const rel of glob.scan({ cwd: libDir })) {
    // Skip test stubs and nested node_modules (shouldn't normally exist in a lib)
    if (rel.includes("node_modules") || rel.endsWith(".spec.d.ts") || rel.endsWith(".test.d.ts")) continue

    // Determine import path: use a subpath when the subdir has its own package.json
    let importPath = pkgName
    const subDir = path.dirname(rel)
    if (subDir && subDir !== ".") {
      const subPkg = await readJson(path.join(libDir, subDir, "package.json"))
      if (subPkg) importPath = `${pkgName}/${subDir.replace(/\\/g, "/")}`
    }

    let content: string
    try {
      content = await Bun.file(path.join(libDir, rel)).text()
    } catch {
      continue
    }

    // Quick scan — skip files with no Ivy declarations
    if (!content.includes("ɵɵ")) continue

    const sourceFile = path.join(libDir, rel)
    for (const item of parseDeclarations(content, importPath, sourceFile)) {
      const k = `${item.kind}:${item.selector}`
      if (!seenKey.has(k)) {
        seenKey.add(k)
        items.push(item)
      }
    }
  }

  return items
}

// ── Angular check ─────────────────────────────────────────────────────────────

/**
 * Returns a failure reason string if the directory is not an Angular project,
 * or null if everything looks good.
 */
async function checkAngular(directory: string): Promise<string | null> {
  const pkg = await readJson<PkgJson>(path.join(directory, "package.json"))
  if (!pkg) return "no-package-json"
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
  if (!("@angular/core" in deps)) return "not-angular"
  return null
}

// ── Plugin export ─────────────────────────────────────────────────────────────

export const server: Plugin = async ({ directory }) => ({
  tool: {
    // ── Primary tool: full lib catalog ───────────────────────────────────────
    mage_bca_lib_catalog: tool({
      description:
        "Scan @mybcabisnis-web/lib and/or @mybcabisnis/lib in the current project's node_modules " +
        "and return a compact catalog of all components, directives, and pipes — with their " +
        "selector, kind, standalone flag, import path, and inputs/outputs (with TypeScript types). " +
        "ALWAYS call this first before writing any Angular template or component code in a BCA project. " +
        "Never guess or invent component names, selectors, or API shapes. " +
        "Returns { ok:true, libs:[...] } on success. " +
        "Returns { ok:false, reason } when: the project has no @angular/core (reason='not-angular'), " +
        "or neither lib is installed (reason='lib-not-installed'). " +
        "On ok:false, fall back to the angular-developer skill and proceed without the lib.",
      args: {},
      async execute() {
        const reason = await checkAngular(directory)
        if (reason) return JSON.stringify({ ok: false, reason })

        const libs: Array<{ name: string; version: string; itemCount: number; items: LibItem[] }> = []

        for (const libName of LIB_PACKAGES) {
          const libDir = path.join(directory, "node_modules", libName)
          const libPkg = await readJson<PkgJson>(path.join(libDir, "package.json"))
          if (!libPkg) continue

          const raw = await scanLib(libDir, libName)
          // Strip internal sourceFile before returning to the model
          const items: LibItem[] = raw
            .map(({ sourceFile: _sf, ...rest }) => rest)
            .sort((a, b) => a.selector.localeCompare(b.selector))

          libs.push({ name: libName, version: libPkg.version ?? "unknown", itemCount: items.length, items })
        }

        if (libs.length === 0) {
          return JSON.stringify({ ok: false, reason: "lib-not-installed", checked: LIB_PACKAGES })
        }

        return JSON.stringify({ ok: true, libs })
      },
    }),

    // ── Detail tool: one component / directive / pipe ─────────────────────────
    mage_bca_lib_component: tool({
      description:
        "Get full details for one component, directive, or pipe from @mybcabisnis-web/lib or @mybcabisnis/lib. " +
        "Pass the selector (e.g. 'mbb-button'), attribute directive selector (e.g. '[mbbTooltip]'), " +
        "pipe name (e.g. 'mbbCurrency'), or class name (e.g. 'MbbButtonComponent'). " +
        "Returns inputs/outputs with TypeScript types and the full class declaration. " +
        "Use when mage_bca_lib_catalog does not provide enough type detail for a specific item. " +
        "Do NOT open node_modules files yourself — this tool reads them correctly.",
      args: {
        name: tool.schema
          .string()
          .describe(
            "Selector (e.g. 'mbb-button'), attribute selector (e.g. '[mbbTooltip]'), " +
            "pipe name (e.g. 'mbbCurrency'), or class name (e.g. 'MbbButtonComponent')",
          ),
      },
      async execute({ name }) {
        const reason = await checkAngular(directory)
        if (reason) return JSON.stringify({ ok: false, reason })

        const search = name.toLowerCase().replace(/[[\]]/g, "")

        for (const libName of LIB_PACKAGES) {
          const libDir = path.join(directory, "node_modules", libName)
          const libPkg = await readJson<PkgJson>(path.join(libDir, "package.json"))
          if (!libPkg) continue

          const items = await scanLib(libDir, libName)
          const found = items.find(
            (it) =>
              it.selector.toLowerCase() === search ||
              it.selector.replace(/[[\]]/g, "").toLowerCase() === search ||
              it.name.toLowerCase() === name.toLowerCase(),
          )
          if (!found) continue

          // Re-read the source file to extract the full class body
          let classDeclaration = ""
          try {
            const content = await Bun.file(found.sourceFile).text()
            const simpleName = (found.name.split("<")[0] ?? found.name).trim()
            const classRe = new RegExp(`(?:export\\s+)?declare\\s+class\\s+${simpleName}[\\s\\S]*?\\{`)
            const classMatch = classRe.exec(content)
            if (classMatch) {
              let depth = 1
              let i = classMatch.index + classMatch[0].length
              while (i < content.length && depth > 0) {
                if (content[i] === "{") depth++
                else if (content[i] === "}") depth--
                i++
              }
              classDeclaration = content.slice(classMatch.index, i).trim()
            }
          } catch {
            // leave classDeclaration empty — the rest of the data is still useful
          }

          const { sourceFile: _sf, ...itemData } = found
          return JSON.stringify({ ok: true, lib: libName, ...itemData, classDeclaration }, null, 2)
        }

        return JSON.stringify({ ok: false, reason: "not-found", searched: name, checked: LIB_PACKAGES })
      },
    }),
  },
})
