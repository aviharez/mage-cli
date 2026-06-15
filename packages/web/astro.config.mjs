// @ts-check
import { defineConfig } from "astro/config"
import starlight from "@astrojs/starlight"
import solidJs from "@astrojs/solid-js"
import node from "@astrojs/node"
import theme from "toolbeam-docs-theme"
import config from "./config.mjs"
import { rehypeHeadingIds } from "@astrojs/markdown-remark"
import rehypeAutolinkHeadings from "rehype-autolink-headings"
import { spawnSync } from "child_process"
import { existsSync } from "fs"

/**
 * Expressive Code plugin — adds a persistent lang label in the code-block
 * header for blocks that have no explicit title. Matches the reference design's
 * code-head (`.code-head .code-lang` on left side of every block).
 */
function ecLangLabelPlugin() {
  return {
    name: "mage-lang-label",
    hooks: {
      postprocessRenderedBlock(/** @type {any} */ context) {
        const { codeBlock, renderData } = context
        // Don't add label when an explicit title was already set by the author
        if (codeBlock.props.title) return
        const lang = codeBlock.language
        if (!lang || ["plaintext", "txt", "text", ""].includes(lang)) return

        const figureEl = renderData.blockAst
        if (!figureEl || figureEl.type !== "element") return

        const langLabel = {
          type: "element",
          tagName: "span",
          properties: { className: ["mage-lang-label"] },
          children: [{ type: "text", value: lang }],
        }

        // Find or create the figcaption.header
        const figcaptionIdx = (figureEl.children || []).findIndex(
          (/** @type {any} */ c) => c.type === "element" && c.tagName === "figcaption"
        )

        if (figcaptionIdx === -1) {
          // No header at all — inject one as the first child
          figureEl.children = [
            {
              type: "element",
              tagName: "figcaption",
              properties: { className: ["header"] },
              children: [langLabel],
            },
            ...(figureEl.children || []),
          ]
        } else {
          const figcaption = figureEl.children[figcaptionIdx]
          // Prepend lang label to existing header (e.g. terminal frames already have sr-only text)
          figcaption.children = [langLabel, ...(figcaption.children || [])]
        }
      },
    },
  }
}

// https://astro.build/config
export default defineConfig({
  site: config.url,
  base: "/",
  output: "server",
  adapter: node({ mode: "standalone" }),
  devToolbar: {
    enabled: false,
  },
  server: {
    host: "0.0.0.0",
  },
  markdown: {
    rehypePlugins: [rehypeHeadingIds, [rehypeAutolinkHeadings, { behavior: "wrap" }]],
  },
  build: {},
  vite: {
    ssr: {
      // Inline solid into dist/server so SSR uses the patched, build-time solid —
      // not whatever the container's node_modules resolves at runtime. Fixes /hub
      // rendering empty on OCP (npm-installed solid is unpatched / resolves differently).
      noExternal: ["solid-js", "solid-js/web", "@astrojs/solid-js"],
    },
  },
  integrations: [
    configSchema(),
    solidJs(),
    starlight({
      title: "Mage",
      defaultLocale: "root",
      locales: {
        root: {
          label: "Bahasa Indonesia",
          lang: "id",
          dir: "ltr",
        },
      },
      favicon: "/favicon.svg",
      head: [
        {
          tag: "link",
          attrs: { rel: "preconnect", href: "https://fonts.googleapis.com" },
        },
        {
          tag: "link",
          attrs: {
            rel: "preconnect",
            href: "https://fonts.gstatic.com",
            crossorigin: "",
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "stylesheet",
            href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap",
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "icon",
            href: "/favicon.ico",
            sizes: "32x32",
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "icon",
            type: "image/png",
            href: "/favicon-96x96.png",
            sizes: "96x96",
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "apple-touch-icon",
            href: "/apple-touch-icon.png",
            sizes: "180x180",
          },
        },
      ],
      lastUpdated: true,
      expressiveCode: {
        themes: ["github-light", "github-dark"],
        plugins: [ecLangLabelPlugin()],
      },
      ...(config.github
        ? {
            editLink: {
              baseUrl: `${config.github}/edit/dev/packages/web/src/content/`,
            },
          }
        : {}),
      markdown: {
        headingLinks: false,
      },
      customCss: ["./src/styles/custom.css"],
      logo: {
        light: "./src/assets/logo-light.svg",
        dark: "./src/assets/logo-dark.svg",
        replacesTitle: true,
      },
      sidebar: [
        "docs",
        "docs/instalasi",
        "docs/setup",
        {
          label: "Penggunaan",
          items: [
            "docs/penggunaan",
            "docs/slash-commands",
            "docs/skills",
          ],
        },
        {
          label: "Referensi",
          items: [
            "docs/agent",
            "docs/qwen-prompting",
            "docs/konfigurasi",
            "docs/troubleshooting",
          ],
        },
      ],
      components: {
        Hero: "./src/components/Hero.astro",
        Head: "./src/components/Head.astro",
        Header: "./src/components/Header.astro",
        Footer: "./src/components/Footer.astro",
        SiteTitle: "./src/components/SiteTitle.astro",
        ThemeSelect: "./src/components/ThemeSelect.astro",
        PageTitle: "./src/components/PageTitle.astro",
      },
      plugins: [
        theme({
          headerLinks: config.headerLinks,
        }),
      ],
    }),
  ],
})

function configSchema() {
  return {
    name: "configSchema",
    hooks: {
      "astro:build:done": async () => {
        // Only regenerate when running inside the full monorepo (opencode source + Bun present).
        // In standalone / Docker builds the vendored public/config.json + public/tui.json are
        // copied to dist/ by Astro automatically, so this is safely skipped.
        const schemaScript = "../opencode/script/schema.ts"
        if (!existsSync(schemaScript)) {
          console.log("skipping config schema generation (standalone build)")
          return
        }
        try {
          console.log("generating config schema")
          spawnSync(schemaScript, ["./dist/config.json", "./dist/tui.json"])
        } catch (err) {
          console.warn("config schema generation failed (non-fatal):", err)
        }
      },
    },
  }
}
