import type { MeetingStatus } from './model.js';

const transitions: Readonly<Record<MeetingStatus, ReadonlySet<MeetingStatus>>> = {
  UPLOAD_PENDING: new Set(['TRANSCRIBING', 'FAILED']),
  TRANSCRIBING: new Set(['ANALYZING', 'FAILED']),
  ANALYZING: new Set(['READY', 'FAILED']),
  READY: new Set(),
  FAILED: new Set(['TRANSCRIBING']),
};

export function canTransition(from: MeetingStatus, to: MeetingStatus): boolean {
  return from === to || transitions[from].has(to);
}

export function assertTransition(from: MeetingStatus, to: MeetingStatus): void {
  if (!canTransition(from, to)) throw new Error(`Invalid meeting status transition: ${from} -> ${to}`);
}
