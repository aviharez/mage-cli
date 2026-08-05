import { describe, expect, test } from "bun:test"
import { LLMRequestPrep } from "../../src/session/llm/request"

describe("LLMRequestPrep.splitSystemPrompt", () => {
  test("keeps the base prompt and lowers plugin additions", () => {
    expect(LLMRequestPrep.splitSystemPrompt(["base", "plugin"], "base")).toEqual({
      system: ["base"],
      injected: ["plugin"],
    })
  })

  test("extracts additions appended to the base prompt", () => {
    expect(LLMRequestPrep.splitSystemPrompt(["base\n\nplugin"], "base")).toEqual({
      system: ["base"],
      injected: ["\n\nplugin"],
    })
  })
})
