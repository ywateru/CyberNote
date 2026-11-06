from pathlib import Path
import importlib.util,json,hashlib,unittest,uuid,io,contextlib,os
from unittest.mock import patch
base=Path('/private/tmp/apple-notes-sync87-native');spec=importlib.util.spec_from_file_location('independent_native_guard',base/'scripts/debug/sync87-native/guard.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
class Boundaries(unittest.TestCase):
 def setUp(self):
  self.root=Path('/private/tmp/notes-sync87-native-indguard-'+uuid.uuid4().hex);self.root.mkdir();self.ident='a1b2c3d4e5';self.payload=b'original synthetic PNG bytes';self.files=[]
  for ext in ['png','txt','wav']:
   name='sync87-'+self.ident+'.'+ext;p=self.root/name;p.write_bytes(self.payload);self.files.append(dict(name=name,path=str(p),remote='/sdcard/Download/notes-sync87-'+self.ident+'/'+name,sha256=hashlib.sha256(self.payload).hexdigest(),bytes=len(self.payload)))
  self.state=dict(version=1,serial=g.SERIAL,avd=g.AVD,runId=self.ident,remote='/sdcard/Download/notes-sync87-'+self.ident,files=self.files,notes=[]);self.path=self.root/'state.json';self.write();self.export=self.root/'exports-1';self.export.mkdir();self.dst=self.export/self.files[0]['name'];self.remote=self.state['remote']+'/exports-1/'+self.files[0]['name'];self.calls=[]
 def tearDown(self):
  import shutil
  shutil.rmtree(self.root)
 def write(self):self.path.write_text(json.dumps(self.state))
 def fake(self,serial,avd,args,**kw):
  assert (serial,avd)==(g.SERIAL,g.AVD);self.calls.append(args)
  if args[:3]==['shell','stat','-c']:return str(len(self.payload))
  if args[:2]==['exec-out','cat']:return self.payload
  return ''
 def pull(self):
  args=['guard.py','--serial',g.SERIAL,'--avd',g.AVD,'pull','--run-state',str(self.path),'--export-index','1','--name',self.files[0]['name'],'--path',str(self.dst),'--remote',self.remote]
  with patch.object(g.sys,'argv',args),patch.object(g,'adb',side_effect=self.fake),contextlib.redirect_stdout(io.StringIO()):g.main()
 def test_original_bytes_publish_and_private_mode(self):
  self.pull();self.assertEqual(self.dst.read_bytes(),self.payload);self.assertEqual(self.dst.stat().st_mode&0o777,0o600)
 def test_wrong_remote_never_reads(self):
  self.remote=self.remote.replace('exports-1','exports-2')
  with self.assertRaises(g.Refused):self.pull()
  self.assertEqual(self.calls,[])
 def test_symlink_export_directory_refused_before_device(self):
  self.export.rmdir();self.export.symlink_to(self.root)
  with self.assertRaises(g.Refused):self.pull()
  self.assertEqual(self.calls,[])
 def test_exclusive_race_preserves_existing_file(self):
  original=g.os.open
  def raced(path,flags,mode):
   self.assertEqual(flags & (os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW),os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW)
   Path(path).write_bytes(b'preserve existing race winner');return original(path,flags,mode)
  with patch.object(g.os,'open',side_effect=raced):
   with self.assertRaises(FileExistsError):self.pull()
  self.assertEqual(self.dst.read_bytes(),b'preserve existing race winner')
 def test_late_symlink_race_preserves_target(self):
  protected=self.root/'protected-local.txt';protected.write_bytes(b'protected');original=g.os.open
  def raced(path,flags,mode):
   Path(path).symlink_to(protected);return original(path,flags,mode)
  with patch.object(g.os,'open',side_effect=raced):
   with self.assertRaises(FileExistsError):self.pull()
  self.assertEqual(protected.read_bytes(),b'protected')
 def test_byte_count_disagrees_no_publication(self):
  self.files[0]['bytes']+=1;self.write()
  with self.assertRaises(g.Refused):self.pull()
  self.assertFalse(self.dst.exists());self.assertEqual(self.calls,[])
 def test_state_parent_symlink_rejected(self):
  link=self.root.with_name(self.root.name+'-link');link.symlink_to(self.root)
  try:
   with self.assertRaises(g.Refused):g.run_scope(link/'state.json')
  finally:link.unlink()
 def test_unknown_manifest_fields_rejected(self):
  self.files[0]['unknown']='synthetic';self.write()
  with self.assertRaises(g.Refused):g.run_scope(self.path)
 def test_duplicate_manifest_name_rejected(self):
  self.files[1]=self.files[0];self.write()
  with self.assertRaises(g.Refused):g.run_scope(self.path)
if __name__=='__main__':
 with patch.object(g.subprocess,'run',side_effect=AssertionError('no host/device subprocess permitted')):unittest.main()
