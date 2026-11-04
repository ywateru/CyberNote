from pathlib import Path
import hashlib,json,subprocess
r=Path.cwd();o=Path(__file__).resolve().parent;out=o/'font-candidates01';out.mkdir(exist_ok=False)
source=o/'webkit04/candidate.html';html=source.read_text();binary=o/'webkit04/render';script=o/'webkit-metrics.js'
selector='.desktop.native-toolbar:not(.gallery-browse):not(.gallery-edit):not(.separate) .notes-scroll:not(.gallery) > .note-entry:first-child > .date-section'
results=[]
for size in ['15.25','15.5']:
 name='font-'+size.replace('.','_');path=out/(name+'.html');path.write_text(html.replace('</style>','</style><style>'+selector+' { font-size: '+size+'px; }</style>',1))
 argv=[str(binary),str(path),str(out/name),str(script)]
 p=subprocess.run(argv,text=True,capture_output=True,timeout=30)
 record={'argv':argv,'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr,'cssOverride':{'fontSize':size+'px','selector':selector},'htmlSha256':hashlib.sha256(path.read_bytes()).hexdigest()}
 (out/(name+'-run.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n');assert p.returncode==0
 report=json.loads((out/(name+'.json')).read_text());assert report['status']=='metrics-ok' and report.get('snapshotSaved')
 assert not report['appActive'] and not report['webViewAttachedToWindow'] and all(not w['visible'] for w in report['windowDiagnostics'])
 first=report['metrics']['cases'][0]['first'];assert first['style']['fontSize']==size+'px' and first['style']['lineHeight']=='20px' and first['style']['height']=='40px'
 results.append({'name':name,'fontSize':size,'first':first,'snapshotPixels':report['snapshotPixels'],'windows':report['windowDiagnostics']})
(out/'result.json').write_text(json.dumps({'status':'two fixture-only font-size candidates rendered','results':results,'productChanged':False},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':'two fixture-only renders complete','candidates':[x['fontSize'] for x in results]},ensure_ascii=False))
