/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Hosted API base, ending in /api/v1. Optional: see HOSTED_API_URL in ReactShadowElement.ts. */
  readonly VITE_DB_API_URL?: string;
}
