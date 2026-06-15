import embeddedWebUIData from "../../../mage-web-ui.gen.ts"
import { Flag } from "@/flag/flag"
import { Hono } from "hono"
import { getMimeType } from "hono/utils/mime"
import fs from "node:fs/promises"
import path from "node:path"

const embeddedWebUI = Flag.MAGE_DISABLE_EMBEDDED_WEB_UI ? null : embeddedWebUIData

// Resolve a local app/dist directory relative to this source file for dev mode.
// In the compiled binary this path won't exist, so localDistDir stays null.
const localDistDir = await (async () => {
  // __dirname for this file is packages/opencode/src/server/routes/
  // packages/app/dist is 4 levels up then into app/dist
  const candidate = path.resolve(import.meta.dirname, "../../../../app/dist")
  try {
    await fs.access(candidate)
    return candidate
  } catch {
    return null
  }
})()

const DEFAULT_CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; media-src 'self' data:; connect-src 'self' data:"

const NOT_BUILT_PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Mage — Web UI not built</title>
<style>
  body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0d0d0d;color:#e0e0e0}
  .box{max-width:520px;padding:2rem;border:1px solid #333;border-radius:8px;line-height:1.6}
  code{background:#1a1a1a;padding:.1em .4em;border-radius:4px;font-size:.9em}
  h1{margin-top:0;font-size:1.4rem}
  .cmd{background:#1a1a1a;border:1px solid #333;border-radius:6px;padding:.8rem 1rem;margin:.5rem 0;font-family:monospace;font-size:.9rem}
</style>
</head>
<body>
<div class="box">
  <h1>Web UI not available</h1>
  <p>The Mage web UI has not been built yet. To use it, build the frontend first:</p>
  <div class="cmd">bun run --cwd packages/app build</div>
  <p>Then restart <code>mage web</code>. The server will serve the built files automatically.</p>
  <p>For development, run the Vite dev server in a second terminal:</p>
  <div class="cmd">bun run dev:serve   # backend on :4096</div>
  <div class="cmd">bun run dev:web     # Vite frontend on :3000</div>
  <p>Then open <code>http://localhost:3000</code>.</p>
</div>
</body>
</html>`

export const UIRoutes = (): Hono =>
  new Hono().all("/*", async (c) => {
    const reqPath = c.req.path

    // Priority 1: compiled-in embedded UI (production binary)
    if (embeddedWebUI) {
      const match = embeddedWebUI[reqPath.replace(/^\//, "")] ?? embeddedWebUI["index.html"] ?? null
      if (!match) return c.json({ error: "Not Found" }, 404)

      // Use Bun.file() instead of node:fs — it correctly resolves bunfs virtual
      // paths (B:/~BUN/root/... on Windows, /$bunfs/root/... on Linux/macOS)
      // that Bun embeds when files are imported with `with { type: "file" }`.
      const f = Bun.file(match)
      if (await f.exists()) {
        const mime = getMimeType(match) ?? "text/plain"
        c.header("Content-Type", mime)
        if (mime.startsWith("text/html")) {
          c.header("Content-Security-Policy", DEFAULT_CSP)
        }
        return c.body(await f.bytes())
      }
      return c.json({ error: "Not Found" }, 404)
    }

    // Priority 2: locally built packages/app/dist (dev mode after running `bun run build` in packages/app)
    if (localDistDir) {
      const rel = reqPath.replace(/^\//, "") || "index.html"
      const filePath = path.join(localDistDir, rel)
      // Prevent path traversal
      if (!filePath.startsWith(localDistDir)) return c.json({ error: "Forbidden" }, 403)

      const exists = await fs.exists(filePath)
      const servePath = exists ? filePath : path.join(localDistDir, "index.html")

      if (await fs.exists(servePath)) {
        const mime = getMimeType(servePath) ?? "text/plain"
        c.header("Content-Type", mime)
        if (mime.startsWith("text/html")) {
          c.header("Content-Security-Policy", DEFAULT_CSP)
        }
        return c.body(new Uint8Array(await fs.readFile(servePath)))
      }
    }

    // Priority 3: show a helpful local page instead of proxying to an external .ai domain
    c.header("Content-Type", "text/html; charset=utf-8")
    return c.html(NOT_BUILT_PAGE)
  })
