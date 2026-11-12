import { execFileSync } from 'node:child_process';
import { lstatSync, existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

export function verifyNewRoot(root) {
  const git = args => {
    try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
    catch { throw Error('New-root Git validation failed'); }
  };
  const control = join(root, '.git');
  if (!lstatSync(control).isDirectory() || lstatSync(control).isSymbolicLink() || realpathSync(git(['rev-parse', '--show-toplevel'])) !== realpathSync(root)) throw Error('New-root acceptance requires an independent Git directory');
  if (existsSync(join(control, 'objects/info/alternates')) || ['GIT_DIR', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES'].some(k => process.env[k]) || git(['rev-parse', '--is-shallow-repository']) !== 'false' || git(['remote'])) throw Error('New-root acceptance forbids alternates, shallow history and remotes');
  const head = git(['rev-parse', 'HEAD']);
  if (git(['symbolic-ref', 'HEAD']) !== 'refs/heads/main' || git(['for-each-ref', '--format=%(refname) %(objectname)']) !== `refs/heads/main ${head}` || git(['rev-list', '--all', '--count']) !== '1' || git(['rev-list', '--parents', '-n', '1', 'HEAD']) !== head) throw Error('New-root acceptance requires exactly one root commit and one main ref');
  const logs = git(['rev-list', '--reflog', '--all']).split('\n').filter(Boolean);
  if (logs.some(oid => oid !== head) || git(['fsck', '--full', '--unreachable', '--no-reflogs', '--no-progress'])) throw Error('New-root acceptance found retained historical objects or reflog entries');
  return { rootCommit: head, reachableCommits: 1, refs: 1, remotes: 0, retainedHistoricalObjects: false };
}
