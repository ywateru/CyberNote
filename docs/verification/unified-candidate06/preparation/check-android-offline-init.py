#!/usr/bin/env python3
"""Python children/temp fixtures only; never runs Gradle, versions or platform builds."""
import ast
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import sys
import tempfile
from unittest.mock import patch
import common as c


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


runner = module('offline_runner', 'run-build.py')
collector = module('offline_collector', 'collect-outputs.py')


def environments():
    root = Path(__file__).resolve().parents[4]
    old = {}
    for stage, run in [('mac', 'mac-smart-u-build09'), ('android', 'android-smart-u-build04')]:
        old[stage] = c.load(root / 'docs/verification/unified-candidate06' / run / 'input-freeze.json')['effectiveBuildEnvironment']
    # Only inspect the pure environment selection; no actual tool/cache availability access.
    with patch.object(Path, 'exists', return_value=True):
        current = {stage: c.effective_environment(stage) for stage in old}
    assert current['mac'] == old['mac'], (current['mac'], old['mac'])
    changed = {k for k in set(old['android']) | set(current['android']) if old['android'].get(k) != current['android'].get(k)}
    assert changed == {'GRADLE_OPTS'}, changed
    assert current['android']['GRADLE_OPTS'] == old['android']['GRADLE_OPTS'] + ' -Dorg.gradle.configuration-cache=false'
    return current, {'macUnchanged': True, 'androidChangedKeys': sorted(changed), 'android': current['android']}


