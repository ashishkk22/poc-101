import {
  type AttendanceSessionStatus,
  type AttendanceStatus,
} from '../../generated/prisma/enums.js';

export interface AttendanceSessionDto {
  id: string;
  deviceId: string;
  joinedAt: string;
  leftAt: string | null;
  leftReason: string | null;
  status: AttendanceSessionStatus;
}

export interface AttendanceDto {
  id: string;
  callId: string;
  participantId: string;
  participant?: { id: string; name: string; email: string };
  firstJoinedAt: string | null;
  lastLeftAt: string | null;
  totalConnectedSeconds: number;
  status: AttendanceStatus;
  sessions?: AttendanceSessionDto[];
}

interface SessionRecord {
  id: string;
  deviceId: string;
  joinedAt: Date;
  leftAt: Date | null;
  leftReason: string | null;
  status: AttendanceSessionStatus;
}

interface AttendanceRecord {
  id: string;
  callId: string;
  participantId: string;
  firstJoinedAt: Date | null;
  lastLeftAt: Date | null;
  totalConnectedSeconds: number;
  status: AttendanceStatus;
  participant?: { id: string; name: string; email: string };
  sessions?: SessionRecord[];
}

export function toAttendanceSessionDto(session: SessionRecord): AttendanceSessionDto {
  return {
    id: session.id,
    deviceId: session.deviceId,
    joinedAt: session.joinedAt.toISOString(),
    leftAt: session.leftAt ? session.leftAt.toISOString() : null,
    leftReason: session.leftReason,
    status: session.status,
  };
}

export function toAttendanceDto(attendance: AttendanceRecord): AttendanceDto {
  return {
    id: attendance.id,
    callId: attendance.callId,
    participantId: attendance.participantId,
    ...(attendance.participant ? { participant: attendance.participant } : {}),
    firstJoinedAt: attendance.firstJoinedAt ? attendance.firstJoinedAt.toISOString() : null,
    lastLeftAt: attendance.lastLeftAt ? attendance.lastLeftAt.toISOString() : null,
    totalConnectedSeconds: attendance.totalConnectedSeconds,
    status: attendance.status,
    ...(attendance.sessions ? { sessions: attendance.sessions.map(toAttendanceSessionDto) } : {}),
  };
}
