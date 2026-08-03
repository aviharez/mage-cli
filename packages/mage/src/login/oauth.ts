import { createServer } from "http"
import { randomBytes, createHash } from "crypto"
import open from "open"
import * as prompts from "@clack/prompts"
import { OauthCallbackPage } from "@mybcabisnis/mage-core/oauth/page"
import { insecureFetchInit } from "@/util/network"

const DEFAULT_RUNE_ORIGIN = "https://rune.apps.ocpdevgra.dti.co.id"
// const DEFAULT_RUNE_ORIGIN = "http://localhost:3000"
const CLIENT_ID = "mage-cli"
const SCOPES = "openid profile"

const CALLBACK_HOST = "127.0.0.1"
const CALLBACK_PORT = 51849
const CALLBACK_PATH = "/mage/login/callback"
const REDIRECT_URI = `http://${CALLBACK_HOST}:${CALLBACK_PORT}${CALLBACK_PATH}`

const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000

export interface MageCredential {
  udomain: string
  display_name: string
  access_token: string
  refresh_token: string
}

function base64url(input: Buffer): string {
  return input.toString("base64url")
}

function pkcePair() {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash("sha256").update(verifier).digest())
  return { verifier, challenge }
}

function runeOrigin() {
  return (process.env.MAGE_OAUTH_BASE_URL || process.env.MAGE_RUNE_OAUTH_BASE_URL || DEFAULT_RUNE_ORIGIN).replace(/\/+$/, "")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function credentialFromTokenResponse(value: unknown): MageCredential {
  if (!isRecord(value)) throw new Error("Rune token response was not an object")

  const fields = ["udomain", "display_name", "access_token", "refresh_token"] as const
  if (fields.some((field) => typeof value[field] !== "string" || value[field].trim().length === 0)) {
    throw new Error("Rune token response is missing a required credential field")
  }

  return {
    udomain: value.udomain as string,
    display_name: value.display_name as string,
    access_token: value.access_token as string,
    refresh_token: value.refresh_token as string,
  }
}

export function isMageCredential(value: unknown): value is MageCredential {
  try {
    credentialFromTokenResponse(value)
    return true
  } catch {
    return false
  }
}

// Loopback callback server — same shape as mcp/oauth-callback.ts (state
// validation, single-use, timeout, branded success/error page) but scoped to
// this one login instead of the multi-server MCP OAuth registry.
function waitForCallbackCode(expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false
    const server = createServer((req, res) => {
      const url = new URL(req.url || "/", `http://${CALLBACK_HOST}:${CALLBACK_PORT}`)
      if (url.pathname !== CALLBACK_PATH) {
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
        res.end(OauthCallbackPage.error(message, { provider: "Rune" }))
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          server.close()
          reject(new Error(message))
        }
      }

      if (!state || state !== expectedState) {
        fail("Invalid or missing state parameter — potential CSRF")
        return
      }
      if (error) {
        fail(errorDescription || error)
        return
      }
      if (!code) {
        fail("No authorization code provided")
        return
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      res.end(OauthCallbackPage.success({ provider: "Rune" }))
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
      reject(new Error("Rune login timed out waiting for browser authorization"))
    }, CALLBACK_TIMEOUT_MS)

    server.listen(CALLBACK_PORT, CALLBACK_HOST)
    server.on("error", (err) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(err)
    })
  })
}

export async function exchangeCode(code: string, verifier: string): Promise<MageCredential> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: verifier,
  })

  const response = await fetch(`${runeOrigin()}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    ...(await insecureFetchInit()),
  })

  if (!response.ok) {
    throw new Error(`Rune token exchange failed: ${response.status} ${response.statusText}`.trim())
  }

  return credentialFromTokenResponse(await response.json())
}

/**
 * Opens Rune's Mage login page with PKCE, waits for the loopback redirect,
 * exchanges the short-lived authorization code, and returns the gateway
 * credential pair and identity.
 */
export async function loginRune(): Promise<MageCredential> {
  const { verifier, challenge } = pkcePair()
  const state = base64url(randomBytes(16))

  const authorizeUrl = new URL(`${runeOrigin()}/api/oauth/authorize`)
  authorizeUrl.searchParams.set("response_type", "code")
  authorizeUrl.searchParams.set("client_id", CLIENT_ID)
  authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI)
  authorizeUrl.searchParams.set("scope", SCOPES)
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
  try {
    const credential = await exchangeCode(code, verifier)
    exchangeSpinner.stop(`Logged in as ${credential.display_name}`)
    return credential
  } catch (error) {
    exchangeSpinner.stop("Login failed", 1)
    throw error
  }
}

export * as Login from "./oauth"
