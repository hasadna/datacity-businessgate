'use strict';
/**
 * The state machine. A mistake here means either an infinite retrigger loop or
 * the same email going out twice, so this is the most safety-critical logic in
 * the package.
 */
require('../helpers/env');

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { Timestamp } = require('firebase-admin/firestore');
const {
  claimability,
  processingDelivery,
  clampAttempts,
  backoffMs,
  isPermanent,
  errString,
  PermanentError,
} = require('../../lib/delivery');

const NOW = 1_700_000_000_000;
const at = (ms) => Timestamp.fromMillis(ms);

describe('claimability', () => {
  test('claims a document the client just wrote, with no delivery field', () => {
    assert.equal(claimability(undefined, NOW), 'claim');
    assert.equal(claimability(null, NOW), 'claim');
  });

  test('claims PENDING', () => {
    assert.equal(claimability({ state: 'PENDING' }, NOW), 'claim');
  });

  test('skips PROCESSING while the lease is live', () => {
    assert.equal(claimability({ state: 'PROCESSING', leaseExpireTime: at(NOW + 1) }, NOW), 'skip');
  });

  test('reclaims PROCESSING once the lease expires (the instance died)', () => {
    assert.equal(claimability({ state: 'PROCESSING', leaseExpireTime: at(NOW - 1) }, NOW), 'claim');
    assert.equal(claimability({ state: 'PROCESSING', leaseExpireTime: at(NOW) }, NOW), 'claim');
  });

  test('reclaims PROCESSING with no lease at all (legacy or crashed writer)', () => {
    assert.equal(claimability({ state: 'PROCESSING' }, NOW), 'claim');
  });

  test('skips RETRY until its backoff elapses, then claims', () => {
    assert.equal(claimability({ state: 'RETRY', leaseExpireTime: at(NOW + 1) }, NOW), 'skip');
    assert.equal(claimability({ state: 'RETRY', leaseExpireTime: at(NOW - 1) }, NOW), 'claim');
  });

  test('never re-sends a terminal document', () => {
    assert.equal(claimability({ state: 'SUCCESS' }, NOW), 'skip');
    assert.equal(claimability({ state: 'ERROR' }, NOW), 'skip');
  });

  test('skips a delivery map whose state it does not recognise', () => {
    for (const state of ['WAT', '', null, undefined, 42]) {
      assert.equal(claimability({ state }, NOW), 'skip', `state=${String(state)}`);
    }
  });

  test('claims when `delivery` is not a map at all', () => {
    // `mail` is world-writable, so a client can put anything in this field.
    // A non-map is indistinguishable from "never processed", and the safe
    // direction is to send: skipping would silently drop mail, which is the
    // exact failure this whole function exists to prevent. The claim then
    // overwrites the field with a proper map, so it cannot recur.
    assert.equal(claimability('SUCCESS', NOW), 'claim');
    assert.equal(claimability(42, NOW), 'claim');
    assert.equal(claimability([], NOW), 'skip'); // an array is typeof 'object'
  });

  test('an operator can requeue a sent message by resetting state to PENDING', () => {
    const sent = { state: 'SUCCESS', attempts: 1, leaseExpireTime: null };
    assert.equal(claimability(sent, NOW), 'skip');
    assert.equal(claimability({ ...sent, state: 'PENDING' }, NOW), 'claim');
  });
});

describe('the loop guard', () => {
  // The function writes to the same document it triggers on. If any state it
  // writes were claimable at the moment it re-fires, the trigger would loop
  // forever and mail would go out repeatedly.
  test('every state the function writes is skipped when it re-triggers', () => {
    const claimed = processingDelivery(undefined, NOW);
    const written = [
      claimed,
      { ...claimed, state: 'SUCCESS', leaseExpireTime: null },
      { ...claimed, state: 'ERROR', leaseExpireTime: null },
      { ...claimed, state: 'RETRY', leaseExpireTime: at(NOW + backoffMs(1)) },
    ];
    for (const delivery of written) {
      assert.equal(claimability(delivery, NOW), 'skip', `state=${delivery.state} must not re-claim`);
    }
  });

  test('the RETRY backoff is always long enough to outlive the re-trigger', () => {
    // Backoff starts at a minute; a re-trigger arrives within milliseconds.
    for (let attempts = 1; attempts <= 5; attempts++) {
      assert.ok(backoffMs(attempts) >= 60_000);
    }
  });
});

describe('processingDelivery', () => {
  test('stamps a lease that outlives the 120s function timeout', () => {
    const d = processingDelivery(undefined, NOW);
    assert.ok(d.leaseExpireTime.toMillis() - NOW > 120_000);
  });

  test('starts attempts at 1 and increments across retries', () => {
    assert.equal(processingDelivery(undefined, NOW).attempts, 1);
    assert.equal(processingDelivery({ attempts: 2 }, NOW).attempts, 3);
  });

  test('preserves startTime across attempts, so it means "first tried at"', () => {
    const first = processingDelivery(undefined, NOW);
    const second = processingDelivery(first, NOW + 60_000);
    assert.equal(second.startTime.toMillis(), first.startTime.toMillis());
  });

  test('clears error and info from the previous attempt', () => {
    const d = processingDelivery({ attempts: 1, error: 'boom', info: { messageId: 'x' } }, NOW);
    assert.equal(d.error, null);
    assert.equal(d.info, null);
    assert.equal(d.endTime, null);
  });

  test('a forged attempts value from a client cannot poison the counter', () => {
    // `mail` is world-writable, so attempts is attacker-controlled.
    assert.equal(clampAttempts(9999), 5);
    assert.equal(clampAttempts(-5), 0);
    assert.equal(clampAttempts('lots'), 0);
    assert.equal(clampAttempts(NaN), 0);
    assert.equal(clampAttempts(undefined), 0);
    assert.equal(clampAttempts(2.7), 2);
    // Non-finite falls to 0 rather than the cap. Harmless: a forged value only
    // ever buys the sender the same 5 attempts an honest attempts:0 would.
    assert.equal(clampAttempts(Infinity), 0);
  });
});

