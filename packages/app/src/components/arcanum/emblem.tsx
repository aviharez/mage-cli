import { For, type JSX } from "solid-js"
import { A } from "./palette"

export function ArcEmblem(props: { size?: number; glow?: boolean; animate?: boolean }) {
  const size = () => props.size ?? 40

  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = (i * 30 - 90) * Math.PI / 180
    const long = i % 3 === 0
    const r1 = 45, r2 = long ? 36 : 40
    return { x1: 50 + Math.cos(a) * r1, y1: 50 + Math.sin(a) * r1,
             x2: 50 + Math.cos(a) * r2, y2: 50 + Math.sin(a) * r2, long }
  })

  const spokes = Array.from({ length: 8 }, (_, i) => {
    const a = (i * 45 - 90) * Math.PI / 180
    const long = i % 2 === 0
    const r1 = 12, r2 = long ? 27 : 22
    return { x1: 50 + Math.cos(a) * r1, y1: 50 + Math.sin(a) * r1,
             x2: 50 + Math.cos(a) * r2, y2: 50 + Math.sin(a) * r2, long }
  })

  return (
    <svg
      width={size()}
      height={size()}
      viewBox="0 0 100 100"
      style={{
        display: "block",
        overflow: "visible",
        "flex-shrink": "0",
        filter: props.glow ? `drop-shadow(0 0 13px ${A.accentRing})` : "none",
      }}
    >
      {/* outer hairline ring */}
      <circle cx="50" cy="50" r="48" fill="none" stroke={A.border} stroke-width="1" />
      <circle
        cx="50" cy="50" r="47" fill="none"
        stroke={A.borderStrong} stroke-width="1.4"
        class={props.animate ? "arc-trace" : ""}
        style={{ "--len": "296" } as JSX.CSSProperties}
      />
      {/* slow runic dial — rotates */}
      <g class={props.animate ? "arc-rot" : ""}>
        <circle cx="50" cy="50" r="43" fill="none" stroke={A.accent}
          stroke-width="1.2" stroke-dasharray="1.5 7" opacity="0.6" />
        <For each={ticks}>{(t) => (
          <line
            x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            stroke={t.long ? A.accentBright : A.accent}
            stroke-width={t.long ? "1.8" : "1.1"}
            opacity={t.long ? "0.8" : "0.45"}
          />
        )}</For>
      </g>
      {/* inscribed astrolabe — counter-rotates */}
      <g class={props.animate ? "arc-rev" : ""} opacity="0.5">
        <circle cx="50" cy="50" r="27" fill="none" stroke={A.accent} stroke-width="0.8" opacity="0.55" />
        <circle cx="50" cy="50" r="22" fill="none" stroke={A.accent} stroke-width="0.5" opacity="0.35" />
        <For each={spokes}>{(s) => (
          <line
            x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
            stroke={s.long ? A.accentBright : A.accent}
            stroke-width={s.long ? "1" : "0.7"}
            opacity={s.long ? "0.7" : "0.4"}
          />
        )}</For>
      </g>
      {/* inner halo + glowing core */}
      <circle cx="50" cy="50" r="13" fill="none" stroke={A.accent} stroke-width="1" opacity="0.5" />
      <circle
        cx="50" cy="50" r="6"
        fill={A.accentBright}
        class={props.animate ? "arc-breathe" : ""}
        style={{ filter: `drop-shadow(0 0 6px ${A.accentRing})`, "transform-origin": "50px 50px" }}
      />
      {/* single aether mote in orbit */}
      <g class={props.animate ? "arc-orbit" : ""}>
        <circle cx="50" cy="9" r="2.4" fill={A.aether}
          style={{ filter: `drop-shadow(0 0 4px ${A.aether})` }} />
      </g>
    </svg>
  )
}

export function MageWordmark(props: { emblem?: number; text?: number; glow?: boolean }) {
  const emblem = () => props.emblem ?? 24
  const text = () => props.text ?? 22
  return (
    <div style={{ display: "flex", "align-items": "center", gap: `${emblem() * 0.34}px` }}>
      <ArcEmblem size={emblem()} glow={props.glow ?? false} />
      <span
        class="serif"
        style={{
          "font-size": `${text()}px`,
          "line-height": "1",
          color: A.fgInk,
          "letter-spacing": "0.02em",
          "font-weight": "500",
          "text-shadow": props.glow ? `0 0 22px ${A.accentSoft}` : "none",
        }}
      >
        mage
      </span>
    </div>
  )
}

export function ArcAvatar(props: { size?: number }) {
  const size = () => props.size ?? 20
  return (
    <div
      style={{
        width: `${size()}px`,
        height: `${size()}px`,
        "border-radius": "50%",
        "flex-shrink": "0",
        border: `1px solid ${A.borderStrong}`,
        display: "grid",
        "place-items": "center",
        background: "radial-gradient(circle at 50% 35%, rgba(169,139,255,0.28), rgba(8,6,17,0.7))",
        "box-shadow": `0 0 10px ${A.accentSoft}`,
      }}
    >
      <svg viewBox="0 0 100 100" width={`${size() * 0.62}px`} height={`${size() * 0.62}px`}>
        <circle cx="50" cy="50" r="42" fill="none" stroke={A.accent} stroke-width="6" opacity="0.55" />
        <circle cx="50" cy="50" r="13" fill={A.accentBright} />
      </svg>
    </div>
  )
}

export function ArcStatus(props: { color?: string; label?: string; size?: number }) {
  const color = () => props.color ?? A.aether
  const size = () => props.size ?? 7
  return (
    <span style={{ display: "flex", "align-items": "center", gap: "8px", color: A.fgMuted, "font-size": "11px" }}>
      <span
        style={{
          position: "relative",
          width: `${size() + 8}px`,
          height: `${size() + 8}px`,
          display: "inline-grid",
          "place-items": "center",
        }}
      >
        <span
          style={{
            position: "absolute",
            inset: "0",
            "border-radius": "50%",
            background: color(),
            opacity: "0.16",
          }}
        />
        <span
          style={{
            width: `${size()}px`,
            height: `${size()}px`,
            "border-radius": "50%",
            background: color(),
            "box-shadow": `0 0 7px ${color()}`,
          }}
        />
      </span>
      {props.label && <span class="mono">{props.label}</span>}
    </span>
  )
}

const ARC_RUNES = [
  "M3 1v14M3 1l4 4M3 15l4-4",
  "M2 2l5 12M12 2L7 14",
  "M2 1v14M11 1v14M2 8h9",
  "M6 1v14M1 5l5-4 5 4",
]

export function RuneMark(props: { d: string; size?: number; style?: JSX.CSSProperties }) {
  const size = () => props.size ?? 13
  return (
    <svg
      width={size()}
      height={size() * 1.15}
      viewBox="0 0 13 16"
      style={{ display: "block", ...(props.style ?? {}) }}
    >
      <path
        d={props.d}
        fill="none"
        stroke="currentColor"
        stroke-width="1.1"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  )
}

export { ARC_RUNES }
