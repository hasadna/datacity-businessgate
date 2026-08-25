/**
 * Checks for the pure logic in delivery.ts and validate.ts - the parts where a
 * mistake means either an infinite retrigger loop or an open mail relay.
 *
 *   npm --prefix functions test
 *
 * Deliberately dependency-free and run against lib/, so it needs nothing beyond
 * `npm run build`.
 */
process.env.TEMPLATE_ALLOWLIST='crm,crm-open,direct-question';
process.env.RECIPIENT_ALLOW_DOMAINS='br7.org.il,br7biz.org.il,hasadna.org.il';
process.env.MAX_EXTERNAL_RECIPIENTS='2';
process.env.MAX_RECIPIENTS='10';
const {Timestamp} = require('firebase-admin/firestore');
const {claimability, backoffMs, clampAttempts, processingDelivery, isPermanent, PermanentError} = require('../lib/delivery');
const {validate} = require('../lib/validate');

let fails = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${name}`);
};
const now = 1_000_000_000_000;
const ts = (ms) => Timestamp.fromMillis(ms);

// --- claimability: the loop guard -----------------------------------------
eq('no delivery field           -> claim', claimability(undefined, now), 'claim');
eq('null delivery               -> claim', claimability(null, now), 'claim');
eq('PENDING                     -> claim', claimability({state:'PENDING'}, now), 'claim');
eq('PROCESSING live lease       -> skip ', claimability({state:'PROCESSING', leaseExpireTime: ts(now+180000)}, now), 'skip');
eq('PROCESSING expired lease    -> claim', claimability({state:'PROCESSING', leaseExpireTime: ts(now-1)}, now), 'claim');
eq('PROCESSING no lease         -> claim', claimability({state:'PROCESSING'}, now), 'claim');
eq('RETRY not yet due           -> skip ', claimability({state:'RETRY', leaseExpireTime: ts(now+60000)}, now), 'skip');
eq('RETRY due                   -> claim', claimability({state:'RETRY', leaseExpireTime: ts(now-1)}, now), 'claim');
eq('SUCCESS                     -> skip ', claimability({state:'SUCCESS'}, now), 'skip');
eq('ERROR                       -> skip ', claimability({state:'ERROR'}, now), 'skip');
eq('garbage state               -> skip ', claimability({state:'WAT'}, now), 'skip');

// the loop-safety property: everything we write must be skippable
const p = processingDelivery(undefined, now);
eq('our PROCESSING write        -> skip ', claimability(p, now), 'skip');
eq('  ..startTime stamped', p.startTime.toMillis(), now);
eq('  ..attempts 0 -> 1', p.attempts, 1);
eq('preserves startTime across attempts', processingDelivery({startTime: ts(123), attempts: 2}, now).startTime.toMillis(), 123);

eq('clampAttempts("x")', clampAttempts('x'), 0);
eq('clampAttempts(99)', clampAttempts(99), 5);
eq('backoff 1..5', [1,2,3,4,5].map(backoffMs), [60000,120000,240000,480000,960000]);

// --- error classification --------------------------------------------------
eq('PermanentError is permanent', isPermanent(new PermanentError('x')), true);
eq('SES 554 is permanent', isPermanent({responseCode:554}), true);
eq('EAUTH is permanent', isPermanent({code:'EAUTH'}), true);
eq('the old TLS error is transient', isPermanent(Object.assign(new Error('wrong version number'), {code:'ESOCKET'})), false);
eq('4xx is transient', isPermanent({responseCode:451}), false);

// --- validation ------------------------------------------------------------
const good = {to:'arielagc@br7.org.il', cc:['arielagc@br7.org.il','rsv@br7.org.il'], bcc:'emri@hasadna.org.il',
              template:{name:'crm', data:{business_kind:'x'}}};
const rejects = (name, doc, needle) => {
  try { validate(doc); fails++; console.log(`FAIL ${name}: accepted`); }
  catch (e) {
    const ok = e instanceof PermanentError && e.message.includes(needle);
    if (!ok) { fails++; console.log(`FAIL ${name}: ${e.message}`); } else console.log(`ok   ${name}`);
  }
};
const v = validate(good);
eq('valid doc: dedupes to/cc overlap', [v.to, v.cc, v.bcc], [['arielagc@br7.org.il'],['arielagc@br7.org.il','rsv@br7.org.il'],['emri@hasadna.org.il']]);
rejects('rejects raw `message` field', {...good, message:{html:'<b>evil</b>'}}, 'unexpected field "message"');
rejects('rejects `from` override', {...good, from:'ceo@bank.example'}, 'unexpected field "from"');
rejects('rejects unknown template', {...good, template:{name:'nope', data:{}}}, 'not allowed');
rejects('rejects path-ish template name', {...good, template:{name:'../secrets', data:{}}}, 'invalid');
rejects('rejects bad address', {...good, to:'not-an-email'}, 'not an email');
rejects('rejects CRLF in address', {...good, to:'a@b.com\nBcc: x@y.com'}, 'CR/LF');
rejects('rejects 3 external recipients', {...good, cc:['a@x.com','b@y.com','c@z.com']}, 'too many external');
// JSON.parse is how a real own "__proto__" key comes into existence; an object
// literal would set the prototype instead of creating an own property.
rejects('rejects own __proto__ key', {...good, template:{name:'crm', data:JSON.parse('{"__proto__":{"polluted":1}}')}}, 'forbidden key');
rejects('rejects nested constructor key', {...good, template:{name:'crm', data:{a:[{b:JSON.parse('{"constructor":1}')}]}}}, 'forbidden key');
rejects('rejects missing to', {template:{name:'crm',data:{}}}, 'to: required');
// one external recipient (the end user) is the legitimate `crm` shape
validate({to:'someone@gmail.com', cc:['arielagc@br7.org.il'], bcc:'emri@hasadna.org.il', template:{name:'crm',data:{}}});
console.log('ok   accepts the real crm shape (1 external recipient)');
// client-written delivery sentinel must not be rejected
validate({...good, delivery:{state:'PENDING', attempts:0}});
console.log('ok   accepts the client PENDING sentinel');

console.log(fails ? `\n${fails} FAILURES` : '\nall checks passed');
process.exit(fails ? 1 : 0);
