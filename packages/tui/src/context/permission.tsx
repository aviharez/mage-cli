import { createStore } from "solid-js/store"
import { useArgs } from "./args"
import { createSimpleContext } from "./helper"

export const { use: usePermission, provider: PermissionProvider } = createSimpleContext({
  name: "Permission",
  init: () => {
    const args = useArgs()
    const [store, setStore] = createStore<{ yolo: boolean; sessionID?: string }>({
      yolo: false,
    })
    return {
      mode: args.auto ? ("auto" as const) : ("normal" as const),
      isYolo(sessionID?: string) {
        if (!store.yolo) return false
        if (store.sessionID === undefined) return true
        return store.sessionID === sessionID
      },
      toggleYolo(sessionID?: string) {
        if (store.yolo && store.sessionID === sessionID) {
          setStore({ yolo: false, sessionID: undefined })
          return false
        }
        setStore({ yolo: true, sessionID })
        return true
      },
      bindYolo(sessionID: string) {
        if (store.yolo && store.sessionID === undefined) setStore("sessionID", sessionID)
      },
    }
  },
})
