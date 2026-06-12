import { createSignal, Show, For } from "solid-js"
import { installSnippet, type HubItem, type HubItemKind } from "./hub-data"

const KIND_LABELS: Record<HubItemKind, string> = {
  mcp:   "MCP",
  skill: "Skill",
}

const KIND_COLORS: Record<HubItemKind, { color: string; bg: string }> = {
  mcp:   { color: "#c4a8ff", bg: "rgba(167,139,250,0.12)" },
  skill: { color: "#6ee7b7", bg: "rgba(110,231,183,0.12)" },
}

const BUILTIN_COLOR = { color: "#fbbf24", bg: "rgba(251,191,36,0.12)" }

function cliCommand(item: HubItem): string {
  if (item.installKind === "config") return `mage mcp add ${item.install}`
  return `mage skill add ${item.install}`
}

// ---- Install panel for installable items (MCP + downloadable skills) -------
function InstallPanel(props: { item: HubItem }) {
  const [copied, setCopied] = createSignal(false)
  const [configCopied, setConfigCopied] = createSignal(false)
  const cmd = cliCommand(props.item)
  const snippet = installSnippet(props.item)

  function copyCmd() {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    })
  }

  function copyConfig() {
    navigator.clipboard.writeText(snippet).then(() => {
      setConfigCopied(true)
      setTimeout(() => setConfigCopied(false), 1400)
    })
  }

  const footerText = () => {
    if (props.item.installKind === "config") return "Gateway dimulai ulang otomatis saat pertama kali dimuat"
    return "Salin path dan tambahkan SKILL.md Anda"
  }

  return (
    <aside class="det-install-panel">
      <h3 class="det-install-h3">Pasang</h3>

      {/* Primary command */}
      <div class="det-install-cmd">
        <span class="det-cmd-prompt">$</span>
        <span class="det-cmd-text">{cmd}</span>
        <button class="det-copy-btn" onClick={copyCmd} aria-label="Salin perintah instalasi">
          <Show when={copied()} fallback={
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="11" height="11" rx="2"/>
              <path d="M5 15V5a2 2 0 0 1 2-2h10"/>
            </svg>
          }>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M5 12l5 5L20 7"/>
            </svg>
          </Show>
        </button>
      </div>

      {/* Footer hint */}
      <div class="det-install-foot">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="det-install-check">
          <path d="M5 12l5 5L20 7"/>
        </svg>
        <span>{footerText()}</span>
      </div>

      {/* Alt / manual config */}
      <div class="det-install-alt">
        <div class="det-install-alt-label">Atau tambahkan manual:</div>
        <div class="det-install-snippet-wrap">
          <pre class="det-install-snippet">{snippet}</pre>
          <button class="det-snippet-copy" onClick={copyConfig} aria-label="Salin konfigurasi">
            <Show when={configCopied()} fallback={
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="11" height="11" rx="2"/>
                <path d="M5 15V5a2 2 0 0 1 2-2h10"/>
              </svg>
            }>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M5 12l5 5L20 7"/>
              </svg>
            </Show>
          </button>
        </div>
      </div>
    </aside>
  )
}

// ---- Info panel for built-in skills (already included, no install needed) --
function BuiltinPanel() {
  return (
    <aside class="det-install-panel">
      <h3 class="det-install-h3">Sudah Termasuk</h3>

      <div class="det-builtin-note">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M5 12l5 5L20 7"/>
        </svg>
        <span>Skill ini sudah tersedia di Mage — tidak perlu dipasang secara terpisah.</span>
      </div>
    </aside>
  )
}

