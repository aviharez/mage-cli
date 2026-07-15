import { createServer } from "http"
import { randomBytes, createHash } from "crypto"
import open from "open"
import * as prompts from "@clack/prompts"
import { OauthCallbackPage } from "@mybcabisnis/mage-core/oauth/page"
import { insecureFetchInit } from "@/util/network"

// ---------------------------------------------------------------------------
// MAGE_LOGIN_LDAP=1 first-run OAuth login (Authorization Code + PKCE).
//
// PLACEHOLDER CONSTANTS — fill in with the real BCA internal IdP values
// before shipping this flow. The command wiring, PKCE exchange, loopback
// callback server, and token/username persistence are all functional; only
// these endpoint/client values need to be swapped for the real ones.
// ---------------------------------------------------------------------------
const LDAP_AUTHORIZE_URL = "https://REPLACE-ME.bca.co.id/oauth2/authorize"
const LDAP_TOKEN_URL = "https://REPLACE-ME.bca.co.id/oauth2/token"
const LDAP_USERINFO_URL = "https://REPLACE-ME.bca.co.id/oauth2/userinfo"
const LDAP_CLIENT_ID = "REPLACE-ME-mage-cli-client-id"
const LDAP_SCOPES = "openid profile"
// Claim (from the id_token, or the userinfo response as a fallback) used as
// provider.merlin.options.username / domain_id.
const LDAP_USERNAME_CLAIM = "preferred_username"

const LDAP_CALLBACK_HOST = "127.0.0.1"
const LDAP_CALLBACK_PORT = 51849
const LDAP_CALLBACK_PATH = "/mage/login/callback"
const LDAP_REDIRECT_URI = `http://${LDAP_CALLBACK_HOST}:${LDAP_CALLBACK_PORT}${LDAP_CALLBACK_PATH}`

const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000

export interface LdapLoginResult {
  access: string
  refresh?: string
  /** Unix epoch (seconds) */
  expires?: number
  username?: string
}

function base64url(input: Buffer): string {
  return input.toString("base64url")
}

function pkcePair() {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash("sha256").update(verifier).digest())
  return { verifier, challenge }
}

function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
  const parts = token.split(".")
  if (parts.length < 2) return undefined
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"))
  } catch {
    return undefined
  }
}

// Loopback callback server — same shape as mcp/oauth-callback.ts (state
// validation, single-use, timeout, branded success/error page) but scoped to
// this one login instead of the multi-server MCP OAuth registry.
function waitForCallbackCode(expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false
    const server = createServer((req, res) => {
      const url = new URL(req.url || "/", `http://${LDAP_CALLBACK_HOST}:${LDAP_CALLBACK_PORT}`)
      if (url.pathname !== LDAP_CALLBACK_PATH) {
        res.writeHead(404)
        res.end("Not found")
        return
      }

      const code = url.searchParams.get("code")
      const state = url.searchParams.get("state")
      const error = url.searchParams.get("error")
      const errorDescription = url.searchParams.get("error_description")

      const fail = (message: string) => {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" })
        res.end(OauthCallbackPage.error(message, { provider: "LDAP" }))
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          server.close()
          reject(new Error(message))
        }
      }

      if (error) {
        fail(errorDescription || error)
        return
      }
      if (!state || state !== expectedState) {
        fail("Invalid or missing state parameter — potential CSRF")
        return
      }
      if (!code) {
        fail("No authorization code provided")
        return
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      res.end(OauthCallbackPage.success({ provider: "LDAP" }))
      if (!settled) {
        settled = true
        clearTimeout(timeout)
        server.close()
        resolve(code)
      }
    })

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      server.close()
      reject(new Error("LDAP login timed out waiting for browser authorization"))
    }, CALLBACK_TIMEOUT_MS)

    server.listen(LDAP_CALLBACK_PORT, LDAP_CALLBACK_HOST)
    server.on("error", (err) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(err)
    })
  })
}

async function exchangeCode(code: string, verifier: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: LDAP_REDIRECT_URI,
    client_id: LDAP_CLIENT_ID,
    code_verifier: verifier,
  })

  const response = await fetch(LDAP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    ...(await insecureFetchInit()),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(`LDAP token exchange failed: ${response.status} ${response.statusText} ${text}`.trim())
  }

  return (await response.json()) as {
    access_token: string
    refresh_token?: string
    expires_in?: number
    id_token?: string
  }
}

async function fetchUserinfo(accessToken: string): Promise<Record<string, unknown> | undefined> {
  if (!LDAP_USERINFO_URL) return undefined
  try {
    const response = await fetch(LDAP_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      ...(await insecureFetchInit()),
    })
    if (!response.ok) return undefined
    return (await response.json()) as Record<string, unknown>
  } catch {
    return undefined
  }
}

/**
 * Runs the MAGE_LOGIN_LDAP=1 first-run OAuth login: opens the internal IdP's
 * authorize page with PKCE, waits for the loopback redirect, exchanges the
 * code for tokens, and derives the udomain username from the id_token
 * (falling back to the userinfo endpoint). The caller persists the result to
 * `login.oauth` / `provider.merlin.options.username` in mage.json.
 */
export async function loginLdap(): Promise<LdapLoginResult> {
  const { verifier, challenge } = pkcePair()
  const state = base64url(randomBytes(16))

  const authorizeUrl = new URL(LDAP_AUTHORIZE_URL)
  authorizeUrl.searchParams.set("response_type", "code")
  authorizeUrl.searchParams.set("client_id", LDAP_CLIENT_ID)
  authorizeUrl.searchParams.set("redirect_uri", LDAP_REDIRECT_URI)
  authorizeUrl.searchParams.set("scope", LDAP_SCOPES)
  authorizeUrl.searchParams.set("state", state)
  authorizeUrl.searchParams.set("code_challenge", challenge)
  authorizeUrl.searchParams.set("code_challenge_method", "S256")

  const pending = waitForCallbackCode(state)

  prompts.log.info("Go to: " + authorizeUrl.toString())
  await open(authorizeUrl.toString()).catch(() => {
    prompts.log.warn("Could not open the browser automatically — open the URL above manually.")
  })

  const spinner = prompts.spinner()
  spinner.start("Waiting for authorization...")

  let code: string
  try {
    code = await pending
  } catch (error) {
    spinner.stop("Authorization failed", 1)
    throw error
  }
  spinner.stop("Authorization received")

  const exchangeSpinner = prompts.spinner()
  exchangeSpinner.start("Exchanging authorization code...")
  const tokens = await exchangeCode(code, verifier)

  let claims = tokens.id_token ? decodeJwtPayload(tokens.id_token) : undefined
  if (typeof claims?.[LDAP_USERNAME_CLAIM] !== "string") {
    claims = { ...claims, ...(await fetchUserinfo(tokens.access_token)) }
  }
  const username = typeof claims?.[LDAP_USERNAME_CLAIM] === "string" ? (claims[LDAP_USERNAME_CLAIM] as string) : undefined

  exchangeSpinner.stop(username ? `Logged in as ${username}` : "Logged in")

  return {
    access: tokens.access_token,
    refresh: tokens.refresh_token,
    expires: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : undefined,
    username,
  }
}

export * as Login from "./ldap"
