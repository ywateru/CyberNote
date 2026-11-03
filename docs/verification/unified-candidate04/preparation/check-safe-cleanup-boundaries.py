#!/usr/bin/env python3
"""Extract only cleanup/finally/exit AST; never import or execute the build CLI."""
import ast
import datetime
import hashlib
import json
import os
from pathlib import Path
import stat
import tempfile
import types
from unittest import mock

prep = Path(__file__).resolve().parent
source = prep / 'run-build-safe-cleanup.py'
tree = ast.parse(source.read_text(), filename=str(source))
cleanup = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'cleanup_owned_init')
locked = next(n for n in tree.body if isinstance(n, ast.With))
final = locked.body[0].finalbody
exit_value = tree.body[-1].exc.args[0]


def sha_file(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_new(path, value):
    with path.open('x') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write('\n')


base = Path(tempfile.mkdtemp(prefix='notes-candidate04-synthetic-cleanup-', dir='/private/tmp'))
c = types.SimpleNamespace(ROOT=base, sha_file=sha_file, write_new=write_new,
                          now=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())
namespace = {'c': c, 'os': os, 'stat': stat}
exec(compile(ast.Module(body=[cleanup], type_ignores=[]), str(source), 'exec'), namespace)
cases = []
for name in ['owned', 'replaced-inode', 'modified-content', 'replaced-symlink', 'missing', 'unlink-error']:
    directory = base / name
    directory.mkdir()
    path = directory / 'synthetic-init.txt'
    path.write_text('owned synthetic bytes\n')
    initial = path.stat()
    owned = {'path': str(path), 'device': initial.st_dev, 'inode': initial.st_ino,
             'bytes': initial.st_size, 'sha256': sha_file(path)}
    retained_target = None
    if name == 'replaced-inode':
        path.rename(directory / 'original-held.txt')
        path.write_text('owned synthetic bytes\n')
    elif name == 'modified-content':
        path.write_text('other synthetic bytes\n')
    elif name == 'replaced-symlink':
        path.rename(directory / 'original-held.txt')
        retained_target = directory / 'synthetic-link-target.txt'
        retained_target.write_text('retained link target\n')
        path.symlink_to(retained_target)
    elif name == 'missing':
        path.unlink()
    context = {**namespace, 'init_created': True, 'init': path, 'init_owned': owned,
               'attempt': directory, 'result': {'exitCode': 0}}
    body = compile(ast.Module(body=final, type_ignores=[]), str(source), 'exec')
    if name == 'unlink-error':
        with mock.patch.object(Path, 'unlink', side_effect=PermissionError('synthetic unlink denial')):
            exec(body, context)
    else:
        exec(body, context)
    saved = json.loads((directory / 'result.json').read_text())
    exit_code = eval(compile(ast.Expression(body=exit_value), str(source), 'eval'), context)
    exists = path.exists() or path.is_symlink()
    expected_success = name == 'owned'
    assert saved == context['result'], name + ': result not persisted'
    assert exit_code == (0 if expected_success else 1), name + ': wrong exit'
    assert saved['temporaryGradleInitRemoved'] == expected_success, name + ': wrong removal status'
    assert exists == (name not in ['owned', 'missing']), name + ': file retention mismatch'
    if not expected_success:
        assert saved.get('cleanupError') and saved.get('error'), name + ': legacy collection gate not blocked'
    if retained_target is not None:
        assert retained_target.read_text() == 'retained link target\n', name + ': symlink target changed'
    cases.append({'case': name, 'passed': True, 'exitCode': exit_code, 'resultFile': str(directory / 'result.json'),
                  'resultSha256': sha_file(directory / 'result.json'), 'pathRetained': exists,
                  'legacyCaptureBlockedByError': bool(saved.get('error')), 'result': saved})

report = {'at': c.now(), 'scope': 'Only extracted cleanup/finally/exit AST against newly created synthetic files; no CLI import/build/freeze/cache/target/process/device/GUI/download',
          'source': {'path': source.name, 'sha256': sha_file(source)}, 'syntheticDirectory': str(base),
          'cases': cases, 'passed': True, 'limits': 'Filesystem name checks are not atomic conditional unlink; production still requires exclusive cache coordination. OS crash/SIGKILL cannot guarantee finally execution. Result writes require an available writable evidence directory.'}
write_new(prep / 'safe-cleanup-boundary-check.json', report)
print(json.dumps({'cases': len(cases), 'passed': True, 'syntheticDirectory': str(base)}))
