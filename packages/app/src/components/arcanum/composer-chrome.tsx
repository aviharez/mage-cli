import { type ParentProps } from "solid-js"
import { A } from "./palette"
import { ARC_RUNES, RuneMark } from "./emblem"

// Decorative shell for the session composer — glowing border box + four corner rune marks.
// Wrap the real composer content with this; it adds only visual chrome, no logic.
export function ArcComposerChrome(props: ParentProps & { big?: boolean }) {
  const corners: [number | null, number | null, number][] = [
    [8, 8, 0],
    [null, 8, 1],
    [8, null, 2],
    [null, null, 3],
  ]

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
      {corners.map(([l, tp, runeIdx]) => (
        <span
          class="arc-breathe"
          style={{
            position: "absolute",
            left: l != null ? `${l}px` : "auto",
            right: l == null ? "8px" : "auto",
            top: tp != null ? `${tp}px` : "auto",
            bottom: tp == null ? "8px" : "auto",
            color: A.accent,
            opacity: "0.5",
            "pointer-events": "none",
          }}
        >
          <RuneMark d={ARC_RUNES[runeIdx]} size={11} />
        </span>
      ))}
      {props.children}
    </div>
  )
}
