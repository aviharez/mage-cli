import { describe, expect, test } from "bun:test"
import { LLM, LLMClient, Provider } from "@mybcabisnis/mage-llm"
import { Route, Protocol } from "@mybcabisnis/mage-llm/route"
import { Provider as ProviderSubpath } from "@mybcabisnis/mage-llm/provider"
import { OpenAIChat, OpenAICompatibleChat, OpenAIResponses } from "@mybcabisnis/mage-llm/protocols"
import * as AnthropicMessages from "@mybcabisnis/mage-llm/protocols/anthropic-messages"

describe("public exports", () => {
  test("root exposes app-facing runtime APIs", () => {
    expect(LLM.request).toBeFunction()
    expect(LLMClient.Service).toBeFunction()
    expect(LLMClient.layer).toBeDefined()
    expect(Provider.make).toBeFunction()
    expect(ProviderSubpath.make).toBe(Provider.make)
  })

  test("route barrel exposes route-authoring APIs", () => {
    expect(Route.make).toBeFunction()
    expect(Protocol.make).toBeFunction()
  })

  test("protocol barrels expose supported low-level routes", () => {
    expect(OpenAIChat.route.id).toBe("openai-chat")
    expect(OpenAICompatibleChat.route.id).toBe("openai-compatible-chat")
    expect(OpenAIResponses.route.id).toBe("openai-responses")
    expect(OpenAIResponses.webSocketRoute.id).toBe("openai-responses-websocket")
    expect(AnthropicMessages.route.id).toBe("anthropic-messages")
  })
})
