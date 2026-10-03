/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NEXUS_URL?: string
  readonly VITE_MINO_CLIENT?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
