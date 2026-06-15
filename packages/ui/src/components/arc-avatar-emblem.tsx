export function ArcAvatarEmblem(props: { size?: number }) {
  const size = () => props.size ?? 20
  return (
    <div
      style={{
        width: `${size()}px`,
        height: `${size()}px`,
        "border-radius": "50%",
        "flex-shrink": "0",
        border: "1px solid rgba(165,148,255,0.22)",
        display: "grid",
        "place-items": "center",
        background: "radial-gradient(circle at 50% 35%, rgba(169,139,255,0.28), rgba(8,6,17,0.7))",
        "box-shadow": "0 0 10px rgba(169,139,255,0.13)",
      }}
    >
      <svg viewBox="0 0 100 100" width={`${size() * 0.62}px`} height={`${size() * 0.62}px`}>
        <circle cx="50" cy="50" r="42" fill="none" stroke="#a98bff" stroke-width="6" opacity="0.55" />
        <circle cx="50" cy="50" r="13" fill="#c8b4ff" />
      </svg>
    </div>
  )
}
