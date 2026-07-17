#!/usr/bin/env node
// Syncs install scripts from the monorepo root into public/ so they are served
// at /install, /install.ps1, /install.cmd.
//
// In the monorepo (bun dev / bun build): the root files are present and are
// copied here, keeping public/ up to date.
//
// In standalone / Docker builds: the root files are absent; this script is a
// no-op and the already-vendored copies in public/ are used as-is.

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "../../..")
const publicDir = path.join(__dirname, "../public")

const assets = [
  [path.join(repoRoot, "install.sh"),  path.join(publicDir, "install")],
  [path.join(repoRoot, "install.ps1"), path.join(publicDir, "install.ps1")],
  [path.join(repoRoot, "install.cmd"), path.join(publicDir, "install.cmd")],
]

let synced = 0
for (const [src, dest] of assets) {
  if (!fs.existsSync(src)) {
    console.log(`skipping ${path.basename(src)} (not found at ${src})`)
    continue
  }
  fs.copyFileSync(src, dest)
  synced++
}

if (synced > 0) {
  console.log(`Synced ${synced} install asset(s) → packages/wiki/public/`)
} else {
  console.log("No install assets to sync (standalone build — using vendored copies)")
}
