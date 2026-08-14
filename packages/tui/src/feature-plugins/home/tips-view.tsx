import { useTheme } from "../../context/theme"

export function Tips() {
  const theme = useTheme().theme

  return (
    <box flexDirection="row" maxWidth="100%">
      <text flexShrink={0} style={{ fg: theme.warning }}>
        ● Tip{" "}
      </text>
      <text flexShrink={1} wrapMode="word" fg={theme.textMuted}>
        <span style={{ fg: theme.text }}>@</span> for files/agent; <span style={{ fg: theme.text }}>/</span>
        {" for commands and skills; "}
        <span style={{ fg: theme.text }}>!</span> for shell;
      </text>
    </box>
  )
}
