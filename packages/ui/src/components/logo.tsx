import { ComponentProps, Show } from "solid-js"

// Pixel grid: 5 rows × 5 cols (M) or 4 cols (A/G/E), cell size = 6px
// Traced directly from the MAGE bitmap font image.
//
// M: #...#  A: .##.  G: ####  E: ####
//    ##.##     #..#     #...     #...
//    #.#.#     ####     #..#     ####
//    #...#     ####     #.##     #...
//    #...#     #..#     ####     ####

export const Mark = (props: { class?: string }) => {
  // M lettermark — full 5 cols × 5 rows, cell=4px, viewBox 20×20
  // M: #...# / ##.## / #.#.# / #...# / #...#
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* row 0: #...# */}
      <rect x="0" y="0" width="4" height="4" fill="var(--icon-strong-base)" />
      <rect x="16" y="0" width="4" height="4" fill="var(--icon-strong-base)" />
      {/* row 1: ##.## */}
      <rect x="0" y="4" width="4" height="4" fill="var(--icon-strong-base)" />
      <rect x="4" y="4" width="4" height="4" fill="var(--icon-strong-base)" />
      <rect x="12" y="4" width="4" height="4" fill="var(--icon-strong-base)" />
      <rect x="16" y="4" width="4" height="4" fill="var(--icon-strong-base)" />
      {/* row 2: #.#.# */}
      <rect x="0" y="8" width="4" height="4" fill="var(--icon-strong-base)" />
      <rect x="8" y="8" width="4" height="4" fill="var(--icon-strong-base)" />
      <rect x="16" y="8" width="4" height="4" fill="var(--icon-strong-base)" />
      {/* row 3: #...# */}
      <rect x="0" y="12" width="4" height="4" fill="var(--icon-strong-base)" />
      <rect x="16" y="12" width="4" height="4" fill="var(--icon-strong-base)" />
      {/* row 4: #...# */}
      <rect x="0" y="16" width="4" height="4" fill="var(--icon-strong-base)" />
      <rect x="16" y="16" width="4" height="4" fill="var(--icon-strong-base)" />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  // M scaled up to 80×100 (cell=16px, 5 cols × 5 rows)
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 80 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="0" y="0" width="16" height="16" fill="var(--icon-strong-base)" />
      <rect x="64" y="0" width="16" height="16" fill="var(--icon-strong-base)" />
      <rect x="0" y="16" width="16" height="16" fill="var(--icon-strong-base)" />
      <rect x="16" y="16" width="16" height="16" fill="var(--icon-strong-base)" />
      <rect x="48" y="16" width="16" height="16" fill="var(--icon-strong-base)" />
      <rect x="64" y="16" width="16" height="16" fill="var(--icon-strong-base)" />
      <rect x="0" y="32" width="16" height="16" fill="var(--icon-strong-base)" />
      <rect x="32" y="32" width="16" height="16" fill="var(--icon-strong-base)" />
      <rect x="64" y="32" width="16" height="16" fill="var(--icon-strong-base)" />
      <rect x="0" y="48" width="16" height="16" fill="var(--icon-strong-base)" />
      <rect x="64" y="48" width="16" height="16" fill="var(--icon-strong-base)" />
      <rect x="0" y="64" width="16" height="16" fill="var(--icon-strong-base)" />
      <rect x="64" y="64" width="16" height="16" fill="var(--icon-strong-base)" />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  // Cell size P=6. Letters at y=6 (top padding). viewBox="0 0 120 42"
  // M: x=0  (5 cols = 30px), gap=6
  // A: x=36 (4 cols = 24px), gap=6
  // G: x=66 (4 cols = 24px), gap=6
  // E: x=96 (4 cols = 24px)
  // Total width = 30+6+24+6+24+6+24 = 120
  return (
    <div
      classList={{ [props.class ?? ""]: !!props.class }}
      style={{ display: "flex", "flex-direction": "column", "align-items": "center" }}
    >
      {/* <img src="/assets/mascot.png" alt="" style={{ width: "120px" }} /> */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 120 42"
        fill="none"
      >
        <g>
          {/* M — #...# / ##.## / #.#.# / #...# / #...# */}
          <rect x="0" y="6" width="6" height="6" fill="var(--icon-base)" />
          <rect x="24" y="6" width="6" height="6" fill="var(--icon-base)" />
          <rect x="0" y="12" width="6" height="6" fill="var(--icon-base)" />
          <rect x="6" y="12" width="6" height="6" fill="var(--icon-base)" />
          <rect x="18" y="12" width="6" height="6" fill="var(--icon-base)" />
          <rect x="24" y="12" width="6" height="6" fill="var(--icon-base)" />
          <rect x="0" y="18" width="6" height="6" fill="var(--icon-base)" />
          <rect x="12" y="18" width="6" height="6" fill="var(--icon-base)" />
          <rect x="24" y="18" width="6" height="6" fill="var(--icon-base)" />
          <rect x="0" y="24" width="6" height="6" fill="var(--icon-base)" />
          <rect x="24" y="24" width="6" height="6" fill="var(--icon-base)" />
          <rect x="0" y="30" width="6" height="6" fill="var(--icon-base)" />
          <rect x="24" y="30" width="6" height="6" fill="var(--icon-base)" />

          {/* A — .##. / #..# / #### / #### / #..# */}
          <rect x="42" y="6" width="6" height="6" fill="var(--icon-base)" />
          <rect x="48" y="6" width="6" height="6" fill="var(--icon-base)" />
          <rect x="36" y="12" width="6" height="6" fill="var(--icon-base)" />
          <rect x="54" y="12" width="6" height="6" fill="var(--icon-base)" />
          <rect x="36" y="18" width="6" height="6" fill="var(--icon-base)" />
          <rect x="42" y="18" width="6" height="6" fill="var(--icon-base)" />
          <rect x="48" y="18" width="6" height="6" fill="var(--icon-base)" />
          <rect x="54" y="18" width="6" height="6" fill="var(--icon-base)" />
          <rect x="36" y="24" width="6" height="6" fill="var(--icon-base)" />
          <rect x="42" y="24" width="6" height="6" fill="var(--icon-base)" />
          <rect x="48" y="24" width="6" height="6" fill="var(--icon-base)" />
          <rect x="54" y="24" width="6" height="6" fill="var(--icon-base)" />
          <rect x="36" y="30" width="6" height="6" fill="var(--icon-base)" />
          <rect x="54" y="30" width="6" height="6" fill="var(--icon-base)" />

          {/* G — #### / #... / #..# / #.## / #### */}
          <rect x="66" y="6" width="6" height="6" fill="var(--icon-strong-base)" />
          <rect x="72" y="6" width="6" height="6" fill="var(--icon-strong-base)" />
          <rect x="78" y="6" width="6" height="6" fill="var(--icon-strong-base)" />
          <rect x="84" y="6" width="6" height="6" fill="var(--icon-strong-base)" />
          <rect x="66" y="12" width="6" height="6" fill="var(--icon-strong-base)" />
          <rect x="66" y="18" width="6" height="6" fill="var(--icon-strong-base)" />
          <rect x="84" y="18" width="6" height="6" fill="var(--icon-strong-base)" />
          <rect x="66" y="24" width="6" height="6" fill="var(--icon-strong-base)" />
          <rect x="78" y="24" width="6" height="6" fill="var(--icon-strong-base)" />
          <rect x="84" y="24" width="6" height="6" fill="var(--icon-strong-base)" />
          <rect x="66" y="30" width="6" height="6" fill="var(--icon-strong-base)" />
          <rect x="72" y="30" width="6" height="6" fill="var(--icon-strong-base)" />
          <rect x="78" y="30" width="6" height="6" fill="var(--icon-strong-base)" />
          <rect x="84" y="30" width="6" height="6" fill="var(--icon-strong-base)" />

          {/* E — #### / #... / #### / #... / #### */}
          <rect x="96" y="6" width="6" height="6" fill="var(--icon-strong-base)" />
          <rect x="102" y="6" width="6" height="6" fill="var(--icon-strong-base)" />
          <rect x="108" y="6" width="6" height="6" fill="var(--icon-strong-base)" />
          <rect x="114" y="6" width="6" height="6" fill="var(--icon-strong-base)" />
          <rect x="96" y="12" width="6" height="6" fill="var(--icon-strong-base)" />
          <rect x="96" y="18" width="6" height="6" fill="var(--icon-strong-base)" />
          <rect x="102" y="18" width="6" height="6" fill="var(--icon-strong-base)" />
          <rect x="108" y="18" width="6" height="6" fill="var(--icon-strong-base)" />
          <rect x="114" y="18" width="6" height="6" fill="var(--icon-strong-base)" />
          <rect x="96" y="24" width="6" height="6" fill="var(--icon-strong-base)" />
          <rect x="96" y="30" width="6" height="6" fill="var(--icon-strong-base)" />
          <rect x="102" y="30" width="6" height="6" fill="var(--icon-strong-base)" />
          <rect x="108" y="30" width="6" height="6" fill="var(--icon-strong-base)" />
          <rect x="114" y="30" width="6" height="6" fill="var(--icon-strong-base)" />
        </g>
      </svg>
    </div>
  )
}