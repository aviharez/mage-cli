import { Database as BunDatabase } from "bun:sqlite"
import { afterAll, expect, test } from "bun:test"
import { Effect } from "effect"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import path from "node:path"

const root = await mkdtemp(path.join(process.env.TMPDIR ?? "/tmp", "mage-database-"))
const home = path.join(root, "home")
process.env.MAGE_TEST_HOME = home
process.env.MAGE_DATA_DIR = path.join(root, "current")
process.env.MAGE_DISABLE_CHANNEL_DB = "true"
const xdgData = path.join(home, ".local", "share")
process.env.XDG_DATA_HOME = xdgData

const { Database } = await import("../src/database/database")
const { sql } = await import("drizzle-orm")

const createLegacyDatabase = (filename: string, projectId: string, sessionId: string, slug: string, title: string) => {
  const database = new BunDatabase(filename)
  database.exec(`
  CREATE TABLE project (
    id TEXT PRIMARY KEY,
    worktree TEXT NOT NULL,
    vcs TEXT,
    time_created INTEGER NOT NULL,
    time_updated INTEGER NOT NULL,
    sandboxes TEXT NOT NULL
  );
  CREATE TABLE session (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    directory TEXT NOT NULL,
    title TEXT NOT NULL,
    version TEXT NOT NULL,
    time_created INTEGER NOT NULL,
    time_updated INTEGER NOT NULL
  );
`)
  database
    .query("INSERT INTO project (id, worktree, vcs, time_created, time_updated, sandboxes) VALUES (?, ?, ?, ?, ?, ?)")
    .run(projectId, `/tmp/${projectId}`, "git", 1, 1, "[]")
  database
    .query(
    "INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(sessionId, projectId, slug, `/tmp/${projectId}`, title, "1", 1, 1)
  database.close()
}

await Promise.all([
  mkdir(path.join(home, ".mage", "data"), { recursive: true }),
  mkdir(path.join(xdgData, "mage"), { recursive: true }),
  mkdir(path.join(xdgData, "opencode"), { recursive: true }),
])

createLegacyDatabase(path.join(home, ".mage", "data", "mage.db"), "legacy-project", "legacy-session", "legacy", "Legacy session")
createLegacyDatabase(
  path.join(home, ".mage", "data", "mage-local.db"),
  "channel-project",
  "channel-session",
  "channel",
  "Channel session",
)
createLegacyDatabase(path.join(xdgData, "mage", "mage.db"), "xdg-mage-project", "xdg-mage-session", "xdg-mage", "XDG Mage session")
createLegacyDatabase(
  path.join(xdgData, "mage", "mage-beta.db"),
  "xdg-mage-channel-project",
  "xdg-mage-channel-session",
  "xdg-mage-channel",
  "XDG Mage channel session",
)
createLegacyDatabase(
  path.join(xdgData, "mage", "opencode.db"),
  "xdg-mage-opencode-project",
  "xdg-mage-opencode-session",
  "xdg-mage-opencode",
  "XDG Mage OpenCode session",
)
createLegacyDatabase(path.join(xdgData, "opencode", "opencode.db"), "xdg-opencode-project", "xdg-opencode-session", "xdg-opencode", "XDG OpenCode session")
createLegacyDatabase(
  path.join(xdgData, "opencode", "opencode-local.db"),
  "xdg-opencode-channel-project",
  "xdg-opencode-channel-session",
  "xdg-opencode-channel",
  "XDG OpenCode channel session",
)

const rows = await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      return yield* db.all<{ id: string }>(sql`SELECT id FROM session`)
    }).pipe(Effect.provide(Database.layerFromPath(Database.path()))),
  ),
)

test("imports sessions from legacy Mage and OpenCode databases", () => {
  expect(rows.map((row) => row.id)).toContain("legacy-session")
  expect(rows.map((row) => row.id)).toContain("channel-session")
  expect(rows.map((row) => row.id)).toContain("xdg-mage-session")
  expect(rows.map((row) => row.id)).toContain("xdg-mage-channel-session")
  expect(rows.map((row) => row.id)).toContain("xdg-mage-opencode-session")
  expect(rows.map((row) => row.id)).toContain("xdg-opencode-session")
  expect(rows.map((row) => row.id)).toContain("xdg-opencode-channel-session")
})

afterAll(() => rm(root, { recursive: true, force: true }))
