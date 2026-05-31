import { For } from "solid-js"
import { A } from "./palette"

const ARC_RNG = (seed: number) => {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

const ARC_STARS = (() => {
  const r = ARC_RNG(23)
  return Array.from({ length: 46 }, () => ({
    x: r() * 100, y: r() * 100,
    rad: 0.4 + r() * 0.9,
    o: 0.10 + r() * 0.16,
    tw: 4 + r() * 6,
  }))
})()

const ARC_CONSTEL = [
  [[12, 22], [19, 14], [27, 23], [35, 17], [33, 28]],
  [[80, 24], [87, 17], [92, 28], [85, 34]],
  [[60, 74], [68, 67], [76, 76], [71, 84]],
]

const ARC_MOTES = (() => {
  const r = ARC_RNG(91)
  return Array.from({ length: 16 }, () => {
    const aether = r() < 0.28
    const sz = 1.4 + r() * 2.2
    return {
      left: r() * 100,
      top: 18 + r() * 78,
      sz,
      aether,
      dur: 7 + r() * 8,
      delay: -r() * 12,
      mo: 0.32 + r() * 0.4,
    }
  })
})()

export function ArcAtmos(props: { stars?: boolean; motes?: boolean }) {
  const showMotes = () => props.motes !== false
  return (
    <div
      class="arc-atmos"
      style={{ position: "absolute", inset: "0", "z-index": "0", overflow: "hidden", "pointer-events": "none" }}
    >
      {/* twilight gradient wash */}
      <div
        style={{
          position: "absolute",
          inset: "0",
          background: `radial-gradient(130% 90% at 50% -15%, rgba(99,71,184,0.16), transparent 55%),
                       radial-gradient(90% 70% at 92% 118%, rgba(103,232,249,0.05), transparent 60%)`,
        }}
      />
      {/* slow breathing aurora */}
      <div
        class="arc-aurora"
        style={{
          position: "absolute",
          width: "70%",
          height: "70%",
          left: "6%",
          top: "-18%",
          "border-radius": "50%",
          filter: "blur(60px)",
          opacity: "0.55",
          background: "radial-gradient(circle, rgba(120,86,220,0.30), transparent 68%)",
        }}
      />
      {/* optional constellation network + stars */}
      {props.stars && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: "0", width: "100%", height: "100%" }}
        >
          <For each={ARC_CONSTEL}>{(constellation) => (
            <g>
              <polyline
                points={constellation.map((p) => p.join(",")).join(" ")}
                fill="none"
                stroke={A.accent}
                stroke-width="0.18"
                opacity="0.30"
              />
              <For each={constellation}>{(p, i) => (
                <circle
                  cx={p[0]} cy={p[1]} r="0.7"
                  fill={A.accentBright}
                  opacity="0.6"
                  class="arc-star"
                  style={{ "--tw": `${5 + (i() % 3) * 1.5}s` } as JSX.CSSProperties}
                />
              )}</For>
            </g>
          )}</For>
          <For each={ARC_STARS}>{(st, i) => (
            <circle
              cx={st.x} cy={st.y} r={st.rad}
              fill={i() % 9 === 0 ? A.aether : "#cfc6ff"}
              opacity={st.o}
              class="arc-star"
              style={{ "--tw": `${st.tw}s` } as JSX.CSSProperties}
            />
          )}</For>
        </svg>
      )}
      {/* drifting aether motes */}
      {showMotes() && (
        <For each={ARC_MOTES}>{(m) => (
          <span
            class="arc-mote"
            style={{
              left: `${m.left}%`,
              top: `${m.top}%`,
              width: `${m.sz}px`,
              height: `${m.sz}px`,
              background: m.aether ? A.aether : A.accentBright,
              "box-shadow": `0 0 ${m.sz * 3}px ${m.aether ? A.aether : A.accentRing}`,
              "--dur": `${m.dur}s`,
              "--delay": `${m.delay}s`,
              "--mo": String(m.mo),
            } as JSX.CSSProperties}
          />
        )}</For>
      )}
    </div>
  )
}
