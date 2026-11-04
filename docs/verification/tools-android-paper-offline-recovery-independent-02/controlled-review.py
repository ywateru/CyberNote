#!/usr/bin/env python3
"""Independent Python-only review; no freeze, version, build, SDK/cache/target access."""
import ast
import hashlib
import json
from pathlib import Path
import subprocess
import types
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
NEW = ROOT / 'docs/verification/unified-candidate06/android-paper-recovery-preparation02'
OLD = NEW.parent / 'preparation'
SHA = '347660b352f6becb1f52a9c79fdf5372b50f1f12'
OUT = Path(__file__).resolve().parent

def sha(b): return hashlib.sha256(b).hexdigest()
def ident(p):
    b=p.read_bytes();return {'path':str(p.relative_to(ROOT)), 'bytes':len(b), 'sha256':sha(b)}
def git(*args): return subprocess.check_output(['git',*args],cwd=ROOT)
def aggregate(rows): return sha(''.join(r['sha256']+'  '+r['path']+'\n' for r in rows).encode())
def load_module(path):
    m=types.ModuleType(path.stem);m.__file__=str(path)
    exec(compile(path.read_bytes(),str(path),'exec'),m.__dict__)
    return m

def main():
    result={'reviewedCommit':SHA,'pass':False,'scope':'Independent Python-only; no freeze/version/build/device/signing/cache/target access or dependency acquisition.'}
    result['sourcesBefore']=[ident(p) for p in sorted(NEW.rglob('*')) if p.is_file()]
    changes=[line.split('\t',1) for line in git('diff-tree','--no-commit-id','--name-status','-r',SHA).decode().splitlines()]
    assert len(changes)==11 and all(status=='A' and path.startswith(str(NEW.relative_to(ROOT))+'/') for status,path in changes)
    for _,path in changes:
        assert (ROOT/path).read_bytes()==git('show',SHA+':'+path),path
    result['exactCommitFilesMatch']=11
    names=['common.py','freeze-inputs.py','run-build.py','collect-outputs.py']
    before=b"GRADLE_OPTS='-Dorg.gradle.daemon=false'"
    after=b"GRADLE_OPTS='-Dorg.gradle.daemon=false -Dorg.gradle.configuration-cache=false'"
    copies=[]
    for name in names:
        old=(OLD/name).read_bytes();new=(NEW/name).read_bytes()
        assert new==(old.replace(before,after) if name=='common.py' else old)
        if name=='common.py': assert old.count(before)==1 and new.count(after)==1 and len(new)-len(old)==39
        assert old==git('show',SHA+'^:'+str((OLD/name).relative_to(ROOT)))
        copies.append({'file':name,'oldSha256':sha(old),'newSha256':sha(new),'unchangedOtherThanSpecifiedAndroidString':True})
    result['copies']=copies
    py=sorted(NEW.glob('*.py'));assert len(py)==5
    for p in py:ast.parse(p.read_bytes(),str(p))
    result['pythonSyntaxFiles']=len(py)
    old=load_module(OLD/'common.py');new=load_module(NEW/'common.py')
    with patch.object(Path,'exists',return_value=True),patch.object(subprocess,'run',side_effect=AssertionError('No subprocess allowed in environment check')):
        oa=old.effective_environment('android');na=new.effective_environment('android')
        om=old.effective_environment('mac');nm=new.effective_environment('mac')
    assert om==nm
    assert na['GRADLE_OPTS']=='-Dorg.gradle.daemon=false -Dorg.gradle.configuration-cache=false'
    assert {k:v for k,v in na.items() if k!='GRADLE_OPTS'}=={k:v for k,v in oa.items() if k!='GRADLE_OPTS'}
    result['effectiveEnvironment']={'oldAndroid':oa,'newAndroid':na,'macEqual':om==nm,'mac':nm,'presenceChecksStubbed':True,'doesNotProveAvailabilityOrGradleRuntime':True}
    # Evaluate exactly the tools dictionary value from the actual capture AST.
    tree=ast.parse((NEW/'common.py').read_bytes())
    capture=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='capture')
    returned=next(n.value for n in capture.body if isinstance(n,ast.Return))
    expr=next(value for key,value in zip(returned.keys,returned.values) if isinstance(key,ast.Constant) and key.value=='tools')
    tools=eval(compile(ast.Expression(expr),str(NEW/'common.py'),'eval'),new.__dict__,{'prep':NEW})
    assert {r['path'] for r in tools}=={p.name for p in py}
    for row in tools:
        assert row['bytes']==(NEW/row['path']).stat().st_size and row['sha256']==sha((NEW/row['path']).read_bytes())
    assert 'prep = Path(__file__).resolve().parent' in ast.get_source_segment((NEW/'common.py').read_text(),capture)
    result['captureToolsExpression']={'actualAstExpressionEvaluated':True,'tools':tools,'includesAllFivePythonFiles':True,'fullCaptureNotCalled':True}
    base={'exitCode':0,'ownedGroupStopped':True,'generatedOutputs':['controlled'],'supplementalInputsUnchanged':True,'inputComparisons':{'files':True}}
    assert new.success(base)
    failures=[]
    for key in ['error','invalidated','offlineMarkerMissing','cleanupError','stopReason','groupCleanupError']:
        for value in [True,False,None]:
            assert not new.success({**base,key:value});failures.append({'field':key,'value':value})
    for key,value in [('exitCode',1),('ownedGroupStopped',False),('generatedOutputs',[]),('supplementalInputsUnchanged',False),('inputComparisons',{}),('inputComparisons',{'files':False})]:
        assert not new.success({**base,key:value});failures.append({'field':key,'value':value})
    for key in base:
        missing=dict(base);del missing[key];assert not new.success(missing);failures.append({'missing':key})
    collect=ast.parse((NEW/'collect-outputs.py').read_bytes())
    fn=next(n for n in collect.body if isinstance(n,ast.FunctionDef) and n.name=='validate_built')
    namespace={'c':new};exec(compile(ast.Module(body=[fn],type_ignores=[]),str(NEW/'collect-outputs.py'),'exec'),namespace)
    failed=json.loads((NEW.parent/'android-paper-build02/android-attempt01/result.json').read_text())
    assert failed['exitCode']==0 and failed['offlineMarkerMissing'] is True
    for built in [failed,{**base,'offlineMarkerMissing':True}]:
        try:namespace['validate_built']({}, {}, 'controlled', Path('controlled-never-read'),built)
        except RuntimeError as error:assert str(error)=='Failed/invalidated build; no candidate acceptance'
        else:raise AssertionError('Failed build accepted')
    result['refusalChecks']={'successPredicateNegativeCases':failures,'count':len(failures),'collectorRejectsActualHistoricalFailureBeforePathRead':True,'historicalExitCode':failed['exitCode'],'historicalOfflineMarkerMissing':failed['offlineMarkerMissing']}
    reference=json.loads((NEW/'evidence/reference-inputs.json').read_text())
    assert len(reference['files'])==33
    for row in reference['files']:
        actual=ident(ROOT/row['path']);assert actual==row
    result['historicalReferenceFilesUnchanged']=33
    frozen=json.loads((NEW.parent/'android-paper-build02/input-freeze.json').read_text())
    product=frozen['productFiles'];assert len(product)==238
    for row in product:
        assert not set(Path(row['path']).parts)&{'target','.gradle','.cache','build'}
        actual=ident(ROOT/row['path']);assert actual['bytes']==row['bytes'] and actual['sha256']==row['sha256']
    assert aggregate(product)=='560f9826b44320f184493f8f522a2cfefaf78a7e4e7c1faad8fa001e1190583d'
    result['product']={'files':len(product),'aggregate':aggregate(product),'allFrozenProductBytesUnchanged':True}
    manifest=json.loads((NEW/'evidence/tool-manifest.json').read_text())
    for row in manifest['files']:
        p=NEW/row['path'];assert len(p.read_bytes())==row['bytes'] and sha(p.read_bytes())==row['sha256']
    assert len(manifest['files'])==10 and aggregate(manifest['files'])==manifest['aggregate']
    assert {r['path'] for r in manifest['files']}=={str(p.relative_to(NEW)) for p in NEW.rglob('*') if p.is_file()}-{'evidence/tool-manifest.json'}
    result['developerManifest']={'files':10,'selfExcluded':True,'aggregate':manifest['aggregate'],'matches':True}
    result['sourcesAfter']=[ident(p) for p in sorted(NEW.rglob('*')) if p.is_file()]
    assert result['sourcesBefore']==result['sourcesAfter'];result['reviewedSourcesUnchanged']=True
    result['pass']=True
    with (OUT/'result.json').open('x') as f:f.write(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'pass':True,'exactCommitFilesMatch':11,'historicalReferences':33,'productFiles':238,'allFiveToolsCaptured':True,'refusalCases':len(failures),'noBuild':True},ensure_ascii=False))

if __name__=='__main__': main()
