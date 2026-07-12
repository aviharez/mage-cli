import { Database } from "@mybcabisnis/mage-core/database/database"
import { LayerNode } from "@mybcabisnis/mage-core/effect/layer-node"
import { httpClient } from "@mybcabisnis/mage-core/effect/app-node-platform"
import { AppNodeBuilder } from "@mybcabisnis/mage-core/effect/app-node-builder"
import { EventV2 } from "@mybcabisnis/mage-core/event"
import { Credential } from "@mybcabisnis/mage-core/credential"
import { PermissionSaved } from "@mybcabisnis/mage-core/permission/saved"
import { PtyTicket } from "@mybcabisnis/mage-core/pty/ticket"
import { SessionV2 } from "@mybcabisnis/mage-core/session"
import { SessionExecution } from "@mybcabisnis/mage-core/session/execution"
import { LocationServiceMap } from "@mybcabisnis/mage-core/location-service-map"
import { SessionExecutionLocal } from "@mybcabisnis/mage-core/session/execution/local"
import { ToolOutputStore } from "@mybcabisnis/mage-core/tool-output-store"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Layer, Option } from "effect"
import { Api } from "./api"
import { ServerAuth } from "./auth"
import { handlers } from "./handlers"
import { authorizationLayer } from "./middleware/authorization"
import { schemaErrorLayer } from "./middleware/schema-error"
import { PtyEnvironment } from "./pty-environment"
import { layer as locationLayer } from "./location"
import { sessionLocationLayer } from "./middleware/session-location"

const applicationServices = LayerNode.group([
  Database.node,
  EventV2.node,
  httpClient,
  ToolOutputStore.cleanupNode,
  SessionV2.node,
  PermissionSaved.node,
  PtyTicket.node,
  Credential.node,
  PtyEnvironment.node,
  LocationServiceMap.node,
])

export function createRoutes(password?: string) {
  return makeRoutes(
    password
      ? ServerAuth.Config.configLayer({ username: "opencode", password: Option.some(password) })
      : ServerAuth.Config.layer,
  )
}

export function createEmbeddedRoutes() {
  return makeRoutes(ServerAuth.Config.configLayer({ username: "opencode", password: Option.none() }))
}

function makeRoutes<AuthError, AuthServices>(auth: Layer.Layer<ServerAuth.Config, AuthError, AuthServices>) {
  const serviceLayer = AppNodeBuilder.build(applicationServices, [[SessionExecution.node, SessionExecutionLocal.node]])

  return HttpApiBuilder.layer(Api, { openapiPath: "/openapi.json" }).pipe(
    Layer.provide(handlers),
    Layer.provide(sessionLocationLayer),
    Layer.provide(locationLayer),
    Layer.provide(authorizationLayer),
    Layer.provide(schemaErrorLayer),
    Layer.provide(auth),
    Layer.provide(serviceLayer),
  )
}

export const routes = createRoutes()

export const webHandler = () =>
  HttpRouter.toWebHandler(routes.pipe(Layer.provide(HttpServer.layerServices)), { disableLogger: true })
