#!/usr/bin/env python3
"""Host-only picker key admission checks; no ADB or device access."""
import importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('guard',Path(__file__).with_name('guard.py'))
g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
component='com.google.android.documentsui/com.android.documentsui.picker.PickActivity'
foreground=f'    mResumedActivity: ActivityRecord{{abc u0 {component} t18}}\n    mCurrentFocus=Window{{def u0 {component}}}\n'
checks=0
for key,value in g.PICKER_KEYS.items():
    assert g.picker_key(foreground,key)==value;checks+=1
negative=[(foreground,k) for k in ['3','HOME','BACK','ENTER;id','enter','',None,66]]
negative.extend((text,'ENTER') for text in [None,'',foreground.replace('PickActivity','FilesActivity'),foreground.replace('com.google.android.documentsui','com.foreign.documentsui'),foreground.replace('u0','u10'),foreground+foreground,foreground.splitlines()[0],foreground.replace('mCurrentFocus','mLastFocus'),foreground.replace('mCurrentFocus=Window{def u0 '+component,'mCurrentFocus=Window{def u0 com.local.notesclone/.MainActivity')])
for text,key in negative:
    try:g.picker_key(text,key)
    except g.Refused:checks+=1
    else:raise AssertionError('unsafe picker admission accepted')
assert g.picker_key(foreground.replace('com.google.android.documentsui','com.android.documentsui'),'SPACE')=='62';checks+=1
print(f'PASS {checks} picker navigation admission checks; host only')
