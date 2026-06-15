import { sentryVitePlugin } from "@sentry/vite-plugin"
import { defineConfig } from "electron-vite"
import appPlugin from "@mybcabisnis/mage-app/vite"
import * as fs from "node:fs/promises"

const MAGE_SERVER_DIST = "../opencode/dist/node"

const channel = (() => {
  const raw = process.env.MAGE_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  if (process.env.MAGE_CHANNEL === "latest") return "prod"
  // Default to prod so a bare `bun run build` behaves the same as package:win.
  // Note: newLayoutDesignsDefault in context/settings.tsx is now unconditionally
  // true (arcanum V2 is the only UI in this fork), so this channel value no
  // longer controls which layout ships — it only affects Sentry environment and
  // auto-updater channel tagging.
  return "prod"
})()

// Allow targeting a platform/arch different from the build host (e.g. building a
// Windows app from macOS). The matching prebuilt native module is staged into
// node_modules by scripts/stage-native.ts before packaging.
const targetPlatform = process.env.MAGE_TARGET_PLATFORM ?? process.platform
const targetArch = process.env.MAGE_TARGET_ARCH ?? process.arch
const nodePtyPkg = `@lydell/node-pty-${targetPlatform}-${targetArch}`

const sentry =
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
    ? sentryVitePlugin({
        authToken: process.env.SENTRY_AUTH_TOKEN,
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        telemetry: false,
        release: {
          name: process.env.SENTRY_RELEASE ?? process.env.VITE_SENTRY_RELEASE,
        },
        sourcemaps: {
          assets: "./out/renderer/**",
          filesToDeleteAfterUpload: "./out/renderer/**/*.map",
        },
      })
    : false

export default defineConfig({
  main: {
    define: {
      "import.meta.env.MAGE_CHANNEL": JSON.stringify(channel),
    },
    build: {
      rollupOptions: {
        input: { index: "src/main/index.ts", sidecar: "src/main/sidecar.ts" },
      },
      externalizeDeps: { include: [nodePtyPkg] },
    },
    plugins: [
      {
        name: "mage:node-pty-narrower",
        enforce: "pre",
        resolveId(s) {
          if (s === "@lydell/node-pty") return nodePtyPkg
        },
      },
      {
        name: "mage:virtual-server-module",
        enforce: "pre",
        resolveId(id) {
          if (id === "virtual:mage-server") return this.resolve(`${MAGE_SERVER_DIST}/node.js`)
        },
      },
      {
        name: "mage:copy-server-assets",
        async writeBundle() {
          for (const l of await fs.readdir(MAGE_SERVER_DIST)) {
            if (!l.endsWith(".wasm")) continue
            await fs.writeFile(`./out/main/chunks/${l}`, await fs.readFile(`${MAGE_SERVER_DIST}/${l}`))
          }
        },
      },
    ],
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: "src/preload/index.ts" },
        output: {
          format: "cjs",
          entryFileNames: "[name].js",
        },
      },
    },
  },
  renderer: {
    define: {
      // The renderer reads both `MAGE_CHANNEL` (sentry filter in index.tsx) and
      // `VITE_MAGE_CHANNEL` (channel badge in the app package).
      // Without injecting these they are `undefined` in packaged builds.
      // Note: newLayoutDesignsDefault is now hardcoded to true in
      // context/settings.tsx, so VITE_MAGE_CHANNEL no longer drives layout choice.
      "import.meta.env.MAGE_CHANNEL": JSON.stringify(channel),
      "import.meta.env.VITE_MAGE_CHANNEL": JSON.stringify(channel),
    },
    plugins: [appPlugin, sentry],
    publicDir: "../../../app/public",
    root: "src/renderer",
    build: {
      sourcemap: true,
      rollupOptions: {
        input: {
          main: "src/renderer/index.html",
          loading: "src/renderer/loading.html",
        },
      },
    },
  },
})