def fixture(environment, mode):
    with tempfile.TemporaryDirectory(prefix='candidate06-offline14-') as tmp:
        root = Path(tmp).resolve()
        run = root / 'docs/verification/unified-candidate06/controlled'; run.mkdir(parents=True)
        cache = root / 'controlled-cache'; cache.mkdir()
        a = dict(schema=1, stage='android', root=str(root), sourceHead='a' * 40,
                 productAggregate='b' * 64, productPaths=['src/a'], inputPaths=['src/a'],
                 runDirectory=str(run), artifactDirectory=str(root / 'artifacts/unified-candidate06/controlled'))
        apk = runner.output_paths(a)[0][1]; apk.parent.mkdir(parents=True); apk.write_bytes(b'old controlled apk')
        dist = root / 'dist'; dist.mkdir(); (dist / 'index.html').write_text('old controlled dist')
        old_inode = apk.stat().st_ino
        before = dict(authorization=a, aggregate='c' * 64, effectiveBuildEnvironment=environment,
                      supplementalInputs={'controlled': True})
        observed = root / 'observed.json'
        # A Python child observes the actual passed environment and init file. It emits
        # explicitly simulated proof, not Gradle execution evidence or a real application.
        code = '''import json,os,pathlib,re,sys
cache,apk,dist,observed,mode=map(str,sys.argv[1:])
init=next((pathlib.Path(cache)/'init.d').glob('candidate06-offline-*.gradle'))
text=init.read_text(); nonce=re.search(r'candidate06-offline-([0-9a-f]{32})',init.name).group(1)
pathlib.Path(observed).write_text(json.dumps({'environment':dict(os.environ),'initText':text,'nonce':nonce}))
pathlib.Path(apk).write_bytes(b'new controlled apk')
pathlib.Path(dist).mkdir(); (pathlib.Path(dist)/'index.html').write_text('new controlled dist')
line='CANDIDATE06_OFFLINE=true workers=2 configurationCacheJvmProperty=false nonce='+nonce
if mode=='missing': line='CONTROLLED NO PROOF'
elif mode=='offline': line=line.replace('OFFLINE=true','OFFLINE=false')
elif mode=='workers': line=line.replace('workers=2','workers=3')
elif mode=='cache-value': line=line.replace('configurationCacheJvmProperty=false','configurationCacheJvmProperty=true')
elif mode=='nonce': line=line.replace(nonce,'0'*32)
elif mode=='cache-reused': line+='\\nConfiguration cache entry reused.'
elif mode=='cache-reusing': line+='\\nReusing configuration cache.'
elif mode=='mixed': line+='\\n'+line.replace('workers=2','workers=8')
print(line,flush=True)
'''
        original_monitor = c.monitored
        calls = []
        def python_only(argv, cwd, env, log, result):
            calls.append({'requestedButNotExecuted': argv, 'actual': [sys.executable, '-B', '-c', '<controlled Python fixture>']})
            return original_monitor([sys.executable, '-B', '-c', code, str(cache), str(apk), str(dist), str(observed), mode],
                                    cwd, env, log, result, deadline=3, poll=.02)
        argv = ['run-build.py', '--authorization', str(root / 'controlled.json'), '--freeze-sha256', 'd' * 64,
                '--attempt', mode, '--exclusive-target-and-cache', '--allow-scoped-gradle-offline-init']
        with patch.object(c, 'authorization', return_value=a), patch.object(c, 'frozen', return_value=before), \
             patch.object(c, 'capture', return_value=before), patch.object(c, 'lock_build', return_value=contextlib.nullcontext()), \
             patch.object(c, 'monitored', side_effect=python_only), patch.object(c, 'CACHE', cache), patch.object(sys, 'argv', argv), \
             contextlib.redirect_stdout(io.StringIO()):
            try:
                runner.main()
            except SystemExit as error:
                exit_code = error.code
        attempt = run / ('android-' + mode); built = c.load(attempt / 'result.json'); seen = c.load(observed)
        assert all(seen['environment'][key] == value for key, value in environment.items())
        assert built['explicitEnvironmentOverrides'] == environment
        text = seen['initText']
        assert text.index('gradle.startParameter.offline = true') < text.index('if (') < text.index('println(')
        assert text.index('gradle.startParameter.maxWorkerCount = 2') < text.index('if (')
        assert '" + gradle.startParameter.offline' in text and '" + gradle.startParameter.maxWorkerCount' in text
        assert text.count('System.getProperty("org.gradle.configuration-cache")') == 2
        assert seen['nonce'] == built['nonce'] and 'nonce=' + built['nonce'] in text
        assert built['ownedGroupStopped'] and not built['remainingOwnedGroupMembers']
        assert built['temporaryGradleInitRemoved'] and not list((cache / 'init.d').iterdir())
        assert (attempt / 'prior-outputs/application').read_bytes() == b'old controlled apk'
        assert (attempt / 'prior-outputs/application').stat().st_ino == old_inode
        assert (attempt / 'prior-outputs/dist/index.html').read_text() == 'old controlled dist'
        expected_good = mode == 'good'
        assert (exit_code == 0) == expected_good, built
        assert bool(c.success(built)) == expected_good, built
        accepted = False
        try:
            collector.validate_built(a, before, 'd' * 64, attempt, built)
            accepted = True
        except RuntimeError:
            pass
        assert accepted == expected_good
        mutations = []
        if expected_good:
            raw = (attempt / 'build.txt').read_text()
            # Keep the successful runner record; collector must independently reject
            # post-run log/environment/proof changes, not just trust success flags.
            for label, changed in [('missing', ''), ('nonce', raw.replace(built['nonce'], '0' * 32)),
                                   ('workers', raw.replace('workers=2', 'workers=9')),
                                   ('offline', raw.replace('OFFLINE=true', 'OFFLINE=false')),
                                   ('cache-value', raw.replace('configurationCacheJvmProperty=false', 'configurationCacheJvmProperty=true')),
                                   ('cache-reused', raw + '\nConfiguration cache entry reused.\n')]:
                (attempt / 'build.txt').write_text(changed)
                try:
                    collector.validate_built(a, before, 'd' * 64, attempt, built)
                except RuntimeError:
                    mutations.append(label)
                else:
                    raise AssertionError('Collector accepted mutated ' + label)
            (attempt / 'build.txt').write_text(raw)
            for label, record in [('proof', {**built, 'androidOfflineProof': {}}),
                                  ('environment', {**built, 'explicitEnvironmentOverrides': {}}),
                                  ('cleanup', {**built, 'temporaryGradleInitRemoved': False})]:
                try:
                    collector.validate_built(a, before, 'd' * 64, attempt, record)
                except RuntimeError:
                    mutations.append(label)
                else:
                    raise AssertionError('Collector accepted mutated ' + label)
        return {'mode': mode, 'runnerExit': exit_code, 'collectorAccepted': accepted,
                'actualChildEnvironmentObserved': True, 'initSetsAssertsThenReadsProperties': True,
                'ownedGroupStopped': True, 'ownedInitRemoved': True, 'oldOutputsPreserved': True,
                'independentCollectorRejections': mutations, 'proofError': built.get('androidOfflineProofError'),
                'calls': calls}


def main():
    output = Path(sys.argv[1])
    if output.exists():
        raise RuntimeError('Refuse overwrite offline14 evidence')
    value = {'scope': 'Python children/temp fixtures only; simulated markers are not Gradle/offline/platform evidence.'}
    try:
        for path in Path(__file__).parent.glob('*.py'):
            ast.parse(path.read_text(), filename=str(path))
        current, value['environments'] = environments()
        cases = ['good', 'missing', 'offline', 'workers', 'cache-value', 'nonce', 'cache-reused', 'cache-reusing', 'mixed']
        value['cases'] = [fixture(current['android'], mode) for mode in cases]
        bad = {**current['android'], 'GRADLE_OPTS': '-Dorg.gradle.daemon=false'}
        value['startupEnvironmentRejected'] = fixture(bad, 'environment')
        value['status'] = 'pass'
    except BaseException as error:
        value['status'] = 'fail'; value['error'] = repr(error)
        raise
    finally:
        c.record_new(output, value)
    print(json.dumps({'status': value['status'], 'runnerCases': len(cases) + 1,
                      'collectorMutationRejections': len(value['cases'][0]['independentCollectorRejections'])}))


if __name__ == '__main__':
    main()
