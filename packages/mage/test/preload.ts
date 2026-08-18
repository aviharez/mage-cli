// IMPORTANT: Set env vars BEFORE any imports from src/ directory
import os from "os"
import path from "path"
import fs from "fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import { afterAll } from "bun:test"

const dir = path.join(os.tmpdir(), "mage-test-data-" + process.pid)
await fs.mkdir(dir, { recursive: true })
afterAll(async () => {
  const { AppRuntime } = await import("../src/effect/app-runtime")
  await AppRuntime.dispose()

  const busy = (error: unknown) =>
    typeof error === "object" && error !== null && "code" in error && error.code === "EBUSY"
  const rm = async (left: number): Promise<void> => {
    Bun.gc(true)
    await sleep(100)
    return fs.rm(dir, { recursive: true, force: true }).catch((error) => {
      if (!busy(error)) throw error
      if (left <= 1 && process.platform !== "win32") throw error
      if (left <= 1) return
      return rm(left - 1)
    })
  }

  // Windows can keep SQLite WAL handles alive until GC finalizers run, so we
  // force GC and retry teardown to avoid flaky EBUSY in test cleanup.
  await rm(30)
})

process.env["MAGE_EXPERIMENTAL_EVENT_SYSTEM"] = "true"
process.env["MAGE_EXPERIMENTAL_WORKSPACES"] = "true"

// Set test home directory to isolate tests from user's actual home directory
// This prevents tests from picking up real user configs/skills from ~/.claude/skills
const testHome = path.join(dir, "home")
await fs.mkdir(testHome, { recursive: true })
process.env["MAGE_TEST_HOME"] = testHome

// Set test managed config directory to isolate tests from system managed settings
const testManagedConfigDir = path.join(dir, "managed")
process.env["MAGE_TEST_MANAGED_CONFIG_DIR"] = testManagedConfigDir

// Write the cache version file to prevent global/index.ts from clearing the cache
const cacheDir = path.join(testHome, ".mage", "cache")
await fs.mkdir(cacheDir, { recursive: true })
await fs.writeFile(path.join(cacheDir, "version"), "21")

// Clear provider and server auth env vars to ensure clean test state
delete process.env["ANTHROPIC_API_KEY"]
delete process.env["OPENAI_API_KEY"]
delete process.env["GOOGLE_API_KEY"]
delete process.env["GOOGLE_GENERATIVE_AI_API_KEY"]
delete process.env["AZURE_OPENAI_API_KEY"]
delete process.env["AWS_ACCESS_KEY_ID"]
delete process.env["AWS_PROFILE"]
delete process.env["AWS_REGION"]
delete process.env["AWS_BEARER_TOKEN_BEDROCK"]
delete process.env["OPENROUTER_API_KEY"]
delete process.env["LLM_GATEWAY_API_KEY"]
delete process.env["GROQ_API_KEY"]
delete process.env["MISTRAL_API_KEY"]
delete process.env["PERPLEXITY_API_KEY"]
delete process.env["TOGETHER_API_KEY"]
delete process.env["XAI_API_KEY"]
delete process.env["DEEPSEEK_API_KEY"]
delete process.env["FIREWORKS_API_KEY"]
delete process.env["CEREBRAS_API_KEY"]
delete process.env["SAMBANOVA_API_KEY"]
delete process.env["MAGE_SERVER_PASSWORD"]
delete process.env["MAGE_SERVER_USERNAME"]
delete process.env["MAGE_EXPERIMENTAL"]
delete process.env["MAGE_ENABLE_EXPERIMENTAL_MODELS"]
delete process.env["OTEL_EXPORTER_OTLP_ENDPOINT"]
delete process.env["OTEL_EXPORTER_OTLP_HEADERS"]
delete process.env["OTEL_RESOURCE_ATTRIBUTES"]

// Use in-memory sqlite
process.env["MAGE_DB"] = ":memory:"

// Now safe to import from src/
const { initProjectors } = await import("../src/server/projectors")

initProjectors()