export default function HubDetail(props: { item: HubItem }) {
  const item = props.item
  const kc = item.builtin ? BUILTIN_COLOR : KIND_COLORS[item.kind]
  const kindLabel = item.builtin ? "Skill Bawaan" : KIND_LABELS[item.kind]
  const tags = item.tags || []

  return (
    <div class="det-wrap not-content">

      {/* Breadcrumbs */}
      <nav class="det-crumbs" aria-label="Breadcrumb">
        <a href="/" class="det-crumb-link">mage</a>
        <span class="det-crumb-sep">/</span>
        <a href="/hub/" class="det-crumb-link">katalog</a>
        <span class="det-crumb-sep">/</span>
        <span class="det-crumb-current">{item.name}</span>
      </nav>

      {/* ── Detail head ── */}
      <div class="det-head">
        {/* Left column */}
        <div>
          <div class="det-title-row">
            <div class="det-glyph" style={{ background: item.bg, color: item.fg }}>
              {item.glyph}
            </div>
            <div class="det-title-block">
              <h1 class="det-name">{item.name}</h1>
              <div class="det-vendor">
                {item.author}
                <span
                  class="det-kind-badge"
                  style={{ color: kc.color, background: kc.bg, border: `1px solid ${kc.color}55` }}
                >
                  {kindLabel}
                </span>
              </div>
            </div>
          </div>

          <p class="det-tagline">{item.description}</p>

          {/* Meta grid */}
          <div class="det-meta">
            <div>
              <div class="det-meta-label">Jenis</div>
              <div class="det-meta-value">{kindLabel}</div>
            </div>
            <div>
              <div class="det-meta-label">Author</div>
              <div class="det-meta-value det-meta-mono">{item.author}</div>
            </div>
            <div>
              <div class="det-meta-label">Tag</div>
              <div class="det-meta-value">{tags.length ? tags.slice(0, 3).join(", ") : "—"}</div>
            </div>
          </div>
        </div>

        {/* Right column — install panel or builtin panel */}
        <Show when={item.builtin} fallback={<InstallPanel item={item} />}>
          <BuiltinPanel />
        </Show>
      </div>

      {/* ── Detail body ── */}
      <div class="det-body">
        {/* Prose */}
        <div class="det-prose">

          {/* Built-in skills: unique per-skill Cara Kerja from skill-howto.ts */}
          <Show when={item.builtin}>
            <h2 class="det-section-title">Cara Kerja</h2>
            <Show
              when={item.howto}
              fallback={
                <p>
                  Skill <code>{item.name}</code> sudah disertakan dalam setiap instalasi Mage.
                  Aktifkan dengan mengetikkan <code>/{item.install}</code> di prompt.
                </p>
              }
            >
              <For each={(item.howto ?? "").split("\n\n").filter(Boolean)}>
                {(para) => <p>{para}</p>}
              </For>
            </Show>
          </Show>

          <Show when={item.kind === "mcp" && !item.builtin}>
            <h2 class="det-section-title">Cara kerja</h2>
            <p>
              MCP server <code>{item.name}</code> mengekspos fungsionalitasnya sebagai alat yang
              dapat dipanggil oleh agen. Pasang dengan <code>mage mcp add {item.name}</code> dan
              gateway akan memulainya secara otomatis pada sesi berikutnya.
            </p>
          </Show>

          <Show when={item.kind === "skill" && !item.builtin}>
            <h2 class="det-section-title">Cara kerja</h2>
            <p>
              Letakkan <code>SKILL.md</code> di <code>.mage/skills/{item.install}/</code> pada
              root proyek Anda. Gateway akan memuatnya sebagai slash command saat startup.
            </p>
          </Show>

          <Show when={tags.length > 0}>
            <h2 class="det-section-title">Tag</h2>
            <div class="det-tags">
              <For each={tags}>
                {(tag) => <span class="det-tag">{tag}</span>}
              </For>
            </div>
          </Show>
        </div>

        {/* Sidebar */}
        <aside class="det-sidebar">
          {/* <Show when={item.source}>
            <div class="det-side-card">
              <h4 class="det-side-title">Tautan</h4>
              <div class="det-side-links">
                <a href={item.source} target="_blank" rel="noopener noreferrer" class="det-side-link">
                  Sumber ↗
                </a>
                <a href="/hub/" class="det-side-link">
                  Kembali ke katalog ↗
                </a>
              </div>
            </div>
          </Show> */}

          {/* <Show when={!item.source}>
            <div class="det-side-card">
              <h4 class="det-side-title">Tautan</h4>
              <div class="det-side-links">
                <a href="/hub/" class="det-side-link">Kembali ke katalog ↗</a>
              </div>
            </div>
          </Show> */}

          <div class="det-side-card">
            <h4 class="det-side-title">Detail</h4>
            <div class="det-side-rows">
              <div class="det-side-row">
                <span class="det-side-row-label">Jenis</span>
                <span
                  class="det-kind-badge"
                  style={{ color: kc.color, background: kc.bg, border: `1px solid ${kc.color}55` }}
                >
                  {kindLabel}
                </span>
              </div>
              <div class="det-side-row">
                <span class="det-side-row-label">Author</span>
                <span class="det-side-row-value">{item.author}</span>
              </div>
              <Show when={tags.length > 0}>
                <div class="det-side-row">
                  <span class="det-side-row-label">Tag</span>
                  <span class="det-side-row-value">{tags.join(", ")}</span>
                </div>
              </Show>
            </div>
          </div>
        </aside>
      </div>

    </div>
  )
}
