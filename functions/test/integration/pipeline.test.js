'use strict';
/**
 * The end-to-end pipeline against the Firestore emulator and a real SMTP
 * server: claim -> validate -> render -> send -> finish.
 *
 * This is where a bug costs the most - a double send, or a message that
 * silently never goes out - so these tests drive the actual transaction and
 * lease logic rather than mocking around it.
 */
require('../helpers/env');

const { test, describe, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { Timestamp } = require('firebase-admin/firestore');

const { db, seedTemplates, clearMail, mailDoc } = require('../helpers/firestore');
const smtp = require('../helpers/smtp');
const { processMail } = require('../../lib/process');
const { claimability } = require('../../lib/delivery');
const { clearTemplateCache } = require('../../lib/templates');

let firestore;

before(async () => {
  firestore = db();
  await seedTemplates();
});

beforeEach(async () => {
  await clearMail();
  clearTemplateCache();
});

/** Create a mail document and run one processing pass over it. */
async function run(doc, serverOpts) {
  const server = await smtp.start(serverOpts);
  try {
    const ref = await firestore.collection('mail').add(doc);
    await processMail(ref, 'test');
    const snap = await ref.get();
    return { ref, delivery: snap.get('delivery'), sent: server.received, server };
  } finally {
    await server.stop();
  }
}

describe('the happy path', () => {
  test('PENDING becomes SUCCESS and the mail actually goes out', async () => {
    const { delivery, sent } = await run(mailDoc());

    assert.equal(delivery.state, 'SUCCESS');
    assert.equal(delivery.attempts, 1);
    assert.equal(delivery.error, null);
    assert.equal(delivery.leaseExpireTime, null, 'a terminal document holds no lease');
    assert.ok(delivery.startTime, 'startTime is stamped');
    assert.ok(delivery.endTime, 'endTime is stamped');
    assert.equal(sent.length, 1);
  });

  test('records the same delivery.info shape the old extension wrote', async () => {
    // 707 historical documents carry this shape; readers must not have to
    // distinguish old from new.
    const { delivery } = await run(mailDoc());
    assert.deepEqual(Object.keys(delivery).sort(), [
      'attempts', 'endTime', 'error', 'info', 'leaseExpireTime', 'startTime', 'state',
    ]);
    assert.deepEqual(Object.keys(delivery.info).sort(), [
      'accepted', 'messageId', 'pending', 'rejected', 'response',
    ]);
    assert.deepEqual(delivery.info.accepted.sort(), [
      'arielagc@br7.org.il', 'emri@hasadna.org.il', 'rsv@br7.org.il',
    ]);
    assert.deepEqual(delivery.info.rejected, []);
    assert.match(delivery.info.response, /^250/);
  });

  test('renders the Handlebars template from Firestore, in Hebrew', async () => {
    const { sent } = await run(mailDoc());
    const raw = sent[0].raw;
    assert.equal(smtp.header(raw, 'Subject'), 'סיכום השיחה שלנו על פתיחת מכון כושר באיזור מרכז חן');
    const body = smtp.bodyText(raw);
    assert.match(body, /ארנונה/, 'the {{#each stack_modules}} block rendered');
    assert.match(body, /https:\/\/br7biz\.org\.il\/r\/TEST/);
    assert.match(body, /direction:rtl/);
  });

  test('an empty {{#if}} branch is omitted rather than printed', async () => {
    const { sent } = await run(mailDoc());
    assert.doesNotMatch(smtp.bodyText(sent[0].raw), /<p><\/p>/);
  });

  test('a document with no delivery field at all is sent', async () => {
    // The 31 orphans that the uninstalled extension left behind looked exactly
    // like this.
    const doc = mailDoc();
    delete doc.delivery;
    const { delivery, sent } = await run(doc);
    assert.equal(delivery.state, 'SUCCESS');
    assert.equal(sent.length, 1);
  });
});

describe('never sends the same message twice', () => {
  test('a second pass over a SUCCESS document does nothing', async () => {
    const server = await smtp.start();
    try {
      const ref = await firestore.collection('mail').add(mailDoc());
      await processMail(ref, 'test');
      const first = (await ref.get()).get('delivery');

      await processMail(ref, 'test'); // e.g. the sweeper racing the trigger
      const second = (await ref.get()).get('delivery');

      assert.equal(server.received.length, 1, 'exactly one message on the wire');
      assert.equal(second.attempts, first.attempts, 'attempts did not move');
      assert.equal(second.endTime.toMillis(), first.endTime.toMillis());
    } finally {
      await server.stop();
    }
  });

  test('concurrent passes over one document send exactly once', async () => {
    // The trigger and the sweeper can genuinely collide. The claim transaction
    // is what makes only one of them win.
    const server = await smtp.start();
    try {
      const ref = await firestore.collection('mail').add(mailDoc());
      await Promise.all([
        processMail(ref, 'trigger'),
        processMail(ref, 'sweep'),
        processMail(ref, 'sweep'),
      ]);
      assert.equal(server.received.length, 1, 'exactly one message on the wire');
      const delivery = (await ref.get()).get('delivery');
      assert.equal(delivery.state, 'SUCCESS');
      assert.equal(delivery.attempts, 1);
    } finally {
      await server.stop();
    }
  });

  test('a live lease blocks a second worker', async () => {
    const doc = mailDoc({
      delivery: {
        state: 'PROCESSING',
        startTime: Timestamp.now(),
        endTime: null,
        leaseExpireTime: Timestamp.fromMillis(Date.now() + 180_000),
        attempts: 1,
        error: null,
        info: null,
      },
    });
    const { delivery, sent } = await run(doc);
    assert.equal(sent.length, 0, 'nothing sent while another worker holds the lease');
    assert.equal(delivery.state, 'PROCESSING');
  });

  test('an expired lease is recovered, because that worker died', async () => {
    const doc = mailDoc({
      delivery: {
        state: 'PROCESSING',
        startTime: Timestamp.fromMillis(Date.now() - 600_000),
        endTime: null,
        leaseExpireTime: Timestamp.fromMillis(Date.now() - 1),
        attempts: 1,
        error: null,
        info: null,
      },
    });
    const { delivery, sent } = await run(doc);
    assert.equal(sent.length, 1);
    assert.equal(delivery.state, 'SUCCESS');
    assert.equal(delivery.attempts, 2, 'the recovered attempt counts');
  });
});

describe('the loop guard holds against real documents', () => {
  test('no state the pipeline leaves behind is claimable', async () => {
    const cases = [
      ['SUCCESS', mailDoc(), undefined],
      ['permanent failure', mailDoc({ template: { name: 'nope', data: {} } }), undefined],
      ['transient failure', mailDoc(), { behaviour: 'drop' }],
    ];
    for (const [label, doc, serverOpts] of cases) {
      await clearMail();
      const { delivery } = await run(doc, serverOpts);
      assert.equal(
        claimability(delivery, Date.now()), 'skip',
        `${label}: left state ${delivery.state}, which would retrigger the function forever`,
      );
    }
  });
});

describe('failure handling', () => {
  test('an unknown template fails permanently, with no socket opened', async () => {
    const { delivery, sent } = await run(mailDoc({ template: { name: 'nope', data: {} } }));
    assert.equal(delivery.state, 'ERROR');
    assert.equal(delivery.attempts, 1, 'no retries burned on a hopeless document');
    assert.match(delivery.error, /not allowed/);
    assert.equal(sent.length, 0);
  });

  test('a template that is allowlisted but absent fails permanently', async () => {
    await firestore.collection('templates').doc('crm-open').delete();
    try {
      const { delivery } = await run(mailDoc({ template: { name: 'crm-open', data: {} } }));
      assert.equal(delivery.state, 'ERROR');
      assert.match(delivery.error, /unknown template/);
    } finally {
      await seedTemplates();
    }
  });

  test('a bad recipient fails permanently rather than retrying forever', async () => {
    const { delivery, sent } = await run(mailDoc({ to: 'not-an-email' }));
    assert.equal(delivery.state, 'ERROR');
    assert.match(delivery.error, /to:/);
    assert.equal(sent.length, 0);
  });

  test('a forged `message` field is refused', async () => {
    const { delivery, sent } = await run(mailDoc({ message: { html: '<b>evil</b>' } }));
    assert.equal(delivery.state, 'ERROR');
    assert.match(delivery.error, /unexpected field "message"/);
    assert.equal(sent.length, 0);
  });

  test('a dropped connection becomes RETRY with a future backoff', async () => {
    const { delivery } = await run(mailDoc(), { behaviour: 'drop' });
    assert.equal(delivery.state, 'RETRY');
    assert.equal(delivery.attempts, 1);
    assert.ok(delivery.error);
    assert.ok(
      delivery.leaseExpireTime.toMillis() > Date.now(),
      'RETRY must not be due immediately, or it would spin',
    );
    assert.equal(delivery.endTime, null, 'not terminal yet');
  });

  test('gives up after 5 attempts instead of retrying forever', async () => {
    const doc = mailDoc({
      delivery: {
        state: 'RETRY',
        startTime: Timestamp.fromMillis(Date.now() - 3_600_000),
        endTime: null,
        leaseExpireTime: Timestamp.fromMillis(Date.now() - 1),
        attempts: 4,
        error: 'previous failure',
        info: null,
      },
    });
    const { delivery } = await run(doc, { behaviour: 'drop' });
    assert.equal(delivery.state, 'ERROR');
    assert.equal(delivery.attempts, 5);
    assert.match(delivery.error, /Gave up after 5 attempts/);
  });

  test('a requeued failure sends, and keeps its original startTime', async () => {
    // This is how the 6 TLS-failed documents were recovered.
    const original = Timestamp.fromMillis(Date.now() - 86_400_000);
    const doc = mailDoc({
      delivery: {
        state: 'PENDING', startTime: original, endTime: null,
        leaseExpireTime: null, attempts: 1,
        error: 'wrong version number', info: null,
      },
    });
    const { delivery, sent } = await run(doc);
    assert.equal(delivery.state, 'SUCCESS');
    assert.equal(delivery.attempts, 2);
    assert.equal(delivery.startTime.toMillis(), original.toMillis());
    assert.equal(delivery.error, null, 'the stale error is cleared');
    assert.equal(sent.length, 1);
  });
});

describe('kill switches', () => {
  test('CLAIM_ENABLED=false observes without writing or sending', async () => {
    // The cutover relied on this to prove the wiring while the old extension
    // was still live.
    process.env.CLAIM_ENABLED = 'false';
    try {
      const { delivery, sent } = await run(mailDoc());
      assert.equal(sent.length, 0);
      assert.deepEqual(delivery, { state: 'PENDING', attempts: 0 }, 'document untouched');
    } finally {
      process.env.CLAIM_ENABLED = 'true';
    }
  });
});

after(async () => {
  await clearMail();
});
