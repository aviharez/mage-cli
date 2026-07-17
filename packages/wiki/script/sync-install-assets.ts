#!/usr/bin/env bun

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "../../..")
const publicDir = path.join(__dirname, "../public")

const assets: [string, string][] = [
  [path.join(repoRoot, "install.sh"), path.join(publicDir, "install")],
  [path.join(repoRoot, "install.ps1"), path.join(publicDir, "install.ps1")],
  [path.join(repoRoot, "install.cmd"), path.join(publicDir, "install.cmd")],
]

for (const [src, dest] of assets) {
  fs.copyFileSync(src, dest)
}

console.log("Synced install assets → packages/wiki/public/")
