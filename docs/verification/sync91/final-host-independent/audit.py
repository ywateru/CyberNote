from pathlib import Path
import hashlib,json,subprocess,stat,time
start=time.monotonic();root=Path('/private/tmp/apple-notes-viewport88');final=Path('/private/tmp/sync91-transport-final01');out=Path(__file__).resolve().parent
load=lambda p:json.loads(p.read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
x=load(final/'build.json');old=load(final/'build.original.json');prov=load(final/'provenance.json');pf=load(root/'docs/verification/sync91/final-integration/approved-product-preflight.json')
assert sha((final/'build.original.json').read_bytes())==prov['sourceManifestSha256']
a=json.loads(json.dumps(x));a['binary']['path']=old['binary']['path'];assert a==old
assert x['sourcesUnchanged'] and len(x['sources'])==48
for path,digest in x['sources'].items():
 b=(root/path).read_bytes();assert sha(b)==digest
 assert subprocess.check_output(['git','show',x['sourceHead']+':'+path],cwd=root)==b
assert pf['product322Equal'] and len(pf['productInputs'])==322 and pf['sourceHead']==x['sourceHead']
for row in pf['productInputs']:
 b=(root/row['path']).read_bytes();assert len(b)==row['bytes'] and sha(b)==row['sha256']
 assert subprocess.check_output(['git','show',pf['approvedCommit']+':'+row['path']],cwd=root)==b
for r in pf['runners']:
 b=(root/r['path']).read_bytes();assert sha(b)==r['sha256']
assert all(c['exitCode']==0 and c['signal'] is None for c in x['commands'])
binary=Path(x['binary']['path']);assert binary==final/'notes-current-attachment-transport';assert binary.is_file() and not binary.is_symlink()
b=binary.read_bytes();assert len(b)==25801472 and sha(b)=='cd1e2b6fc989a9d09d69bc889704bb1fbc26bd7aa95248eea21c31c482a86077'
assert stat.S_IMODE(binary.stat().st_mode)==0o555
assert Path(old['binary']['path']).read_bytes()==b
result={'status':'PASS-FROZEN91-BINARY-SOURCE','sourceHead':x['sourceHead'],'approvedCommit':pf['approvedCommit'],'source48CurrentGitBlobExact':True,'product322ApprovedExact':True,'acceptedRunnerHashes':pf['runners'],'onlyManifestEdit':'binary.path','binary':prov['binary'],'sourceManifestSha256':prov['sourceManifestSha256'],'compileCommands':x['commands'],'readOnly':True,'seconds':time.monotonic()-start,'limits':['No new build/runtime/device/DB activity','DOM/routes actual evidence pending separate audit','Source provenance is not reproducible-build or full native acceptance claim']}
(out/'binary-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
