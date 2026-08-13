import { createStore } from "solid-js/store"
import { useArgs } from "./args"
import { useKV } from "./kv"
import { createSimpleContext } from "./helper"

export type PermissionMode = "auto" | "normal"

export const { use: usePermission, provider: PermissionProvider } = createSimpleContext({
  name: "Permission",
  init: () => {
    const args = useArgs()
    const kv = useKV()
    const [store, setStore] = createStore<{ mode: PermissionMode }>({
      mode: args.auto ? "auto" : "normal",
    })
    const isYolo = () => kv.get("yolo_mode", false) === true
    const effectiveMode = () => (isYolo() ? "auto" : store.mode)
    return {
      get mode() {
        return effectiveMode()
      },
      get yolo() {
        return isYolo()
      },
      set(mode: PermissionMode) {
        kv.set("yolo_mode", false)
        setStore("mode", mode)
      },
      toggle() {
        kv.set("yolo_mode", false)
        setStore("mode", effectiveMode() === "auto" ? "normal" : "auto")
      },
      enableYolo() {
        kv.set("yolo_mode", true)
        setStore("mode", "auto")
      },
      disableYolo() {
        kv.set("yolo_mode", false)
        setStore("mode", "normal")
      },
    }
  },
})
