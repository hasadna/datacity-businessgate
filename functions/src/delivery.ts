import { Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  LEASE_MS,
  MAX_ATTEMPTS,
  MAX_ERROR_CHARS,
} from './config';

export type DeliveryState = 'PENDING' | 'PROCESSING' | 'RETRY' | 'SUCCESS' | 'ERROR';

export interface DeliveryInfo {
  messageId: string;
  accepted: string[];
  rejected: string[];
  pending: string[];
  response: string;
}

/**
 * Byte-for-byte the shape the firestore-send-email extension wrote, so the 707
 * historical SUCCESS documents and everything we write from here on are
 * indistinguishable to any reader.
 */
export interface Delivery {
  state: DeliveryState;
  startTime: Timestamp | null;
  endTime: Timestamp | null;
  /** Live lease while PROCESSING; "not before" timestamp while RETRY; null when terminal. */
  leaseExpireTime: Timestamp | null;
  attempts: number;
  error: string | null;
  info: DeliveryInfo | null;
}

/** Thrown for conditions that will never succeed on retry. */
export class PermanentError extends Error {
  readonly permanent = true as const;

  constructor(message: string) {
    super(message);
    this.name = 'PermanentError';
  }
}

export function isPermanent(err: unknown): boolean {
  if (err instanceof PermanentError) return true;
  if (!err || typeof err !== 'object') return false;
  const e = err as { responseCode?: unknown; code?: unknown };
  if (typeof e.responseCode === 'number' && e.responseCode >= 500 && e.responseCode < 600) {
    return true;
  }
  return e.code === 'EAUTH' || e.code === 'EENVELOPE';
}

export function errString(err: unknown): string {
  const s = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return s.length > MAX_ERROR_CHARS ? `${s.slice(0, MAX_ERROR_CHARS)}…` : s;
}

export function backoffMs(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1), BACKOFF_MAX_MS);
}

/**
 * The single source of truth for "should this document be worked on right now?".
 *
 * This is also what closes the self-retrigger loop: every write the function
 * makes lands on a 'skip' branch at the instant it re-fires onDocumentWritten
 * (PROCESSING and RETRY carry a future leaseExpireTime; SUCCESS and ERROR are
 * terminal). Diffing event.data.before/after would not work here, because it
 * cannot distinguish our own write from an operator requeueing by hand.
 */
export function claimability(delivery: unknown, nowMs: number): 'claim' | 'skip' {
  if (delivery === undefined || delivery === null || typeof delivery !== 'object') {
    return 'claim'; // no delivery field at all - a fresh client write
  }
  const d = delivery as Partial<Delivery>;
  switch (d.state) {
    case 'PENDING':
      return 'claim';
    case 'PROCESSING':
    case 'RETRY': {
      // A missing lease means a legacy document or a writer that crashed before
      // stamping one; treat it as expired so the document stays recoverable.
      const until = d.leaseExpireTime instanceof Timestamp ? d.leaseExpireTime.toMillis() : 0;
      return until <= nowMs ? 'claim' : 'skip';
    }
    default:
      return 'skip'; // SUCCESS, ERROR, or anything unrecognised
  }
}

export function clampAttempts(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.min(Math.max(Math.trunc(v), 0), MAX_ATTEMPTS)
    : 0;
}

export function processingDelivery(
  prev: Partial<Delivery> | undefined,
  nowMs: number,
): Delivery {
  return {
    state: 'PROCESSING',
    startTime: prev?.startTime instanceof Timestamp ? prev.startTime : Timestamp.fromMillis(nowMs),
    endTime: null,
    leaseExpireTime: Timestamp.fromMillis(nowMs + LEASE_MS),
    attempts: clampAttempts(prev?.attempts) + 1,
    error: null,
    info: null,
  };
}

export type Outcome =
  | { state: 'SUCCESS'; info: DeliveryInfo }
  | { state: 'ERROR'; error: string }
  | { state: 'RETRY'; error: string; notBeforeMs: number };

export async function finish(
  ref: DocumentReference,
  claimed: Delivery,
  outcome: Outcome,
): Promise<void> {
  const base = { startTime: claimed.startTime, attempts: claimed.attempts };

  let delivery: Delivery;
  if (outcome.state === 'SUCCESS') {
    delivery = {
      ...base,
      state: 'SUCCESS',
      endTime: Timestamp.now(),
      leaseExpireTime: null,
      error: null,
      info: outcome.info,
    };
  } else if (outcome.state === 'ERROR') {
    delivery = {
      ...base,
      state: 'ERROR',
      endTime: Timestamp.now(),
      leaseExpireTime: null,
      error: outcome.error,
      info: null,
    };
  } else {
    delivery = {
      ...base,
      state: 'RETRY',
      endTime: null,
      leaseExpireTime: Timestamp.fromMillis(outcome.notBeforeMs),
      error: outcome.error,
      info: null,
    };
  }

  // update() replaces the whole `delivery` map. set(..., {merge:true}) would
  // merge recursively and leave a stale `info` from a previous attempt behind.
  await ref.update({ delivery });
}
