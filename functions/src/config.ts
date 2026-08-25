import {
  defineBoolean,
  defineInt,
  defineSecret,
  defineString,
} from 'firebase-functions/params';

/** Must match the Firestore database region, or Eventarc will refuse the trigger. */
export const REGION = 'europe-west2';

export const MAIL_COLLECTION = 'mail';
export const TEMPLATES_COLLECTION = 'templates';

/**
 * How long a claim is held. MUST exceed the function's timeoutSeconds (120),
 * otherwise a slow-but-alive send can be re-claimed by the sweeper mid-flight
 * and the message goes out twice.
 */
export const LEASE_MS = 180_000;

export const MAX_ATTEMPTS = 5;
export const BACKOFF_BASE_MS = 60_000;
export const BACKOFF_MAX_MS = 60 * 60_000;

export const TEMPLATE_CACHE_TTL_MS = 5 * 60_000;

/** Grace period before a sweeper touches a young document, so it doesn't race the trigger. */
export const MIN_SWEEP_AGE_MS = 5 * 60_000;

export const MAX_HTML_BYTES = 256 * 1024;
export const MAX_DATA_BYTES = 64 * 1024;
export const MAX_ERROR_CHARS = 2000;

// --- secrets (Google Secret Manager) ---------------------------------------
// SMTP_USERNAME is an AWS IAM access key id (AKIA...), i.e. a credential, not a
// label. It does not belong in .env, which ships inside the deployed bundle.
export const SMTP_USERNAME = defineSecret('SMTP_USERNAME');
export const SMTP_PASSWORD = defineSecret('SMTP_PASSWORD');
export const SECRETS = [SMTP_USERNAME, SMTP_PASSWORD];

// --- non-secret configuration (functions/.env) -----------------------------
export const SMTP_HOST = defineString('SMTP_HOST', {
  default: 'email-smtp.us-east-1.amazonaws.com',
});
export const SMTP_PORT = defineInt('SMTP_PORT', { default: 587 });
export const SMTP_SECURE = defineBoolean('SMTP_SECURE', { default: false });
export const MAIL_FROM = defineString('MAIL_FROM', {
  default: 'BR7 Bot <noreply@br7biz.org.il>',
});

export const TEMPLATE_ALLOWLIST = defineString('TEMPLATE_ALLOWLIST', {
  default: 'crm,crm-open,direct-question',
});
export const RECIPIENT_ALLOW_DOMAINS = defineString('RECIPIENT_ALLOW_DOMAINS', {
  default: 'br7.org.il,br7biz.org.il,hasadna.org.il',
});
export const MAX_EXTERNAL_RECIPIENTS = defineInt('MAX_EXTERNAL_RECIPIENTS', { default: 2 });
export const MAX_RECIPIENTS = defineInt('MAX_RECIPIENTS', { default: 10 });

export const ORPHAN_SCAN_ENABLED = defineBoolean('ORPHAN_SCAN_ENABLED', { default: true });

/** CLAIM_ENABLED=false makes the function a pure observer (see the cutover plan). */
export const CLAIM_ENABLED = defineBoolean('CLAIM_ENABLED', { default: true });

/** SEND_ENABLED=false renders the full message but opens no socket (emulator). */
export const SEND_ENABLED = defineBoolean('SEND_ENABLED', { default: true });

export const csv = (s: string): string[] =>
  s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
