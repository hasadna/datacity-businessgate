/**
 * Smoke test the mail pipeline.
 *
 * Two modes:
 *
 *   --direct   Render a template and send it straight through nodemailer, with
 *              no Firestore document and no deployed function involved. This is
 *              the fastest way to prove the SMTP configuration (in particular
 *              the STARTTLS fix) and the Handlebars rendering.
 *
 *   (default)  Write one real `mail` document and poll it until the deployed
 *              sendMailOnWrite function reaches a terminal delivery state. This
 *              is the true end-to-end check.
 *
 * Either way the message carries no cc and no bcc, so no staff member is
 * bothered by a test.
 *
 *   node lib/tools/smoke.js --direct --to=someone@example.com
 *   node lib/tools/smoke.js --to=someone@example.com --template=crm
 *
 * Requires SMTP_USERNAME and SMTP_PASSWORD in the environment for --direct.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { arg, db } from './adminApp';

const DEFAULT_TEMPLATE = 'crm';

function sampleData(template: string): Record<string, unknown> {
  const base = {
    self_link: 'https://br7biz.org.il/r/SMOKETEST',
    business_kind: 'בדיקת מערכת (SMOKE TEST)',
    location: 'באר שבע',
    phone_number: '000-0000000',
    email_address: 'smoke-test@example.invalid',
    job_title: 'בדיקת מערכת',
    questions: [] as unknown[],
    stack_modules: [] as unknown[],
  };

  if (template === 'direct-question') {
    return { ...base, questions: ['שאלת בדיקה — אנא התעלמו מהודעה זו.'] };
  }
  return {
    ...base,
    questions: [{ name: 'הערות כלליות', questions: ['הודעת בדיקה — אנא התעלמו ממנה.'] }],
    stack_modules: [{ module: 'בדיקה', stacks: ['כרטיסיית בדיקה'] }],
  };
}

async function direct(to: string, template: string): Promise<void> {
  // render() reads the template out of Firestore, so the admin app has to be up
  // even though nothing is written here.
  const { render } = await import('../templates');
  const { send } = await import('../mailer');
  const {
    MAIL_FROM, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_SECURE, SMTP_USERNAME,
  } = await import('../config');

  const user = SMTP_USERNAME.value();
  const pass = SMTP_PASSWORD.value();
  if (!user || !pass) {
    throw new Error('SMTP_USERNAME and SMTP_PASSWORD must be set in the environment');
  }

  const { subject, html } = await render(template, sampleData(template));
  console.log(`\ntemplate : ${template}`);
  console.log(`subject  : ${subject}`);
  console.log(`html     : ${Buffer.byteLength(html, 'utf8')} bytes\n`);

  const info = await send(
    {
      host: SMTP_HOST.value(),
      port: SMTP_PORT.value(),
      secure: SMTP_SECURE.value(),
      user,
      pass,
      from: MAIL_FROM.value(),
      dryRun: false,
    },
    { to: [to], cc: [], bcc: [], subject, html },
  );

  console.log('delivery info:', JSON.stringify(info, null, 2));
  if (info.rejected.length) throw new Error(`rejected: ${info.rejected.join(', ')}`);
  console.log(`\nSENT to ${to}`);
}

async function viaFirestore(to: string, template: string): Promise<void> {
  const firestore = getFirestore();

  const ref = await firestore.collection('mail').add({
    to,
    template: { name: template, data: sampleData(template) },
    delivery: { state: 'PENDING', attempts: 0 },
  });
  console.log(`wrote mail/${ref.id}; polling for up to 90s...`);

  const deadline = Date.now() + 90_000;
  let last = '';
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const snap = await ref.get();
    const delivery = snap.get('delivery') as { state?: string } | undefined;
    const state = delivery?.state ?? '<none>';
    if (state !== last) {
      console.log(`  ${new Date().toISOString().slice(11, 19)}  ${state}`);
      last = state;
    }
    if (state === 'SUCCESS' || state === 'ERROR') {
      console.log('\n' + JSON.stringify(delivery, null, 2));
      if (state === 'ERROR') process.exitCode = 1;
      return;
    }
  }
  console.log('\nTIMED OUT - no terminal state after 90s');
  process.exitCode = 1;
}

async function main(): Promise<void> {
  const to = arg('to');
  if (!to) throw new Error('--to=<address> is required');
  const template = arg('template') || DEFAULT_TEMPLATE;

  db(); // initialize firebase-admin; both modes read templates from Firestore

  if (arg('direct') !== undefined) {
    await direct(to, template);
  } else {
    await viaFirestore(to, template);
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
