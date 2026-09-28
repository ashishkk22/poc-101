import { API_PREFIX, AUTH_PREFIX, config } from '../config/env';
import { ApiError, type ApiErrorDetail } from '../errors/api-error';

/**
 * The one place that talks to the backend.
 *
 * Responsibilities: base URL, credentialed requests (the session lives in an
 * HttpOnly cookie — never in localStorage), JSON handling, a correlation id,
 * and normalising every failure into `ApiError`.
 */

type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  /** Bypasses the /api/v1 prefix — used only for the Better Auth surface. */
  absolutePath?: boolean;
  /** Lets a request outlive the page, for leave-on-close. */
  keepalive?: boolean;
}

function buildUrl(path: string, query?: Record<string, QueryValue>, absolutePath = false): string {
  const url = new URL(
    `${absolutePath ? '' : API_PREFIX}${path.startsWith('/') ? path : `/${path}`}`,
    config.apiBaseUrl,
  );

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

function newRequestId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  return `web_${(random ?? Math.random().toString(36).slice(2)).replace(/-/g, '')}`;
}

/**
 * Two error envelopes reach this client, and both must be understood.
 *
 *   the v1 API:    { error: { code, message, requestId, details? } }
 *   Better Auth:   { message, code }        — flat, and with no request id
 *
 * Parsing only the first shape is how an auth failure silently degrades into
 * "Bad Request", so both are handled here rather than at the call sites.
 */
interface V1ErrorEnvelope {
  error?: { code?: string; message?: string; requestId?: string; details?: ApiErrorDetail[] };
}

interface AuthErrorEnvelope {
  code?: string;
  message?: string;
}

/** `Retry-After` is exposed by the backend's CORS config; use it, don't guess. */
function retryAfterSeconds(response: Response): number | null {
  const header = response.headers.get('Retry-After');
  if (!header) return null;

  const seconds = Number.parseInt(header, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

async function toApiError(response: Response): Promise<ApiError> {
  const headerRequestId = response.headers.get('X-Request-Id');

  let body: (V1ErrorEnvelope & AuthErrorEnvelope) | null = null;
  try {
    body = (await response.json()) as V1ErrorEnvelope & AuthErrorEnvelope;
  } catch {
    body = null;
  }

  const v1 = body?.error;
  const code = v1?.code ?? body?.code ?? `HTTP_${response.status}`;
  const message = v1?.message ?? body?.message ?? response.statusText ?? 'Request failed.';

  return new ApiError({
    code,
    message,
    status: response.status,
    requestId: v1?.requestId ?? headerRequestId,
    details: v1?.details ?? null,
    retryAfterSeconds: retryAfterSeconds(response),
  });
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal, absolutePath = false, keepalive } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  // The backend echoes this back and logs against it, so a user-reported
  // reference can be traced end to end.
  headers['X-Request-Id'] = newRequestId();
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query, absolutePath), {
      method,
      headers,
      // Credentialed: the Better Auth session cookie rides along.
      credentials: 'include',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
      ...(keepalive ? { keepalive: true } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw ApiError.network();
  }

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (text.length === 0) return undefined as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw ApiError.network('The server returned an unreadable response.');
  }
}

/** Unwraps the `{ data }` envelope every successful v1 response uses. */
async function requestData<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const payload = await request<{ data: T }>(path, options);
  return payload.data;
}

export const apiClient = {
  /** `{ data: T }` responses. */
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    requestData<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    requestData<T>(path, { ...options, method: 'POST', body }),

  /** `{ items, nextCursor }` responses, which carry no envelope. */
  getPage: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),

  /** Better Auth lives outside /api/v1 and answers with its own shapes. */
  auth: <T>(path: string, options: RequestOptions = {}) =>
    request<T>(`${AUTH_PREFIX}${path}`, { ...options, absolutePath: true }),
};
