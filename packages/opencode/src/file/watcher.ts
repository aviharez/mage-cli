import { Cause, Effect, Layer, Context } from "effect"
// @ts-ignore
import { createWrapper } from "@parcel/watcher/wrapper"
import type ParcelWatcher from "@parcel/watcher"
import { readdir } from "fs/promises"
import path from "path"
import z from "zod"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { InstanceState } from "@/effect"
import { Flag } from "@/flag/flag"
import { Git } from "@/git"
import { Instance } from "@/project/instance"
import { lazy } from "@/util/lazy"
import { Config } from "../config"
import { FileIgnore } from "./ignore"
import { Protected } from "./protected"
import { Log } from "../util"

declare const MAGE_LIBC: string | undefined

const log = Log.create({ service: "file.watcher" })
const SUBSCRIBE_TIMEOUT_MS = 10_000

export const Event = {
  Updated: BusEvent.define(
    "file.watcher.updated",
    z.object({
      file: z.string(),
      event: z.union([z.literal("add"), z.literal("change"), z.literal("unlink")]),
    }),
  ),
}

const watcher = lazy((): typeof import("@parcel/watcher") | undefined => {
  try {
    const binding = require(
      `@parcel/watcher-${process.platform}-${process.arch}${process.platform === "linux" ? `-${MAGE_LIBC || "glibc"}` : ""}`,
    )
    return createWrapper(binding) as typeof import("@parcel/watcher")
  } catch (error) {
    log.error("failed to load watcher binding", { error })
    return
  }
})

function getBackend() {
  if (process.platform === "win32") return "windows"
  if (process.platform === "darwin") return "fs-events"
  if (process.platform === "linux") return "inotify"
}

function protecteds(dir: string) {
  return Protected.paths().filter((item) => {
    const rel = path.relative(dir, item)
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel)
  })
}

export const hasNativeBinding = () => !!watcher()

export interface Interface {
  readonly init: () => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/FileWatcher") { }

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const git = yield* Git.Service

    const state = yield* InstanceState.make(
      Effect.fn("FileWatcher.state")(
        function* (ctx) {
          if (yield* Flag.MAGE_EXPERIMENTAL_DISABLE_FILEWATCHER) return

          // Bind callbacks that fire outside the Effect fiber (parcel-watcher
          // native callbacks, timers) back into this instance's ALS context.
          // `Instance.bind` cannot be used here: the cache lookup runs on the
          // Effect runtime where the ALS context is not established, so reading
          // `Instance.directory` directly would throw "No context found for
          // instance". The context is carried by the Effect `InstanceRef` and
          // handed to us as `ctx` — use it explicitly.
          const bindCtx = <F extends (...args: any[]) => any>(fn: F): F =>
            ((...args: any[]) => Instance.restore(ctx, () => fn(...args))) as F

          log.info("init", { directory: ctx.directory })

          const backend = getBackend()
          if (!backend) {
            log.error("watcher backend not supported", { directory: ctx.directory, platform: process.platform })
            return
          }

          const w = watcher()
          if (!w) return

          log.info("watcher backend", { directory: ctx.directory, platform: process.platform, backend })

          const subs: ParcelWatcher.AsyncSubscription[] = []
          const pending = new Map<string, { type: string; path: string }>()
          let flushTimer: ReturnType<typeof setTimeout> | undefined

          const flushPending = bindCtx(() => {
            flushTimer = undefined
            const evts = [...pending.values()]
            pending.clear()
            for (const evt of evts) {
              if (evt.type === "create") void Bus.publish(Event.Updated, { file: evt.path, event: "add" })
              if (evt.type === "update") void Bus.publish(Event.Updated, { file: evt.path, event: "change" })
              if (evt.type === "delete") void Bus.publish(Event.Updated, { file: evt.path, event: "unlink" })
            }
          })

          yield* Effect.addFinalizer(() => {
            if (flushTimer !== undefined) {
              clearTimeout(flushTimer)
              flushTimer = undefined
              pending.clear()
            }
            return Effect.promise(() => Promise.allSettled(subs.map((sub) => sub.unsubscribe())))
          })

          const cb: ParcelWatcher.SubscribeCallback = bindCtx((err, evts) => {
            if (err) return
            for (const evt of evts) {
              pending.set(evt.path, { type: evt.type, path: evt.path })
            }
            if (flushTimer !== undefined) clearTimeout(flushTimer)
            flushTimer = setTimeout(flushPending, 50)
          })

          const subscribe = (dir: string, ignore: string[]) => {
            const pending = w.subscribe(dir, cb, { ignore, backend })
            return Effect.gen(function* () {
              const sub = yield* Effect.promise(() => pending)
              subs.push(sub)
            }).pipe(
              Effect.timeout(SUBSCRIBE_TIMEOUT_MS),
              Effect.catchCause((cause) => {
                log.error("failed to subscribe", { dir, cause: Cause.pretty(cause) })
                pending.then((s) => s.unsubscribe()).catch(() => { })
                return Effect.void
              }),
            )
          }

          const cfg = yield* config.get()
          const cfgIgnores = cfg.watcher?.ignore ?? []

          if (yield* Flag.MAGE_EXPERIMENTAL_FILEWATCHER) {
            yield* subscribe(ctx.directory, [...FileIgnore.PATTERNS, ...cfgIgnores, ...protecteds(ctx.directory)])
          }

          if (ctx.project.vcs === "git") {
            const result = yield* git.run(["rev-parse", "--git-dir"], {
              cwd: ctx.project.worktree,
            })
            const vcsDir =
              result.exitCode === 0 ? path.resolve(ctx.project.worktree, result.text().trim()) : undefined
            if (vcsDir && !cfgIgnores.includes(".git") && !cfgIgnores.includes(vcsDir)) {
              const ignore = (yield* Effect.promise(() => readdir(vcsDir).catch(() => []))).filter(
                (entry) => entry !== "HEAD",
              )
              yield* subscribe(vcsDir, ignore)
            }
          }
        },
        Effect.catchCause((cause) => {
          log.error("failed to init watcher service", { cause: Cause.pretty(cause) })
          return Effect.void
        }),
      ),
    )

    return Service.of({
      init: Effect.fn("FileWatcher.init")(function* () {
        yield* InstanceState.get(state)
      }),
    })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Config.defaultLayer), Layer.provide(Git.defaultLayer))

export * as FileWatcher from "./watcher"
