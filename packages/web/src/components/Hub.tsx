import { createSignal, createMemo, For, Show } from "solid-js"
import { HUB_ITEMS, type HubItem, type HubItemKind } from "./hub-data"

type Filter = "all" | HubItemKind
type Sort = "popular" | "name" | "recent"

const KIND_LABELS: Record<HubItemKind, string> = {
  mcp: "MCP",
  skill: "Skill",
  plugin: "Plugin",
}

const KIND_COLORS: Record<HubItemKind, { color: string; bg: string }> = {
  mcp:    { color: "#c4a8ff", bg: "rgba(167,139,250,0.12)" },
  skill:  { color: "#6ee7b7", bg: "rgba(110,231,183,0.12)" },
  plugin: { color: "#f5b76c", bg: "rgba(245,183,108,0.12)" },
}

function Card(props: { item: HubItem }) {
  const kc = KIND_COLORS[props.item.kind]

  return (
    <a
      class="hub-card"
      href={`/hub/${props.item.name}`}
    >
      <div class="hub-card-head">
        <div class="hub-glyph" style={{ background: props.item.bg, color: props.item.fg }}>
          {props.item.glyph}
        </div>
        <div class="hub-card-meta">
          <div class="hub-card-title">{props.item.name}</div>
          <div class="hub-card-author">{props.item.author}</div>
        </div>
      </div>
      <p class="hub-card-desc">{props.item.description}</p>
      <div class="hub-card-foot">
        <span
          class="hub-badge"
          style={{ color: kc.color, background: kc.bg, border: `1px solid ${kc.color}44` }}
        >
          {KIND_LABELS[props.item.kind]}
        </span>
        <span class="hub-card-arrow">→</span>
      </div>
    </a>
  )
}

export default function Hub() {
  const [filter, setFilter] = createSignal<Filter>("all")
  const [sort, setSort] = createSignal<Sort>("popular")
  const [query, setQuery] = createSignal("")

  const filtered = createMemo(() => {
    let items = [...HUB_ITEMS]
    const f = filter()
    if (f !== "all") items = items.filter(i => i.kind === f)
    const q = query().trim().toLowerCase()
    if (q) {
      items = items.filter(i =>
        i.name.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.author.toLowerCase().includes(q) ||
        (i.tags || []).some(t => t.includes(q))
      )
    }
    if (sort() === "name") items.sort((a, b) => a.name.localeCompare(b.name))
    return items
  })

  const featured = createMemo(() =>
    filter() === "all" && !query()
      ? HUB_ITEMS.filter(i => i.featured)
      : []
  )
  const rest = createMemo(() => {
    const f = featured()
    return filtered().filter(i => !f.includes(i))
  })

  const stats = createMemo(() => ({
    total: HUB_ITEMS.length,
    mcp:    HUB_ITEMS.filter(i => i.kind === "mcp").length,
    skill:  HUB_ITEMS.filter(i => i.kind === "skill").length,
    plugin: HUB_ITEMS.filter(i => i.kind === "plugin").length,
  }))

  const filters: { id: Filter; label: string; count: () => number }[] = [
    { id: "all",    label: "All",     count: () => HUB_ITEMS.length },
    { id: "mcp",    label: "MCP",     count: () => stats().mcp },
    { id: "skill",  label: "Skills",  count: () => stats().skill },
    { id: "plugin", label: "Plugins", count: () => stats().plugin },
  ]

  return (
    <div class="hub-wrap not-content">
      {/* Header — left: eyebrow+title, right: lede+stats (matches reference catalog-head) */}
      <div class="hub-head">
        <div>
          <div class="hub-eyebrow">MCP Catalog</div>
          <h1 class="hub-title">Extensions for every workflow.</h1>
        </div>
        <div class="hub-right-col">
          <p class="hub-lede">
            Browse and install MCP servers, skills, and plugins curated for the Mage gateway.
            Click any card to copy the install snippet.
          </p>
          <div class="hub-stats">
            <div class="stat">
              <div class="stat-num">{stats().total}</div>
              <div class="stat-label">Items</div>
            </div>
            <div class="stat">
              <div class="stat-num">{stats().mcp}</div>
              <div class="stat-label">MCP</div>
            </div>
            <div class="stat">
              <div class="stat-num">{stats().skill}</div>
              <div class="stat-label">Skills</div>
            </div>
            <div class="stat">
              <div class="stat-num">{stats().plugin}</div>
              <div class="stat-label">Plugins</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div class="hub-filter">
        <div class="filter-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="7"/>
            <path d="m20 20-3.5-3.5"/>
          </svg>
          <input
            class="filter-input"
            placeholder="Search servers, skills, plugins…"
            value={query()}
            onInput={e => setQuery(e.currentTarget.value)}
          />
        </div>
        <div class="filter-pills">
          <For each={filters}>
            {(f) => (
              <button
                class="pill"
                classList={{ active: filter() === f.id }}
                onClick={() => setFilter(f.id)}
              >
                {f.label} <span class="pill-count">{f.count()}</span>
              </button>
            )}
          </For>
        </div>
        <div class="filter-sort">
          <span>Sort:</span>
          <select value={sort()} onChange={e => setSort(e.currentTarget.value as Sort)}>
            <option value="popular">Most installed</option>
            <option value="name">Name (A–Z)</option>
            <option value="recent">Recently updated</option>
          </select>
        </div>
      </div>

      {/* Featured */}
      <Show when={featured().length > 0}>
        <div class="hub-section">
          <div class="hub-section-label">✦ Featured</div>
          <div class="hub-grid hub-grid--featured">
            <For each={featured()}>{(item) => <Card item={item} />}</For>
          </div>
        </div>
      </Show>

      {/* All */}
      <Show when={rest().length > 0}>
        <div class="hub-section">
          <div class="hub-section-label" style="color:var(--mg-text-dim)">All items</div>
          <div class="hub-grid">
            <For each={rest()}>{(item) => <Card item={item} />}</For>
          </div>
        </div>
      </Show>

      {/* Empty */}
      <Show when={filtered().length === 0}>
        <div class="hub-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="7"/>
            <path d="m20 20-3.5-3.5"/>
          </svg>
          <div>No items match that filter.</div>
        </div>
      </Show>
    </div>
  )
}

// Hub styles are in src/styles/custom.css (under "/* Hub / Marketplace page */")
