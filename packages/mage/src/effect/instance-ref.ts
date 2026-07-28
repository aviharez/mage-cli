import { Context } from "effect"
import type { InstanceContext } from "@/project/instance-context"
import type { WorkspaceV2 } from "@mybcabisnis/mage-core/workspace"

export const InstanceRef = Context.Reference<InstanceContext | undefined>("~mage/InstanceRef", {
  defaultValue: () => undefined,
})

export const WorkspaceRef = Context.Reference<WorkspaceV2.ID | undefined>("~mage/WorkspaceRef", {
  defaultValue: () => undefined,
})
