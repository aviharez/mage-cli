import { execFile } from "node:child_process"
import { platform } from "node:os"
import { promisify } from "node:util"

const exec = promisify(execFile)

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
    const script = [
      'tell application "Terminal"',
      `  do script "${escapeAppleScriptString(command)}"`,
      "  activate",
      "end tell",
    ].join("\n")
    return exec("osascript", ["-e", script]).then(
      () => true,
      () => false,
    )
  }

  if (os === "win32") {
    const wt = await exec("wt.exe", ["-d", directory, execPath, directory], { cwd: directory }).then(
      () => true,
      () => false,
    )
    if (wt) return true

    // "" is the window title argument `start` expects before the target.
    return exec("cmd", ["/c", "start", '""', execPath, directory], { cwd: directory }).then(
      () => true,
      () => false,
    )
  }

  return false
}
