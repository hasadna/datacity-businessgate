import { getFirestore } from 'firebase-admin/firestore';
import * as Handlebars from 'handlebars';
import { MAX_HTML_BYTES, TEMPLATES_COLLECTION, TEMPLATE_CACHE_TTL_MS } from './config';
import { PermanentError } from './delivery';

/** An isolated environment: no globally-registered helper or partial can leak in. */
const hbs = Handlebars.create();

const RUNTIME_OPTIONS = {
  allowProtoPropertiesByDefault: false,
  allowProtoMethodsByDefault: false,
} as const;

interface Compiled {
  subject: HandlebarsTemplateDelegate;
  html: HandlebarsTemplateDelegate;
  fetchedAt: number;
}

const cache = new Map<string, Compiled>();

async function load(name: string): Promise<Compiled> {
  const hit = cache.get(name);
  if (hit && Date.now() - hit.fetchedAt < TEMPLATE_CACHE_TTL_MS) return hit;

  const snap = await getFirestore().collection(TEMPLATES_COLLECTION).doc(name).get();
  if (!snap.exists) throw new PermanentError(`unknown template: ${name}`);

  const doc = snap.data() as { subject?: unknown; html?: unknown };
  if (typeof doc.html !== 'string' || doc.html.length === 0) {
    throw new PermanentError(`template ${name}: missing "html"`);
  }
  const subjectSrc = typeof doc.subject === 'string' ? doc.subject : '';

  let compiled: Compiled;
  try {
    compiled = {
      subject: hbs.compile(subjectSrc, { strict: false }),
      html: hbs.compile(doc.html, { strict: false }),
      fetchedAt: Date.now(),
    };
  } catch (err) {
    throw new PermanentError(`template ${name}: compile failed: ${(err as Error).message}`);
  }

  cache.set(name, compiled);
  return compiled;
}

export interface Rendered {
  subject: string;
  html: string;
}

export async function render(name: string, data: unknown): Promise<Rendered> {
  const t = await load(name);

  let subject: string;
  let html: string;
  try {
    // Deliberately the escaping {{ }} form throughout the templates: Handlebars
    // escapes only & < > " ' ` = and passes Hebrew and RTL marks through
    // untouched, while every interpolated value here originates from a
    // world-writable collection. A triple-stache would turn staff mail into a
    // stored-XSS / phishing vector.
    subject = t.subject(data, RUNTIME_OPTIONS);
    html = t.html(data, RUNTIME_OPTIONS);
  } catch (err) {
    throw new PermanentError(`template ${name}: render failed: ${(err as Error).message}`);
  }

  // Header-injection guard: {{business_kind}} and friends land straight in the
  // Subject: line.
  subject = subject.replace(/[\r\n]+/g, ' ').trim().slice(0, 300);
  if (!subject) subject = 'BR7 Bot';

  const bytes = Buffer.byteLength(html, 'utf8');
  if (bytes > MAX_HTML_BYTES) {
    throw new PermanentError(`template ${name}: rendered html too large (${bytes} bytes)`);
  }

  return { subject, html };
}

/** Test/emulator seam. */
export function clearTemplateCache(): void {
  cache.clear();
}
