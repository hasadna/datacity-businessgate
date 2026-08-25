'use strict';
/**
 * `mail` is world-writable - the live Firestore rules are an unconditioned
 * `allow create` - so anyone on the internet can put a document in this
 * collection. validate() is what stops that from becoming an open relay that
 * sends arbitrary mail as noreply@br7biz.org.il.
 */
require('../helpers/env');

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../../lib/validate');
const { PermanentError } = require('../../lib/delivery');

const good = () => ({
  to: 'arielagc@br7.org.il',
  cc: ['arielagc@br7.org.il', 'rsv@br7.org.il'],
  bcc: 'emri@hasadna.org.il',
  template: { name: 'crm', data: { business_kind: 'מכון כושר' } },
});

/** Assert the document is refused, permanently (no retry, no socket opened). */
function refuses(doc, needle) {
  let thrown;
  try {
    validate(doc);
  } catch (err) {
    thrown = err;
  }
  assert.ok(thrown, `expected validate() to reject, but it accepted ${JSON.stringify(doc)}`);
  assert.ok(
    thrown instanceof PermanentError,
    `must reject permanently (no retry), got ${thrown.name}: ${thrown.message}`,
  );
  assert.match(thrown.message, needle);
}

describe('accepts what the app actually writes', () => {
  test('the crm-open shape (staff recipients only)', () => {
    const v = validate(good());
    assert.deepEqual(v.to, ['arielagc@br7.org.il']);
    assert.deepEqual(v.bcc, ['emri@hasadna.org.il']);
    assert.equal(v.templateName, 'crm');
  });

  test('the crm shape, which legitimately mails one outside address', () => {
    const v = validate({
      to: 'someone@gmail.com',
      cc: ['arielagc@br7.org.il', 'rsv@br7.org.il'],
      bcc: 'emri@hasadna.org.il',
      template: { name: 'crm', data: {} },
    });
    assert.deepEqual(v.to, ['someone@gmail.com']);
  });

  test('the direct-question shape, which cc\'s the end user', () => {
    const v = validate({
      to: 'pikuah1@br7.org.il',
      cc: ['someone@gmail.com', 'arielagc@br7.org.il'],
      bcc: 'emri@hasadna.org.il',
      template: { name: 'direct-question', data: { questions: ['שאלה'] } },
    });
    assert.equal(v.cc.length, 2);
  });

  test('the PENDING sentinel the client now writes', () => {
    validate({ ...good(), delivery: { state: 'PENDING', attempts: 0 } });
  });

  test('a document with no cc or bcc', () => {
    const v = validate({ to: 'a@br7.org.il', template: { name: 'crm', data: {} } });
    assert.deepEqual(v.cc, []);
    assert.deepEqual(v.bcc, []);
  });

  test('template.data omitted entirely', () => {
    assert.deepEqual(validate({ to: 'a@br7.org.il', template: { name: 'crm' } }).data, {});
  });
});

describe('refuses to become an open relay', () => {
  test('rejects the raw `message` escape hatch', () => {
    // The extension accepted message:{subject,html}, bypassing templates
    // entirely. 0 of 746 historical documents used it, and supporting it would
    // let anyone send arbitrary HTML from our domain to anyone.
    refuses({ ...good(), message: { subject: 'Your account', html: '<a href=evil>click</a>' } },
      /unexpected field "message"/);
  });

  test('rejects a spoofed From', () => {
    refuses({ ...good(), from: 'ceo@bank.example' }, /unexpected field "from"/);
  });

  test('rejects injected headers, replyTo and attachments', () => {
    refuses({ ...good(), headers: { 'X-Evil': '1' } }, /unexpected field "headers"/);
    refuses({ ...good(), replyTo: 'evil@example.com' }, /unexpected field "replyTo"/);
    refuses({ ...good(), attachments: [{ path: '/etc/passwd' }] }, /unexpected field "attachments"/);
  });

  test('caps how many outside recipients one document may reach', () => {
    // Bounds the amplification factor: a single forged document cannot become
    // a bulk send. Two is headroom over the one the real flows use.
    refuses({ ...good(), cc: ['a@evil.com', 'b@evil.com', 'c@evil.com'] }, /too many external/);
  });

  test('counts outside recipients across to, cc and bcc together', () => {
    refuses(
      { to: 'a@evil.com', cc: ['b@evil.com'], bcc: 'c@evil.com', template: { name: 'crm', data: {} } },
      /too many external/,
    );
  });

  test('caps total recipients even when all are internal', () => {
    const many = Array.from({ length: 12 }, (_, i) => `staff${i}@br7.org.il`);
    refuses({ ...good(), cc: many }, /too many recipients/);
  });

  test('deduplicates before counting, so overlap is not punished', () => {
    // `to` and `cc[0]` are the same address in the real crm-open payload.
    const v = validate({
      to: 'x@evil.com',
      cc: ['X@EVIL.COM', 'arielagc@br7.org.il'],
      template: { name: 'crm', data: {} },
    });
    assert.equal(v.to.length + v.cc.length, 3);
  });
});

