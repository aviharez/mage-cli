import type { JSX } from "solid-js"

// Small stroke icons used by the arcane composer toolbar. The mage-ui icon set
// has no paperclip / at / terminal / arrow-right, so they're inlined here to
// match the V4Composer reference (design-references/arcanum.jsx).
function Svg(props: { size?: number; children: JSX.Element }) {
  const size = () => props.size ?? 13
  return (
    <svg
      width={size()}
      height={size()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      style={{ display: "block" }}
    >
      {props.children}
    </svg>
  )
}

export function IconSparkles(props: { size?: number }) {
  return (
    <Svg size={props.size}>
      <path d="M12 3v4M12 17v4M5 12H1M23 12h-4M6.3 6.3l2.1 2.1M15.6 15.6l2.1 2.1M17.7 6.3l-2.1 2.1M8.4 15.6l-2.1 2.1" />
    </Svg>
  )
}

export function IconPaperclip(props: { size?: number }) {
  return (
    <Svg size={props.size}>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </Svg>
  )
}

export function IconAt(props: { size?: number }) {
  return (
    <Svg size={props.size}>
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
    </Svg>
  )
}

export function IconTerminal(props: { size?: number }) {
  return (
    <Svg size={props.size}>
      <path d="M4 17l6-6-6-6M12 19h8" />
    </Svg>
  )
}

export function IconArrowRight(props: { size?: number }) {
  return (
    <Svg size={props.size}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  )
}

export function IconChevronDown(props: { size?: number }) {
  return (
    <Svg size={props.size}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  )
}

export function IconPaperPlane(props: { size?: number }) {
  return (
    <Svg size={props.size}>
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </Svg>
  )
}
