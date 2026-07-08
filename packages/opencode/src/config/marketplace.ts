import { Schema } from "effect"
import { zod } from "@/util/effect-zod"
import { withStatics } from "@/util/schema"

export const Info = Schema.Struct({
  counter: Schema.optional(Schema.String).annotate({
    description: "URL to POST { name } to after a successful skill/mcp install, for the registry's install counter",
  }),
}).pipe(withStatics((s) => ({ zod: zod(s) })))

export type Info = Schema.Schema.Type<typeof Info>

export * as ConfigMarketplace from "./marketplace"
