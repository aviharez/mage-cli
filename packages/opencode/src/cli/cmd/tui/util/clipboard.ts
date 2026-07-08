import { platform, release } from "os"
import { lazy } from "../../../../util/lazy.js"
import { tmpdir } from "os"
import path from "path"
import fs from "fs/promises"
import * as Filesystem from "../../../../util/filesystem"
import * as Process from "../../../../util/process"
import { Log } from "@/util"

const log = Log.create({ service: "clipboard" })

// Lazy load which and clipboardy to avoid expensive execa/which/isexe chain at startup
const getWhich = lazy(async () => {
  const { which } = await import("../../../../util/which")
  return which
})

const getClipboardy = lazy(async () => {
  const { default: clipboardy } = await import("clipboardy")
  return clipboardy
})

/**
 * Writes text to clipboard via OSC 52 escape sequence.
 * This allows clipboard operations to work over SSH by having
 * the terminal emulator handle the clipboard locally.
 */
function writeOsc52(text: string): void {
  if (!process.stdout.isTTY) return
  const base64 = Buffer.from(text).toString("base64")
  const osc52 = `\x1b]52;c;${base64}\x07`
  const passthrough = process.env["TMUX"] || process.env["STY"]
  const sequence = passthrough ? `\x1bPtmux;\x1b${osc52}\x1b\\` : osc52
  process.stdout.write(sequence)
}

export interface Content {
  data: string
  mime: string
}

// Checks clipboard for images first, then falls back to text.
//
// On Windows prompt/ can call this from multiple paste signals because
// terminals surface image paste differently:
//   1. A forwarded Ctrl+V keypress
//   2. An empty bracketed-paste hint for image-only clipboard in Windows
//      Terminal <1.25
//   3. A kitty Ctrl+V key-release fallback for Windows Terminal 1.25+
export async function read(): Promise<Content | undefined> {
  const os = platform()

  if (os === "darwin") {
    const tmpfile = path.join(tmpdir(), "mage-clipboard.png")
    try {
      await Process.run(
        [
          "osascript",
          "-e",
          'set imageData to the clipboard as "PNGf"',
          "-e",
          `set fileRef to open for access POSIX file "${tmpfile}" with write permission`,
          "-e",
          "set eof fileRef to 0",
          "-e",
          "write imageData to fileRef",
          "-e",
          "close access fileRef",
        ],
        { nothrow: true },
      )
      const buffer = await Filesystem.readBytes(tmpfile)
      return { data: buffer.toString("base64"), mime: "image/png" }
    } catch {
    } finally {
      await fs.rm(tmpfile, { force: true }).catch(() => {})
    }
  }

  // Windows/WSL: probe clipboard for images, then text, in one PowerShell call.
  // Bracketed paste can't carry image data so we read it directly. Text also
  // goes through PowerShell rather than clipboardy: clipboardy's Windows paste
  // shells out to a bundled clipboard_*.exe resolved via import.meta.url — that
  // asset is not embedded in the compiled single-file binary, so
  // clipboardy.read() ENOENTs there. A single spawn (instead of one probe per
  // kind) keeps every Ctrl+V paste from costing two PowerShell startups.
  //
  // -Sta: the WinForms/OLE clipboard API (used for images) only works from an
  // STA thread. Without it, GetImage()/GetText() silently return null in some
  // hosts (observed: classic conhost windows). Get-Clipboard is a cmdlet (like
  // Set-Clipboard in copy(), below) and works regardless of apartment state, so
  // it's used for text instead of the WinForms text API for the same reason.
  if (os === "win32" || release().includes("WSL")) {
    const script =
      "Add-Type -AssemblyName System.Windows.Forms; " +
      "$img = [System.Windows.Forms.Clipboard]::GetImage(); " +
      "if ($img) { $ms = New-Object System.IO.MemoryStream; $img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); 'IMG:' + [System.Convert]::ToBase64String($ms.ToArray()) } " +
      "else { $t = Get-Clipboard -Raw; if ($t) { 'TXT:' + [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($t)) } }"
    const result = await Process.text(
      ["powershell.exe", "-Sta", "-NonInteractive", "-NoProfile", "-command", script],
      { nothrow: true },
    )
    const out = result.text.trim()
    log.debug("clipboard: read (win32)", { code: result.code, outLength: out.length })
    if (out.startsWith("IMG:")) {
      const imageBuffer = Buffer.from(out.slice(4), "base64")
      if (imageBuffer.length > 0) {
        return { data: imageBuffer.toString("base64"), mime: "image/png" }
      }
    } else if (out.startsWith("TXT:")) {
      const text = Buffer.from(out.slice(4), "base64").toString("utf8")
      if (text) return { data: text, mime: "text/plain" }
    }
    // Fall through to the clipboardy fallback below — a no-op in the compiled
    // binary (swallowed by its .catch()), but still useful for `bun dev`.
  }

  if (os === "linux") {
    const wayland = await Process.run(["wl-paste", "-t", "image/png"], { nothrow: true })
    if (wayland.stdout.byteLength > 0) {
      return { data: Buffer.from(wayland.stdout).toString("base64"), mime: "image/png" }
    }
    const x11 = await Process.run(["xclip", "-selection", "clipboard", "-t", "image/png", "-o"], {
      nothrow: true,
    })
    if (x11.stdout.byteLength > 0) {
      return { data: Buffer.from(x11.stdout).toString("base64"), mime: "image/png" }
    }
  }

  const clipboardy = await getClipboardy()
  const text = await clipboardy.read().catch(() => {})
  if (text) {
    return { data: text, mime: "text/plain" }
  }
}

