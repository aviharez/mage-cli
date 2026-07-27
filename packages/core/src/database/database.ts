export * as Database from "./database"

import { EffectDrizzleSqlite } from "@mybcabisnis/mage-effect-drizzle-sqlite"
import { layer as sqliteLayer } from "#sqlite"
import { sql } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { existsSync, readdirSync } from "fs"
import { Global } from "../global"
import { Flag } from "../flag/flag"
import { isAbsolute, join } from "path"
import { DatabaseMigration } from "./migration"
import { InstallationChannel } from "../installation/version"
import { makeGlobalNode } from "../effect/app-node"

const makeDatabase = EffectDrizzleSqlite.makeWithDefaults()
type DatabaseShape = Effect.Success<typeof makeDatabase>

const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`

const legacyDatabasePaths = () => {
  const legacyData = join(Global.Path.home, ".mage", "data")
  return [
    join(legacyData, "mage.db"),
    ...(existsSync(legacyData)
      ? readdirSync(legacyData, { withFileTypes: true })
          .filter((entry) => entry.isFile() && /^mage-.*\.db$/.test(entry.name))
          .map((entry) => join(legacyData, entry.name))
      : []),
    join(Global.Path.data, "mage.db"),
  ]
}

export interface Interface {
  db: DatabaseShape
}

export class Service extends Context.Service<Service, Interface>()("@mage/v2/storage/Database") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = yield* makeDatabase

    yield* db.run("PRAGMA journal_mode = WAL")
    yield* db.run("PRAGMA synchronous = NORMAL")
    yield* db.run("PRAGMA busy_timeout = 5000")
    yield* db.run("PRAGMA cache_size = -64000")
    yield* db.run("PRAGMA foreign_keys = ON")
    yield* db.run("PRAGMA wal_checkpoint(PASSIVE)")
    yield* DatabaseMigration.apply(db)
    yield* importLegacyDatabases(db)

    return { db }
  }).pipe(Effect.orDie),
)

export function layerFromPath(filename: string) {
  return layer.pipe(Layer.provide(sqliteLayer({ filename })))
}

export function path() {
  if (Flag.MAGE_DB) {
    if (Flag.MAGE_DB === ":memory:" || isAbsolute(Flag.MAGE_DB)) return Flag.MAGE_DB
    return join(Global.Path.data, Flag.MAGE_DB)
  }
  if (
    ["latest", "beta", "prod"].includes(InstallationChannel) ||
    process.env.MAGE_DISABLE_CHANNEL_DB === "1" ||
    process.env.MAGE_DISABLE_CHANNEL_DB === "true"
  )
    return join(Global.Path.data, "mage.db")
  return join(Global.Path.data, `mage-${InstallationChannel.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`)
}

function importLegacyDatabases(db: DatabaseShape) {
  if (Flag.MAGE_DB) return Effect.void
  const target = path()
  return Effect.gen(function* () {
    for (const source of new Set(legacyDatabasePaths())) {
      if (source === target || !existsSync(source)) continue

      yield* Effect.gen(function* () {
        yield* db.run(sql`ATTACH DATABASE ${source} AS legacy`)
        const tables = yield* db.all<{ name: string }>(sql`
          SELECT name
          FROM legacy.sqlite_master
          WHERE type = 'table'
            AND name NOT LIKE 'sqlite_%'
            AND name NOT IN ('migration', '__drizzle_migrations')
        `)
        const priority = new Map([
          ["project", 0],
          ["project_directory", 1],
          ["workspace", 2],
          ["session", 10],
          ["message", 20],
          ["part", 30],
        ])

        for (const table of tables.toSorted(
          (left, right) => (priority.get(left.name) ?? 100) - (priority.get(right.name) ?? 100),
        )) {
          const targetColumnRows = yield* db.all<{ name: string }>(
            sql.raw(`PRAGMA main.table_info(${quoteIdentifier(table.name)})`),
          )
          const targetColumns = new Set(targetColumnRows.map((column) => column.name))
          const sourceColumnRows = yield* db.all<{ name: string }>(
            sql.raw(`PRAGMA legacy.table_info(${quoteIdentifier(table.name)})`),
          )
          const columns = sourceColumnRows
            .map((column) => column.name)
            .filter((column) => targetColumns.has(column))
          if (columns.length === 0) continue

          const quotedColumns = columns.map(quoteIdentifier).join(", ")
          yield* db
            .run(
              sql.raw(
                `INSERT OR IGNORE INTO main.${quoteIdentifier(table.name)} (${quotedColumns}) SELECT ${quotedColumns} FROM legacy.${quoteIdentifier(table.name)}`,
              ),
            )
            .pipe(
              Effect.catch((error) =>
                Effect.logWarning("legacy database table skipped", { table: table.name, error }),
              ),
            )
        }
      })
        .pipe(Effect.ensuring(db.run("DETACH DATABASE legacy").pipe(Effect.ignore)))
        .pipe(Effect.catch((error) => Effect.logWarning("legacy database import skipped", { source, error })))
    }
  })
}

export const node = makeGlobalNode({
  service: Service,
  layer: layerFromPath(path()),
  deps: [],
})
