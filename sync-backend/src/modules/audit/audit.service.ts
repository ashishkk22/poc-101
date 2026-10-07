import { type AuditOutcome } from '../../generated/prisma/enums.js';
import { type DbClient } from '../../infrastructure/database/prisma.js';
import { logger } from '../../infrastructure/logger/logger.js';
import { type AuditAction } from './audit.actions.js';
import { auditRepository, type AppendAuditInput } from './audit.repository.js';

/**
 * Audit metadata is attacker-visible via the organizer audit API, so this
 * service strips anything resembling a secret before persisting. Callers are
 * expected not to pass secrets at all; this is the second line of defence.
 */
const FORBIDDEN_METADATA_KEYS = new Set([
  'token',
  'rawtoken',
  'tokenhash',
  'joinurl',
  'cookie',
  'authorization',
  'password',
  'secret',
  'apikey',
  'content',
  'transcript',
]);

export function sanitizeMetadata(
  metadata: Record<string, unknown> | undefined | null,
): Record<string, unknown> | null {
  if (!metadata) return null;

  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.has(key.toLowerCase())) continue;
    if (value === undefined) continue;
    safe[key] = value;
  }
  return Object.keys(safe).length > 0 ? safe : null;
}

export const auditService = {
  /**
   * Records a decision. When a transaction client is supplied the audit row
   * commits atomically with the state change it describes.
   */
  async record(input: AppendAuditInput, db?: DbClient) {
    const sanitized = { ...input, metadata: sanitizeMetadata(input.metadata) };
    return auditRepository.append(sanitized, db);
  },

  /**
   * Fire-and-forget variant for denial paths, where failing to write an audit
   * row must not convert a clean 403 into a 500.
   */
  recordDetached(input: AppendAuditInput): void {
    void this.record(input).catch((error) => {
      logger.error({ err: error, action: input.action }, 'failed to write audit event');
    });
  },

  async denial(
    action: AuditAction,
    input: Omit<AppendAuditInput, 'action' | 'outcome'>,
  ): Promise<void> {
    this.recordDetached({ ...input, action, outcome: 'DENIED' as AuditOutcome });
  },
};
