import { Show } from "solid-js"
import { useDialog } from "@mybcabisnis/mage-ui/context/dialog"
import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@mybcabisnis/mage-shared/util/encode"
import { getFilename } from "@mybcabisnis/mage-shared/util/path"
import { A } from "./palette"

interface ComposerFolderRibbonProps {
  currentDir: string
  homeDir: string
  /** When false (an existing session), the breadcrumb is display-only — you
   *  can't re-target an in-progress conversation to another directory. */
  clickable?: boolean
}

export function ComposerFolderRibbon(props: ComposerFolderRibbonProps) {
  const dialog = useDialog()
  const navigate = useNavigate()

  const clickable = () => props.clickable !== false
  const isHome = () => !props.currentDir || props.currentDir === props.homeDir
  const label = () => {
    if (isHome()) return "~"
    return getFilename(props.currentDir) || props.currentDir
  }

  function pickFolder() {
    void import("@/components/dialog-select-directory").then((x) => {
      dialog.show(() => (
        <x.DialogSelectDirectory
          onSelect={(result) => {
            const dir = Array.isArray(result) ? result[0] : result
            if (dir) navigate(`/${base64Encode(dir)}/session`)
            dialog.close()
          }}
        />
      ))
    })
  }

  const breadcrumb = (
    <>
      <span>Home</span>
      <span style={{ color: A.fgDim }}>›</span>
      <span class="mono" style={{ color: A.fg, "font-family": "monospace" }}>
        {label()}
      </span>
    </>
  )

  return (
    <div
      style={{
        display: "flex",
        "align-items": "center",
        gap: "8px",
        "margin-bottom": "9px",
        "font-size": "11.5px",
        color: A.fgMuted,
        "font-family": "inherit",
      }}
    >
      <Show
        when={clickable()}
        fallback={
          <span style={{ display: "inline-flex", "align-items": "center", gap: "6px" }}>
            {breadcrumb}
          </span>
        }
      >
        {/* breadcrumb — click to cross into another folder (the casting circle) */}
        <button
          type="button"
          onClick={pickFolder}
          style={{
            display: "inline-flex",
            "align-items": "center",
            gap: "6px",
            background: "none",
            border: "0",
            padding: "0",
            color: A.fgMuted,
            cursor: "pointer",
            "font-size": "11.5px",
            "font-family": "inherit",
            transition: "color .15s",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = A.fg)}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = A.fgMuted)}
        >
          {breadcrumb}
        </button>
      </Show>
      <span style={{ flex: "1" }} />
      <Show when={clickable()}>
        <span
          class="mono"
          style={{
            "font-family": "monospace",
            "font-size": "10px",
            padding: "1px 6px",
            border: `1px solid ${A.border}`,
            "border-radius": "4px",
            color: A.fgMuted,
          }}
        >
          ⌘L
        </span>
      </Show>
    </div>
  )
}
