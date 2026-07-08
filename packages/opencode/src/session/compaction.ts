import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import * as Session from "./session"
import { SessionID, MessageID, PartID } from "./schema"
import { Provider } from "../provider"
import { MessageV2 } from "./message-v2"
import z from "zod"
import { Token } from "../util"
import { Log } from "../util"
import { SessionProcessor } from "./processor"
import { Agent } from "@/agent/agent"
import { Plugin } from "@/plugin"
import { Config } from "@/config"
import { NotFoundError } from "@/storage"
import { ModelID, ProviderID } from "@/provider/schema"
import { Effect, Layer, Context } from "effect"
import { InstanceState } from "@/effect"
import { isOverflow as overflow, usable } from "./overflow"
import { makeRuntime } from "@/effect/run-service"
import { fn } from "@/util/fn"

const log = Log.create({ service: "session.compaction" })

export const Event = {
  Compacted: BusEvent.define(
    "session.compacted",
    z.object({
      sessionID: SessionID.zod,
    }),
  ),
}

export const PRUNE_MINIMUM = 20_000
export const PRUNE_PROTECT = 40_000
const PRUNE_PROTECTED_TOOLS = ["skill"]
const DEFAULT_TAIL_TURNS = 2
const MIN_PRESERVE_RECENT_TOKENS = 2_000
const MAX_PRESERVE_RECENT_TOKENS = 8_000
// Headroom subtracted from the summarizer's usable context when shrinking the
// compaction head to fit — leaves room for the summary prompt template and
// the model's own output tokens.
const HISTORY_SAFETY_BUFFER = 4_000
// Fractions of the base shrink budget tried in order when the summarization
// request itself overflows the provider (e.g. the model's declared context
// limit is larger than what the provider actually accepts). The first factor
// (1) is the normal shrinkToFit target; later, smaller factors are a
// limit-agnostic fallback so compaction keeps making progress instead of
// dead-ending on the very first overflow.
const COMPACTION_SHRINK_FACTORS = [1, 0.55, 0.3]
type Turn = {
  start: number
  end: number
  id: MessageID
}

function preserveRecentBudget(input: { cfg: Config.Info; model: Provider.Model }) {
  return (
    input.cfg.compaction?.preserve_recent_tokens ??
    Math.min(MAX_PRESERVE_RECENT_TOKENS, Math.max(MIN_PRESERVE_RECENT_TOKENS, Math.floor(usable(input) * 0.25)))
  )
}

function turns(messages: MessageV2.WithParts[]) {
  const result: Turn[] = []
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.info.role !== "user") continue
    if (msg.parts.some((part) => part.type === "compaction")) continue
    result.push({
      start: i,
      end: messages.length,
      id: msg.info.id,
    })
  }
  for (let i = 0; i < result.length - 1; i++) {
    result[i].end = result[i + 1].start
  }
  return result
}

export interface Interface {
  readonly isOverflow: (input: {
    tokens: MessageV2.Assistant["tokens"]
    model: Provider.Model
  }) => Effect.Effect<boolean>
  readonly prune: (input: { sessionID: SessionID }) => Effect.Effect<void>
  readonly process: (input: {
    parentID: MessageID
    messages: MessageV2.WithParts[]
    sessionID: SessionID
    auto: boolean
    overflow?: boolean
  }) => Effect.Effect<"continue" | "stop">
  readonly create: (input: {
    sessionID: SessionID
    agent: string
    model: { providerID: ProviderID; modelID: ModelID }
    auto: boolean
    overflow?: boolean
  }) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionCompaction") {}

export const layer: Layer.Layer<
  Service,
  never,
  | Bus.Service
  | Config.Service
  | Session.Service
  | Agent.Service
  | Plugin.Service
  | SessionProcessor.Service
  | Provider.Service
> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const config = yield* Config.Service
    const session = yield* Session.Service
    const agents = yield* Agent.Service
    const plugin = yield* Plugin.Service
    const processors = yield* SessionProcessor.Service
    const provider = yield* Provider.Service

    const isOverflow = Effect.fn("SessionCompaction.isOverflow")(function* (input: {
      tokens: MessageV2.Assistant["tokens"]
      model: Provider.Model
    }) {
      return overflow({ cfg: yield* config.get(), tokens: input.tokens, model: input.model })
    })

