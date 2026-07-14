import { Config } from "effect"
import type { Auth } from "../src/route/auth"
import type { ModelFactory } from "../src/route/auth-options"
import * as OpenAIChat from "../src/protocols/openai-chat"

type BaseOptions = {
  readonly baseURL?: string
  readonly headers?: Record<string, string>
}

type Model = {
  readonly id: string
}

declare const auth: Auth
declare const optionalAuthModel: ModelFactory<BaseOptions, "optional", Model>
declare const requiredAuthModel: ModelFactory<BaseOptions, "required", Model>
const configApiKey = Config.redacted("OPENAI_API_KEY")

OpenAIChat.route.model({ id: "gpt-4.1-mini" })

// @ts-expect-error route model selection does not configure endpoints.
OpenAIChat.route.model({ id: "gpt-4.1-mini", baseURL: "https://gateway.example.com/v1" })

// @ts-expect-error route model selection does not configure query params.
OpenAIChat.route.model({ id: "gpt-4.1-mini", queryParams: { debug: "1" } })

// @ts-expect-error route model selection does not configure auth.
OpenAIChat.route.model({ id: "gpt-4.1-mini", auth })

// @ts-expect-error route model selection does not configure api keys.
OpenAIChat.route.model({ id: "gpt-4.1-mini", apiKey: "sk-test" })

optionalAuthModel("gpt-4.1-mini")
optionalAuthModel("gpt-4.1-mini", {})
optionalAuthModel("gpt-4.1-mini", { apiKey: "sk-test" })
optionalAuthModel("gpt-4.1-mini", { apiKey: configApiKey })
optionalAuthModel("gpt-4.1-mini", { auth })
optionalAuthModel("gpt-4.1-mini", { auth, baseURL: "https://gateway.example.com/v1" })
optionalAuthModel("gpt-4.1-mini", { apiKey: "sk-test", headers: { "x-source": "test" } })

// @ts-expect-error auth is an override, so apiKey cannot be supplied with it.
optionalAuthModel("gpt-4.1-mini", { apiKey: "sk-test", auth })

requiredAuthModel("custom-model", { apiKey: "key" })
requiredAuthModel("custom-model", { apiKey: configApiKey })
requiredAuthModel("custom-model", { auth })
requiredAuthModel("custom-model", { auth, headers: { "x-tenant-id": "tenant" } })

// @ts-expect-error providers without config fallback need apiKey or auth.
requiredAuthModel("custom-model")

// @ts-expect-error providers without config fallback need apiKey or auth.
requiredAuthModel("custom-model", {})

// @ts-expect-error auth is an override, so apiKey cannot be supplied with it.
requiredAuthModel("custom-model", { apiKey: "key", auth })
