/** Application-wide constants that are not environment dependent. */

export const API_PREFIX = '/api/v1';
export const AUTH_BASE_PATH = '/api/auth';

/** Cursor pagination bounds. Unbounded reads are forbidden. */
export const PAGINATION = {
  defaultLimit: 25,
  maxLimit: 100,
} as const;

/** Bytes of entropy in a raw invitation token (base64url encoded). */
export const INVITATION_TOKEN_BYTES = 32;

export const QUEUE_NAMES = {
  transcript: 'transcript',
  retention: 'retention',
  providerCleanup: 'provider-cleanup',
  callLifecycle: 'call-lifecycle',
} as const;

export const REALTIME = {
  revocationChannel: 'sync:revocations',
  socketPath: '/realtime',
} as const;

export const DEFAULT_DEVICE_ID = 'default';
