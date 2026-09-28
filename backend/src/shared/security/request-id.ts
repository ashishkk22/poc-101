import { randomUUID } from 'node:crypto';

/**
 * Correlation IDs.
 *
 * An inbound X-Request-Id is honoured only when it is short and free of
 * control characters — an untrusted header must never be able to inject
 * newlines into structured logs.
 */
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function isSafeRequestId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_REQUEST_ID.test(value);
}

export function generateRequestId(): string {
  return `req_${randomUUID().replace(/-/g, '')}`;
}

export function resolveRequestId(headerValue: unknown): string {
  if (Array.isArray(headerValue)) {
    return resolveRequestId(headerValue[0]);
  }
  return isSafeRequestId(headerValue) ? headerValue : generateRequestId();
}
