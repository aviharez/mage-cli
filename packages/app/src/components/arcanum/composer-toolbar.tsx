import { type JSX, Show } from "solid-js"
import { A } from "./palette"
import { IconArrowRight, IconPaperclip, IconTerminal } from "./composer-icons"

// Ghost action button — borderless, lights up on hover (V4Composer .btn-ghost).
function GhostButton(props: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: JSX.Element
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      style={{
        display: "inline-flex",
        "align-items": "center",
        "justify-content": "center",
        width: "28px",
        height: "28px",
        border: "0",
        "border-radius": "8px",
        background: "transparent",
        color: A.fgMuted,
        cursor: props.disabled ? "default" : "pointer",
        opacity: props.disabled ? "0.4" : "1",
        transition: "background .15s, color .15s",
      }}
      onMouseEnter={(e) => {
        if (props.disabled) return
        const el = e.currentTarget as HTMLElement
        el.style.background = "rgba(169,139,255,0.07)"
        el.style.color = A.fg
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.background = "transparent"
        el.style.color = A.fgMuted
      }}
    >
      {props.children}
    </button>
  )
}

// The arcane composer footer toolbar — mode/agent pill on the left, attach / @ /
// terminal ghost actions, then the "to cast" hint and the primary Cast button.
// Presentational only; all wiring is passed in from PromptInput.
export function ArcComposerToolbar(props: {
  modeControl: JSX.Element
  onAttach: () => void
  onTerminal: () => void
  onCast: (event: MouseEvent) => void
  hint: string
  castLabel: string
  stopLabel: string
  stopping: boolean
  disabled: boolean
}) {
  return (
    <div
      style={{
        display: "flex",
        "align-items": "center",
        gap: "8px",
        padding: "10px 4px 2px",
        "min-width": "0",
      }}
    >
      {props.modeControl}
      <GhostButton label={props.castLabel} onClick={props.onAttach}>
        <IconPaperclip size={14} />
      </GhostButton>
      <GhostButton label="terminal" onClick={props.onTerminal}>
        <IconTerminal size={14} />
      </GhostButton>
      <span style={{ flex: "1", "min-width": "8px" }} />
      <span
        class="mono"
        style={{ "font-size": "10.5px", color: A.fgDim, "white-space": "nowrap" }}
      >
        {props.hint}
      </span>
      <button
        type="button"
        onClick={props.onCast}
        disabled={props.disabled}
        style={{
          display: "inline-flex",
          "align-items": "center",
          gap: "7px",
          padding: "8px 16px",
          "border-radius": "9px",
          border: "0",
          background: props.stopping
            ? "rgba(248,122,154,0.16)"
            : `linear-gradient(180deg, ${A.accentBright}, ${A.accent})`,
          color: props.stopping ? A.err : A.accentInk,
          "font-size": "12px",
          "font-weight": "600",
          "font-family": "inherit",
          cursor: props.disabled ? "default" : "pointer",
          opacity: props.disabled ? "0.45" : "1",
          "box-shadow": props.stopping ? "none" : `0 0 20px ${A.accentSoft}`,
          transition: "box-shadow .15s, opacity .15s",
        }}
        onMouseEnter={(e) => {
          if (props.disabled || props.stopping) return
          ;(e.currentTarget as HTMLElement).style.boxShadow = `0 0 30px ${A.accentRing}`
        }}
        onMouseLeave={(e) => {
          if (props.stopping) return
          ;(e.currentTarget as HTMLElement).style.boxShadow = `0 0 20px ${A.accentSoft}`
        }}
      >
        <Show when={props.stopping} fallback={<>{props.castLabel} <IconArrowRight size={13} /></>}>
          {props.stopLabel}
        </Show>
      </button>
    </div>
  )
}
