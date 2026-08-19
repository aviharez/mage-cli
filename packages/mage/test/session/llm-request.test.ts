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

  test("keeps the Qwen prompt before an agent prompt", () => {
    expect(LLMRequestPrep.buildSystemPrompt(["qwen policy"], "agent policy", ["runtime"], "user policy")).toEqual([
      "qwen policy\nagent policy\nruntime\nuser policy",
    ])
  })
})
