import {
  MAX_DATA_BYTES,
  MAX_EXTERNAL_RECIPIENTS,
  MAX_RECIPIENTS,
  RECIPIENT_ALLOW_DOMAINS,
  TEMPLATE_ALLOWLIST,
  csv,
} from './config';
import { PermanentError } from './delivery';

const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;
const TEMPLATE_NAME_RE = /^[a-z0-9-]{1,64}$/;

const ALLOWED_TOP_LEVEL = new Set(['to', 'cc', 'bcc', 'template', 'delivery']);
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export interface ValidMail {
  to: string[];
  cc: string[];
  bcc: string[];
  templateName: string;
  data: Record<string, unknown>;
}

function fail(msg: string): never {
  throw new PermanentError(msg);
}

function addresses(value: unknown, field: string): string[] {
  if (value === undefined || value === null || value === '') return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw.map((v) => {
    if (typeof v !== 'string') fail(`${field}: expected string, got ${typeof v}`);
    const a = v.trim();
    if (a.length > 254) fail(`${field}: address too long`);
    if (/[\r\n]/.test(a)) fail(`${field}: CR/LF in address`);
    if (!EMAIL_RE.test(a)) fail(`${field}: not an email address: ${a.slice(0, 64)}`);
    return a;
  });
}

function assertCleanKeys(value: unknown, depth = 0): void {
  if (depth > 8) fail('template.data: nested too deeply');
  if (Array.isArray(value)) {
    for (const v of value) assertCleanKeys(v, depth + 1);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(k)) fail(`template.data: forbidden key "${k}"`);
    assertCleanKeys(v, depth + 1);
  }
}

/**
 * The `mail` collection is world-writable (firestore rules are an unconditioned
 * `allow create`), so every field here is hostile input. Everything this
 * rejects is a PermanentError: terminal ERROR, no retry, no socket opened.
 */
export function validate(doc: Record<string, unknown>): ValidMail {
  for (const k of Object.keys(doc)) {
    if (!ALLOWED_TOP_LEVEL.has(k)) {
      // Notably rejects `message`, the extension's raw-HTML escape hatch: it
      // would let anyone on the internet send arbitrary HTML as
      // noreply@br7biz.org.il. 0 of 746 historical documents use it.
      fail(`unexpected field "${k}"`);
    }
  }

  const to = addresses(doc.to, 'to');
  if (to.length === 0) fail('to: required');
  const cc = addresses(doc.cc, 'cc');
  const bcc = addresses(doc.bcc, 'bcc');

  const seen = new Set<string>();
  const all: string[] = [];
  for (const a of [...to, ...cc, ...bcc]) {
    const key = a.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      all.push(a);
    }
  }
  if (all.length > MAX_RECIPIENTS.value()) {
    fail(`too many recipients: ${all.length} > ${MAX_RECIPIENTS.value()}`);
  }

  // A hard recipient allowlist is impossible - the `crm` template legitimately
  // mails the end user. Capping the *count* of outside addresses bounds the
  // amplification factor of the open endpoint instead.
  const allowed = new Set(csv(RECIPIENT_ALLOW_DOMAINS.value()));
  const external = all.filter(
    (a) => !allowed.has(a.slice(a.lastIndexOf('@') + 1).toLowerCase()),
  );
  if (external.length > MAX_EXTERNAL_RECIPIENTS.value()) {
    fail(`too many external recipients (${external.length}): ${external.join(', ').slice(0, 200)}`);
  }

  const template = doc.template;
  if (!template || typeof template !== 'object' || Array.isArray(template)) {
    fail('template: required object');
  }
  const t = template as Record<string, unknown>;
  for (const k of Object.keys(t)) {
    if (k !== 'name' && k !== 'data') fail(`template: unexpected field "${k}"`);
  }

  const name = t.name;
  if (typeof name !== 'string' || !TEMPLATE_NAME_RE.test(name)) {
    fail('template.name: invalid');
  }
  if (!csv(TEMPLATE_ALLOWLIST.value()).includes(name)) {
    fail(`template.name: not allowed: ${name}`);
  }

  const data = t.data ?? {};
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    fail('template.data: must be an object');
  }
  assertCleanKeys(data);
  const size = Buffer.byteLength(JSON.stringify(data), 'utf8');
  if (size > MAX_DATA_BYTES) fail(`template.data: too large (${size} bytes)`);

  return { to, cc, bcc, templateName: name, data: data as Record<string, unknown> };
}
