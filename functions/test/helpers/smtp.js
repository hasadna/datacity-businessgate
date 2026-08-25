'use strict';
/**
 * A real SMTP server for tests, so the mail path is exercised over an actual
 * connection - STARTTLS negotiation, AUTH, RCPT TO, and the RFC822 bytes -
 * rather than against a stub. smtp-server ships a self-signed certificate,
 * which is why the integration tests run with NODE_TLS_REJECT_UNAUTHORIZED=0.
 */
const { SMTPServer } = require('smtp-server');

/** Fixed, so config read through firebase-functions params stays stable. */
const PORT = 21587;
const HOST = 'localhost';

/**
 * @param {object} [opts]
 * @param {'accept'|'reject'|'drop'} [opts.behaviour] how to answer DATA:
 *   accept - 250; reject - a permanent 5xx; drop - destroy the connection,
 *   which is the transient case.
 */
function start(opts = {}) {
  const behaviour = opts.behaviour ?? 'accept';
  const received = [];

  const server = new SMTPServer({
    // Force STARTTLS, matching what the production transport requires on 587.
    hideSTARTTLS: false,
    authMethods: ['PLAIN', 'LOGIN'],
    onAuth(auth, session, cb) {
      received.auth = { user: auth.username, pass: auth.password };
      cb(null, { user: auth.username });
    },
    onMailFrom(address, session, cb) {
      session.mailFrom = address.address;
      cb();
    },
    onRcptTo(address, session, cb) {
      (session.rcpts ??= []).push(address.address);
      cb();
    },
    onData(stream, session, cb) {
      let raw = '';
      stream.on('data', (chunk) => (raw += chunk));
      stream.on('end', () => {
        if (behaviour === 'drop') {
          session.destroy?.();
          return cb(new Error('connection dropped'));
        }
        received.push({ raw, from: session.mailFrom, rcpts: session.rcpts ?? [] });
        if (behaviour === 'reject') {
          const err = new Error('Message rejected');
          err.responseCode = 554;
          return cb(err);
        }
        cb(null, '250 Ok queued as TESTMSG');
      });
    },
  });

  // smtp-server logs a warning about its public test certificate on every boot.
  server.on('error', () => {});

  return new Promise((resolve) => {
    server.listen(PORT, '127.0.0.1', () =>
      resolve({
        received,
        port: PORT,
        stop: () => new Promise((r) => server.close(r)),
      }),
    );
  });
}

/** Decode a base64 MIME body back to text, for asserting on Hebrew content. */
function bodyText(raw) {
  const idx = raw.indexOf('\r\n\r\n');
  const body = idx === -1 ? raw : raw.slice(idx + 4);
  return Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8');
}

/**
 * RFC2047-decode a header value. A long Hebrew subject is split across several
 * encoded-words; per RFC 2047 the whitespace *between* adjacent encoded-words
 * is folding, not content, so it has to be dropped rather than preserved.
 */
function decodeHeader(value) {
  return value
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?utf-8\?B\?([^?]*)\?=/gi, (_, b64) =>
      Buffer.from(b64, 'base64').toString('utf8'),
    );
}

function header(raw, name) {
  const unfolded = raw.replace(/\r\n[ \t]+/g, ' ');
  const m = unfolded.match(new RegExp(`^${name}: (.*)$`, 'mi'));
  return m ? decodeHeader(m[1]).trim() : undefined;
}

module.exports = { start, bodyText, header, HOST, PORT };
