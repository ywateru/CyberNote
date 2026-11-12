import { writeFileSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';
import { sourceIdentity, projectRoot, productFiles } from '../build-info.mjs';

// Run only in a trusted Git checkout, BEFORE omitting .git from a source archive.
// The destination must be outside product inputs; transport this file as trusted
// build metadata, never accept a revision/fingerprint from an end-user request.
const [flag, output] = process.argv.slice(2);
if (flag !== '--out' || !output || !isAbsolute(output) || process.argv.length !== 4) throw Error('Usage: node scripts/publish/deploy-metadata.mjs --out ABS_PATH_OUTSIDE_SOURCE');
if (output === projectRoot || output.startsWith(projectRoot + sep)) throw Error('Metadata must be outside source checkout');
const identity = sourceIdentity(projectRoot, { metadataPath: null });
if (identity.sourceDirty) throw Error('Trusted deployment metadata requires a clean committed checkout');
if (productFiles().includes(output)) throw Error('Metadata cannot be a product input');
writeFileSync(resolve(output), JSON.stringify({ schema: 1, provenance: 'trusted-checkout', ...identity }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
