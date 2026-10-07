/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_REALTIME_PATH?: string;
  readonly VITE_HEARTBEAT_INTERVAL_SECONDS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
