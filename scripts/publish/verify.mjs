import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planExport, digest } from './export.mjs';

// Intended for the NEW source-only repository, not the private development tree.
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const plan = planExport(root);
const actual = [...plan.tree.entries.keys()].sort(), expected = [...plan.files.keys()].sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error('Checkout is not the exact sanitized source tree; do not run release jobs here');
for (const [name, bytes] of plan.files) {
  if (digest(readFileSync(resolve(root, name))) !== digest(bytes)) throw Error(`Checkout differs from approved export: ${name}`);
}
console.log(JSON.stringify({ ok: true, files: expected.length, sourceRevision: plan.tree.commit }));
