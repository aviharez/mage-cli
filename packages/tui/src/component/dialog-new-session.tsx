import { useDialog } from "../ui/dialog"
import { DialogSelect } from "../ui/dialog-select"
import { useRoute } from "../context/route"
import { useSDK } from "../context/sdk"
import { useToast } from "../ui/toast"
import { openNewWindow } from "../util/new-window"

type Choice = "this-window" | "new-window"

export function DialogNewSession() {
  const dialog = useDialog()
  const route = useRoute()
  const sdk = useSDK()
  const toast = useToast()

  return (
    <DialogSelect<Choice>
      title="New session"
      current="this-window"
      renderFilter={false}
      options={[
        {
          title: "This window",
          description: "Start a new session here",
          value: "this-window",
        },
        {
          title: "New window",
          description: "Open mage in a new terminal window",
          value: "new-window",
        },
      ]}
      onSelect={async (option) => {
        if (option.value === "this-window") {
          route.navigate({ type: "home" })
          dialog.clear()
          return
        }

        dialog.clear()
        const opened = await openNewWindow(sdk.directory ?? "")
        if (!opened) {
          toast.show({
            variant: "error",
            title: "Couldn't open a new window",
            message: "New windows are only supported on macOS and Windows.",
          })
        }
      }}
    />
  )
}
