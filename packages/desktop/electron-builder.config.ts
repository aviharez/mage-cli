import { execFile } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import type { Configuration } from "electron-builder"

const execFileAsync = promisify(execFile)
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const signScript = path.join(rootDir, "script", "sign-windows.ps1")

async function signWindows(configuration: { path: string }) {
  if (process.platform !== "win32") return
  if (process.env.GITHUB_ACTIONS !== "true") return

  await execFileAsync(
    "pwsh",
    ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", signScript, configuration.path],
    { cwd: rootDir },
  )
}

const channel = (() => {
  const raw = process.env.MAGE_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  return "dev"
})()

const getBase = (): Configuration => ({
  artifactName: "mage-desktop-${os}-${arch}.${ext}",
  directories: {
    output: "dist",
    buildResources: "resources",
  },
  files: ["out/**/*", "resources/**/*"],
  // Native prebuilt modules must live outside the asar so their .node/.dll/.exe
  // siblings (e.g. node-pty's conpty.dll + OpenConsole.exe) can be loaded at runtime.
  asarUnpack: ["**/node_modules/@lydell/node-pty-*/**", "**/node_modules/@parcel/watcher-*/**"],
  extraResources: [
    {
      from: "native/",
      to: "native/",
      filter: ["index.js", "index.d.ts", "build/Release/mac_window.node", "swift-build/**"],
    },
    {
      // Ship the default config dir so the bundled server can load default commands,
      // skills, agents, and themes (see MAGE_CONFIG_DIR in src/main/server.ts).
      from: "../opencode/defaults",
      to: "defaults",
      filter: ["**/*", "!**/node_modules/**", "!**/.DS_Store"],
    },
  ],
  mac: {
    category: "public.app-category.developer-tools",
    icon: `resources/icons/icon.icns`,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "resources/entitlements.plist",
    entitlementsInherit: "resources/entitlements.plist",
    notarize: true,
    target: ["dmg", "zip"],
  },
  dmg: {
    sign: true,
  },
  protocols: {
    name: "Mage",
    schemes: ["mage"],
  },
  win: {
    icon: `resources/icons/icon.ico`,
    signtoolOptions: {
      sign: signWindows,
    },
    target: ["nsis"],
    verifyUpdateCodeSignature: false,
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    installerIcon: `resources/icons/icon.ico`,
    installerHeaderIcon: `resources/icons/icon.ico`,
  },
  linux: {
    icon: `resources/icons`,
    category: "Development",
    target: ["AppImage", "deb", "rpm"],
  },
})

function getConfig() {
  const base = getBase()

  switch (channel) {
    case "dev": {
      return {
        ...base,
        appId: "id.bca.mage.desktop.dev",
        productName: "Mage Dev",
        rpm: { packageName: "mage-dev" },
      }
    }
    case "beta": {
      return {
        ...base,
        appId: "id.bca.mage.desktop.beta",
        productName: "Mage Beta",
        protocols: { name: "Mage Beta", schemes: ["mage"] },
        publish: { provider: "github", owner: "anomalyco", repo: "mage-beta", channel: "latest" },
        rpm: { packageName: "mage-beta" },
      }
    }
    case "prod": {
      return {
        ...base,
        appId: "id.bca.mage.desktop",
        productName: "Mage",
        protocols: { name: "Mage", schemes: ["mage"] },
        publish: { provider: "github", owner: "anomalyco", repo: "opencode", channel: "latest" },
        rpm: { packageName: "mage" },
      }
    }
  }
}

export default getConfig()
