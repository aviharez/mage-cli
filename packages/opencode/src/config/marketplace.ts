import { Schema } from "effect"
import { zod } from "@/util/effect-zod"
import { withStatics } from "@/util/schema"

export const Info = Schema.Struct({
  registry: Schema.optional(Schema.String).annotate({
    description: "URL of the marketplace registry (e.g. GitLab generic package endpoint)",
  }),
  token: Schema.optional(Schema.String).annotate({
    description: "Access token for the registry (supports {env:VAR} substitution)",
  }),
}).pipe(withStatics((s) => ({ zod: zod(s) })))

export type Info = Schema.Schema.Type<typeof Info>

export * as ConfigMarketplace from "./marketplace"
