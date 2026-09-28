import { randomUUID } from 'node:crypto';
import { auth } from '../../src/modules/auth/auth.js';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import { generateRawToken, hashToken } from '../../src/shared/security/tokens.js';
import { addMinutes } from '../../src/shared/time/window.js';

export const TEST_PASSWORD = 'IntegrationTestPassword1!';

export interface TestUser {
  id: string;
  email: string;
  name: string;
  /** Serialized Cookie header for authenticated supertest requests. */
  cookie: string;
}

/**
 * Creates a user through Better Auth and returns a usable session cookie, so
 * tests exercise the real authentication path rather than a shortcut.
 */
export async function createUser(namePrefix = 'user'): Promise<TestUser> {
  const email = `${namePrefix}-${randomUUID().slice(0, 8)}@example.com`;
  const name = `${namePrefix} tester`;

  await auth.api.signUpEmail({ body: { email, name, password: TEST_PASSWORD } });

  const response = await auth.api.signInEmail({
    body: { email, password: TEST_PASSWORD },
    asResponse: true,
  });

  const setCookie = response.headers.getSetCookie();
  const cookie = setCookie.map((entry) => entry.split(';')[0]).join('; ');

  const record = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { id: record.id, email, name, cookie };
}

export interface CallOptions {
  organizerId: string;
  title?: string;
  /** Minutes relative to now; negative is in the past. */
  startsInMinutes?: number;
  durationMinutes?: number;
  status?: 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';
  timezone?: string;
  providerCallId?: string | null;
}

export async function createCall(options: CallOptions) {
  const now = new Date();
  const startsInMinutes = options.startsInMinutes ?? -5;
  const durationMinutes = options.durationMinutes ?? 60;

  return prisma.call.create({
    data: {
      organizerId: options.organizerId,
      title: options.title ?? 'Architecture Review',
      scheduledStart: addMinutes(now, startsInMinutes),
      scheduledEnd: addMinutes(now, startsInMinutes + durationMinutes),
      timezone: options.timezone ?? 'Asia/Kolkata',
      status: options.status ?? 'LIVE',
      providerCallId: options.providerCallId ?? `pcall_${randomUUID().slice(0, 12)}`,
    },
  });
}

/**
 * Issues an invitation and returns the raw token.
 *
 * The raw value is only available here because this factory generates it —
 * exactly mirroring production, where it exists solely in the creation
 * response.
 */
export async function createInvitation(options: {
  callId: string;
  participantId: string;
  expiresAt?: Date;
  status?: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
}) {
  const rawToken = generateRawToken();
  const call = await prisma.call.findUniqueOrThrow({ where: { id: options.callId } });

  const invitation = await prisma.invitation.create({
    data: {
      callId: options.callId,
      participantId: options.participantId,
      tokenHash: hashToken(rawToken),
      expiresAt: options.expiresAt ?? addMinutes(call.scheduledEnd, 60),
      status: options.status ?? 'ACTIVE',
      ...(options.status === 'REVOKED' ? { revokedAt: new Date() } : {}),
    },
  });

  return { invitation, rawToken };
}

/** Organizer + participant + live call + active invitation, ready to join. */
export async function createJoinableScenario() {
  const organizer = await createUser('organizer');
  const participant = await createUser('alice');
  const call = await createCall({ organizerId: organizer.id });
  const { invitation, rawToken } = await createInvitation({
    callId: call.id,
    participantId: participant.id,
  });

  return { organizer, participant, call, invitation, rawToken };
}

export async function auditActionsFor(callId: string): Promise<string[]> {
  const events = await prisma.auditEvent.findMany({
    where: { callId },
    orderBy: { createdAt: 'asc' },
    select: { action: true },
  });
  return events.map((event) => event.action);
}
