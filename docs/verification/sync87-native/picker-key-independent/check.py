"""Narrow host-only key admission; no ADB, subprocess or device actions."""
import contextlib,importlib.util,io,json,sys
from pathlib import Path
from unittest.mock import patch
root=Path.cwd();out=root/'docs/verification/sync87-native/picker-key-independent'
spec=importlib.util.spec_from_file_location('g',root/'scripts/debug/sync87-native/guard.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
component='com.google.android.documentsui/com.android.documentsui.picker.PickActivity'
valid=f'    mResumedActivity: ActivityRecord{{abc u0 {component} t18}}\n    mCurrentFocus=Window{{def u0 {component}}}\n'
identity={'pid':123,'startTicks':'456','package':'com.local.notesclone'};results=[]
def test(name,operation):
 try:operation();results.append({'name':name,'pass':True})
 except Exception as e:results.append({'name':name,'pass':False,'error':str(e)})
def require_rejected(text):
 try:code=g.picker_key(text,'ENTER')
 except g.Refused:return
 raise AssertionError('mixed duplicate foreground admitted keycode '+code)
test('Extra foreign u10 Resumed line must reject',lambda:require_rejected(valid+'    mResumedActivity: ActivityRecord{xyz u10 com.foreign.app/.MainActivity t22}\n'))
test('Extra foreign u10 Focus line must reject',lambda:require_rejected(valid+'    mCurrentFocus=Window{xyz u10 com.foreign.app/.MainActivity}\n'))
def execute(key='ENTER',fail_identity=None):
 calls=[];ids=0
 def app_identity(serial,avd,expected):
  nonlocal ids
  assert serial==g.SERIAL and avd==g.AVD and expected==identity
  ids+=1;calls.append('identity'+str(ids))
  if ids==fail_identity:raise g.Refused('synthetic lifetime changed')
  return identity
 def adb(serial,avd,argv,**kwargs):
  assert serial==g.SERIAL and avd==g.AVD
  if argv==['shell','dumpsys','activity','activities']:calls.append('foreground');return valid
  assert argv==['shell','input','keyevent','66'];calls.append('key');return ''
 argv=['guard.py','--serial',g.SERIAL,'--avd',g.AVD,'picker-key','--key',key,'--app-identity',json.dumps(identity)]
 with patch.object(sys,'argv',argv),patch.object(g,'app_identity',app_identity),patch.object(g,'adb',adb),patch.object(g.subprocess,'run',side_effect=AssertionError('host subprocess forbidden')),contextlib.redirect_stdout(io.StringIO()):
  try:g.main();return calls,None
  except g.Refused as e:return calls,str(e)
def positive_order():
 calls,error=execute();assert error is None;assert calls==['identity1','foreground','identity2','key','identity3']
test('Successful main path brackets fixed key with three app lifetime checks',positive_order)
def lifetime_refusal():
 for stage,expected in [(1,['identity1']),(2,['identity1','foreground','identity2']),(3,['identity1','foreground','identity2','key','identity3'])]:
  calls,error=execute(fail_identity=stage);assert error=='synthetic lifetime changed';assert calls==expected;assert calls.count('key')<=1
test('Lifetime mismatch before/middle/after aborts without action replay',lifetime_refusal)
def invalid_keys():
 for key in ['66','HOME','BACK','ENTER;id','ENTER\nshell','enter','']:
  calls,error=execute(key);assert error=='fixed picker navigation key required';assert calls==[]
test('Raw keycodes foreign keys and shell text rejected before side effects',invalid_keys)
def fixed_allowlist():assert g.PICKER_KEYS=={'TAB':'61','DPAD_DOWN':'20','DPAD_UP':'19','DPAD_CENTER':'23','ENTER':'66','SPACE':'62'}
test('Only six fixed navigation keys are admitted',fixed_allowlist)
def ownership_static():
 source=(root/'scripts/debug/sync87-native/guard.py').read_text();assert 'def adb(serial,avd,tail,timeout=15,binary=False):\n    ownership(serial,avd)' in source;assert 'invoke=lambda tail,**kw:adb(a.serial,a.avd,tail,**kw)' in source
test('Original per-command ownership guard remains (static)',ownership_static)
result={'status':'BLOCKED' if any(not r['pass'] for r in results) else 'PASS','frozenAuthor':'d034a85e','hostOnly':True,'adbCalls':0,'deviceActions':0,'results':results,'counterexamples':{'base':valid,'extraResumed':'    mResumedActivity: ActivityRecord{xyz u10 com.foreign.app/.MainActivity t22}','extraFocus':'    mCurrentFocus=Window{xyz u10 com.foreign.app/.MainActivity}'}}
(out/'result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'status':result['status'],'checks':len(results),'failed':[r['name'] for r in results if not r['pass']],'adbCalls':0}));sys.exit(1 if result['status']=='BLOCKED' else 0)
