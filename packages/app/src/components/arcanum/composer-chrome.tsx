import { type ParentProps } from "solid-js"
import { A } from "./palette"

// Decorative shell for the session composer — glowing border box + four corner rune marks.
// Wrap the real composer content with this; it adds only visual chrome, no logic.
export function ArcComposerChrome(props: ParentProps & { big?: boolean }) {
  return (
    <div
      style={{
        position: "relative",
        border: `1px solid ${A.accentRing}`,
        "border-radius": "14px",
        background: "linear-gradient(180deg, rgba(21,17,49,0.92), rgba(11,9,24,0.92))",
        "box-shadow": `0 0 0 1px ${A.accentRing}, 0 0 36px ${A.accentSoft}, inset 0 0 30px rgba(169,139,255,0.04)`,
        padding: props.big ? "16px" : "13px",
      }}
    >
      {props.children}
    </div>
  )
}
