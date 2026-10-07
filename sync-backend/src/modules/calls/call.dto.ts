import { type CallStatus } from '../../generated/prisma/enums.js';

/**
 * Explicit DTOs.
 *
 * Prisma records are never returned directly, so internal columns cannot leak
 * by accident when the schema grows a field.
 */
export interface CallDto {
  id: string;
  title: string;
  scheduledStart: string;
  scheduledEnd: string;
  timezone: string;
  status: CallStatus;
  organizerId: string;
  createdAt: string;
  // When the meeting actually ended, which can be before scheduledEnd.
  endedAt: string | null;
}

export interface CallSummaryDto extends CallDto {
  invitationCount?: number;
}

interface CallRecord {
  id: string;
  title: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  timezone: string;
  status: CallStatus;
  organizerId: string;
  createdAt: Date;
  endedAt?: Date | null;
}

export function toCallDto(call: CallRecord): CallDto {
  return {
    id: call.id,
    title: call.title,
    scheduledStart: call.scheduledStart.toISOString(),
    scheduledEnd: call.scheduledEnd.toISOString(),
    timezone: call.timezone,
    status: call.status,
    organizerId: call.organizerId,
    createdAt: call.createdAt.toISOString(),
    endedAt: call.endedAt ? call.endedAt.toISOString() : null,
  };
}

/** The reduced view a participant receives when joining. */
export interface JoinCallDto {
  id: string;
  title: string;
  scheduledStart: string;
  scheduledEnd: string;
  timezone: string;
  status: CallStatus;
}

export function toJoinCallDto(call: {
  id: string;
  title: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  timezone: string;
  status: CallStatus;
}): JoinCallDto {
  return {
    id: call.id,
    title: call.title,
    scheduledStart: call.scheduledStart.toISOString(),
    scheduledEnd: call.scheduledEnd.toISOString(),
    timezone: call.timezone,
    status: call.status,
  };
}
