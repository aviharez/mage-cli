import { createSignal, createMemo, createEffect, For, Show } from "solid-js"
import { HUB_ITEMS, type HubItem, type HubItemKind } from "./hub-data"

type Filter = "all" | HubItemKind

const KIND_LABELS: Record<HubItemKind, string> = {
  mcp:   "MCP",
  skill: "Skill",
}

const KIND_COLORS: Record<HubItemKind, { color: string; bg: string }> = {
  mcp:   { color: "#c4a8ff", bg: "rgba(167,139,250,0.12)" },
  skill: { color: "#6ee7b7", bg: "rgba(110,231,183,0.12)" },
}

const BUILTIN_COLOR = { color: "#fbbf24", bg: "rgba(251,191,36,0.12)" }

const PAGE_SIZE = 9

function Card(props: { item: HubItem }) {
  const kc = props.item.builtin ? BUILTIN_COLOR : KIND_COLORS[props.item.kind]

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
          {props.item.builtin ? "Default" : KIND_LABELS[props.item.kind]}
        </span>
        <For each={props.item.tags ?? []}>
          {(t) => <span class="hub-tag-chip">{t}</span>}
        </For>
        <span class="hub-card-arrow">→</span>
      </div>
    </a>
  )
}

/** Paginated grid — resets to page 1 whenever the items list changes. */
function PaginatedGrid(props: {
  items: () => HubItem[]
  featured?: boolean
}) {
  const [page, setPage] = createSignal(1)

  // Reset to page 1 whenever the source items change (filter/search/tag).
  createEffect(() => {
    props.items() // track
    setPage(1)
  })

  const pageCount = createMemo(() =>
    Math.max(1, Math.ceil(props.items().length / PAGE_SIZE))
  )
  const currentPage = createMemo(() =>
    Math.min(page(), pageCount())
  )
  const visible = createMemo(() => {
    const start = (currentPage() - 1) * PAGE_SIZE
    return props.items().slice(start, start + PAGE_SIZE)
  })

  const gridClass = () =>
    props.featured ? "hub-grid hub-grid--featured" : "hub-grid"

  return (
    <div>
      <div class={gridClass()}>
        <For each={visible()}>{(item) => <Card item={item} />}</For>
      </div>
      <Show when={pageCount() > 1}>
        <div class="hub-pagination">
          <button
            class="hub-page-nav"
            disabled={currentPage() === 1}
            onClick={() => setPage(p => p - 1)}
            aria-label="Halaman sebelumnya"
          >
            ‹
          </button>
          <For each={Array.from({ length: pageCount() }, (_, i) => i + 1)}>
            {(n) => (
              <button
                class="hub-page-btn"
                classList={{ active: currentPage() === n }}
                onClick={() => setPage(n)}
                aria-label={`Halaman ${n}`}
                aria-current={currentPage() === n ? "page" : undefined}
              >
                {n}
              </button>
            )}
          </For>
          <button
            class="hub-page-nav"
            disabled={currentPage() === pageCount()}
            onClick={() => setPage(p => p + 1)}
            aria-label="Halaman berikutnya"
          >
            ›
          </button>
        </div>
      </Show>
    </div>
  )
}

export default function Hub() {
  const [filter, setFilter] = createSignal<Filter>("all")
  const [tag,    setTag]    = createSignal("all")
  const [query,  setQuery]  = createSignal("")

  // All unique tags across downloadable + MCP items (built-ins have no tags).
  const allTags = createMemo(() =>
    Array.from(new Set(HUB_ITEMS.flatMap(i => i.tags ?? []))).sort()
  )

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
    const t = tag()
    if (t !== "all") items = items.filter(i => (i.tags ?? []).includes(t))
    return items
  })

  // "Skill Bawaan" section: hide when filtered by kind=mcp, by query, or by tag
  // (built-in skills carry no tags, so they never match a tag filter).
  const builtinSkills = createMemo(() => {
    const showSection =
      (filter() === "all" || filter() === "skill") && !query() && tag() === "all"
    return showSection ? HUB_ITEMS.filter(i => i.builtin) : []
  })

  // Everything else: not builtin
  const rest = createMemo(() => {
    const builtins = new Set(builtinSkills().map(i => i.name))
    return filtered().filter(i => !builtins.has(i.name))
  })

  const stats = createMemo(() => ({
    total: HUB_ITEMS.length,
    mcp:   HUB_ITEMS.filter(i => i.kind === "mcp").length,
    skill: HUB_ITEMS.filter(i => i.kind === "skill").length,
  }))

  const filters: { id: Filter; label: string; count: () => number }[] = [
    { id: "all",   label: "Semua",  count: () => HUB_ITEMS.length },
    { id: "mcp",   label: "MCP",    count: () => stats().mcp },
    { id: "skill", label: "Skill",  count: () => stats().skill },
  ]

  return (
    <div class="hub-wrap not-content">
      {/* Header */}
      <div class="hub-head">
        <div>
          <div class="hub-eyebrow">Katalog Mage</div>
          <h1 class="hub-title">Ekstensi untuk setiap kebutuhan.</h1>
        </div>
        <div class="hub-right-col">
          <p class="hub-lede">
            Jelajahi dan pasang MCP server, skill bawaan, serta skill tambahan yang dikurasi
            untuk Mage. Klik card mana untuk detail pemasangan.
          </p>
          <div class="hub-stats">
            <div class="stat">
              <div class="stat-num">{stats().total}</div>
              <div class="stat-label">Total</div>
            </div>
            <div class="stat">
              <div class="stat-num">{stats().mcp}</div>
              <div class="stat-label">MCP</div>
            </div>
            <div class="stat">
              <div class="stat-num">{stats().skill}</div>
              <div class="stat-label">Skill</div>
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
            placeholder="Cari skill atau MCP server…"
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
        <Show when={allTags().length > 0}>
          <div class="filter-sort">
            <span>Tag:</span>
            <select value={tag()} onChange={e => setTag(e.currentTarget.value)}>
              <option value="all">Semua tag</option>
              <For each={allTags()}>{(t) => <option value={t}>{t}</option>}</For>
            </select>
          </div>
        </Show>
      </div>

      {/* Skill Bawaan */}
      <Show when={builtinSkills().length > 0}>
        <div class="hub-section">
          <div class="hub-section-label">★ Skill Bawaan</div>
          <p class="hub-section-sublabel">
            Sudah termasuk dalam Mage — tidak perlu dipasang, langsung tersedia saat sesi dimulai.
          </p>
          <PaginatedGrid items={builtinSkills} />
        </div>
      </Show>

      {/* MCP + downloadable skills */}
      <Show when={rest().length > 0}>
        <div class="hub-section">
          <div class="hub-section-label" style="color:var(--mg-text-dim)">Semua item</div>
          <PaginatedGrid items={rest} />
        </div>
      </Show>

      {/* Empty */}
      <Show when={filtered().length === 0}>
        <div class="hub-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="7"/>
            <path d="m20 20-3.5-3.5"/>
          </svg>
          <div>Tidak ada item yang sesuai filter.</div>
        </div>
      </Show>
    </div>
  )
}

// Hub styles are in src/styles/custom.css (under "/* Hub / Marketplace page */")
