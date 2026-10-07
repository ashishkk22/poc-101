/**
 * Every value here is public to the browser. Nothing secret belongs in a
 * VITE_* variable, so nothing secret is read here.
 */
function required(name: string, value: string | undefined, fallback: string): string {
  if (value && value.trim().length > 0) return value.trim();
  if (import.meta.env.DEV) return fallback;
  throw new Error(`Missing required environment variable ${name}`);
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Where the API lives. A production build without VITE_API_BASE_URL is served
 * by the backend itself, so the API is this page's own origin.
 */
function apiBaseUrl(): string {
  const value = import.meta.env.VITE_API_BASE_URL;
  if (!import.meta.env.DEV && !value?.trim()) return window.location.origin;
  return required('VITE_API_BASE_URL', value, 'http://localhost:4000');
}

export const config = {
  apiBaseUrl: apiBaseUrl().replace(/\/+$/, ''),
  appName: import.meta.env.VITE_APP_NAME?.trim() || 'Sync',
  tagline: 'Everyone, at the same moment.',
  realtimePath: import.meta.env.VITE_REALTIME_PATH?.trim() || '/realtime',
  heartbeatIntervalMs:
    positiveInt(import.meta.env.VITE_HEARTBEAT_INTERVAL_SECONDS, 30) * 1000,
} as const;

/** Versioned API surface. Better Auth owns /api/auth/* separately. */
export const API_PREFIX = '/api/v1';
export const AUTH_PREFIX = '/api/auth';
