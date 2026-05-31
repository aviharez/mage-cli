import { For } from "solid-js"
import { Icon } from "@mybcabisnis/mage-ui/icon"
import { useDialog } from "@mybcabisnis/mage-ui/context/dialog"
import { A } from "./palette"
import { ArcAtmos } from "./atmos"
import { ArcEmblem, ArcStatus } from "./emblem"
import { UsernameDialog } from "./username-dialog"

const RITES = [
  { icon: "bubble-5",   title: "Speak your intent",  body: "Describe the change — mage drafts a plan first." },
  { icon: "folder-add-left", title: "Cross any circle", body: "Home, a repo, a notes folder. No project required." },
  { icon: "new-session", title: "Cast and review",   body: "Watch diffs, run tests, ship when it's right." },
] as const

export function Onboarding(props: { onDone: () => void }) {
  const dialog = useDialog()

  function startMage() {
    dialog.show(() => <UsernameDialog onDone={props.onDone} />)
  }

  return (
    <div
      class="h-dvh w-screen flex items-center justify-center"
      style={{ position: "relative", background: A.bg }}
    >
      <ArcAtmos stars />

      {/* outer summoning rings */}
      <div style={{
        position: "absolute", width: "760px", height: "760px", "border-radius": "50%",
        border: `1px solid ${A.border}`, "box-shadow": `inset 0 0 120px ${A.accentSoft}`,
        "pointer-events": "none",
      }} />
      <div style={{
        position: "absolute", width: "560px", height: "560px", "border-radius": "50%",
        border: `1px solid ${A.border}`, opacity: "0.5", "pointer-events": "none",
      }} />

      <div style={{
        position: "relative", "z-index": "1", display: "flex", "flex-direction": "column",
        "align-items": "center", gap: "26px", "max-width": "720px", "text-align": "center",
        padding: "0 64px",
      }}>
        <ArcStatus color={A.aether} label="localhost:4096 · attuned" />

        <ArcEmblem size={132} glow animate />

        <div style={{ display: "flex", "flex-direction": "column", "align-items": "center", gap: "14px" }}>
          <div
            class="serif"
            style={{
              "font-size": "66px", "line-height": "1", color: A.fgInk,
              "letter-spacing": "0.04em", "text-shadow": `0 0 34px ${A.accentSoft}`,
            }}
          >
            mage
          </div>
          <div style={{
            "font-size": "11px", "letter-spacing": "0.38em", color: A.fgDim,
            "text-transform": "uppercase", "font-family": "var(--font-mono, monospace)",
          }}>
            The coding familiar
          </div>
        </div>

        <div style={{ "font-size": "16px", color: A.fgMuted, "line-height": "1.65", "max-width": "480px" }}>
          Speak your intent and watch it take shape. mage opens in your{" "}
          <span style={{ color: A.accentBright }}>Home</span> circle — cross into any workspace whenever you like.
        </div>

        <div style={{ display: "flex", "flex-direction": "row", gap: "14px", "margin-top": "4px" }}>
          <For each={RITES}>{(r) => (
            <div style={{
              width: "200px", padding: "16px", "text-align": "left",
              border: `1px solid ${A.border}`, "border-radius": "12px",
              background: "rgba(21,17,49,0.45)",
              display: "flex", "flex-direction": "column", gap: "8px",
            }}>
              <Icon name={r.icon} size="small" style={{ color: A.accentBright }} />
              <span style={{ "font-size": "13.5px", color: A.fg, "font-weight": "500" }}>{r.title}</span>
              <span style={{ "font-size": "11.5px", color: A.fgMuted, "line-height": "1.5" }}>{r.body}</span>
            </div>
          )}</For>
        </div>

        <button
          onClick={startMage}
          style={{
            display: "flex", "align-items": "center", gap: "8px",
            "justify-content": "center", height: "50px", padding: "0 40px",
            "font-size": "15.5px", "margin-top": "8px", "border-radius": "12px",
            "align-self": "center",
            background: `linear-gradient(135deg, ${A.accent}, #7c5cdb)`,
            color: A.accentInk, border: "none", cursor: "pointer", "font-weight": "600",
            "box-shadow": `0 0 24px ${A.accentSoft}`,
          }}
        >
          Start Mage
          <Icon name="arrow-right" size="small" style={{ color: A.accentInk }} />
        </button>
      </div>
    </div>
  )
}
