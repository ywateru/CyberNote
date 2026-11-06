#!/usr/bin/env python3
"""Host-only tests. Must not start subprocesses, emulator or ADB."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile
spec=importlib.util.spec_from_file_location('native_guard',Path(__file__).with_name('guard.py'))
g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
class Guards(unittest.TestCase):
 def test_explicit_exact_target(self):g.target('emulator-5584','notes-sync87-isolated')
 def test_old_target_rejected(self):
  for serial,avd in [('emulator-5580',g.AVD),('',g.AVD),(g.SERIAL,'old-avd'),('emulator-5586',g.AVD)]:
   with self.assertRaises(g.Refused):g.target(serial,avd)
 def test_paths(self):
  self.assertEqual(g.device_path('/sdcard/Download/notes-sync87-ab/sync87-ab.png'),'/sdcard/Download/notes-sync87-ab/sync87-ab.png')
  for x in ['/sdcard/foo.png','/sdcard/Download/notes-sync87-ab/../sync87-ab.png','/sdcard/Download/notes-sync87-ab/sync87-ab.png;id','/sdcard/Download/notes-sync87-ab','/data/user/0/com.local.notesclone/a']:
   with self.assertRaises(g.Refused):g.device_path(x)
 def make(self,root):
  apk=root/'reviewed.apk'
  with zipfile.ZipFile(apk,'w') as z:z.writestr('lib/arm64-v8a/libnotes_clone_lib.so',b'synthetic zip entry, not an APK')
  obj=dict(authorizedBy='root-sync87-package-review',apk=str(apk),sha256=hashlib.sha256(apk.read_bytes()).hexdigest(),sourceCommit='a'*40,buildLabel='Android17',package=g.PACKAGE,activity='.MainActivity',entries={'lib/arm64-v8a/libnotes_clone_lib.so':hashlib.sha256(b'synthetic zip entry, not an APK').hexdigest()})
  p=root/'receipt.json';p.write_text(json.dumps(obj));return p,obj
 def test_review_receipt(self):
  with tempfile.TemporaryDirectory() as d:
   p,obj=self.make(Path(d));self.assertEqual(g.receipt(p),obj)
 def test_receipt_strict_rejections(self):
  with tempfile.TemporaryDirectory() as d:
   p,obj=self.make(Path(d))
   invalid=[dict(obj,extra=True),dict(obj,authorizedBy='someone'),dict(obj,buildLabel='Android16'),dict(obj,sourceCommit='short'),dict(obj,sha256='0'*64),dict(obj,package='other'),dict(obj,entries={}),dict(obj,entries={'../foo':'a'*64}),dict(obj,entries={'lib/arm64-v8a/libnotes_clone_lib.so':'0'*64})]
   for value in invalid:
    p.write_text(json.dumps(value))
    with self.assertRaises(g.Refused):g.receipt(p)
 def test_symlink_apk(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);p,obj=self.make(root);link=root/'linked.apk';link.symlink_to(obj['apk']);obj['apk']=str(link);p.write_text(json.dumps(obj))
   with self.assertRaises(g.Refused):g.receipt(p)
 def test_owned_fixture(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);p=root/'sync87-fixture.png';p.write_bytes(b'synthetic');self.assertEqual(g.owned_file(p),p)
   q=root/'real-user.png';q.write_bytes(b'data')
   with self.assertRaises(g.Refused):g.owned_file(q)
 def test_target_fails_before_any_process(self):
  with patch.object(g.subprocess,'run',side_effect=AssertionError('host subprocess forbidden')):
   with self.assertRaises(g.Refused):g.ownership('emulator-5580',g.AVD)
if __name__=='__main__':
 with patch.object(g.subprocess,'run',side_effect=AssertionError('host subprocess forbidden')):
  unittest.main()
