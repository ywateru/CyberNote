from pathlib import Path
import json,gzip,hashlib,subprocess
p=Path('docs/verification/mobile-recording-wave60');o=Path('docs/verification/mobile-recording-wave60-independent');m=json.loads((p/'manifest.json').read_text());records=[]
def check(b,r,label):
 assert len(b)==r['bytes'],label+' bytes';assert hashlib.sha256(b).hexdigest()==r['sha256'],label+' sha';return True
for r in m['files']:
 check((p/r['path']).read_bytes(),r,r['path']);records.append(r['path'])
paths=subprocess.check_output(['git','diff-tree','--no-commit-id','--name-only','-r','0db24aa9434649f2ccd011daeecd9ebbb0ff2484'],text=True).splitlines();prefix=str(p)+'/'
assert {x[len(prefix):] for x in paths}==set(records)|{'manifest.json'},'author evidence paths not exhaustively indexed'
for group in ['sourceFiles','protected','baselineInputs']:
 for name,r in m[group].items():
  b=Path(name).read_bytes() if group!='baselineInputs' else subprocess.check_output(['git','show',m['baselineProduct']+':'+name])
  check(b,r,name)
  expected=m['source'] if group=='sourceFiles' else m['base'] if group=='protected' else m['baselineProduct']
  assert b==subprocess.check_output(['git','show',expected+':'+name]),name
check(Path(m['reference']['path']).read_bytes(),m['reference'],'reference')
archives=[]
for r in json.loads((p/'raw-results-archive.json').read_text()):
 z=(p/r['gzipPath']).read_bytes();raw=gzip.decompress(z);assert len(z)==r['gzipBytes'] and hashlib.sha256(z).hexdigest()==r['gzipSha256'];assert len(raw)==r['rawBytes'] and hashlib.sha256(raw).hexdigest()==r['rawSha256'];d=json.loads(raw);archives.append({'path':r['gzipPath'],'bytes':len(z),'rawBytes':len(raw),'rawSha256':hashlib.sha256(raw).hexdigest(),'status':d['status'],'errors':d['errors'],'external':d['external']})
report={'source':m['source'],'authorEvidenceCommit':'0db24aa9434649f2ccd011daeecd9ebbb0ff2484','manifestSha256':hashlib.sha256((p/'manifest.json').read_bytes()).hexdigest(),'indexedFiles':len(records),'commitFiles':len(paths),'allHashesExact':True,'sourceFilesChecked':len(m['sourceFiles']),'protectedFilesChecked':len(m['protected']),'baselineInputsChecked':len(m['baselineInputs']),'archives':archives}
(o/'author-index-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
