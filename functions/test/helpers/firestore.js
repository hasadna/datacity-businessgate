'use strict';
/**
 * Firestore access for the integration tests. Requires the emulator, which
 * `npm run test:integration` starts via `firebase emulators:exec`.
 *
 * The integration files share one emulator database and one SMTP port, so they
 * are run with --test-concurrency=1. Adding a new integration file that assumes
 * parallelism will flake.
 */
require('./env');

const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const PROJECT_ID = 'businessgate-test';

function db() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST is not set - run these through `npm run test:integration`, ' +
        'never against a real project.',
    );
  }
  if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
  return getFirestore();
}

/** The three templates as they exist in the production `templates` collection. */
async function seedTemplates() {
  const firestore = db();
  await firestore.collection('templates').doc('crm').set({
    subject: 'סיכום השיחה שלנו על פתיחת {{business_kind}} באיזור {{location}}',
    html:
      "<html><body style='direction:rtl'>הי!<br/>" +
      "<a href='{{self_link}}'>{{self_link}}</a>" +
      '{{#each stack_modules}}<b>{{module}}:</b>' +
      '<ul>{{#each stacks}}<li>{{this}}</li>{{/each}}</ul>{{/each}}' +
      '{{#if email_address}}<p>{{email_address}}</p>{{/if}}' +
      '</body></html>',
  });
  await firestore.collection('templates').doc('crm-open').set({
    subject: 'פתיחת שיחה על {{business_kind}} באיזור {{location}}',
    html: "<html><body style='direction:rtl'>{{business_kind}} / {{location}}</body></html>",
  });
  await firestore.collection('templates').doc('direct-question').set({
    subject: 'פניה ל{{job_title}}',
    html: '<html><body>{{#each questions}}<li>{{this}}</li>{{/each}}</body></html>',
  });
}

async function clearMail() {
  const firestore = db();
  const snap = await firestore.collection('mail').get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

/** A well-formed mail document, matching what backend.service.ts writes. */
function mailDoc(overrides = {}) {
  return {
    to: 'arielagc@br7.org.il',
    cc: ['arielagc@br7.org.il', 'rsv@br7.org.il'],
    bcc: 'emri@hasadna.org.il',
    template: {
      name: 'crm',
      data: {
        self_link: 'https://br7biz.org.il/r/TEST',
        business_kind: 'מכון כושר',
        location: 'מרכז חן',
        phone_number: '',
        email_address: '',
        questions: [],
        stack_modules: [{ module: 'ארנונה', stacks: ['מה כדאי לדעת?'] }],
      },
    },
    delivery: { state: 'PENDING', attempts: 0 },
    ...overrides,
  };
}

module.exports = { db, seedTemplates, clearMail, mailDoc, PROJECT_ID };
