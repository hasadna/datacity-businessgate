import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * firebase-functions params resolve from process.env, and their declared
 * defaults only apply inside the functions runtime - outside it, .value()
 * returns empty. The CLI tools therefore have to load functions/.env
 * themselves, so they see exactly the configuration the deployed function sees.
 * Real environment variables win, which is what makes the emulator overrides in
 * .env.local work.
 */
export function loadEnv(): void {
  for (const file of ['.env', '.env.local']) {
    const path = join(__dirname, '..', '..', file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (process.env[key] === undefined) process.env[key] = trimmed.slice(eq + 1).trim();
    }
  }
}

/**
 * Shared bootstrap for the local CLI tools in this directory. These run on a
 * developer machine against production, using Application Default Credentials:
 *
 *   gcloud auth application-default login
 *   export GOOGLE_CLOUD_PROJECT=businessgate-beersheva
 *
 * Set FIRESTORE_EMULATOR_HOST to point them at the emulator instead.
 */
export function db(): Firestore {
  loadEnv();

  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.GCLOUD_PROJECT ??
    'businessgate-beersheva';

  initializeApp(
    process.env.FIRESTORE_EMULATOR_HOST
      ? { projectId }
      : { projectId, credential: applicationDefault() },
  );

  const target = process.env.FIRESTORE_EMULATOR_HOST ?? 'PRODUCTION';
  console.error(`[tools] project=${projectId} firestore=${target}`);
  return getFirestore();
}

export function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (hit === undefined) return undefined;
  const eq = hit.indexOf('=');
  return eq === -1 ? '' : hit.slice(eq + 1);
}

export function flag(name: string): boolean {
  return arg(name) !== undefined;
}

export async function confirm(question: string): Promise<boolean> {
  if (flag('yes')) return true;
  process.stderr.write(`${question} [y/N] `);
  const answer = await new Promise<string>((resolve) => {
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (d) => resolve(String(d)));
  });
  return answer.trim().toLowerCase() === 'y';
}
