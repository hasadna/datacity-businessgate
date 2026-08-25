/**
 * Push the repo's plain-text template copies into the Firestore `templates`
 * collection. Format of each file is: line 1 = subject, blank line(s), then the
 * HTML body.
 *
 *   node lib/tools/sync-templates.js --dry-run
 *   node lib/tools/sync-templates.js --yes
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { arg, confirm, db, flag } from './adminApp';

const REPO_ROOT = join(__dirname, '..', '..', '..');

const FILES: Record<string, string> = {
  crm: 'email_template_crm',
  'crm-open': 'email_template_initial',
  'direct-question': 'email_template_direct',
};

function parse(raw: string): { subject: string; html: string } {
  const lines = raw.split('\n');
  const subject = (lines[0] ?? '').trim();
  const html = lines.slice(1).join('\n').trim();
  if (!subject) throw new Error('first line (subject) is empty');
  if (!html) throw new Error('body is empty');
  return { subject, html };
}

async function main(): Promise<void> {
  const firestore = db();
  const dryRun = flag('dry-run') || arg('mode') === 'dry-run';

  const parsed = Object.entries(FILES).map(([name, file]) => {
    const path = join(REPO_ROOT, file);
    const { subject, html } = parse(readFileSync(path, 'utf8'));
    return { name, file, subject, html };
  });

  for (const t of parsed) {
    const snap = await firestore.collection('templates').doc(t.name).get();
    const live = snap.data() as { subject?: string; html?: string } | undefined;
    const same = live?.subject === t.subject && live?.html === t.html;
    console.log(
      `${t.name.padEnd(16)} <- ${t.file.padEnd(24)} ${
        !snap.exists ? 'NEW' : same ? 'unchanged' : 'DIFFERS'
      }`,
    );
    if (!same) console.log(`   subject: ${t.subject.slice(0, 100)}`);
  }

  if (dryRun) {
    console.log('\n(dry run - nothing written)');
    return;
  }
  if (!(await confirm('\nWrite these templates to Firestore?'))) {
    console.log('aborted');
    process.exitCode = 1;
    return;
  }

  for (const t of parsed) {
    await firestore
      .collection('templates')
      .doc(t.name)
      .set({ subject: t.subject, html: t.html }, { merge: true });
    console.log(`wrote templates/${t.name}`);
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
