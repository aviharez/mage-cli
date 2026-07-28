/// <reference path="../markdown.d.ts" />

export * as SkillPlugin from "./skill"

import { define } from "./internal"
import { Effect } from "effect"
import { AbsolutePath } from "../schema"
import { SkillV2 } from "../skill"
import customizeMageContent from "./skill/customize-mage.md" with { type: "text" }

export const CustomizeMageContent = customizeMageContent

export const Plugin = define({
  id: "skill",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.skill.transform((draft) => {
      draft.source(
        SkillV2.EmbeddedSource.make({
          type: "embedded",
          skill: SkillV2.Info.make({
            name: "customize-mage",
            description:
              "Use ONLY when the user is editing or creating mage's own configuration: mage.json, mage.jsonc, files under .mage/, or files under ~/.mage/. Also use when creating or fixing mage agents, subagents, commands, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring mage itself.",
            location: AbsolutePath.make("/builtin/customize-mage.md"),
            content: CustomizeMageContent,
          }),
        }),
      )
    })
  }),
})
