import { For } from "solid-js"
import type { JSX } from "solid-js"
import { A } from "./palette"

const ARC_RNG = (seed: number) => {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

// A quiet starfield — small twinkling points scattered across the sky.
const ARC_STARS = (() => {
  const r = ARC_RNG(23)
  return Array.from({ length: 64 }, () => ({
    x: r() * 100,
    y: r() * 100,
    sz: 0.8 + r() * 1.6,
    o: 0.18 + r() * 0.5,
    tw: 3 + r() * 5,
    delay: -r() * 6,
    bright: r() < 0.12,
  }))
})()

// A handful of shooting stars that streak across on long, staggered cycles.
const ARC_SHOOTING = (() => {
  const r = ARC_RNG(57)
  return Array.from({ length: 4 }, () => ({
    top: r() * 45,
    left: 18 + r() * 64,
    len: 90 + r() * 70,
    dur: 6 + r() * 5,
    delay: -r() * 9,
  }))
})()

export function ArcAtmos(props: { stars?: boolean; motes?: boolean }) {
  return (
    <div
      class="arc-atmos"
      style={{ position: "absolute", inset: "0", "z-index": "0", overflow: "hidden", "pointer-events": "none" }}
    >
      {/* night-sky gradient wash */}
      <div
        style={{
          position: "absolute",
          inset: "0",
          background: `radial-gradient(120% 90% at 50% -20%, rgba(99,71,184,0.14), transparent 58%),
                       radial-gradient(80% 60% at 80% 115%, rgba(103,232,249,0.04), transparent 60%)`,
        }}
      />
      {/* soft glow low on the horizon for depth */}
      <div
        class="arc-aurora"
        style={{
          position: "absolute",
          width: "80%",
          height: "60%",
          left: "10%",
          bottom: "-24%",
          "border-radius": "50%",
          filter: "blur(70px)",
          opacity: "0.4",
          background: "radial-gradient(circle, rgba(120,86,220,0.22), transparent 70%)",
        }}
      />
      {props.stars && (
        <>
          {/* twinkling stars */}
          <For each={ARC_STARS}>{(st) => (
            <span
              class="arc-star"
              style={{
                position: "absolute",
                left: `${st.x}%`,
                top: `${st.y}%`,
                width: `${st.sz}px`,
                height: `${st.sz}px`,
                "border-radius": "50%",
                background: st.bright ? A.aether : "#dad3ff",
                "box-shadow": `0 0 ${st.sz * 2.5}px ${st.bright ? A.aether : "rgba(200,180,255,0.6)"}`,
                opacity: String(st.o),
                "--tw": `${st.tw}s`,
                "--delay": `${st.delay}s`,
              } as JSX.CSSProperties}
            />
          )}</For>
          {/* falling / shooting stars */}
          <For each={ARC_SHOOTING}>{(sh) => (
            <span
              class="arc-shoot"
              style={{
                top: `${sh.top}%`,
                left: `${sh.left}%`,
                "--len": `${sh.len}px`,
                "--dur": `${sh.dur}s`,
                "--delay": `${sh.delay}s`,
              } as JSX.CSSProperties}
            />
          )}</For>
        </>
      )}
    </div>
  )
}
