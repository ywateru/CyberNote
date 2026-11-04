#!/usr/bin/env python3
"""Future authorized candidate06 offline build. Never invoked by preparation checks."""
import argparse
import hashlib
import os
from pathlib import Path
import re
import stat
import uuid
import common as c

COMMANDS = {'mac': ['pnpm', 'mac:build'], 'android': ['pnpm', 'android:build', '--debug']}


def output_paths(a):
    root = Path(a['root'])
    final = root / ('src-tauri/target/release/bundle/macos/备忘录.app' if a['stage'] == 'mac'
                    else 'src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk')
    return [('application', final, 'directory' if a['stage'] == 'mac' else 'file'),
            ('dist', root / 'dist', 'directory')]


def output_snapshot(path, kind):
    """Never follow an output root/ancestor or an external bundle symlink."""
    for parent in [path, *path.parents]:
        if parent.is_symlink():
            raise RuntimeError('Output or ancestor symlink rejected: ' + str(parent))
    if not os.path.lexists(path):
        return None
    info = path.lstat()
    if ((kind == 'directory' and not stat.S_ISDIR(info.st_mode))
            or (kind == 'file' and not stat.S_ISREG(info.st_mode))):
        raise RuntimeError('Unexpected final output type: ' + str(path))
    payload = {'kind': kind, 'device': info.st_dev, 'inode': info.st_ino, 'mode': info.st_mode & 0o777}
    if kind == 'directory':
        payload['directories'] = []
        for p in path.rglob('*'):
            if p.is_symlink():
                target = p.resolve(strict=True)
                if path not in target.parents:
                    raise RuntimeError('External output symlink rejected: ' + str(p))
            elif p.is_dir():
                payload['directories'].append({'path': str(p.relative_to(path)), 'mode': p.stat().st_mode & 0o777})
            elif not p.is_file():
                raise RuntimeError('Special file in final output rejected: ' + str(p))
        payload['directories'].sort(key=lambda row: row['path'])
        payload['files'] = c.tree(path)
    else:
        payload.update(bytes=info.st_size, sha256=c.sha_file(path))
    return payload


def isolate_outputs(a, attempt, result):
    """Root-selected provenance gate: rename final outputs only; never clean caches."""
    prior = attempt / 'prior-outputs'
    prior.mkdir(exist_ok=False)
    proof = {'policy': 'atomic-rename-final-output-and-dist', 'sourcePathsAbsentBeforeCommand': False, 'outputs': []}
    result['outputIsolation'] = proof
    # Validate every path/type/device before moving either output.
    for name, source, kind in output_paths(a):
        snapshot = output_snapshot(source, kind)
        if snapshot is not None and source.stat().st_dev != prior.stat().st_dev:
            raise RuntimeError('Atomic output preservation requires the same filesystem')
        proof['outputs'].append({'name': name, 'source': str(source), 'preserved': str(prior / name),
                                 'kind': kind, 'before': snapshot})
    for row in proof['outputs']:
        source, preserved = Path(row['source']), Path(row['preserved'])
        c.check_space(attempt)
        if output_snapshot(source, row['kind']) != row['before']:
            raise RuntimeError('Output changed before atomic preservation')
        if row['before'] is not None:
            source.rename(preserved)
            if output_snapshot(preserved, row['kind']) != row['before']:
                raise RuntimeError('Preserved prior output identity mismatch')
        if os.path.lexists(source):
            raise RuntimeError('Final source output still present before command')
    proof['sourcePathsAbsentBeforeCommand'] = True
    c.write_new(attempt / 'output-isolation.json', proof)


def generated_outputs(a, attempt, isolation):
    expected = output_paths(a)
    if isolation.get('policy') != 'atomic-rename-final-output-and-dist' or isolation.get('sourcePathsAbsentBeforeCommand') is not True or len(isolation.get('outputs', [])) != len(expected):
        raise RuntimeError('Missing exact output-isolation proof')
    generated = []
    for (name, source, kind), row in zip(expected, isolation['outputs']):
        preserved = attempt / 'prior-outputs' / name
        if any(row.get(k) != v for k, v in {'name': name, 'source': str(source), 'preserved': str(preserved), 'kind': kind}.items()):
            raise RuntimeError('Output-isolation proof belongs to different fixed paths')
        if output_snapshot(preserved, kind) != row['before']:
            raise RuntimeError('Prior preserved output changed or missing')
        fresh = output_snapshot(source, kind)
        if fresh is None:
            raise RuntimeError('Command did not generate required fresh output: ' + str(source))
        generated.append({'source': str(source), 'snapshot': fresh})
    return generated


