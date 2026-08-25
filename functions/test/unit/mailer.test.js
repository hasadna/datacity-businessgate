'use strict';
/**
 * The SMTP transport. Every send in production had been failing with
 *
 *   error:0A00010B:SSL routines:tls_validate_record_header:wrong version number
 *
 * because the configuration used smtps:// (implicit TLS) against port 587,
 * which is SES's STARTTLS port. These tests pin the invariant that now makes
 * that combination impossible.
 */
require('../helpers/env');

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { getTransporter, send } = require('../../lib/mailer');
const { PermanentError } = require('../../lib/delivery');
const smtp = require('../helpers/smtp');

const cfg = (over = {}) => ({
  host: 'email-smtp.us-east-1.amazonaws.com',
  port: 587,
  secure: false,
  user: 'AKIAEXAMPLE',
  pass: 'secret',
  from: 'BR7 Bot <noreply@br7biz.org.il>',
  dryRun: false,
  ...over,
});

describe('port and TLS mode must agree', () => {
  test('587 with implicit TLS is refused - this was the production outage', () => {
    let thrown;
    try {
      getTransporter(cfg({ port: 587, secure: true }));
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown instanceof PermanentError);
    assert.match(thrown.message, /587 requires SMTP_SECURE=false/);
  });

  test('465 without implicit TLS is refused - the mirror-image mistake', () => {
    let thrown;
    try {
      getTransporter(cfg({ port: 465, secure: false }));
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown instanceof PermanentError);
    assert.match(thrown.message, /465 requires SMTP_SECURE=true/);
  });

  test('the two correct combinations are accepted', () => {
    assert.ok(getTransporter(cfg({ port: 587, secure: false })));
    assert.ok(getTransporter(cfg({ port: 465, secure: true })));
  });

  test('587 demands STARTTLS rather than silently falling back to plaintext', () => {
    const t = getTransporter(cfg({ port: 587, secure: false }));
    assert.equal(t.options.requireTLS, true);
    assert.equal(t.options.secure, false);
    assert.equal(t.options.tls.minVersion, 'TLSv1.2');
  });

  test('the misconfiguration is permanent, so it fails fast instead of retrying', () => {
    // Retrying a config error five times just delays the alert.
    let thrown;
    try {
      getTransporter(cfg({ port: 587, secure: true }));
    } catch (err) {
      thrown = err;
    }
    const { isPermanent } = require('../../lib/delivery');
    assert.equal(isPermanent(thrown), true);
  });
});

describe('credentials never reach a connection string', () => {
  test('a password containing "/" is usable', async () => {
    // The legacy config was a smtps:// URI whose password contained a literal
    // "/" in the userinfo, which makes it unparseable: new URL() throws. The
    // transport takes discrete fields precisely so this cannot happen.
    const pass = 'BJhHJI8v/IKc6LdkZNQSoP2SNnFTV9OS2WhkCtatztyl';
    assert.throws(() => new URL(`smtps://user:${pass}@host:587`), { code: 'ERR_INVALID_URL' });

    const server = await smtp.start();
    try {
      await send(
        cfg({ host: smtp.HOST, port: smtp.PORT, pass }),
        { to: ['a@br7.org.il'], cc: [], bcc: [], subject: 'x', html: '<p>x</p>' },
      );
      assert.equal(server.received.auth.pass, pass);
    } finally {
      await server.stop();
    }
  });
});

describe('the message on the wire', () => {
  test('carries every recipient, including bcc, without leaking bcc into headers', async () => {
    const server = await smtp.start();
    try {
      const info = await send(
        cfg({ host: smtp.HOST, port: smtp.PORT }),
        {
          to: ['arielagc@br7.org.il'],
          cc: ['rsv@br7.org.il'],
          bcc: ['emri@hasadna.org.il'],
          subject: 'נושא',
          html: '<b>גוף ההודעה</b>',
        },
      );

      const msg = server.received[0];
      assert.deepEqual(msg.rcpts.sort(), [
        'arielagc@br7.org.il', 'emri@hasadna.org.il', 'rsv@br7.org.il',
      ]);
      // bcc must be delivered but must not appear in the headers.
      assert.equal(smtp.header(msg.raw, 'Bcc'), undefined);
      assert.equal(smtp.header(msg.raw, 'To'), 'arielagc@br7.org.il');
      assert.equal(smtp.header(msg.raw, 'Cc'), 'rsv@br7.org.il');
      assert.deepEqual(info.accepted.sort(), [
        'arielagc@br7.org.il', 'emri@hasadna.org.il', 'rsv@br7.org.il',
      ]);
      assert.match(info.response, /^250/);
    } finally {
      await server.stop();
    }
  });

  test('sends from the configured address', async () => {
    const server = await smtp.start();
    try {
      await send(cfg({ host: smtp.HOST, port: smtp.PORT }),
        { to: ['a@br7.org.il'], cc: [], bcc: [], subject: 'x', html: '<p>x</p>' });
      assert.equal(server.received[0].from, 'noreply@br7biz.org.il');
      assert.equal(smtp.header(server.received[0].raw, 'From'), 'BR7 Bot <noreply@br7biz.org.il>');
    } finally {
      await server.stop();
    }
  });

  test('Hebrew survives the round trip, in both subject and body', async () => {
    const server = await smtp.start();
    try {
      const subject = 'סיכום השיחה שלנו על פתיחת מכון כושר באיזור מרכז חן';
      const html = "<html><body style='direction:rtl'>שלום, זהו גוף ההודעה</body></html>";
      await send(cfg({ host: smtp.HOST, port: smtp.PORT }),
        { to: ['a@br7.org.il'], cc: [], bcc: [], subject, html });

      const msg = server.received[0];
      assert.equal(smtp.header(msg.raw, 'Subject'), subject);
      assert.match(smtp.bodyText(msg.raw), /שלום, זהו גוף ההודעה/);
      assert.match(smtp.header(msg.raw, 'Content-Type') ?? '', /utf-8/i);
    } finally {
      await server.stop();
    }
  });

  test('a 5xx rejection surfaces as a permanent failure', async () => {
    const server = await smtp.start({ behaviour: 'reject' });
    try {
      const { isPermanent } = require('../../lib/delivery');
      let thrown;
      try {
        await send(cfg({ host: smtp.HOST, port: smtp.PORT }),
          { to: ['a@br7.org.il'], cc: [], bcc: [], subject: 'x', html: '<p>x</p>' });
      } catch (err) {
        thrown = err;
      }
      assert.ok(thrown, 'expected the send to fail');
      assert.equal(isPermanent(thrown), true, 'a 5xx must not be retried');
    } finally {
      await server.stop();
    }
  });
});

describe('dry run', () => {
  test('SEND_ENABLED=false opens no socket', async () => {
    // Nothing is listening on this port; a real connection would throw.
    const info = await send(
      cfg({ host: '127.0.0.1', port: 1, secure: false, dryRun: true }),
      { to: ['a@br7.org.il'], cc: [], bcc: [], subject: 'x', html: '<p>x</p>' },
    );
    assert.ok(info.messageId);
  });
});
