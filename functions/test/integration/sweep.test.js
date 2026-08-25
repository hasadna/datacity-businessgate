'use strict';
/**
 * The sweepers are the safety net that stops mail going missing again. Their
 * Firestore queries are the part that can fail silently in production - a query
 * needing an index that does not exist just throws inside a scheduled run
 * nobody is watching - so they are exercised here for real.
 */
require('../helpers/env');

const { test, describe, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { FieldPath, Timestamp } = require('firebase-admin/firestore');

const { db, clearMail, mailDoc } = require('../helpers/firestore');
const { isSweepDue, isOrphan } = require('../../lib/delivery');

let firestore;

before(() => {
  firestore = db();
});

beforeEach(async () => {
  await clearMail();
});

const delivery = (state, over = {}) => ({
  state,
  startTime: Timestamp.now(),
  endTime: null,
  leaseExpireTime: null,
  attempts: 1,
  error: null,
  info: null,
  ...over,
});

/** Exactly the query in sweepMail. */
function sweepQuery() {
  return firestore
    .collection('mail')
    .where('delivery.state', 'in', ['PENDING', 'PROCESSING', 'RETRY'])
    .limit(100);
}

describe('sweepMail query', () => {
  test('runs without a composite index', async () => {
    // A nested map subfield is auto-indexed, and the lease comparison is done
    // in code precisely so no composite index is required. If that ever stops
    // being true this test fails rather than a silent 03:00 scheduled run.
    await assert.doesNotReject(() => sweepQuery().get());
  });

  test('selects the unfinished states and ignores terminal ones', async () => {
    await firestore.collection('mail').add(mailDoc({ delivery: delivery('PENDING') }));
    await firestore.collection('mail').add(mailDoc({ delivery: delivery('RETRY') }));
    await firestore.collection('mail').add(mailDoc({ delivery: delivery('PROCESSING') }));
    await firestore.collection('mail').add(mailDoc({ delivery: delivery('SUCCESS') }));
    await firestore.collection('mail').add(mailDoc({ delivery: delivery('ERROR') }));

    const snap = await sweepQuery().get();
    assert.deepEqual(
      snap.docs.map((d) => d.get('delivery').state).sort(),
      ['PENDING', 'PROCESSING', 'RETRY'],
    );
  });

  test('a document with no delivery field is invisible to it', async () => {
    // The whole reason sweepMailOrphans has to exist.
    const doc = mailDoc();
    delete doc.delivery;
    await firestore.collection('mail').add(doc);
    const snap = await sweepQuery().get();
    assert.equal(snap.size, 0);
  });

  test('the filter then keeps only what is genuinely due', async () => {
    const now = Date.now();
    await firestore.collection('mail').add(
      mailDoc({ delivery: delivery('RETRY', { leaseExpireTime: Timestamp.fromMillis(now - 1) }) }),
    );
    await firestore.collection('mail').add(
      mailDoc({ delivery: delivery('RETRY', { leaseExpireTime: Timestamp.fromMillis(now + 600_000) }) }),
    );
    await firestore.collection('mail').add(
      mailDoc({ delivery: delivery('PROCESSING', { leaseExpireTime: Timestamp.fromMillis(now + 600_000) }) }),
    );

    const snap = await sweepQuery().get();
    assert.equal(snap.size, 3, 'the query is deliberately broad');

    const due = snap.docs.filter((d) => isSweepDue(d.get('delivery'), d.createTime.toMillis(), now));
    assert.equal(due.length, 1, 'only the expired RETRY is due');
  });
});

describe('sweepMailOrphans scan', () => {
  /** Exactly the projected scan in sweepMailOrphans. */
  function scanQuery() {
    return firestore
      .collection('mail')
      .select('delivery')
      .orderBy(FieldPath.documentId())
      .limit(500);
  }

  test('the projection still exposes createTime, which the scan depends on', async () => {
    // `mail` documents carry no createdAt of their own, so createTime is the
    // only way to tell a brand-new orphan from an abandoned one.
    await firestore.collection('mail').add(mailDoc());
    const snap = await scanQuery().get();
    assert.ok(snap.docs[0].createTime instanceof Timestamp);
  });

  test('finds documents with no delivery field and leaves the rest alone', async () => {
    const orphan = mailDoc();
    delete orphan.delivery;
    await firestore.collection('mail').add(orphan);
    await firestore.collection('mail').add(mailDoc({ delivery: delivery('SUCCESS') }));

    const snap = await scanQuery().get();
    assert.equal(snap.size, 2);

    // Pretend the documents are old enough to be past the grace period.
    const later = Date.now() + 10 * 60_000;
    const found = snap.docs.filter((d) => isOrphan(d.get('delivery'), d.createTime.toMillis(), later));
    assert.equal(found.length, 1);
  });

  test('requeueing an orphan makes it visible to sweepMail', async () => {
    // The full recovery path for the 31 stranded documents: invisible, then
    // requeued to PENDING, then picked up.
    const orphan = mailDoc();
    delete orphan.delivery;
    const ref = await firestore.collection('mail').add(orphan);

    assert.equal((await sweepQuery().get()).size, 0);
    await ref.update({ delivery: { state: 'PENDING', attempts: 0 } });
    assert.equal((await sweepQuery().get()).size, 1);
  });
});

after(async () => {
  await clearMail();
});
