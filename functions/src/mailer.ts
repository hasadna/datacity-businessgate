import { logger } from 'firebase-functions';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { PermanentError, type DeliveryInfo } from './delivery';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  dryRun: boolean;
}

export interface Envelope {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string;
}

let cached: { key: string; transporter: nodemailer.Transporter } | null = null;

/**
 * Discrete host/port/user/pass - deliberately NOT a connection URI.
 *
 * The legacy value was
 *   smtps://AKIA...:<password-containing-a-slash>@email-smtp.us-east-1.amazonaws.com:587
 * which is broken twice over:
 *
 *   1. new URL() throws ERR_INVALID_URL, because the password contains "/"
 *      inside the userinfo component.
 *   2. smtps:// means implicit TLS, but 587 is SES's STARTTLS port. The
 *      plaintext "220 ..." greeting then gets parsed as a TLS record, giving
 *      error:0A00010B:SSL routines:tls_validate_record_header:wrong version
 *      number - the exact failure on the recent ERROR documents.
 */
export function getTransporter(cfg: SmtpConfig): nodemailer.Transporter {
  if (cfg.port === 465 && !cfg.secure) {
    throw new PermanentError('SMTP misconfigured: port 465 requires SMTP_SECURE=true (implicit TLS)');
  }
  if (cfg.port === 587 && cfg.secure) {
    throw new PermanentError('SMTP misconfigured: port 587 requires SMTP_SECURE=false (STARTTLS)');
  }

  const key = `${cfg.dryRun}|${cfg.host}|${cfg.port}|${cfg.secure}|${cfg.user}`;
  if (cached?.key === key) return cached.transporter;

  let transporter: nodemailer.Transporter;
  if (cfg.dryRun) {
    transporter = nodemailer.createTransport({ jsonTransport: true });
  } else {
    const options: SMTPTransport.Options = {
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure, // true ONLY on 465
      requireTLS: !cfg.secure, // on 587, refuse to continue without STARTTLS
      auth: { user: cfg.user, pass: cfg.pass },
      connectionTimeout: 20_000,
      greetingTimeout: 20_000,
      socketTimeout: 30_000,
      tls: { minVersion: 'TLSv1.2', servername: cfg.host },
    };
    transporter = nodemailer.createTransport(options);
  }

  logger.info('smtp transport created', {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    requireTLS: !cfg.secure,
    dryRun: cfg.dryRun,
    // never log cfg.user (an AWS access key id) or cfg.pass
  });

  cached = { key, transporter };
  return transporter;
}

const asStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))) : [];

export async function send(cfg: SmtpConfig, env: Envelope): Promise<DeliveryInfo> {
  const info = (await getTransporter(cfg).sendMail({
    from: cfg.from,
    to: env.to,
    cc: env.cc.length ? env.cc : undefined,
    bcc: env.bcc.length ? env.bcc : undefined,
    subject: env.subject,
    html: env.html,
    textEncoding: 'base64', // keeps Hebrew intact through older MTAs
  })) as unknown as Record<string, unknown>;

  return {
    messageId: String(info.messageId ?? ''),
    accepted: asStrings(info.accepted),
    rejected: asStrings(info.rejected),
    pending: asStrings(info.pending),
    response: String(info.response ?? ''),
  };
}
