import { Config, ConfigProvider, Context, Effect, Layer, Option } from "effect"
import { ConfigService } from "@/effect/config-service"

const bool = (name: string) => Config.boolean(name).pipe(Config.withDefault(false))
const positiveInteger = (name: string) =>
  Config.number(name).pipe(
    Config.map((value) => (Number.isInteger(value) && value > 0 ? value : undefined)),
    Config.orElse(() => Config.succeed(undefined)),
  )
const experimental = bool("MAGE_EXPERIMENTAL")
const enabledByExperimental = (name: string) =>
  Config.all({ experimental, enabled: Config.boolean(name).pipe(Config.option) }).pipe(
    Config.map((flags) => Option.getOrElse(flags.enabled, () => flags.experimental)),
  )

export class Service extends ConfigService.Service<Service>()("@mage/RuntimeFlags", {
  autoShare: bool("MAGE_AUTO_SHARE"),
  pure: bool("MAGE_PURE"),
  disableDefaultPlugins: bool("MAGE_DISABLE_DEFAULT_PLUGINS"),
  disableEmbeddedWebUi: bool("MAGE_DISABLE_EMBEDDED_WEB_UI"),
  disableExternalSkills: bool("MAGE_DISABLE_EXTERNAL_SKILLS"),
  disableLspDownload: bool("MAGE_DISABLE_LSP_DOWNLOAD"),
  disableClaudeCodePrompt: Config.all({
    broad: bool("MAGE_DISABLE_CLAUDE_CODE"),
    direct: bool("MAGE_DISABLE_CLAUDE_CODE_PROMPT"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  disableClaudeCodeSkills: Config.all({
    broad: bool("MAGE_DISABLE_CLAUDE_CODE"),
    direct: bool("MAGE_DISABLE_CLAUDE_CODE_SKILLS"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  enableExa: Config.all({
    experimental,
    enabled: bool("MAGE_ENABLE_EXA"),
    legacy: bool("MAGE_EXPERIMENTAL_EXA"),
  }).pipe(Config.map((flags) => flags.experimental || flags.enabled || flags.legacy)),
  enableParallel: Config.all({
    enabled: bool("MAGE_ENABLE_PARALLEL"),
    legacy: bool("MAGE_EXPERIMENTAL_PARALLEL"),
  }).pipe(Config.map((flags) => flags.enabled || flags.legacy)),
  enableExperimentalModels: bool("MAGE_ENABLE_EXPERIMENTAL_MODELS"),
  enableQuestionTool: bool("MAGE_ENABLE_QUESTION_TOOL"),
  experimentalReferences: enabledByExperimental("MAGE_EXPERIMENTAL_REFERENCES"),
  experimentalBackgroundSubagents: enabledByExperimental("MAGE_EXPERIMENTAL_BACKGROUND_SUBAGENTS"),
  experimentalLspTy: bool("MAGE_EXPERIMENTAL_LSP_TY"),
  experimentalLspTool: enabledByExperimental("MAGE_EXPERIMENTAL_LSP_TOOL"),
  experimentalOxfmt: enabledByExperimental("MAGE_EXPERIMENTAL_OXFMT"),
  experimentalPlanMode: enabledByExperimental("MAGE_EXPERIMENTAL_PLAN_MODE"),
  experimentalCodeMode: enabledByExperimental("MAGE_EXPERIMENTAL_CODE_MODE"),
  experimentalEventSystem: enabledByExperimental("MAGE_EXPERIMENTAL_EVENT_SYSTEM"),
  experimentalWorkspaces: enabledByExperimental("MAGE_EXPERIMENTAL_WORKSPACES"),
  experimentalIconDiscovery: enabledByExperimental("MAGE_EXPERIMENTAL_ICON_DISCOVERY"),
  outputTokenMax: positiveInteger("MAGE_EXPERIMENTAL_OUTPUT_TOKEN_MAX"),
  bashDefaultTimeoutMs: positiveInteger("MAGE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS"),
  experimentalWebSockets: bool("MAGE_EXPERIMENTAL_WEBSOCKETS"),
  client: Config.string("MAGE_CLIENT").pipe(Config.withDefault("cli")),
}) {}

export type Info = Context.Service.Shape<typeof Service>

const emptyConfigLayer = Service.layer.pipe(
  Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
  Layer.orDie,
)

export const layer = (overrides: Partial<Info> = {}) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const flags = yield* Service
      return Service.of({ ...flags, ...overrides })
    }),
  ).pipe(Layer.provide(emptyConfigLayer))

export const node = LayerNode.make({ service: Service, layer: Service.layer.pipe(Layer.orDie), deps: [] })

export * as RuntimeFlags from "./runtime-flags"
import { LayerNode } from "@mybcabisnis/mage-core/effect/layer-node"
