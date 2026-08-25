/**
 * One-off requeue of stuck mail documents.
 *
 * This never sends mail itself: it only writes delivery {state:'PENDING',
 * attempts:0}, which the sendMailOnWrite trigger then picks up. That keeps
 * exactly one send path in the system.
 *
 *   node lib/tools/backfill.js --dry-run
 *   node lib/tools/backfill.js --mode=send --state=missing
 *   node lib/tools/backfill.js --mode=send --state=ERROR --since=2026-08-20
 *
 * --state   missing (default) | PENDING | PROCESSING | RETRY | SUCCESS | ERROR
 * --since / --before  ISO dates, compared against the document's createTime
 * --limit   cap the number of documents touched
 * --yes     skip the interactive confirmation
 */
import { FieldPath, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { arg, confirm, db, flag } from './adminApp';

const COLLECTION = 'mail';
const PAGE = 500;

interface Row {
  ref: FirebaseFirestore.DocumentReference;
  id: string;
  createTime: string;
  state: string;
  template: string;
  to: string;
}

async function main(): Promise<void> {
  const firestore = db();

  const mode = arg('mode') ?? 'dry-run';
  const wantState = (arg('state') ?? 'missing').toUpperCase();
  const since = arg('since') ? Date.parse(arg('since') as string) : undefined;
  const before = arg('before') ? Date.parse(arg('before') as string) : undefined;
  const limit = arg('limit') ? Number(arg('limit')) : Infinity;
  const dryRun = mode === 'dry-run' || flag('dry-run');

  if (!['dry-run', 'send'].includes(mode)) {
    throw new Error(`unknown --mode=${mode} (expected dry-run or send)`);
  }

  const rows: Row[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  let scanned = 0;

  outer: for (;;) {
    let q = firestore
      .collection(COLLECTION)
      .select('delivery', 'to', 'template')
      .orderBy(FieldPath.documentId())
      .limit(PAGE);
    if (cursor) q = q.startAfter(cursor);

    const snap = await q.get();
    if (snap.empty) break;
    scanned += snap.size;

    for (const d of snap.docs) {
      const delivery = d.get('delivery') as { state?: string } | undefined;
      const state = delivery === undefined ? 'MISSING' : (delivery.state ?? 'UNKNOWN');
      if (state !== wantState) continue;

      const created = d.createTime.toMillis();
      if (since !== undefined && created < since) continue;
      if (before !== undefined && created >= before) continue;

      rows.push({
        ref: d.ref,
        id: d.id,
        createTime: d.createTime.toDate().toISOString().slice(0, 19),
        state,
        template: String(d.get('template.name') ?? '?'),
        to: String(d.get('to') ?? '?'),
      });
      if (rows.length >= limit) break outer;
    }

    if (snap.size < PAGE) break;
    cursor = snap.docs[snap.size - 1];
  }

  rows.sort((a, b) => a.createTime.localeCompare(b.createTime));

  console.log(`scanned ${scanned} documents, matched ${rows.length} with state=${wantState}\n`);
  for (const r of rows) {
    console.log(
      `${r.createTime} | ${r.state.padEnd(10)} | ${r.template.padEnd(15)} | ${r.to.padEnd(28)} | ${r.id}`,
    );
  }

  if (dryRun) {
    console.log('\n(dry run - nothing written; pass --mode=send to requeue)');
    return;
  }
  if (rows.length === 0) {
    console.log('\nnothing to do');
    return;
  }

  if (!(await confirm(`\nRequeue ${rows.length} document(s) for sending?`))) {
    console.log('aborted');
    process.exitCode = 1;
    return;
  }

  let written = 0;
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const batch = firestore.batch();
    for (const r of chunk) {
      batch.update(r.ref, { delivery: { state: 'PENDING', attempts: 0 } });
    }
    await batch.commit();
    written += chunk.length;
    console.log(`requeued ${written}/${rows.length}`);
  }

  console.log('\nDone. sendMailOnWrite will pick these up within seconds.');
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
