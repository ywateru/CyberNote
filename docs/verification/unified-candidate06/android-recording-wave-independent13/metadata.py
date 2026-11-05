from pathlib import Path
import hashlib,json,datetime
O=Path(__file__).resolve().parent
R=Path('/Users/water/work/2026/Apple-Notes-Clone')
RUN=R/'docs/verification/unified-candidate06/android-recording-wave-build13'
def load(p):return json.loads(p.read_text())
def ident(p):return {'path':str(p),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
authpath=R/'docs/verification/unified-candidate06/recording-wave60-preparation/android-authorization.json'
a=load(authpath);f=load(RUN/'input-freeze.json');summary=load(RUN/'freeze-summary.json');review=load(RUN/'root-freeze-review.json');result=load(O/'result.json')
checks=[('freeze summary exact file identity/head/aggregates',summary['freeze']==ident(RUN/'input-freeze.json')and summary['sourceHead']==f['head']and summary['productAggregate']==f['productAggregate']and summary['inputAggregate']==f['aggregate']),('root freeze review binds actual authorization/freeze and counts',review['authorizationSha256']==ident(authpath)['sha256']and review['freezeSha256']==ident(RUN/'input-freeze.json')['sha256']and review['sourceHead']==a['sourceHead']and review['productCount']==334 and review['inputCount']==353 and review['productAggregate']==f['productAggregate']and review['inputAggregate']==f['aggregate']and review['reviewPerformedBeforeStart']and review['recordWrittenAfterCollection']and not review['deviceOperationsAuthorized'])]
for name,passed in checks:
 assert passed,name
 result['checks'].append({'name':name,'pass':True,'detail':'Root before-START review timing is a recorded attestation, not independently replayable historical UI/event timing.'if name.startswith('root')else None})
result['supplementalMetadataAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
(O/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
(O/'metadata-result.json').write_text(json.dumps({'authorization':ident(authpath),'freeze':ident(RUN/'input-freeze.json'),'summary':ident(RUN/'freeze-summary.json'),'rootReview':ident(RUN/'root-freeze-review.json'),'checks':[{'name':n,'pass':p}for n,p in checks]},indent=2)+'\n')
print('PASS metadata summary + root-review exact file binding; total',len(result['checks']))
