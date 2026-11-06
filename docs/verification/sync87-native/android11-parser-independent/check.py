"""Host-only independent parser/call-boundary checks; every subprocess mocked."""
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
from unittest.mock import patch

root = Path.cwd()
spec = importlib.util.spec_from_file_location('review_guard', root / 'scripts/debug/sync87-native/guard.py')
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)
checks = []


def check(name, value):
    assert value, name
    checks.append(name)


def refused(name, fn):
    try:
        fn()
    except g.Refused:
        checks.append(name)
    else:
        raise AssertionError(name)


with patch.object(g.subprocess, 'run', side_effect=AssertionError('real subprocess forbidden')):
    for text in ['Success', 'Performing Streamed Install\nSuccess']:
        check('successful install format ' + repr(text), g.install_result(text) == text)
    for text in ['', 'Failure [INSTALL_FAILED_INVALID_APK]', 'Success\nFailure [FAILED]',
                 'Performing Streamed Install\nWarning\nSuccess', 'Success\nextra',
                 'extra\nSuccess', 'Performing Streamed Install\nFailure', 'success', 'Success ', None, b'Success']:
        refused('reject install output ' + repr(text), lambda text=text: g.install_result(text))
    valid = [
        'package:/data/app/~~Hay4zLfJ9o5yX9tiZ5p-PA==/com.local.notesclone-EYHwC0h5qTQ0Ks66x7YpZQ==/base.apk',
        'package:/data/app/com.local.notesclone-token/base.apk',
    ]
    for text in valid:
        check('accept installed path ' + text, g.installed_apk_path(text) == text[len('package:'):])
    for text in [
        'package:/data/app/~~token/other.pkg-token/base.apk',
        'package:/data/app/~~token/comXlocalXnotesclone-token/base.apk',
        'package:/data/app/~~token/com.local.notesclone2-token/base.apk',
        'package:/data/app/~~token/com.local.notesclone-token/split_config.apk',
        'package:/data/app/~~token/com.local.notesclone-token/sub/base.apk',
        'package:/data/app/~~a/~~b/com.local.notesclone-token/base.apk',
        'package:/data/app/~~/com.local.notesclone-token/base.apk',
        'package:/data/app/~~token/com.local.notesclone-/base.apk',
        'package:/data/app/~~token/com.local.notesclone-token/../base.apk',
        'package:/data/app/~~token/../com.local.notesclone-token/base.apk',
        'package:/data/app/~~%2e%2e/com.local.notesclone-token/base.apk',
        'package:/data/app/a/b/com.local.notesclone-token/base.apk',
        valid[0] + '\n' + valid[1], valid[0] + ';id', valid[0] + '/extra',
        valid[0] + '\n', 'prefix' + valid[0], '', None,
    ]:
        refused('reject installed path ' + repr(text), lambda text=text: g.installed_apk_path(text))

# Exercise the real main -> adb -> run chain with a mocked subprocess and
# prevalidated synthetic receipt. Ownership and receipt are independent of this
# parser change and remain covered by the original host guard suite.
payload = b'owned synthetic installed APK bytes, not an actual APK'
reviewed = {'apk': '/private/tmp/reviewed.apk', 'sha256': hashlib.sha256(payload).hexdigest(),
            'sourceCommit': 'a' * 40, 'buildLabel': 'Android17'}


def invoke(operation, responses):
    calls = []
    def fake(argv, **kwargs):
        assert argv[:3] == [g.ADB, '-s', g.SERIAL]
        tail = argv[3:]
        calls.append(tail)
        assert responses, 'unexpected extra subprocess'
        expected, code, stdout = responses.pop(0)
        assert tail == expected, (tail, expected)
        return subprocess.CompletedProcess(argv, code, stdout, b'synthetic stderr' if code else b'')
    args = ['guard.py', '--serial', g.SERIAL, '--avd', g.AVD, operation, '--receipt', '/private/tmp/synthetic-receipt.json']
    with patch.object(g, 'ownership', return_value={'status': 'ready'}), patch.object(g, 'receipt', return_value=reviewed), patch.object(g.subprocess, 'run', side_effect=fake), patch.object(sys, 'argv', args), contextlib.redirect_stdout(io.StringIO()) as output:
        g.main()
    assert not responses
    return json.loads(output.getvalue()), calls


install = ['install', '-r', reviewed['apk']]
for stdout in [b'Success\n', b'Performing Streamed Install\nSuccess\n']:
    result, calls = invoke('install', [(install, 0, stdout)])
    check('main accepts normalized real successful stdout ' + repr(stdout), result['result']['installed'] is True and len(calls) == 1)
for code, stdout in [(1, b'Success\n'), (2, b'Performing Streamed Install\nSuccess\n'),
                     (0, b'Failure [INSTALL_FAILED]\n'), (0, b'Success\nextra\n')]:
    refused('main installation rejects code/output ' + repr((code, stdout)), lambda code=code, stdout=stdout: invoke('install', [(install, code, stdout)]))
pm = ['shell', 'pm', 'path', g.PACKAGE]
for text in valid:
    apk = text[len('package:'):]
    result, calls = invoke('installed', [(pm, 0, (text + '\n').encode()), (['exec-out', 'cat', apk], 0, payload)])
    check('main validates installed hash after exact parsed path ' + text, result['result']['sha256'] == reviewed['sha256'] and len(calls) == 2)
bad = 'package:/data/app/~~token/other.pkg-token/base.apk'
refused('main foreign package refused before any APK read', lambda: invoke('installed', [(pm, 0, bad.encode())]))
refused('main nonzero pm output refused before APK read', lambda: invoke('installed', [(pm, 1, valid[0].encode())]))
refused('main valid path still rejects installed hash mismatch', lambda: invoke('installed', [(pm, 0, valid[0].encode()), (['exec-out', 'cat', valid[0][len('package:'):]], 0, b'changed')]))
print(json.dumps({'status': 'PASS-HOST-PARSER-BOUNDARY', 'checks': len(checks), 'details': checks,
                  'realSubprocesses': 0, 'deviceOperations': False}, indent=2))
