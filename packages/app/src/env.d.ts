interface ImportMetaEnv {
  readonly VITE_MAGE_SERVER_HOST: string
  readonly VITE_MAGE_SERVER_PORT: string
  readonly VITE_MAGE_CHANNEL?: "dev" | "beta" | "prod"
  readonly VITE_CHANGELOG_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

export declare module "solid-js" {
  namespace JSX {
    interface Directives {
      sortable: true
    }
  }
}
