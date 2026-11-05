from pathlib import Path
import hashlib,json,subprocess
base=Path(__file__).resolve().parent
repo=base.parents[2]
def digest(data):return hashlib.sha256(data).hexdigest()
def verify_file(root,row):
 p=root/row['path'];data=p.read_bytes()
 assert len(data)==row['bytes'] and digest(data)==row['sha256'],p
index=json.loads((base/'evidence-index.json').read_text())
for row in index['files']:verify_file(base,row)
for name in ['product-source.json','all-product-inputs.json']:
 data=json.loads((base/name).read_text())
 for row in data['files']:
  verify_file(repo,row)
  committed=subprocess.check_output(['git','show',data['sourceCommit']+':'+row['path']],cwd=repo)
  assert digest(committed)==row['sha256'],row['path']
 aggregate=digest(''.join(row['sha256']+'  '+row['path']+'\n' for row in data['files']).encode())
 assert aggregate==data['productAggregate'],name
result=json.loads((base/'verification-result.json').read_text())
for row in result['wkResults']:
 r=json.loads((base/row['path']).read_text())
 assert r['status']=='PASS' and len(r['checks'])==row['checks'] and all(c['pass'] for c in r['checks']),row
assert len(result['wkResults'])==result['uniqueWKScenarios']==30
assert sum(row['checks'] for row in result['wkResults'])==result['finalSelectedWKChecks']==237
product=json.loads((base/'product-source.json').read_text())
changed=subprocess.check_output(['git','diff','--name-only',product['baseline'],product['sourceCommit']],cwd=repo,text=True).splitlines()
assert changed==[r['path'] for r in product['files']],changed
print(json.dumps({'status':'PASS','sourceCommit':product['sourceCommit'],'evidenceFiles':len(index['files']),'evidenceIndexSha256':digest((base/'evidence-index.json').read_bytes()),'WKScenarios':30,'WKChecks':237,'allProductCount':308},indent=2))
