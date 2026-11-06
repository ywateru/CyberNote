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
 def test_actual_android_install_stdout(self):
  for value in ['Success','Performing Streamed Install\nSuccess']:self.assertEqual(g.install_result(value),value)
  for value in ['','Failure [INSTALL_FAILED]','Success\nFailure','Performing Streamed Install\nSuccess\nextra','adb: failed','Success ']:
   with self.assertRaises(g.Refused):g.install_result(value)
 def test_actual_android_package_path(self):
  for value in ['package:/data/app/~~Hay4zLfJ9o5yX9tiZ5p-PA==/com.local.notesclone-EYHwC0h5qTQ0Ks66x7YpZQ==/base.apk','package:/data/app/com.local.notesclone-token/base.apk']:
   self.assertEqual(g.installed_apk_path(value),value[len('package:'):])
  for value in ['','package:/data/app/../base.apk','package:/data/app/~~token/other.pkg-token/base.apk','package:/data/app/~~token/com.local.notesclone-token/split.apk','package:/data/app/~~token/com.local.notesclone-token/base.apk\npackage:/data/app/other/base.apk','package:/data/app/~~token/com.local.notesclone-token/../base.apk','package:/data/app/a/b/com.local.notesclone-token/base.apk','package:/data/app/~~/com.local.notesclone-token/base.apk','package:/data/app/~~token/com.local.notesclone-token/base.apk;id']:
   with self.assertRaises(g.Refused):g.installed_apk_path(value)
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
class RunScopes(unittest.TestCase):
 def setUp(self):
  import uuid
  self.root=Path('/private/tmp/notes-sync87-native-'+uuid.uuid4().hex);self.root.mkdir();self.ident='abcd123456'
  self.state=dict(version=1,serial=g.SERIAL,avd=g.AVD,runId=self.ident,remote='/sdcard/Download/notes-sync87-'+self.ident,notes=[],files=[])
  for ext in ['png','txt','wav']:
   name='sync87-'+self.ident+'.'+ext;payload=('synthetic-'+ext).encode();path=self.root/name;path.write_bytes(payload)
   self.state['files'].append(dict(name=name,path=str(path),remote=self.state['remote']+'/'+name,sha256=hashlib.sha256(payload).hexdigest(),bytes=len(payload)))
  self.path=self.root/'state.json';self.write()
 def tearDown(self):
  import shutil
  self.assertTrue(str(self.root).startswith('/private/tmp/notes-sync87-native-'));shutil.rmtree(self.root)
 def write(self):self.path.write_text(json.dumps(self.state))
 def test_exact_run_scope(self):
  root,state,files=g.run_scope(self.path);self.assertEqual(root,self.root);self.assertEqual(len(files),3)
 def test_wrong_remote_and_identity(self):
  for key,value in [('remote','/sdcard/Download/notes-sync87-other'),('serial','emulator-5580'),('runId','other')]:
   saved=self.state[key];self.state[key]=value;self.write()
   with self.assertRaises(g.Refused):g.run_scope(self.path)
   self.state[key]=saved;self.write()
 def test_changed_fixture(self):
  Path(self.state['files'][0]['path']).write_bytes(b'changed')
  with self.assertRaises(g.Refused):g.run_scope(self.path)
 def test_foreign_fixture_path(self):
  self.state['files'][0]['remote']='/sdcard/Download/notes-sync87-other/sync87-'+self.ident+'.png';self.write()
  with self.assertRaises(g.Refused):g.run_scope(self.path)
 def test_fixture_symlink(self):
  original=Path(self.state['files'][0]['path']);original.unlink();original.symlink_to(self.state['files'][1]['path'])
  with self.assertRaises(g.Refused):g.run_scope(self.path)
 def test_export_derivation(self):
  name=self.state['files'][0]['name'];local,remote,f=g.export_scope(self.path,2,name)
  self.assertEqual(local,self.root/'exports-2');self.assertEqual(remote,self.state['remote']+'/exports-2');self.assertEqual(f['name'],name)
  for index in [0,21,True,None]:
   with self.assertRaises(g.Refused):g.export_scope(self.path,index,name)
  with self.assertRaises(g.Refused):g.export_scope(self.path,1,'sync87-other.png')
 def test_run_state_symlink(self):
  self.path.rename(self.root/'real-state.json');self.path.symlink_to(self.root/'real-state.json')
  with self.assertRaises(g.Refused):g.run_scope(self.path)
 def call_main(self,op,extra,answers):
  import contextlib,io
  calls=[]
  def fake(serial,avd,tail,**kwargs):
   self.assertEqual((serial,avd),(g.SERIAL,g.AVD));calls.append(tail);return answers(tail,kwargs)
  args=['guard.py','--serial',g.SERIAL,'--avd',g.AVD,op,'--run-state',str(self.path),'--export-index','1','--name',self.state['files'][0]['name'],*extra]
  with patch.object(g.sys,'argv',args),patch.object(g,'adb',side_effect=fake),contextlib.redirect_stdout(io.StringIO()):g.main()
  return calls
 def test_prepare_and_verified_pull(self):
  file=self.state['files'][0];local=self.root/'exports-1'/file['name'];remote=self.state['remote']+'/exports-1/'+file['name']
  prepared=self.call_main('prepare-export',[],lambda a,k:'');self.assertEqual(prepared[0],['shell','mkdir',self.state['remote']+'/exports-1'])
  payload=Path(file['path']).read_bytes()
  def answer(args,kwargs):
   if args[:3]==['shell','stat','-c']:return str(len(payload))
   if args[:2]==['exec-out','cat']:self.assertEqual(args[2],remote);return payload
   return ''
  self.call_main('pull',['--path',str(local),'--remote',remote],answer);self.assertEqual(local.read_bytes(),payload)
  with self.assertRaises(g.Refused):self.call_main('pull',['--path',str(local),'--remote',remote],answer)
 def test_pull_foreign_destination_refused_before_adb(self):
  (self.root/'exports-1').mkdir()
  with self.assertRaises(g.Refused):self.call_main('pull',['--path',str(self.root/'outside.png'),'--remote',self.state['remote']+'/exports-1/'+self.state['files'][0]['name']],lambda a,k:self.fail('no device command expected'))
 def test_pull_hash_mismatch_never_publishes(self):
  file=self.state['files'][0];(self.root/'exports-1').mkdir();destination=self.root/'exports-1'/file['name']
  def answer(args,kwargs):
   if args[:3]==['shell','stat','-c']:return str(file['bytes'])
   if args[:2]==['exec-out','cat']:return b'x'*file['bytes']
   return ''
  with self.assertRaises(g.Refused):self.call_main('pull',['--path',str(destination),'--remote',self.state['remote']+'/exports-1/'+file['name']],answer)
  self.assertFalse(destination.exists())
if __name__=='__main__':
 with patch.object(g.subprocess,'run',side_effect=AssertionError('host subprocess forbidden')):
  unittest.main()
