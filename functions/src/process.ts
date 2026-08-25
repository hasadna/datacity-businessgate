import { getFirestore, Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
  CLAIM_ENABLED,
  MAIL_FROM,
  MAX_ATTEMPTS,
  SEND_ENABLED,
  SMTP_HOST,
  SMTP_PASSWORD,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USERNAME,
} from './config';
import {
  backoffMs,
  claimability,
  errString,
  finish,
  isPermanent,
  processingDelivery,
  type Delivery,
} from './delivery';
import { send, type SmtpConfig } from './mailer';
import { render } from './templates';
import { validate } from './validate';

function smtpConfig(): SmtpConfig {
  return {
    host: SMTP_HOST.value(),
    port: SMTP_PORT.value(),
    secure: SMTP_SECURE.value(),
    user: SMTP_USERNAME.value(),
    pass: SMTP_PASSWORD.value(),
    from: MAIL_FROM.value(),
    dryRun: !SEND_ENABLED.value(),
  };
}

interface Claimed {
  delivery: Delivery;
  data: Record<string, unknown>;
}

/**
 * Atomically move the document into PROCESSING, or return null if it is
 * terminal or another instance holds a live lease.
 *
 * Re-reads inside the transaction rather than trusting the trigger payload,
 * which can be seconds stale by the time we get here.
 */
async function claim(ref: DocumentReference): Promise<Claimed | null> {
  return getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;

    const data = snap.data() as Record<string, unknown>;
    const nowMs = Date.now();
    if (claimability(data.delivery, nowMs) === 'skip') return null;

    const prev = (data.delivery ?? undefined) as Partial<Delivery> | undefined;
    const delivery = processingDelivery(prev, nowMs);

    if (delivery.attempts > MAX_ATTEMPTS) {
      tx.update(ref, {
        delivery: {
          ...delivery,
          state: 'ERROR',
          attempts: MAX_ATTEMPTS,
          endTime: Timestamp.fromMillis(nowMs),
          leaseExpireTime: null,
          error: `Gave up after ${MAX_ATTEMPTS} attempts`,
        },
      });
      return null;
    }

    tx.update(ref, { delivery });
    return { delivery, data };
  });
}

/** Idempotent worker for a single mail document. Never throws. */
export async function processMail(ref: DocumentReference, source: string): Promise<void> {
  if (!CLAIM_ENABLED.value()) {
    logger.info('claim disabled; observing only', { id: ref.id, source });
    return;
  }

  const claimed = await claim(ref);
  if (!claimed) return; // terminal, or someone else holds the lease

  const { delivery, data } = claimed;
  logger.info('claimed', { id: ref.id, source, attempt: delivery.attempts });

  try {
    const mail = validate(data);
    const { subject, html } = await render(mail.templateName, mail.data);
    const info = await send(smtpConfig(), {
      to: mail.to,
      cc: mail.cc,
      bcc: mail.bcc,
      subject,
      html,
    });

    await finish(ref, delivery, { state: 'SUCCESS', info });
    logger.info('sent', {
      id: ref.id,
      template: mail.templateName,
      accepted: info.accepted.length,
      rejected: info.rejected.length,
      messageId: info.messageId,
    });
  } catch (err) {
    const message = errString(err);
    const permanent = isPermanent(err);
    const exhausted = delivery.attempts >= MAX_ATTEMPTS;

    if (permanent || exhausted) {
      const reason = permanent
        ? message
        : `Gave up after ${delivery.attempts} attempts: ${message}`;
      await finish(ref, delivery, { state: 'ERROR', error: reason });
      logger.error('permanent failure', {
        id: ref.id,
        attempt: delivery.attempts,
        error: reason,
      });
    } else {
      const notBeforeMs = Date.now() + backoffMs(delivery.attempts);
      await finish(ref, delivery, { state: 'RETRY', error: message, notBeforeMs });
      logger.warn('transient failure; will retry', {
        id: ref.id,
        attempt: delivery.attempts,
        retryAt: new Date(notBeforeMs).toISOString(),
        error: message,
      });
    }
  }
}