    const estimate = Effect.fn("SessionCompaction.estimate")(function* (input: {
      messages: MessageV2.WithParts[]
      model: Provider.Model
    }) {
      const msgs = yield* MessageV2.toModelMessagesEffect(input.messages, input.model)
      return Token.estimate(JSON.stringify(msgs))
    })

    const select = Effect.fn("SessionCompaction.select")(function* (input: {
      messages: MessageV2.WithParts[]
      cfg: Config.Info
      model: Provider.Model
    }) {
      const limit = input.cfg.compaction?.tail_turns ?? DEFAULT_TAIL_TURNS
      if (limit <= 0) return { head: input.messages, tail_start_id: undefined }
      const budget = preserveRecentBudget({ cfg: input.cfg, model: input.model })
      const all = turns(input.messages)
      if (!all.length) return { head: input.messages, tail_start_id: undefined }
      const recent = all.slice(-limit)
      const sizes = yield* Effect.forEach(
        recent,
        (turn) =>
          estimate({
            messages: input.messages.slice(turn.start, turn.end),
            model: input.model,
          }),
        { concurrency: 1 },
      )
      if (sizes.at(-1)! > budget) {
        log.info("tail fallback", { budget, size: sizes.at(-1) })
        return { head: input.messages, tail_start_id: undefined }
      }

      let total = 0
      let keep: Turn | undefined
      for (let i = recent.length - 1; i >= 0; i--) {
        const size = sizes[i]
        if (total + size > budget) break
        total += size
        keep = recent[i]
      }

      if (!keep || keep.start === 0) return { head: input.messages, tail_start_id: undefined }
      return {
        head: input.messages.slice(0, keep.start),
        tail_start_id: keep.id,
      }
    })

    // Sheds bytes from a (already-cloned) compaction head so the summarization
    // request always fits the summarizer model's context — this is what fixes
    // "Conversation history too large to compact - exceeds model context limit".
    // Real conversational turns are preserved as long as possible: tool-call
    // *outputs* (the largest, least-summary-relevant bytes — the tool name and
    // arguments are kept) are blanked first, and only if that isn't enough are
    // whole messages dropped, oldest first. The verbatim recent tail kept by
    // `select` is a separate slice and is never touched by this function.
    //
    // `budget` optionally overrides the default `usable(...) -
    // HISTORY_SAFETY_BUFFER` target. This lets a caller re-shrink harder than
    // the model's declared limit would imply — e.g. `attemptSummary` below
    // retries with a smaller budget when the provider still rejects a request
    // opencode believed fit, which happens when the declared model limit is
    // larger than what the provider actually accepts.
    const shrinkToFit = Effect.fn("SessionCompaction.shrinkToFit")(function* (input: {
      messages: MessageV2.WithParts[]
      model: Provider.Model
      cfg: Config.Info
      budget?: number
    }) {
      for (const msg of input.messages) {
        for (const part of msg.parts) {
          if (part.type !== "tool") continue
          if (part.state.status !== "completed") continue
          if (PRUNE_PROTECTED_TOOLS.includes(part.tool)) continue
          part.state.time.compacted = Date.now()
        }
      }

      let msgs = input.messages
      const budget = input.budget ?? usable({ cfg: input.cfg, model: input.model }) - HISTORY_SAFETY_BUFFER
      while (msgs.length > 0 && (yield* estimate({ messages: msgs, model: input.model })) > budget) {
        msgs = msgs.slice(1)
      }
      if (msgs.length !== input.messages.length) {
        log.warn("shrink_dropped_messages", { dropped: input.messages.length - msgs.length, kept: msgs.length })
      }
      return msgs
    })

