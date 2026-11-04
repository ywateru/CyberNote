#!/usr/bin/env python3
"""Controlled Python-only safety checks; no platform/version/build command is run."""
import ast
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import common as c

spec = importlib.util.spec_from_file_location('collector', Path(__file__).with_name('collect-outputs.py'))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class Boundaries(unittest.TestCase):
    def test_syntax_without_bytecode(self):
        for p in sorted(Path(__file__).parent.glob('*.py')):
            ast.parse(p.read_text(), filename=str(p))

    def test_explicit_parameters_and_output_boundary(self):
        with tempfile.TemporaryDirectory(prefix='candidate06-check-') as tmp:
            root = Path(tmp).resolve()
            a = dict(schema=1, stage='mac', root=str(root), sourceHead='a'*40,
                     productAggregate='b'*64, productPaths=['src/a'], inputPaths=['src/a'],
                     runDirectory=str(root/'docs/verification/unified-candidate06/run'),
                     artifactDirectory=str(root/'artifacts/unified-candidate06/run'))
            p = root/'authorization.json'; p.write_text(json.dumps(a))
            self.assertEqual(c.authorization(p), a)
            for key, value in [('sourceHead','HEAD'), ('productAggregate','latest'), ('inputPaths',[]),
                               ('runDirectory',str(root/'docs/verification/unified-candidate04/run')),
                               ('artifactDirectory',str(root/'artifacts/old'))]:
                changed = {**a,key:value}; p.write_text(json.dumps(changed))
                with self.assertRaises((ValueError,RuntimeError)):
                    c.authorization(p)

    def test_freeze_bytes_and_no_overwrite(self):
        with tempfile.TemporaryDirectory(prefix='candidate06-check-') as tmp:
            a = {'runDirectory': tmp}
            path=Path(tmp)/'input-freeze.json'
            c.write_new(path, {'authorization': a, 'at':'fixed'})
            digest=c.sha_file(path)
            self.assertEqual(c.frozen(a,digest)['authorization'],a)
            with self.assertRaises(FileExistsError):
                c.write_new(path,{})
            with self.assertRaises(RuntimeError):
                c.frozen(a,'0'*64)
            path.write_text('{}')
            with self.assertRaises(RuntimeError):
                c.frozen(a,digest)

    def test_owned_init_identity_and_replacements(self):
        with tempfile.TemporaryDirectory(prefix='candidate06-check-') as tmp:
            p=Path(tmp)/'owned.gradle'; p.write_text('owned')
            owned=c.inspect_init(p)
            self.assertTrue(c.cleanup_owned_init(p,owned)['temporaryGradleInitRemoved'])
            p.write_text('owned'); owned=c.inspect_init(p)
            p.write_text('foreign bytes')
            self.assertIn('cleanupError',c.cleanup_owned_init(p,owned)); self.assertTrue(p.exists())
            p.unlink(); target=Path(tmp)/'foreign'; target.write_text('owned'); p.symlink_to(target)
            self.assertIn('cleanupError',c.cleanup_owned_init(p,owned)); self.assertTrue(target.exists())

    def test_timeout_only_owned_process_group(self):
        with tempfile.TemporaryDirectory(prefix='candidate06-check-') as tmp:
            unrelated=subprocess.Popen([sys.executable,'-B','-c','import time; time.sleep(20)'], start_new_session=True)
            record={}
            try:
                with self.assertRaises(RuntimeError):
                    c.monitored([sys.executable,'-B','-c','import time; time.sleep(20)'], Path(tmp), os.environ.copy(), Path(tmp)/'log',record,deadline=0.15,poll=0.02)
                self.assertEqual(record['stopReason'],'deadline')
                self.assertIsNotNone(record['exitCode']); self.assertIsNone(unrelated.poll())
                with self.assertRaises(ProcessLookupError):
                    os.killpg(record['ownedProcessGroup'],0)
            finally:
                unrelated.terminate(); unrelated.wait(timeout=5)

    def test_low_space_and_download_guard(self):
        with tempfile.TemporaryDirectory(prefix='candidate06-check-') as tmp:
            calls=[]
            def free(_):
                calls.append(1)
                if len(calls)>1: raise RuntimeError('disk-guard')
                return c.MIN_FREE+1
            record={}
            with self.assertRaises(RuntimeError):
                c.monitored([sys.executable,'-B','-c','import time; time.sleep(20)'],Path(tmp),os.environ.copy(),Path(tmp)/'space',record,free=free,poll=0.02)
            self.assertEqual(record['stopReason'],'disk-guard')
            record={}
            with self.assertRaises(RuntimeError):
                c.monitored([sys.executable,'-B','-c','print("Downloading https://invalid.example",flush=True)'],Path(tmp),os.environ.copy(),Path(tmp)/'download',record,poll=0.02)
            self.assertEqual(record['stopReason'],'download-prompt')

    def test_failed_builds_never_collect(self):
        base=dict(exitCode=0,ownedGroupStopped=True,generatedOutputs=['controlled'],supplementalInputsUnchanged=True,inputComparisons={'files':True})
        self.assertTrue(c.success(base))
        for key in ['error','invalidated','offlineMarkerMissing','cleanupError','stopReason']:
            self.assertFalse(c.success({**base,key:'failure'}))
        self.assertFalse(c.success({**base,'supplementalInputsUnchanged':False}))
        with tempfile.TemporaryDirectory(prefix='candidate06-check-') as tmp:
            a=dict(stage='mac',sourceHead='a'*40,productAggregate='b'*64)
            before={'aggregate':'c'*64,'at':'fixed','files':[]}
            attempt=Path(tmp)
            for name in ['inputs-before.json','inputs-after.json']:
                (attempt/name).write_text(json.dumps(before))
            built={**base,'stage':'mac','expectedHead':a['sourceHead'],'productAggregate':a['productAggregate'],
                   'sourceAggregate':before['aggregate'],'freezeSha256':'d'*64,'attempt':str(attempt),
                   'command':['pnpm','mac:build'],'nonce':'e'*32,'outputIsolation':{'controlled':True}}
            (attempt/'output-isolation.json').write_text(json.dumps(built['outputIsolation']))
            (attempt/'generated-outputs.json').write_text(json.dumps(built['generatedOutputs']))
            # This older case isolates stage/freeze gates; check-review-fixes exercises real provenance.
            with patch.object(collector.runner,'generated_outputs',return_value=built['generatedOutputs']):
                collector.validate_built(a,before,'d'*64,attempt,built)
                for key,value in [('stage','android'),('freezeSha256','0'*64),('expectedHead','f'*40),('nonce',''),('command',['pnpm','dev'])]:
                    with self.assertRaises(RuntimeError):
                        collector.validate_built(a,before,'d'*64,attempt,{**built,key:value})
                (attempt/'inputs-after.json').write_text(json.dumps({**before,'files':['changed']}))
                with self.assertRaises(RuntimeError):
                    collector.validate_built(a,before,'d'*64,attempt,built)


if __name__ == '__main__':
    unittest.main(verbosity=2)
