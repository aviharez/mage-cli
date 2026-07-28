export * as PublicEventManifest from "./public-event-manifest"

import { Event } from "@mybcabisnis/mage-schema/event"
import { EventManifest } from "@mybcabisnis/mage-schema/event-manifest"

export const Definitions = EventManifest.ServerDefinitions
export const Latest = Event.latest(Definitions)
