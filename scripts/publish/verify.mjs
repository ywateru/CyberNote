import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planExport, digest } from './export.mjs';
import { verifyNewRoot } from './history.mjs';

// Content checks run in CI. --new-root is a separate, stricter pre-publication
// acceptance for the independent initial import, before adding a remote.
const args = process.argv.slice(2);
if (args.length && (args.length !== 1 || args[0] !== '--new-root')) throw Error('Usage: verify.mjs [--new-root]');
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const history = args.length ? verifyNewRoot(root) : null;
const plan = planExport(root);
const actual = [...plan.tree.entries.keys()].sort(), expected = [...plan.files.keys()].sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error('Checkout is not the exact sanitized source tree; do not run release jobs here');
for (const [name, bytes] of plan.files) {
  if (digest(readFileSync(resolve(root, name))) !== digest(bytes)) throw Error(`Checkout differs from approved export: ${name}`);
}
console.log(JSON.stringify({ ok: true, files: expected.length, sourceRevision: plan.tree.commit, historyChecked: !!history, history }));
