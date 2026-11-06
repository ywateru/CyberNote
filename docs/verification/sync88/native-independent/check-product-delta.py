from pathlib import Path
import hashlib,json,re,subprocess
root=Path('/Users/water/work/2026/Apple-Notes-Clone');out=Path(__file__).resolve().parent
r=json.loads((out/'run01/result.json').read_text())
new=json.loads((root/'docs/verification/sync88/android-build/result.json').read_text());old=json.loads((root/'docs/verification/sync87/android-build/result.json').read_text())
a={x['path']:x for x in new['inputBefore']};b={x['path']:x for x in old['inputBefore']};assert set(a)==set(b) and len(a)==321
changes=[p for p in a if a[p]!=b[p]];assert changes==['src/Preferences.css'];assert a[changes[0]]['sha256']=='98c78d2eea6a53abe3ce7d294adafe8a565c02d0e8cf12b7aa0ed928ef0f288f'
assert r['mac']['embeddedFrontend']==r['android']['embeddedFrontend']
folder=Path('/private/tmp/sync88-package-review-extract-run01/android-frontend')
css=next(folder.rglob('*.css')).read_text();blocks=re.findall(r'\.preferences\{([^}]+)\}',css)
assert len(blocks)==2
assert 'height:min(760px,calc(100vh - max(24px,var(--native-top, 0px)) - 24px));height:min(760px,calc(100dvh - max(24px,var(--native-top, 0px)) - 24px));' in blocks[0]
assert 'height:100vh;height:100dvh;max-height:100vh;max-height:100dvh;' in blocks[1]
bad=(out/'run01/android-badging.stdout.txt').read_text();assert "launchable-activity: name='com.local.notesclone.MainActivity'" in bad
for n in ['audit-packages.py','extract-assets.mjs']:
 current=(out/n).read_bytes();prior=subprocess.check_output(['git','show','c7c6e115:docs/verification/sync88/native-independent/'+n],cwd=out)
 assert prior==current
result={'ok':True,'sourceCount':321,'onlyProductInputChanged':changes,'changedInput':a[changes[0]],'embeddedCrossPackageFrontendEqual':True,'embeddedPreferencesRules':blocks,'actualLaunchActivity':'com.local.notesclone.MainActivity','auditToolsStillEqualFrozenCommit':'c7c6e115','noDeviceOperations':True}
(out/'product-delta.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'ok':True,'onlySourceChange':changes,'exactEmbeddedFallbacks':True,'crossPackageFrontendEqual':True}))