// Each platform method returns true on success, false on failure.
// copy() uses these to decide whether to fall back to clipboardy.
const getCopyMethod = lazy(async () => {
  const os = platform()
  const which = await getWhich()

  if (os === "darwin" && which("osascript")) {
    log.debug("clipboard: using osascript")
    return async (text: string): Promise<boolean> => {
      const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
      const result = await Process.run(["osascript", "-e", `set the clipboard to "${escaped}"`], { nothrow: true })
      return result.code === 0
    }
  }

  if (os === "linux") {
    if (process.env["WAYLAND_DISPLAY"] && which("wl-copy")) {
      log.debug("clipboard: using wl-copy")
      return async (text: string): Promise<boolean> => {
        const proc = Process.spawn(["wl-copy"], { stdin: "pipe", stdout: "ignore", stderr: "ignore" })
        if (!proc.stdin) return false
        proc.stdin.write(text)
        proc.stdin.end()
        const code = await proc.exited.catch(() => 1)
        return code === 0
      }
    }
    if (which("xclip")) {
      log.debug("clipboard: using xclip")
      return async (text: string): Promise<boolean> => {
        const proc = Process.spawn(["xclip", "-selection", "clipboard"], {
          stdin: "pipe",
          stdout: "ignore",
          stderr: "ignore",
        })
        if (!proc.stdin) return false
        proc.stdin.write(text)
        proc.stdin.end()
        const code = await proc.exited.catch(() => 1)
        return code === 0
      }
    }
    if (which("xsel")) {
      log.debug("clipboard: using xsel")
      return async (text: string): Promise<boolean> => {
        const proc = Process.spawn(["xsel", "--clipboard", "--input"], {
          stdin: "pipe",
          stdout: "ignore",
          stderr: "ignore",
        })
        if (!proc.stdin) return false
        proc.stdin.write(text)
        proc.stdin.end()
        const code = await proc.exited.catch(() => 1)
        return code === 0
      }
    }
  }

  if (os === "win32") {
    log.debug("clipboard: using powershell")
    // Encode as base64 before piping so PowerShell can decode to UTF-8 without
    // touching [Console]::InputEncoding — setting that property throws
    // System.IO.IOException ("The handle is invalid") when stdin is a redirected
    // pipe (which it always is here), aborting the script before Set-Clipboard runs.
    return async (text: string): Promise<boolean> => {
      const proc = Process.spawn(
        [
          "powershell.exe",
          "-NonInteractive",
          "-NoProfile",
          "-Command",
          "Set-Clipboard -Value ([System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String([Console]::In.ReadToEnd())))",
        ],
        {
          stdin: "pipe",
          stdout: "ignore",
          stderr: "ignore",
        },
      )

      if (!proc.stdin) return false
      // Write base64-encoded text so the pipe's default ASCII/ANSI encoding is irrelevant.
      proc.stdin.write(Buffer.from(text).toString("base64"))
      proc.stdin.end()
      const code = await proc.exited.catch(() => 1)
      return code === 0
    }
  }

  return null
})

export async function copy(text: string): Promise<void> {
  // Best-effort OSC 52 — lets SSH sessions copy via the terminal emulator.
  // Silently ignored by terminals that don't support it.
  writeOsc52(text)

  // Try the native platform method first.
  const method = await getCopyMethod()
  if (method) {
    const ok = await method(text).catch(() => false)
    if (ok) return
    // Native method failed — fall through to clipboardy.
    log.debug("clipboard: native method failed, trying clipboardy fallback")
  } else {
    log.debug("clipboard: no native support, trying clipboardy fallback")
  }

  // clipboardy fallback — covers the case where the native tool is absent or fails.
  const clipboardy = await getClipboardy()
  await clipboardy.write(text)
  // clipboardy.write throws on failure, which propagates to the caller so the
  // handler's .catch() can show an honest "Failed to copy" toast.
}
