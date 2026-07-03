import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { Effect } from "effect"
import { Config } from "@/config"
import { MCP } from "@/mcp"
import { Global } from "@/global"
import { Instance } from "@/project/instance"
import { errors } from "../../error"
import { lazy } from "@/util/lazy"
import { jsonRequest } from "./trace"
import {
  Marketplace,
  buildMcpConfig,
  installSkill,
  writeMcpToConfig,
  resolveConfigPath,
  resolveRegistry,
  resolveToken,
} from "@/marketplace"
import path from "path"

// Re-export the Catalog zod schema for OpenAPI resolver
const CatalogSchema = z.object({
  connected: z
    .boolean()
    .describe("Whether the registry was reached; false means the bundled fallback catalog is being shown"),
  skills: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        files: z.array(z.string()),
      }),
    )
    .describe("Available skills in the catalog"),
  mcp: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        config: z.record(z.string(), z.unknown()),
        inputs: z
          .array(
            z.object({
              key: z.string(),
              message: z.string(),
              placeholder: z.string().optional(),
              into: z.enum(["environment", "header", "arg"]),
              secret: z.boolean().optional(),
            }),
          )
          .optional(),
      }),
    )
    .describe("Available MCP servers in the catalog"),
})

const SkillInstallResult = z.object({
  name: z.string(),
  dir: z.string(),
  scope: z.enum(["global", "project"]),
})

const McpInstallResult = z.object({
  name: z.string(),
  scope: z.enum(["global", "project"]),
  configPath: z.string(),
  status: z.record(z.string(), z.unknown()),
})

export const MarketplaceRoutes = lazy(() =>
  new Hono()
    // ------------------------------------------------------------------
    // GET / – fetch the catalog (uses marketplace.registry + token from config)
    // ------------------------------------------------------------------
    .get(
      "/",
      describeRoute({
        summary: "Get marketplace catalog",
        description: "Fetch the list of installable skills and MCP servers from the configured registry.",
        operationId: "marketplace.catalog",
        responses: {
          200: {
            description: "Marketplace catalog",
            content: {
              "application/json": {
                schema: resolver(CatalogSchema),
              },
            },
          },
        },
      }),
      async (c) =>
        jsonRequest("MarketplaceRoutes.catalog", c, function* () {
          const cfg = yield* Config.Service
          const config = yield* cfg.get()
          return yield* Effect.promise(() =>
            Marketplace.catalog(
              resolveRegistry(config.marketplace?.registry),
              resolveToken(config.marketplace?.token),
            ),
          )
        }),
    )
    // ------------------------------------------------------------------
    // POST /skill – install a skill from the catalog
    // ------------------------------------------------------------------
    .post(
      "/skill",
      describeRoute({
        summary: "Install a skill",
        description: "Download a skill from the marketplace registry into the chosen scope directory.",
        operationId: "marketplace.skill.install",
        responses: {
          200: {
            description: "Skill installed",
            content: {
              "application/json": {
                schema: resolver(SkillInstallResult),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "json",
        z.object({
          name: z.string(),
          scope: z.enum(["global", "project"]).default("global"),
        }),
      ),
      async (c) =>
        jsonRequest("MarketplaceRoutes.skill.install", c, function* () {
          const { name, scope } = c.req.valid("json")

          const cfg = yield* Config.Service
          const config = yield* cfg.get()

          // resolveRegistry/resolveToken return undefined when nothing is
          // configured — Marketplace.catalog/installSkill fall back to
          // Rune's baked-in default GitLab registry in that case, so there's
          // no need to hard-fail here the way earlier versions did.
          const registry = resolveRegistry(config.marketplace?.registry)
          const token = resolveToken(config.marketplace?.token)

          const cat = yield* Effect.promise(() => Marketplace.catalog(registry, token))
          const entry = cat.skills.find((s) => s.name === name)
          if (!entry) throw new Error(`Skill "${name}" not found in catalog`)

          const targetDir =
            scope === "global"
              ? path.join(Global.Path.config, "skills")
              : path.join(Instance.worktree, ".mage", "skills")

          const dir = yield* Effect.promise(() => installSkill(entry, registry, token, targetDir))

          return { name, dir, scope }
        }),
    )
    // ------------------------------------------------------------------
    // POST /mcp – install an MCP server from the catalog
    // ------------------------------------------------------------------
    .post(
      "/mcp",
      describeRoute({
        summary: "Install an MCP server",
        description: "Add an MCP server from the marketplace to the chosen scope config file and connect it.",
        operationId: "marketplace.mcp.install",
        responses: {
          200: {
            description: "MCP server installed and connected",
            content: {
              "application/json": {
                schema: resolver(McpInstallResult),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "json",
        z.object({
          name: z.string(),
          scope: z.enum(["global", "project"]).default("global"),
          inputs: z.record(z.string(), z.string()).default({}),
        }),
      ),
      async (c) =>
        jsonRequest("MarketplaceRoutes.mcp.install", c, function* () {
          const { name, scope, inputs } = c.req.valid("json")

          const cfg = yield* Config.Service
          const config = yield* cfg.get()

          // See the /skill route above: undefined registry/token fall back
          // to Rune's baked-in default GitLab registry inside Marketplace.catalog.
          const registry = resolveRegistry(config.marketplace?.registry)
          const token = resolveToken(config.marketplace?.token)

          const cat = yield* Effect.promise(() => Marketplace.catalog(registry, token))
          const entry = cat.mcp.find((m) => m.name === name)
          if (!entry) throw new Error(`MCP server "${name}" not found in catalog`)

          const mcpConfig = buildMcpConfig(entry, inputs)

          const baseDir = scope === "global" ? Global.Path.config : Instance.worktree
          const configPath = yield* Effect.promise(() => resolveConfigPath(baseDir, scope === "global"))

          yield* Effect.promise(() => writeMcpToConfig(name, mcpConfig, configPath))

          // Connect the server live (no restart needed)
          const mcp = yield* MCP.Service
          const result = yield* mcp.add(name, mcpConfig as unknown as Parameters<typeof mcp.add>[1])
          const status = result.status

          return { name, scope, configPath, status }
        }),
    ),
)