    // goes backwards through parts until there are PRUNE_PROTECT tokens worth of tool
    // calls, then erases output of older tool calls to free context space
    const prune = Effect.fn("SessionCompaction.prune")(function* (input: { sessionID: SessionID }) {
      const cfg = yield* config.get()
      if (!cfg.compaction?.prune) return
      log.info("pruning")

      const msgs = yield* session
        .messages({ sessionID: input.sessionID })
        .pipe(Effect.catchIf(NotFoundError.isInstance, () => Effect.succeed(undefined)))
      if (!msgs) return

      let total = 0
      let pruned = 0
      const toPrune: MessageV2.ToolPart[] = []
      let turns = 0

      loop: for (let msgIndex = msgs.length - 1; msgIndex >= 0; msgIndex--) {
        const msg = msgs[msgIndex]
        if (msg.info.role === "user") turns++
        if (turns < 2) continue
        if (msg.info.role === "assistant" && msg.info.summary) break loop
        for (let partIndex = msg.parts.length - 1; partIndex >= 0; partIndex--) {
          const part = msg.parts[partIndex]
          if (part.type === "tool")
            if (part.state.status === "completed") {
              if (PRUNE_PROTECTED_TOOLS.includes(part.tool)) continue
              if (part.state.time.compacted) break loop
              const estimate = Token.estimate(part.state.output)
              total += estimate
              if (total > PRUNE_PROTECT) {
                pruned += estimate
                toPrune.push(part)
              }
            }
        }
      }

      log.info("found", { pruned, total })
      if (pruned > PRUNE_MINIMUM) {
        for (const part of toPrune) {
          if (part.state.status === "completed") {
            part.state.time.compacted = Date.now()
            yield* session.updatePart(part)
          }
        }
        log.info("pruned", { count: toPrune.length })
      }
    })

