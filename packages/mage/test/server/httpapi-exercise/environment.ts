import { Flag } from "@mybcabisnis/mage-core/flag/flag"
import { Effect } from "effect"
import path from "path"

const preserveExerciseGlobalRoot = !!process.env.MAGE_HTTPAPI_EXERCISE_GLOBAL
export const exerciseGlobalRoot =
  process.env.MAGE_HTTPAPI_EXERCISE_GLOBAL ??
  path.join(process.env.TMPDIR ?? "/tmp", `mage-httpapi-global-${process.pid}`)
process.env.MAGE_TEST_HOME = exerciseGlobalRoot
process.env.MAGE_DISABLE_SHARE = "true"
export const exerciseConfigDirectory = path.join(exerciseGlobalRoot, ".mage")
export const exerciseDataDirectory = path.join(exerciseGlobalRoot, ".mage", "data")

const preserveExerciseDatabase = !!process.env.MAGE_HTTPAPI_EXERCISE_DB
export const exerciseDatabasePath =
  process.env.MAGE_HTTPAPI_EXERCISE_DB ??
  path.join(process.env.TMPDIR ?? "/tmp", `mage-httpapi-exercise-${process.pid}.db`)
process.env.MAGE_DB = exerciseDatabasePath
Flag.MAGE_DB = exerciseDatabasePath

export const original = {
  MAGE_SERVER_PASSWORD: Flag.MAGE_SERVER_PASSWORD,
  MAGE_SERVER_USERNAME: Flag.MAGE_SERVER_USERNAME,
}

export const cleanupExercisePaths = Effect.promise(async () => {
  const fs = await import("fs/promises")
  if (!preserveExerciseDatabase) {
    await Promise.all(
      [exerciseDatabasePath, `${exerciseDatabasePath}-wal`, `${exerciseDatabasePath}-shm`].map((file) =>
        fs.rm(file, { force: true }).catch(() => undefined),
      ),
    )
  }
  if (!preserveExerciseGlobalRoot)
    await fs.rm(exerciseGlobalRoot, { recursive: true, force: true }).catch(() => undefined)
})