def output_identity(a):
    root = Path(a['root'])
    if a['stage'] == 'mac':
        path = root / 'src-tauri/target/release/bundle/macos/备忘录.app'
        return {'path': str(path), 'bundleFiles': c.tree(path)}
    return c.identity(root / 'src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--authorization', type=Path, required=True)
    p.add_argument('--freeze-sha256', required=True)
    p.add_argument('--attempt', required=True)
    p.add_argument('--exclusive-target-and-cache', action='store_true', required=True,
                   help='root confirms no other operator uses shared target or Gradle cache')
    p.add_argument('--allow-scoped-gradle-offline-init', action='store_true')
    args = p.parse_args()
    if not re.fullmatch('[A-Za-z0-9_-]+', args.attempt):
        raise ValueError('Unique simple attempt identifier required')
    a = c.authorization(args.authorization)
    before = c.frozen(a, args.freeze_sha256)
    if a['stage'] == 'android' and not args.allow_scoped_gradle_offline_init:
        raise ValueError('Android requires explicit permission for scoped offline init')
    run = Path(a['runDirectory'])
    c.check_space(run)
    attempt = run / (a['stage'] + '-' + args.attempt)
    attempt.mkdir(exist_ok=False)
    result = {'schema': 1, 'startedAt': c.now(), 'stage': a['stage'], 'expectedHead': a['sourceHead'],
              'productAggregate': a['productAggregate'], 'sourceAggregate': before['aggregate'],
              'freezeSha256': args.freeze_sha256, 'attempt': str(attempt), 'nonce': uuid.uuid4().hex,
              'command': COMMANDS[a['stage']], 'exitCode': None}
    init = None
    owned = None
    try:
        with c.lock_build():
            current = c.capture(a)
            c.write_new(attempt / 'inputs-before.json', current)
            checks = c.same_inputs(before, current)
            if not all(checks.values()):
                raise RuntimeError('Frozen inputs/environment changed: ' + repr(checks))
            env = os.environ.copy()
            env.update(before['effectiveBuildEnvironment'])
            result['explicitEnvironmentOverrides'] = before['effectiveBuildEnvironment']
            try:
                isolate_outputs(a, attempt, result)
                if a['stage'] == 'android':
                    init = c.CACHE / 'init.d' / ('candidate06-offline-' + result['nonce'] + '.gradle')
                    init.parent.mkdir(exist_ok=True)
                    c.check_space(init.parent)
                    text = 'gradle.startParameter.offline = true\ngradle.startParameter.maxWorkerCount = 2\nprintln("CANDIDATE06_OFFLINE=" + gradle.startParameter.offline)\n'
                    with init.open('x') as stream:
                        created = os.fstat(stream.fileno())
                        owned = {'path': str(init), 'device': created.st_dev, 'inode': created.st_ino,
                                 'bytes': len(text.encode()), 'sha256': hashlib.sha256(text.encode()).hexdigest()}
                        stream.write(text)
                    result['temporaryGradleInit'] = owned
                c.monitored(result['command'], Path(a['root']), env, attempt / 'build.txt', result)
            except BaseException as error:
                result['error'] = repr(error)
            finally:
                # Cleanup stays under the shared lock; never expose init to a second build.
                if owned is not None and ('ownedProcessGroup' not in result or result.get('ownedGroupStopped') is True):
                    result.update(c.cleanup_owned_init(init, owned))
                elif owned is not None:
                    result['cleanupError'] = 'Owned group cleanup unconfirmed; preserve offline init'
            if a['stage'] == 'android' and (not (attempt / 'build.txt').exists() or 'CANDIDATE06_OFFLINE=true' not in (attempt / 'build.txt').read_text(errors='replace')):
                result['offlineMarkerMissing'] = True
            after = c.capture(a)
            c.write_new(attempt / 'inputs-after.json', after)
            result['inputComparisons'] = c.same_inputs(before, after)
            result['supplementalInputsUnchanged'] = before['supplementalInputs'] == after['supplementalInputs']
            if not all(result['inputComparisons'].values()):
                result['invalidated'] = 'Frozen inputs/environment changed; failed evidence retained'
            if result.get('exitCode') == 0:
                result['generatedOutputs'] = generated_outputs(a, attempt, result.get('outputIsolation', {}))
                c.write_new(attempt / 'generated-outputs.json', result['generatedOutputs'])
                result['buildOutputIdentity'] = output_identity(a)
                result['dist'] = c.tree(Path(a['root']) / 'dist')
            c.check_space(run)
    except BaseException as error:
        result.setdefault('error', repr(error))
    finally:
        result['endedAt'] = c.now()
        c.record_new(attempt / 'result.json', result)
    print({k: v for k, v in result.items() if k not in ['buildOutputIdentity', 'dist']})
    raise SystemExit(0 if c.success(result) else 1)


if __name__ == '__main__':
    main()
