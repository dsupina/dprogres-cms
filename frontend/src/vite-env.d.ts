/// <reference types="vite/client" />

declare interface ImportMetaEnv {
  readonly VITE_FEATURE_BLOCK_EDITOR?: string;
  readonly VITE_FEATURE_BLOCK_RENDERER?: string;
  readonly VITE_FEATURE_BLOCK_AI?: string;
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv;
}
