import { createSignal, Show, For } from "solid-js"
import { installSnippet, type HubItem, type HubItemKind } from "./hub-data"

const KIND_LABELS: Record<HubItemKind, string> = {
  mcp:    "MCP",
  skill:  "Skill",
  plugin: "Plugin",
}

const KIND_COLORS: Record<HubItemKind, { color: string; bg: string }> = {
  mcp:    { color: "#c4a8ff", bg: "rgba(167,139,250,0.12)" },
  skill:  { color: "#6ee7b7", bg: "rgba(110,231,183,0.12)" },
  plugin: { color: "#f5b76c", bg: "rgba(245,183,108,0.12)" },
}

function cliCommand(item: HubItem): string {
  if (item.installKind === "config") return `mage mcp add ${item.install}`
  if (item.installKind === "npm")    return `mage plugin add ${item.install}`
  return `mage skill add ${item.install}`
}

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
    if (props.item.installKind === "config")    return "Restarts the gateway on first load"
    if (props.item.installKind === "npm")       return "Loads automatically on next session"
    return "Copy the path and add your SKILL.md"
  }

  return (
    <aside class="det-install-panel">
      <h3 class="det-install-h3">Install</h3>

      {/* Primary command */}
      <div class="det-install-cmd">
        <span class="det-cmd-prompt">$</span>
        <span class="det-cmd-text">{cmd}</span>
        <button class="det-copy-btn" onClick={copyCmd} aria-label="Copy install command">
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
        <div class="det-install-alt-label">Or add manually:</div>
        <div class="det-install-snippet-wrap">
          <pre class="det-install-snippet">{snippet}</pre>
          <button class="det-snippet-copy" onClick={copyConfig} aria-label="Copy config snippet">
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

export default function HubDetail(props: { item: HubItem }) {
  const item = props.item
  const kc = KIND_COLORS[item.kind]
  const kindLabel = KIND_LABELS[item.kind]
  const tags = item.tags || []

  return (
    <div class="det-wrap not-content">

      {/* Breadcrumbs */}
      <nav class="det-crumbs" aria-label="Breadcrumb">
        <a href="/" class="det-crumb-link">mage</a>
        <span class="det-crumb-sep">/</span>
        <a href="/hub/" class="det-crumb-link">hub</a>
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
              <div class="det-meta-label">Kind</div>
              <div class="det-meta-value">{kindLabel}</div>
            </div>
            <div>
              <div class="det-meta-label">Author</div>
              <div class="det-meta-value det-meta-mono">{item.author}</div>
            </div>
            <div>
              <div class="det-meta-label">Install</div>
              <div class="det-meta-value det-meta-mono">{item.installKind}</div>
            </div>
            <div>
              <div class="det-meta-label">Tags</div>
              <div class="det-meta-value">{tags.length ? tags.slice(0, 3).join(", ") : "—"}</div>
            </div>
          </div>
        </div>

        {/* Right column — install panel */}
        <InstallPanel item={item} />
      </div>

      {/* ── Detail body ── */}
      <div class="det-body">
        {/* Prose */}
        <div class="det-prose">
          <h2 class="det-section-title">Overview</h2>
          <p>{item.description}</p>

          <Show when={item.kind === "mcp"}>
            <h2 class="det-section-title">How it works</h2>
            <p>
              The <code>{item.name}</code> MCP server exposes its functionality as discrete tools
              the agent can call. Install it with <code>mage mcp add {item.name}</code> and the
              gateway will start it automatically on the next session.
            </p>
          </Show>

          <Show when={item.kind === "plugin"}>
            <h2 class="det-section-title">How it works</h2>
            <p>
              Add <code>{item.install}</code> to the <code>plugin</code> array in your{" "}
              <code>mage.json</code>. The plugin hooks into the gateway lifecycle and runs on every
              session start.
            </p>
          </Show>

          <Show when={item.kind === "skill"}>
            <h2 class="det-section-title">How it works</h2>
            <p>
              Place <code>SKILL.md</code> at <code>.mage/skills/{item.install}/</code> in your
              project root. The gateway loads it as a slash command on startup.
            </p>
          </Show>

          <Show when={tags.length > 0}>
            <h2 class="det-section-title">Tags</h2>
            <div class="det-tags">
              <For each={tags}>
                {(tag) => <span class="det-tag">{tag}</span>}
              </For>
            </div>
          </Show>
        </div>

        {/* Sidebar */}
        <aside class="det-sidebar">
          <Show when={item.source}>
            <div class="det-side-card">
              <h4 class="det-side-title">Links</h4>
              <div class="det-side-links">
                <a href={item.source} target="_blank" rel="noopener noreferrer" class="det-side-link">
                  Source ↗
                </a>
                <a href="/hub/" class="det-side-link">
                  Back to hub ↗
                </a>
              </div>
            </div>
          </Show>

          <Show when={!item.source}>
            <div class="det-side-card">
              <h4 class="det-side-title">Links</h4>
              <div class="det-side-links">
                <a href="/hub/" class="det-side-link">Back to hub ↗</a>
              </div>
            </div>
          </Show>

          <div class="det-side-card">
            <h4 class="det-side-title">Details</h4>
            <div class="det-side-rows">
              <div class="det-side-row">
                <span class="det-side-row-label">Kind</span>
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
                  <span class="det-side-row-label">Tags</span>
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
