import whichPkg from "which"
import path from "path"
import { Global } from "../global"

export function which(cmd: string, env?: NodeJS.ProcessEnv, options?: { includeGlobalBin?: boolean }) {
  const base = env?.PATH ?? env?.Path ?? process.env.PATH ?? process.env.Path ?? ""
  const full =
    options?.includeGlobalBin === false ? base : base ? base + path.delimiter + Global.Path.bin : Global.Path.bin
  const result = whichPkg.sync(cmd, {
    nothrow: true,
    path: full,
    pathExt: env?.PATHEXT ?? env?.PathExt ?? process.env.PATHEXT ?? process.env.PathExt,
  })
  return typeof result === "string" ? result : null
}
