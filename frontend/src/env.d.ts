interface ImportMetaEnv {
  /** Origin of the backend, e.g. https://api.example.com. Empty means same origin. */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
