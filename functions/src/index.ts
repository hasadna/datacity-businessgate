import { initializeApp } from 'firebase-admin/app';
import {
  FieldPath,
  getFirestore,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  MAIL_COLLECTION,
  MIN_SWEEP_AGE_MS,
  ORPHAN_SCAN_ENABLED,
  REGION,
  SECRETS,
} from './config';
import { claimability, type Delivery } from './delivery';
import { processMail } from './process';

initializeApp();
setGlobalOptions({ region: REGION, maxInstances: 3 });

/**
 * Replaces the deprecated firebase/firestore-send-email extension.
 *
 * onDocumentWritten rather than onDocumentCreated, so that requeue-by-edit
 * works: setting delivery.state back to 'PENDING' on any document re-sends it.
 * That is how tools/backfill.ts works, and how an operator retries by hand.
 *
 * Every write this function makes re-fires this handler exactly once, and
 * claimability() returns 'skip' for all of them - PROCESSING and RETRY carry a
 * future leaseExpireTime, SUCCESS and ERROR are terminal - so there is no loop.
 *
 * retry:false because Eventarc's own at-least-once retry would fight the state
 * machine; retries are ours to schedule.
 */
export const sendMailOnWrite = onDocumentWritten(
  {
    document: `${MAIL_COLLECTION}/{docId}`,
    region: REGION,
    memory: '256MiB',
    timeoutSeconds: 120, // must stay below LEASE_MS (180s)
    concurrency: 1,
    maxInstances: 3,
    retry: false,
    secrets: SECRETS,
  },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return; // deletion

    if (claimability(after.get('delivery'), Date.now()) === 'skip') return;
    await processMail(after.ref, 'trigger');
  },
);

/**
 * Catches anything the trigger missed: due RETRYs, PROCESSING documents whose
 * instance died, and PENDING documents whose event was never delivered.
 *
 * A single `in` query on delivery.state uses the automatic single-field index
 * on that map subfield - no composite index needed - and the lease comparison
 * happens in code. At 746 documents and roughly one email a week the read cost
 * is negligible.
 */
export const sweepMail = onSchedule(
  {
    schedule: 'every 10 minutes',
    timeZone: 'Etc/UTC',
    region: REGION,
    memory: '256MiB',
    timeoutSeconds: 300,
    maxInstances: 1,
    retryCount: 0,
    secrets: SECRETS,
  },
  async () => {
    const db = getFirestore();
    const nowMs = Date.now();

    const snap = await db
      .collection(MAIL_COLLECTION)
      .where('delivery.state', 'in', ['PENDING', 'PROCESSING', 'RETRY'])
      .limit(100)
      .get();

    const due = snap.docs.filter((d) => {
      const delivery = d.get('delivery') as Partial<Delivery> | undefined;
      if (claimability(delivery, nowMs) === 'skip') return false;
      // Give the trigger first refusal on a document that was just created.
      if (delivery?.state === 'PENDING' && nowMs - d.createTime.toMillis() < MIN_SWEEP_AGE_MS) {
        return false;
      }
      return true;
    });

    logger.info('sweep', { scanned: snap.size, due: due.length });
    for (const d of due) {
      await processMail(d.ref, 'sweep');
    }
  },
);

/**
 * Firestore cannot query for a *missing* field, which is exactly how 31
 * documents ended up invisible while the extension was uninstalled. This is a
 * projected full-collection scan - about 750 small reads a day, ~1.5% of the
 * free daily quota - that flips any document with no `delivery` field to
 * PENDING and lets the trigger send it.
 */
export const sweepMailOrphans = onSchedule(
  {
    schedule: '0 3 * * *',
    timeZone: 'Etc/UTC',
    region: REGION,
    memory: '256MiB',
    timeoutSeconds: 540,
    maxInstances: 1,
    retryCount: 0,
    secrets: SECRETS,
  },
  async () => {
    if (!ORPHAN_SCAN_ENABLED.value()) {
      logger.info('orphan scan disabled');
      return;
    }

    const db = getFirestore();
    const PAGE = 500;
    let cursor: QueryDocumentSnapshot | undefined;
    let scanned = 0;
    let requeued = 0;

    for (;;) {
      let q = db
        .collection(MAIL_COLLECTION)
        // .select() still yields snap.createTime, the only timestamp these
        // documents carry.
        .select('delivery')
        .orderBy(FieldPath.documentId())
        .limit(PAGE);
      if (cursor) q = q.startAfter(cursor);

      const snap = await q.get();
      if (snap.empty) break;
      scanned += snap.size;

      for (const d of snap.docs) {
        if (d.get('delivery') !== undefined) continue;
        if (Date.now() - d.createTime.toMillis() < MIN_SWEEP_AGE_MS) continue;
        await d.ref.update({ delivery: { state: 'PENDING', attempts: 0 } });
        requeued++;
      }

      if (snap.size < PAGE) break;
      cursor = snap.docs[snap.size - 1];
    }

    logger.info('orphan scan', { scanned, requeued });
  },
);
