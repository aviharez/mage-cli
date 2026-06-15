import type { JSX } from "solid-js"
import { ArcEmblem } from "@/components/arcanum/emblem"
import { ArcAtmos } from "@/components/arcanum/atmos"
import { A } from "@/components/arcanum/palette"

interface NewSessionDesignViewProps {
  children: JSX.Element
  currentDir?: string
  homeDir?: string
}

export function NewSessionDesignView(props: NewSessionDesignViewProps) {
  const isHome = () => !props.currentDir || !props.homeDir || props.currentDir === props.homeDir
  const dirLabel = () => isHome() ? "~" : (props.currentDir?.split("/").at(-1) ?? "~")

  return (
    <div
      data-component="session-new-design"
      class="relative size-full overflow-hidden"
      style={{ background: A.bg }}
    >
      <ArcAtmos stars />
      <div
        class="absolute inset-0 flex flex-col items-center justify-center gap-10 px-6"
        style={{ "z-index": "1" }}
      >
        <div class="flex flex-col items-center gap-5">
          <ArcEmblem size={100} glow animate />
          <div class="flex flex-col items-center gap-2 text-center">
            <span
              class="serif"
              style={{
                "font-size": "26px",
                "font-weight": "500",
                color: A.fgInk,
                "letter-spacing": "0.02em",
                "text-shadow": `0 0 28px ${A.accentSoft}`,
              }}
            >
              Conjure anything
            </span>
            <span style={{ "font-size": "13px", color: A.fgMuted }}>
              {"You're in "}
              <span style={{ color: A.accentBright }}>{dirLabel()}</span>
              {isHome() ? " — your Home circle" : ""}
            </span>
          </div>
        </div>
        <div class="w-full max-w-[720px]">{props.children}</div>
      </div>
    </div>
  )
}
