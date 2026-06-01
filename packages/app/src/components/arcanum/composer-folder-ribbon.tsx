import { useDialog } from "@mybcabisnis/mage-ui/context/dialog"
import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@mybcabisnis/mage-shared/util/encode"
import { getFilename } from "@mybcabisnis/mage-shared/util/path"
import { A } from "./palette"

interface ComposerFolderRibbonProps {
  currentDir: string
  homeDir: string
}

export function ComposerFolderRibbon(props: ComposerFolderRibbonProps) {
  const dialog = useDialog()
  const navigate = useNavigate()

  const label = () => {
    const dir = props.currentDir
    const home = props.homeDir
    if (!dir || dir === home) return "~"
    return getFilename(dir) || dir
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

  return (
    <div
      style={{
        display: "flex",
        "align-items": "center",
        gap: "6px",
        "margin-bottom": "10px",
        "font-size": "12px",
        color: A.fgDim,
        "font-family": "inherit",
      }}
    >
      <button
        type="button"
        onClick={pickFolder}
        style={{
          display: "inline-flex",
          "align-items": "center",
          gap: "4px",
          background: "none",
          border: `1px solid ${A.accentRing}`,
          "border-radius": "6px",
          padding: "2px 8px",
          color: A.accent,
          cursor: "pointer",
          "font-size": "12px",
          "font-family": "inherit",
          transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0.8")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "1")}
      >
        Home ›{" "}
        <span class="font-mono" style={{ "font-family": "monospace" }}>
          {label()}
        </span>
      </button>
    </div>
  )
}
