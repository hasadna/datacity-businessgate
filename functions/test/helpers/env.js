'use strict';
/**
 * Test configuration, applied before anything requires lib/config.
 *
 * firebase-functions params resolve from process.env, so setting these gives
 * the code under test exactly the shape it has in production - including the
 * validation limits, which several tests depend on.
 */
const smtp = require('./smtp');

process.env.SMTP_HOST = smtp.HOST;
process.env.SMTP_PORT = String(smtp.PORT);
process.env.SMTP_SECURE = 'false';
process.env.SMTP_USERNAME = 'test-user';
process.env.SMTP_PASSWORD = 'test-pass';
process.env.MAIL_FROM = 'BR7 Bot <noreply@br7biz.org.il>';

process.env.TEMPLATE_ALLOWLIST = 'crm,crm-open,direct-question';
process.env.RECIPIENT_ALLOW_DOMAINS = 'br7.org.il,br7biz.org.il,hasadna.org.il';
process.env.MAX_EXTERNAL_RECIPIENTS = '2';
process.env.MAX_RECIPIENTS = '10';

process.env.CLAIM_ENABLED = 'true';
process.env.SEND_ENABLED = 'true';
process.env.ORPHAN_SCAN_ENABLED = 'true';

/** The fake SMTP server presents smtp-server's public self-signed certificate. */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

module.exports = {};
