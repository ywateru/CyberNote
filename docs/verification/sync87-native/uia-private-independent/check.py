from pathlib import Path
import importlib.util,contextlib,io,sys,json,subprocess,hashlib
root=Path('/private/tmp/apple-notes-sync87-native')
p=root/'scripts/debug/sync87-native/guard.py'
s=p.read_text();base=subprocess.check_output(['git','show','094725ff:scripts/debug/sync87-native/guard.py'],cwd=root,text=True)
assert s==base.replace('/sdcard/Download/notes-sync87-uia.xml','/data/local/tmp/notes-sync87-uia.xml')
assert base.count('/sdcard/Download/notes-sync87-uia.xml')==2
spec=importlib.util.spec_from_file_location('guard',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
calls=[]
def fake(serial,avd,args,**kw):
 calls.append((serial,avd,args,kw))
 return 'UI hierarchy dumped' if args[0]=='shell' else '<hierarchy/>'
m.adb=fake
old=sys.argv
try:
 sys.argv=['guard.py','--serial','emulator-5584','--avd','notes-sync87-isolated','uia']
 out=io.StringIO()
 with contextlib.redirect_stdout(out):m.main()
 assert calls==[('emulator-5584','notes-sync87-isolated',['shell','uiautomator','dump','/data/local/tmp/notes-sync87-uia.xml'],{'timeout':25}),('emulator-5584','notes-sync87-isolated',['exec-out','cat','/data/local/tmp/notes-sync87-uia.xml'],{})]
 assert json.loads(out.getvalue())=={'ok':True,'operation':'uia','result':'<hierarchy/>'}
 calls.clear();sys.argv=['guard.py','--serial','emulator-5580','--avd','notes-sync87-isolated','uia']
 try:m.main()
 except m.Refused:pass
 else:raise AssertionError('foreign serial admitted')
 assert calls==[]
finally:sys.argv=old
print(json.dumps({'ok':True,'scope':'source and mocked adb main dispatch only; no devices operated','sourceSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'checks':['exact two path replacements only','fixed shell-private dump and matching cat','bounded25second dump unchanged','normal result forwarding unchanged','foreign serial refused before adb stub'],'realAdbCalls':0},indent=2))
