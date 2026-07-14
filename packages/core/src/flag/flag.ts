import { Config } from "effect"

export function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

const copy = process.env["MAGE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
const fff = process.env["MAGE_DISABLE_FFF"]

function enabledByExperimental(key: string) {
  return process.env[key] === undefined ? truthy("MAGE_EXPERIMENTAL") : truthy(key)
}

export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],

  MAGE_AUTO_HEAP_SNAPSHOT: truthy("MAGE_AUTO_HEAP_SNAPSHOT"),
  MAGE_GIT_BASH_PATH: process.env["MAGE_GIT_BASH_PATH"],
  MAGE_CONFIG: process.env["MAGE_CONFIG"],
  MAGE_CONFIG_CONTENT: process.env["MAGE_CONFIG_CONTENT"],
  MAGE_DISABLE_AUTOUPDATE: truthy("MAGE_DISABLE_AUTOUPDATE"),
  MAGE_ALWAYS_NOTIFY_UPDATE: truthy("MAGE_ALWAYS_NOTIFY_UPDATE"),
  MAGE_DISABLE_PRUNE: truthy("MAGE_DISABLE_PRUNE"),
  MAGE_DISABLE_TERMINAL_TITLE: truthy("MAGE_DISABLE_TERMINAL_TITLE"),
  MAGE_SHOW_TTFD: truthy("MAGE_SHOW_TTFD"),
  MAGE_DISABLE_AUTOCOMPACT: truthy("MAGE_DISABLE_AUTOCOMPACT"),
  MAGE_DISABLE_MOUSE: truthy("MAGE_DISABLE_MOUSE"),
  MAGE_FAKE_VCS: process.env["MAGE_FAKE_VCS"],
  MAGE_SERVER_PASSWORD: process.env["MAGE_SERVER_PASSWORD"],
  MAGE_SERVER_USERNAME: process.env["MAGE_SERVER_USERNAME"],
  MAGE_DISABLE_FFF: fff === undefined ? process.platform === "win32" : truthy("MAGE_DISABLE_FFF"),

  // Experimental
  MAGE_EXPERIMENTAL_FILEWATCHER: Config.boolean("MAGE_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  MAGE_EXPERIMENTAL_DISABLE_FILEWATCHER: Config.boolean("MAGE_EXPERIMENTAL_DISABLE_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  MAGE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:
    copy === undefined ? process.platform === "win32" : truthy("MAGE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"),
  MAGE_DB: process.env["MAGE_DB"],

  MAGE_WORKSPACE_ID: process.env["MAGE_WORKSPACE_ID"],
  MAGE_EXPERIMENTAL_WORKSPACES: enabledByExperimental("MAGE_EXPERIMENTAL_WORKSPACES"),

  // Evaluated at access time (not module load) because tests, the CLI, and
  // external tooling set these env vars at runtime.
  get MAGE_DISABLE_PROJECT_CONFIG() {
    return truthy("MAGE_DISABLE_PROJECT_CONFIG")
  },
  get MAGE_EXPERIMENTAL_REFERENCES() {
    return enabledByExperimental("MAGE_EXPERIMENTAL_REFERENCES")
  },
  get MAGE_TUI_CONFIG() {
    return process.env["MAGE_TUI_CONFIG"]
  },
  get MAGE_CONFIG_DIR() {
    return process.env["MAGE_CONFIG_DIR"]
  },
  get MAGE_PURE() {
    return truthy("MAGE_PURE")
  },
  get MAGE_PERMISSION() {
    return process.env["MAGE_PERMISSION"]
  },
  get MAGE_PLUGIN_META_FILE() {
    return process.env["MAGE_PLUGIN_META_FILE"]
  },
  get MAGE_CLIENT() {
    return process.env["MAGE_CLIENT"] ?? "cli"
  },
}
