export * from "./client.js"
export * from "./server.js"

import { createMageClient } from "./client.js"
import { createMageServer } from "./server.js"
import type { ServerOptions } from "./server.js"

export * as data from "./data.js"

export async function createMage(options?: ServerOptions) {
  const server = await createMageServer({
    ...options,
  })

  const client = createMageClient({
    baseUrl: server.url,
  })

  return {
    client,
    server,
  }
}
