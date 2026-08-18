import { Database as BunDatabase } from "bun:sqlite"
import { afterAll, expect, test } from "bun:test"
import { Effect } from "effect"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import path from "node:path"

const root = await mkdtemp(path.join(process.env.TMPDIR ?? "/tmp", "mage-database-"))
const home = path.join(root, "home")
process.env.MAGE_TEST_HOME = home
process.env.XDG_DATA_HOME = path.join(root, "data")
process.env.XDG_CACHE_HOME = path.join(root, "cache")
process.env.XDG_STATE_HOME = path.join(root, "state")
process.env.MAGE_DISABLE_CHANNEL_DB = "true"

const { Database } = await import("../src/database/database")
const { sql } = await import("drizzle-orm")

await mkdir(path.join(home, ".mage", "data"), { recursive: true })
const legacy = new BunDatabase(path.join(home, ".mage", "data", "mage.db"))
legacy.exec(`
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
legacy
  .query("INSERT INTO project (id, worktree, vcs, time_created, time_updated, sandboxes) VALUES (?, ?, ?, ?, ?, ?)")
  .run("legacy-project", "/tmp/project", "git", 1, 1, "[]")
legacy
  .query(
    "INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
  .run("legacy-session", "legacy-project", "legacy", "/tmp/project", "Legacy session", "1", 1, 1)
legacy.close()

const channelLegacy = new BunDatabase(path.join(home, ".mage", "data", "mage-local.db"))
channelLegacy.exec(`
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
channelLegacy
  .query("INSERT INTO project (id, worktree, vcs, time_created, time_updated, sandboxes) VALUES (?, ?, ?, ?, ?, ?)")
  .run("channel-project", "/tmp/channel-project", "git", 1, 1, "[]")
channelLegacy
  .query(
    "INSERT INTO session (id, project_id, slug, directory, title, version, time_created, time_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
  .run("channel-session", "channel-project", "channel", "/tmp/channel-project", "Channel session", "1", 1, 1)
channelLegacy.close()

const rows = await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      return yield* db.all<{ id: string }>(sql`SELECT id FROM session`)
    }).pipe(Effect.provide(Database.layerFromPath(Database.path()))),
  ),
)

test("imports sessions from the pre-rebase Mage database", () => {
  expect(rows.map((row) => row.id)).toContain("legacy-session")
  expect(rows.map((row) => row.id)).toContain("channel-session")
})

afterAll(() => rm(root, { recursive: true, force: true }))