    const processCompaction = Effect.fn("SessionCompaction.process")(function* (input: {
      parentID: MessageID
      messages: MessageV2.WithParts[]
      sessionID: SessionID
      auto: boolean
      overflow?: boolean
    }) {
      const parent = input.messages.findLast((m) => m.info.id === input.parentID)
      if (!parent || parent.info.role !== "user") {
        throw new Error(`Compaction parent must be a user message: ${input.parentID}`)
      }
      const userMessage = parent.info
      const compactionPart = parent.parts.find((part): part is MessageV2.CompactionPart => part.type === "compaction")

      let messages = input.messages
      let replay:
        | {
            info: MessageV2.User
            parts: MessageV2.Part[]
          }
        | undefined
      if (input.overflow) {
        const idx = input.messages.findIndex((m) => m.info.id === input.parentID)
        for (let i = idx - 1; i >= 0; i--) {
          const msg = input.messages[i]
          if (msg.info.role === "user" && !msg.parts.some((p) => p.type === "compaction")) {
            replay = { info: msg.info, parts: msg.parts }
            messages = input.messages.slice(0, i)
            break
          }
        }
        const hasContent =
          replay && messages.some((m) => m.info.role === "user" && !m.parts.some((p) => p.type === "compaction"))
        if (!hasContent) {
          replay = undefined
          messages = input.messages
        }
      }

      const agent = yield* agents.get("compaction")
      const model = agent.model
        ? yield* provider.getModel(agent.model.providerID, agent.model.modelID)
        : yield* provider.getModel(userMessage.model.providerID, userMessage.model.modelID)
      const cfg = yield* config.get()
      const history = compactionPart && messages.at(-1)?.info.id === input.parentID ? messages.slice(0, -1) : messages
      const selected = yield* select({
        messages: history,
        cfg,
        model,
      })
      // Allow plugins to inject context or replace compaction prompt.
      const compacting = yield* plugin.trigger(
        "experimental.session.compacting",
        { sessionID: input.sessionID },
        { context: [], prompt: undefined },
      )
      const defaultPrompt = `When constructing the summary, try to stick to this template:
---
## Goal

[What goal(s) is the user trying to accomplish?]

## Instructions

- [What important instructions did the user give you that are relevant]
- [If there is a plan or spec, include information about it so next agent can continue using it]

## Discoveries

[What notable things were learned during this conversation that would be useful for the next agent to know when continuing the work]

## Accomplished

[What work has been completed, what work is still in progress, and what work is left?]

## Relevant files / directories

[Construct a structured list of relevant files that have been read, edited, or created that pertain to the task at hand. If all the files in a directory are relevant, include the path to the directory.]
---`

      const prompt = compacting.prompt ?? [defaultPrompt, ...compacting.context].join("\n\n")

      // Runs one summarization attempt at a given shrink budget: shrink the
      // head to fit, build the summarizer request, and process it. Returns
      // the processor and its result so the caller can decide whether to
      // retry at a smaller budget or accept this attempt.
      const attemptSummary = Effect.fn("SessionCompaction.attemptSummary")(function* (budget: number) {
        const msgs = yield* shrinkToFit({ messages: structuredClone(selected.head), model, cfg, budget })
        yield* plugin.trigger("experimental.chat.messages.transform", {}, { messages: msgs })
        const modelMessages = yield* MessageV2.toModelMessagesEffect(msgs, model, { stripMedia: true })
        const ctx = yield* InstanceState.context
        const msg: MessageV2.Assistant = {
          id: MessageID.ascending(),
          role: "assistant",
          parentID: input.parentID,
          sessionID: input.sessionID,
          mode: "compaction",
          agent: "compaction",
          variant: userMessage.model.variant,
          summary: true,
          path: {
            cwd: ctx.directory,
            root: ctx.worktree,
          },
          cost: 0,
          tokens: {
            output: 0,
            input: 0,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          modelID: model.id,
          providerID: model.providerID,
          time: {
            created: Date.now(),
          },
        }
        yield* session.updateMessage(msg)
        const attemptProcessor = yield* processors.create({
          assistantMessage: msg,
          sessionID: input.sessionID,
          model,
        })
        const attemptResult = yield* attemptProcessor.process({
          user: userMessage,
          agent,
          sessionID: input.sessionID,
          tools: {},
          system: [],
          messages: [
            ...modelMessages,
            {
              role: "user",
              content: [{ type: "text", text: prompt }],
            },
          ],
          model,
        })
        return { result: attemptResult, processor: attemptProcessor }
      })

      // Shed tool-output bytes (and, if still needed, the oldest whole turns) so
      // this request always fits the summarizer's context — fixes "Conversation
      // history too large to compact". The preserved recent tail (selected.tail_start_id)
      // is a separate slice appended by filterCompacted later and is unaffected.
      //
      // The model's declared context limit can still be larger than what the
      // provider actually accepts (e.g. GAIA rejecting a request opencode
      // believed fit), so if the summarization request itself overflows we
      // retry at progressively smaller budgets (COMPACTION_SHRINK_FACTORS)
      // instead of dead-ending on the first overflow. Only interim attempts
      // that still overflow after every factor is exhausted count as failure
      // below — earlier overflowing attempts are silently superseded, so they
      // never surface as a user-visible error.
      const baseBudget = usable({ cfg, model }) - HISTORY_SAFETY_BUFFER
      const budgets = COMPACTION_SHRINK_FACTORS.map((factor) => Math.max(1, Math.floor(baseBudget * factor)))
      let { result, processor } = yield* attemptSummary(budgets[0]!)
      for (let i = 1; i < budgets.length && result === "compact"; i++) {
        log.warn("compaction_overflow_retry", { attempt: i, budget: budgets[i] })
        ;({ result, processor } = yield* attemptSummary(budgets[i]!))
      }

      if (result === "compact") {
        processor.message.error = new MessageV2.ContextOverflowError({
          message: replay
            ? "Conversation history too large to compact - exceeds model context limit"
            : "Session too large to compact - context exceeds model limit even after stripping media",
        }).toObject()
        processor.message.finish = "error"
        yield* session.updateMessage(processor.message)
        return "stop"
      }

      if (result === "continue" && compactionPart) {
        // Estimate the active context size immediately after this compaction
        // (summary + preserved tail) against the real conversation model, so
        // clients can show an accurate post-compaction context size before a
        // new turn produces a real measurement (see sidebar/prompt context
        // gauge — manual compaction otherwise leaves it reading the stale
        // pre-compaction value since it doesn't emit a new non-summary
        // assistant message).
        const activeMessages = yield* MessageV2.filterCompactedEffect(input.sessionID)
        const contextModel = yield* provider.getModel(userMessage.model.providerID, userMessage.model.modelID)
        const postEstimate = yield* estimate({ messages: activeMessages, model: contextModel })
        yield* session.updatePart({
          ...compactionPart,
          tail_start_id: selected.tail_start_id ?? compactionPart.tail_start_id,
          context: postEstimate,
        })
      }

      if (result === "continue" && input.auto) {
        if (replay) {
          const original = replay.info
          const replayMsg = yield* session.updateMessage({
            id: MessageID.ascending(),
            role: "user",
            sessionID: input.sessionID,
            time: { created: Date.now() },
            agent: original.agent,
            model: original.model,
            format: original.format,
            tools: original.tools,
            system: original.system,
          })
          for (const part of replay.parts) {
            if (part.type === "compaction") continue
            const replayPart =
              part.type === "file" && MessageV2.isMedia(part.mime)
                ? { type: "text" as const, text: `[Attached ${part.mime}: ${part.filename ?? "file"}]` }
                : part
            yield* session.updatePart({
              ...replayPart,
              id: PartID.ascending(),
              messageID: replayMsg.id,
              sessionID: input.sessionID,
            })
          }
        }

        if (!replay) {
          const info = yield* provider.getProvider(userMessage.model.providerID)
          if (
            (yield* plugin.trigger(
              "experimental.compaction.autocontinue",
              {
                sessionID: input.sessionID,
                agent: userMessage.agent,
                model: yield* provider.getModel(userMessage.model.providerID, userMessage.model.modelID),
                provider: {
                  source: info.source,
                  info,
                  options: info.options,
                },
                message: userMessage,
                overflow: input.overflow === true,
              },
              { enabled: true },
            )).enabled
          ) {
            const continueMsg = yield* session.updateMessage({
              id: MessageID.ascending(),
              role: "user",
              sessionID: input.sessionID,
              time: { created: Date.now() },
              agent: userMessage.agent,
              model: userMessage.model,
            })
            const text =
              (input.overflow
                ? "The previous request exceeded the provider's size limit due to large media attachments. The conversation was compacted and media files were removed from context. If the user was asking about attached images or files, explain that the attachments were too large to process and suggest they try again with smaller or fewer files.\n\n"
                : "") +
              "Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed."
            yield* session.updatePart({
              id: PartID.ascending(),
              messageID: continueMsg.id,
              sessionID: input.sessionID,
              type: "text",
              // Internal marker for auto-compaction followups so provider plugins
              // can distinguish them from manual post-compaction user prompts.
              // This is not a stable plugin contract and may change or disappear.
              metadata: { compaction_continue: true },
              synthetic: true,
              text,
              time: {
                start: Date.now(),
                end: Date.now(),
              },
            })
          }
        }
      }

      if (processor.message.error) return "stop"
      if (result === "continue") yield* bus.publish(Event.Compacted, { sessionID: input.sessionID })
      return result
    })

    const create = Effect.fn("SessionCompaction.create")(function* (input: {
      sessionID: SessionID
      agent: string
      model: { providerID: ProviderID; modelID: ModelID }
      auto: boolean
      overflow?: boolean
    }) {
      const msg = yield* session.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        model: input.model,
        sessionID: input.sessionID,
        agent: input.agent,
        time: { created: Date.now() },
      })
      yield* session.updatePart({
        id: PartID.ascending(),
        messageID: msg.id,
        sessionID: msg.sessionID,
        type: "compaction",
        auto: input.auto,
        overflow: input.overflow,
      })
    })

    return Service.of({
      isOverflow,
      prune,
      process: processCompaction,
      create,
    })
  }),
)

export const defaultLayer = Layer.suspend(() =>
  layer.pipe(
    Layer.provide(Provider.defaultLayer),
    Layer.provide(Session.defaultLayer),
    Layer.provide(SessionProcessor.defaultLayer),
    Layer.provide(Agent.defaultLayer),
    Layer.provide(Plugin.defaultLayer),
    Layer.provide(Bus.layer),
    Layer.provide(Config.defaultLayer),
  ),
)

const { runPromise } = makeRuntime(Service, defaultLayer)

export async function isOverflow(input: { tokens: MessageV2.Assistant["tokens"]; model: Provider.Model }) {
  return runPromise((svc) => svc.isOverflow(input))
}

export async function prune(input: { sessionID: SessionID }) {
  return runPromise((svc) => svc.prune(input))
}

export const create = fn(
  z.object({
    sessionID: SessionID.zod,
    agent: z.string(),
    model: z.object({ providerID: ProviderID.zod, modelID: ModelID.zod }),
    auto: z.boolean(),
    overflow: z.boolean().optional(),
  }),
  (input) => runPromise((svc) => svc.create(input)),
)

export * as SessionCompaction from "./compaction"
