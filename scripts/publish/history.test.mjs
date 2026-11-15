import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { verifyNewRoot } from './history.mjs';

function isolated(t) {
  const root = mkdtempSync(join(tmpdir(), 'new-root-boundary-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (args, input) => execFileSync('git', args, { cwd: root, input, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
  git(['init', '-q', '--initial-branch=main']);
  writeFileSync(join(root, 'source.txt'), 'synthetic public source'); git(['add', '.']);
  const commit = () => git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'source']);
  commit(); return { root, git, commit };
}
test('new-root acceptance checks all refs, old parents, remotes, reflogs and unreachable objects independently of HEAD content', t => {
  const clean = isolated(t);
  assert.equal(verifyNewRoot(clean.root).reachableCommits, 1);
  for (const mutate of [
    c => c.git(['tag', 'retained-tag']),
    c => c.git(['branch', 'retained-branch']),
    c => c.git(['remote', 'add', 'origin', 'https://fixture.invalid/source']),
    c => { writeFileSync(join(c.root, 'source.txt'), 'new synthetic public source'); c.git(['add', '.']); c.commit(); },
    c => { const first = c.git(['rev-parse', 'HEAD']); writeFileSync(join(c.root, 'source.txt'), 'discarded synthetic revision'); c.git(['add', '.']); c.commit(); c.git(['reset', '--hard', first]); },
    c => c.git(['hash-object', '-w', '--stdin'], 'synthetic historical bytes'),
    c => { writeFileSync(join(c.root, '.git/shallow'), c.git(['rev-parse', 'HEAD']) + '\n'); },
  ]) {
    const c = isolated(t); mutate(c);
    assert.throws(() => verifyNewRoot(c.root), /New-root/);
  }
});
