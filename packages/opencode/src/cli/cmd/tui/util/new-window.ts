import { platform } from "os"
import { Log, Process } from "@/util"

const log = Log.create({ service: "new-window" })

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

/**
 * Opens a new OS terminal window running mage scoped to `directory`.
 * Only macOS and Windows are supported; other platforms resolve to `false`
 * so the caller can surface a toast.
 */
export async function openNewWindow(directory: string): Promise<boolean> {
  const os = platform()
  const execPath = process.execPath

  if (os === "darwin") {
    const command = `"${execPath.replace(/"/g, '\\"')}" "${directory.replace(/"/g, '\\"')}"`
    const script = ['tell application "Terminal"', `  do script "${escapeAppleScriptString(command)}"`, "  activate", "end tell"].join(
      "\n",
    )
    try {
      const result = await Process.run(["osascript", "-e", script], { nothrow: true })
      if (result.code !== 0) {
        log.error("failed to open new window via osascript", { code: result.code, stderr: result.stderr.toString() })
        return false
      }
      return true
    } catch (err) {
      log.error("failed to open new window", { error: err })
      return false
    }
  }

  if (os === "win32") {
    try {
      const wt = await Process.run(["wt.exe", "-d", directory, execPath, directory], {
        cwd: directory,
        nothrow: true,
      })
      if (wt.code === 0) return true
      log.warn("wt.exe unavailable, falling back to cmd start", { code: wt.code, stderr: wt.stderr.toString() })
    } catch (err) {
      log.warn("wt.exe unavailable, falling back to cmd start", { error: err })
    }

    try {
      // "" is the window title argument `start` expects before the target.
      const result = await Process.run(["cmd", "/c", "start", '""', execPath, directory], {
        cwd: directory,
        nothrow: true,
      })
      if (result.code !== 0) {
        log.error("failed to open new window via cmd start", { code: result.code, stderr: result.stderr.toString() })
        return false
      }
      return true
    } catch (err) {
      log.error("failed to open new window", { error: err })
      return false
    }
  }

  log.info("new window not supported on this platform", { platform: os })
  return false
}