describe('address handling', () => {
  test('rejects malformed addresses', () => {
    for (const bad of ['not-an-email', 'a@b', '@b.com', 'a@.com', '', ' ']) {
      refuses({ ...good(), to: bad }, /to:/);
    }
  });

  test('rejects header injection through an address', () => {
    refuses({ ...good(), to: 'a@b.com\nBcc: victim@example.com' }, /CR\/LF|not an email/);
    refuses({ ...good(), to: 'a@b.com\r\nSubject: spam' }, /CR\/LF|not an email/);
  });

  test('rejects an over-long address', () => {
    refuses({ ...good(), to: `${'a'.repeat(250)}@b.com` }, /too long/);
  });

  test('rejects non-strings', () => {
    refuses({ ...good(), to: 42 }, /expected string/);
    refuses({ ...good(), cc: [{ address: 'a@b.com' }] }, /expected string/);
  });

  test('requires a recipient', () => {
    refuses({ template: { name: 'crm', data: {} } }, /to: required/);
    refuses({ ...good(), to: null }, /to: required/);
  });

  test('trims surrounding whitespace', () => {
    assert.deepEqual(validate({ ...good(), to: '  a@br7.org.il  ' }).to, ['a@br7.org.il']);
  });
});

describe('template selection', () => {
  test('rejects a template that is not on the allowlist', () => {
    refuses({ ...good(), template: { name: 'nope', data: {} } }, /not allowed/);
  });

  test('rejects names that could escape the templates collection', () => {
    for (const name of ['../secrets', 'a/b', 'CRM', 'crm ', '', 'x'.repeat(65)]) {
      refuses({ ...good(), template: { name, data: {} } }, /invalid/);
    }
  });

  test('requires the template object', () => {
    refuses({ to: 'a@br7.org.il' }, /template: required/);
    refuses({ to: 'a@br7.org.il', template: 'crm' }, /template: required/);
    refuses({ to: 'a@br7.org.il', template: ['crm'] }, /template: required/);
  });

  test('rejects unknown keys inside template', () => {
    refuses({ ...good(), template: { name: 'crm', data: {}, partial: 'x' } }, /unexpected field/);
  });
});

describe('template.data', () => {
  test('rejects prototype-pollution keys, at any depth', () => {
    // JSON.parse is how a real own "__proto__" key comes into existence; an
    // object literal would set the prototype instead.
    refuses({ ...good(), template: { name: 'crm', data: JSON.parse('{"__proto__":{"x":1}}') } },
      /forbidden key/);
    refuses({ ...good(), template: { name: 'crm', data: { a: [{ b: JSON.parse('{"constructor":1}') }] } } },
      /forbidden key/);
    refuses({ ...good(), template: { name: 'crm', data: { a: JSON.parse('{"prototype":1}') } } },
      /forbidden key/);
  });

  test('rejects data that is not an object', () => {
    refuses({ ...good(), template: { name: 'crm', data: 'string' } }, /must be an object/);
    refuses({ ...good(), template: { name: 'crm', data: [1, 2] } }, /must be an object/);
  });

  test('rejects an oversized payload', () => {
    const data = { stack_modules: Array.from({ length: 5000 }, () => ({ module: 'x'.repeat(100) })) };
    refuses({ ...good(), template: { name: 'crm', data } }, /too large/);
  });

  test('rejects data nested absurdly deep', () => {
    let deep = {};
    let cur = deep;
    for (let i = 0; i < 20; i++) cur = cur.next = {};
    refuses({ ...good(), template: { name: 'crm', data: deep } }, /nested too deeply/);
  });

  test('accepts the real nested shape the app sends', () => {
    validate({
      ...good(),
      template: {
        name: 'crm',
        data: {
          questions: [{ name: 'הערות כלליות', questions: ['שאלה אחת', 'שאלה שתיים'] }],
          stack_modules: [{ module: 'ארנונה', stacks: ['מה כדאי לדעת?'] }],
        },
      },
    });
  });
});
