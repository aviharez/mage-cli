import { createSignal } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@mybcabisnis/mage-shared/util/encode"
import { Icon } from "@mybcabisnis/mage-ui/icon"
import { useDialog } from "@mybcabisnis/mage-ui/context/dialog"
import { useGlobalSync } from "@/context/global-sync"
import { readMerlinUsername, withMerlinUsername } from "@/utils/merlin-username"
import { useOnboarding } from "./onboarding-context"
import { A } from "./palette"
import { ArcEmblem } from "./emblem"

export function UsernameDialog(props: { onDone: () => void }) {
  const sync = useGlobalSync()
  const dialog = useDialog()
  const navigate = useNavigate()
  const { markSubmitted } = useOnboarding()
  const [value, setValue] = createSignal(readMerlinUsername(sync.data.config))

  async function confirm() {
    const name = value().trim()
    if (!name) return
    // Store the udomain at provider.merlin.options.username (gateway domain_id),
    // matching the CLI `init` wizard — not the top-level display username.
    await sync.updateConfig(withMerlinUsername(sync.data.config, name))
    markSubmitted()
    props.onDone()
    dialog.close()
    navigate(`/${base64Encode(sync.data.path.home)}/session`)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") void confirm()
  }

  return (
    <div style={{
      position: "fixed", inset: "0", "z-index": "50",
      display: "flex", "align-items": "center", "justify-content": "center",
    }}>
    <div style={{
      width: "460px", "border-radius": "18px",
      border: `1px solid ${A.borderStrong}`, background: A.bgRaised,
      overflow: "hidden", position: "relative",
      "box-shadow": `0 30px 90px rgba(0,0,0,0.6), 0 0 60px ${A.accentSoft}`,
    }}>
      {/* aurora backdrop */}
      <div style={{ position: "absolute", inset: "0", "z-index": "0", overflow: "hidden", "pointer-events": "none" }}>
        <div style={{
          position: "absolute", width: "90%", height: "70%", left: "5%", top: "-30%",
          "border-radius": "50%", filter: "blur(50px)", opacity: "0.5",
          background: "radial-gradient(circle, rgba(120,86,220,0.30), transparent 68%)",
        }} />
      </div>

      <div style={{
        position: "relative", "z-index": "1",
        padding: "30px 32px 26px",
        display: "flex", "flex-direction": "column", gap: "18px",
        color: A.fg,
      }}>
        {/* header */}
        <div style={{ display: "flex", "flex-direction": "column", "align-items": "center", gap: "14px" }}>
          <ArcEmblem size={52} glow />
          <div style={{ display: "flex", "flex-direction": "column", "align-items": "center", gap: "8px", "text-align": "center" }}>
            <div class="serif" style={{ "font-size": "27px", "line-height": "1.1", color: A.fgInk }}>
              What udomain shall we inscribe?
            </div>
            <div style={{ "font-size": "13.5px", color: A.fgMuted, "line-height": "1.55", "max-width": "340px" }}>
              Your work is bound to a udomain. Choose one for your familiar — you can change it later in Settings.
            </div>
          </div>
        </div>

        {/* name field */}
        <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
          <span style={{ "font-size": "11px", "letter-spacing": "0.12em", "text-transform": "uppercase", color: A.fgDim }}>
            Your udomain
          </span>
          <div style={{
            display: "flex", "align-items": "center",
            padding: "12px 14px", "border-radius": "12px",
            border: `1px solid ${A.accentRing}`, background: A.bgInput,
            "box-shadow": `0 0 0 1px ${A.accentRing}, 0 0 26px ${A.accentSoft}`,
          }}>
            <input
              type="text"
              value={value()}
              onInput={(e) => setValue(e.currentTarget.value)}
              onKeyDown={onKeyDown}
              autofocus
              style={{
                flex: "1", "font-size": "16px", color: A.fg, background: "transparent",
                border: "none", outline: "none",
              }}
            />
          </div>
        </div>

        {/* confirm button */}
        <button
          onClick={() => void confirm()}
          style={{
            display: "flex", "align-items": "center", "justify-content": "center", gap: "8px",
            height: "48px", "font-size": "15px", "border-radius": "12px",
            background: `linear-gradient(135deg, ${A.accent}, #7c5cdb)`,
            color: A.accentInk, border: "none", cursor: "pointer", "font-weight": "600",
            "box-shadow": `0 0 20px ${A.accentSoft}`,
          }}
        >
          Bind the udomain
          <Icon name="arrow-right" size="small" style={{ color: A.accentInk }} />
        </button>

        <div style={{
          display: "flex", "align-items": "center", "justify-content": "center",
          gap: "8px", "font-size": "11.5px", color: A.fgDim,
        }}>
          <kbd style={{
            padding: "1px 6px", "border-radius": "4px",
            border: `1px solid ${A.border}`, "font-size": "10px",
          }}>↵</kbd>
          <span>to confirm</span>
        </div>
      </div>
    </div>
    </div>
  )
}