describe('backoff', () => {
  test('doubles per attempt', () => {
    assert.deepEqual([1, 2, 3, 4, 5].map(backoffMs), [60_000, 120_000, 240_000, 480_000, 960_000]);
  });

  test('is capped at an hour', () => {
    assert.equal(backoffMs(100), 60 * 60_000);
  });
});

describe('permanent vs transient classification', () => {
  test('validation and template failures are permanent', () => {
    assert.equal(isPermanent(new PermanentError('bad template')), true);
  });

  test('a 5xx from SES is permanent - retrying cannot help', () => {
    assert.equal(isPermanent({ responseCode: 554 }), true);
    assert.equal(isPermanent({ responseCode: 500 }), true);
    assert.equal(isPermanent({ responseCode: 599 }), true);
  });

  test('auth and envelope errors are permanent', () => {
    assert.equal(isPermanent({ code: 'EAUTH' }), true);
    assert.equal(isPermanent({ code: 'EENVELOPE' }), true);
  });

  test('the TLS failure that broke the old extension is transient', () => {
    // A misconfiguration, not a bad message: once the config is fixed the same
    // document must still be sendable, so it has to retry rather than die.
    const tlsError = Object.assign(
      new Error('error:0A00010B:SSL routines:tls_validate_record_header:wrong version number'),
      { code: 'ESOCKET' },
    );
    assert.equal(isPermanent(tlsError), false);
  });

  test('connection trouble and 4xx are transient', () => {
    assert.equal(isPermanent({ code: 'ECONNECTION' }), false);
    assert.equal(isPermanent({ code: 'ETIMEDOUT' }), false);
    assert.equal(isPermanent({ responseCode: 451 }), false);
    assert.equal(isPermanent({ responseCode: 421 }), false);
  });

  test('anything unrecognised is transient, so a message is never dropped silently', () => {
    assert.equal(isPermanent(new Error('who knows')), false);
    assert.equal(isPermanent(null), false);
    assert.equal(isPermanent(undefined), false);
    assert.equal(isPermanent('a string'), false);
  });
});

describe('errString', () => {
  test('keeps name and message', () => {
    assert.equal(errString(new TypeError('nope')), 'TypeError: nope');
  });

  test('truncates, so a huge SMTP response cannot bloat the document', () => {
    const out = errString(new Error('x'.repeat(10_000)));
    assert.ok(out.length <= 2001, `length was ${out.length}`);
    assert.ok(out.endsWith('…'));
  });

  test('survives non-Error throws', () => {
    assert.equal(errString('plain string'), 'plain string');
    assert.equal(errString(null), 'null');
  });
});

describe('sweeper selection', () => {
  const { isSweepDue, isOrphan } = require('../../lib/delivery');
  const OLD = NOW - 10 * 60_000; // older than the 5 minute grace period
  const NEW = NOW - 1_000;

  test('picks up a PENDING document the trigger evidently missed', () => {
    assert.equal(isSweepDue({ state: 'PENDING' }, OLD, NOW), true);
  });

  test('leaves a freshly created PENDING document to the trigger', () => {
    // Racing the trigger cannot double-send - the claim transaction prevents
    // that - but it wastes a transaction on every new message.
    assert.equal(isSweepDue({ state: 'PENDING' }, NEW, NOW), false);
  });

  test('picks up a RETRY whose backoff has elapsed', () => {
    assert.equal(isSweepDue({ state: 'RETRY', leaseExpireTime: at(NOW - 1) }, OLD, NOW), true);
    assert.equal(isSweepDue({ state: 'RETRY', leaseExpireTime: at(NOW + 1) }, OLD, NOW), false);
  });

  test('recovers a PROCESSING document whose instance died', () => {
    assert.equal(isSweepDue({ state: 'PROCESSING', leaseExpireTime: at(NOW - 1) }, OLD, NOW), true);
  });

  test('does not disturb a live PROCESSING lease, however old the document', () => {
    assert.equal(
      isSweepDue({ state: 'PROCESSING', leaseExpireTime: at(NOW + 1) }, OLD, NOW), false,
    );
  });

  test('never resurrects a terminal document', () => {
    assert.equal(isSweepDue({ state: 'SUCCESS' }, OLD, NOW), false);
    assert.equal(isSweepDue({ state: 'ERROR' }, OLD, NOW), false);
  });

  test('the orphan scan claims exactly the documents with no delivery field', () => {
    // This is the class of 31 documents the uninstalled extension left behind.
    assert.equal(isOrphan(undefined, OLD, NOW), true);
    assert.equal(isOrphan({ state: 'PENDING' }, OLD, NOW), false);
    assert.equal(isOrphan({ state: 'SUCCESS' }, OLD, NOW), false);
    assert.equal(isOrphan(null, OLD, NOW), false, 'an explicit null is not a missing field');
  });

  test('the orphan scan gives a brand-new document time to be triggered', () => {
    assert.equal(isOrphan(undefined, NEW, NOW), false);
  });
});
