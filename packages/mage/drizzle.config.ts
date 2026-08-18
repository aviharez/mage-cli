import { defineConfig } from "drizzle-kit"
import os from "os"
import path from "path"

const dataDir = process.env.MAGE_DATA_DIR
  ? path.resolve(process.env.MAGE_DATA_DIR)
  : path.join(process.env.MAGE_TEST_HOME ?? os.homedir(), ".mage", "data")

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/**/*.sql.ts",
  out: "./migration",
  dbCredentials: {
    url: path.join(dataDir, "mage.db"),
  },
})
