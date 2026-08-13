import { afterEach, describe, expect, test } from "bun:test"
import { credentialFromTokenResponse, exchangeCode, isMageCredential } from "@/login/oauth"

const originalFetch = globalThis.fetch
const originalBaseURL = process.env.MAGE_OAUTH_BASE_URL

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalBaseURL === undefined) delete process.env.MAGE_OAUTH_BASE_URL
  else process.env.MAGE_OAUTH_BASE_URL = originalBaseURL
})

describe("Rune OAuth credential mapping", () => {
  test("validates and maps the token response to the persisted credential", () => {
    expect(
      credentialFromTokenResponse({
        access_token: "access",
        refresh_token: "refresh",
        token_type: "Bearer",
        expires_in: 3600,
        udomain: "u012345",
        display_name: "Monitoring MBB MBB",
      }),
    ).toEqual({
      udomain: "u012345",
      display_name: "Monitoring MBB MBB",
      access_token: "access",
      refresh_token: "refresh",
      expires_in: 3600,
    })
    expect(isMageCredential({ udomain: "u", display_name: "User", access_token: "a", refresh_token: "r", expires_in: 3600 })).toBe(true)
    expect(isMageCredential({ udomain: "u", display_name: "User", access_token: "a" })).toBe(false)
  })

  test("exchanges the PKCE code at Rune without exposing gateway credentials in the URL", async () => {
    process.env.MAGE_OAUTH_BASE_URL = "https://rune.example/"
    let request: { url: string; init: RequestInit } | undefined
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      request = { url, init }
      return new Response(
        JSON.stringify({
          access_token: "access",
          refresh_token: "refresh",
          expires_in: 3600,
          udomain: "u012345",
          display_name: "User",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )
    }) as unknown as typeof fetch

    await expect(exchangeCode("short-lived-code", "pkce-verifier")).resolves.toEqual({
      udomain: "u012345",
      display_name: "User",
      access_token: "access",
      refresh_token: "refresh",
      expires_in: expect.any(Number),
    })
    expect(request?.url).toBe("https://rune.example/api/oauth/token")
    expect(request?.init.body as string).toContain("code=short-lived-code")
    expect(request?.init.body as string).toContain("code_verifier=pkce-verifier")
    expect(request?.url).not.toContain("access")
    expect(request?.url).not.toContain("refresh")
  })
})
